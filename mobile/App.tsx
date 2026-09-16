import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import CardCollaboration from './CardCollaboration';
import NotificationCenter from './NotificationCenter';

type Board = { id: string; name: string; description?: string | null; owner_id?: string };
type List = { id: string; board_id: string; name: string; position: number };
type Card = { id: string; list_id: string; title: string; description?: string | null; position: number; priority: string | null; assignee_id?: string | null; due_at?: string | null };
type Profile = { id: string; full_name: string | null };
type SessionUser = { id: string; email?: string | null };
type BoardRole = 'owner' | 'admin' | 'member' | 'viewer';
type View = 'tasks' | 'calendar' | 'documents' | 'team';
type AppProps = { selectedBoard?: string | null; onSelectedBoardChange?: (boardId: string) => void; openCardId?: string | null; onOpenCardHandled?: () => void; onNavigate?: (view: View | null) => void };

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }) : null;
const priorities = ['low', 'normal', 'high', 'urgent'];
const priorityLabels: Record<string, string> = { low: 'Niedrig', normal: 'Normal', high: 'Hoch', urgent: 'Dringend' };

export default function App({ selectedBoard: controlledBoard, onSelectedBoardChange, openCardId, onOpenCardHandled, onNavigate }: AppProps = {}) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login'); const [authBusy, setAuthBusy] = useState(false); const [message, setMessage] = useState('');
  const [boards, setBoards] = useState<Board[]>([]); const [lists, setLists] = useState<List[]>([]); const [cards, setCards] = useState<Card[]>([]); const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(controlledBoard ?? null); const [loadingBoard, setLoadingBoard] = useState(false); const [boardRole, setBoardRole] = useState<BoardRole | null>(null); const [search, setSearch] = useState('');
  const [editingCard, setEditingCard] = useState<Card | null>(null); const [cardTitle, setCardTitle] = useState(''); const [cardDescription, setCardDescription] = useState(''); const [cardPriority, setCardPriority] = useState('normal'); const [cardListId, setCardListId] = useState(''); const [cardDue, setCardDue] = useState(''); const [cardAssignee, setCardAssignee] = useState(''); const [savingCard, setSavingCard] = useState(false);
  const [showBoardEditor, setShowBoardEditor] = useState(false); const [boardName, setBoardName] = useState(''); const [boardDescription, setBoardDescription] = useState(''); const [savingBoard, setSavingBoard] = useState(false);
  const listIdsRef = useRef<Set<string>>(new Set());
  const boardLoadSeq = useRef(0);
  const activeBoard = boards.find(b => b.id === selectedBoard) ?? null;
  const canEdit = boardRole !== null && boardRole !== 'viewer';
  const canManage = boardRole === 'owner' || boardRole === 'admin';

  useEffect(() => {
    if (controlledBoard === undefined) return;
    if (controlledBoard === null || boards.some(board => board.id === controlledBoard)) setSelectedBoard(controlledBoard);
  }, [controlledBoard, boards]);

  useEffect(() => {
    if (!openCardId || !cards.length) return;
    const requestedCard = cards.find(card => card.id === openCardId);
    if (!requestedCard) return;
    openCard(requestedCard);
    onOpenCardHandled?.();
  }, [openCardId, cards]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => { if (mounted) setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ? { id: session.user.id, email: session.user.email } : null));
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  async function loadBoards() {
    if (!supabase || !user) return;
    const { data, error } = await supabase.from('boards').select('id,name,description,owner_id').order('updated_at', { ascending: false });
    if (error) { setMessage(error.message); return; }
    const next = (data ?? []) as Board[]; setBoards(next);
    setSelectedBoard(current => current && next.some(b => b.id === current) ? current : controlledBoard && next.some(b => b.id === controlledBoard) ? controlledBoard : next[0]?.id ?? null);
  }
  useEffect(() => { if (user) void loadBoards(); else { ++boardLoadSeq.current; setBoards([]); setSelectedBoard(null); setBoardRole(null); setLists([]); setCards([]); setProfiles([]); listIdsRef.current = new Set(); } }, [user]);

  useEffect(() => {
    if (!supabase || !selectedBoard || !user) { setBoardRole(null); return; }
    let alive = true; setBoardRole(null);
    void supabase.from('board_members').select('role').eq('board_id', selectedBoard).eq('user_id', user.id).single().then(({ data }) => { if (alive) setBoardRole((data?.role as BoardRole | undefined) ?? null); });
    return () => { alive = false; };
  }, [selectedBoard, user]);

  async function loadBoard(boardId: string) {
    if (!supabase || !user) return;
    const requestId = ++boardLoadSeq.current;
    setLoadingBoard(true); listIdsRef.current = new Set();
    const { data, error } = await supabase.rpc('get_board_snapshot', { p_board_id: boardId });
    if (requestId !== boardLoadSeq.current) return;
    if (error) { setMessage(error.message); setLists([]); setCards([]); setProfiles([]); setLoadingBoard(false); return; }
    const snapshot = data as { lists?: List[]; cards?: Card[]; profiles?: Profile[] } | null;
    const nextLists = snapshot?.lists ?? [];
    if (requestId !== boardLoadSeq.current) return;
    listIdsRef.current = new Set(nextLists.map(x => x.id));
    setLists(nextLists); setCards(snapshot?.cards ?? []); setProfiles(snapshot?.profiles ?? []); setLoadingBoard(false);
  }
  useEffect(() => {
    if (!selectedBoard || !user || !supabase) { ++boardLoadSeq.current; setLoadingBoard(false); listIdsRef.current = new Set(); return; }
    void loadBoard(selectedBoard);
    const channel = supabase.channel(`mobile-board-${selectedBoard}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter: `board_id=eq.${selectedBoard}` }, () => void loadBoard(selectedBoard))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, payload => {
        const oldCard = payload.old as Partial<Card>;
        const newCard = payload.new as Partial<Card>;
        const relevant = [oldCard.list_id, newCard.list_id].some(id => Boolean(id) && listIdsRef.current.has(id));
        if (!relevant) return;
        if (payload.eventType === 'INSERT') setCards(v => v.some(x => x.id === newCard.id) ? v : [...v, newCard as Card]);
        if (payload.eventType === 'UPDATE') setCards(v => v.some(x => x.id === newCard.id) ? v.map(x => x.id === newCard.id ? newCard as Card : x) : [...v, newCard as Card]);
        if (payload.eventType === 'DELETE') setCards(v => v.filter(x => x.id !== oldCard.id));
      }).subscribe();
    return () => { ++boardLoadSeq.current; void supabase.removeChannel(channel); };
  }, [selectedBoard, user]);

  async function submitAuth() {
    if (!supabase || !email.trim() || !password) return; setAuthBusy(true); setMessage('');
    const result = authMode === 'login' ? await supabase.auth.signInWithPassword({ email: email.trim(), password }) : await supabase.auth.signUp({ email: email.trim(), password });
    setAuthBusy(false); if (result.error) setMessage(result.error.message); else setMessage(authMode === 'signup' ? 'Konto angelegt. Bitte bestätige ggf. deine E-Mail-Adresse.' : '');
  }
  async function signOut() { if (!supabase) return; const { error } = await supabase.auth.signOut(); if (error) Alert.alert('Abmelden', error.message); }

  function openCard(card: Card) {
    setEditingCard(card); setCardTitle(card.title); setCardDescription(card.description ?? ''); setCardPriority(card.priority ?? 'normal'); setCardListId(card.list_id); setCardDue(card.due_at ? card.due_at.slice(0, 10) : ''); setCardAssignee(card.assignee_id ?? '');
  }
  function openNewCard(listId: string) { if (!canEdit) return; setEditingCard({ id: '', list_id: listId, title: '', description: '', position: 0, priority: 'normal' }); setCardTitle(''); setCardDescription(''); setCardPriority('normal'); setCardListId(listId); setCardDue(''); setCardAssignee(''); }
  async function saveCard() {
    if (!supabase || !editingCard || !cardTitle.trim() || !canEdit) return; setSavingCard(true);
    const due_at = cardDue ? `${cardDue}T23:59:59Z` : null;
    if (editingCard.id) {
      const { data, error } = await supabase.from('cards').update({ title: cardTitle.trim(), description: cardDescription.trim() || null, priority: cardPriority, assignee_id: cardAssignee || null, due_at }).eq('id', editingCard.id).select('*').single();
      if (error) Alert.alert('Karte speichern', error.message); else if (data) {
        let saved = data as Card;
        if (cardListId !== editingCard.list_id) { const moved = await supabase.rpc('move_card', { p_card_id: editingCard.id, p_target_list_id: cardListId, p_before_card_id: null }); if (moved.error || !moved.data) Alert.alert('Verschieben', moved.error?.message ?? 'Karte konnte nicht verschoben werden.'); else saved = moved.data as Card; }
        setCards(v => v.map(c => c.id === saved.id ? saved : c));
      }
    } else {
      const positions = cards.filter(c => c.list_id === cardListId).map(c => Number(c.position) || 0); const position = positions.length ? Math.max(...positions) + 1 : 0;
      const { data, error } = await supabase.from('cards').insert({ list_id: cardListId, title: cardTitle.trim(), description: cardDescription.trim() || null, priority: cardPriority, position, assignee_id: cardAssignee || null, due_at }).select('*').single();
      if (error) Alert.alert('Karte anlegen', error.message); else if (data) setCards(v => [...v, data as Card]);
    }
    setSavingCard(false); setEditingCard(null);
  }
  function deleteCard() {
    if (!supabase || !editingCard?.id || !canEdit) return;
    Alert.alert('Karte löschen', 'Diese Karte wirklich löschen?', [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: async () => { const { error } = await supabase.from('cards').delete().eq('id', editingCard.id); if (error) Alert.alert('Karte löschen', error.message); else { setCards(v => v.filter(c => c.id !== editingCard.id)); setEditingCard(null); } } }]);
  }
  async function addList() { if (!supabase || !activeBoard || !canEdit) return; Alert.prompt('Neue Liste', 'Name der Liste', async name => { if (!name?.trim()) return; const { error } = await supabase.from('lists').insert({ board_id: activeBoard.id, name: name.trim(), position: lists.filter(l => l.board_id === activeBoard.id).length }); if (error) Alert.alert('Liste', error.message); }); }
  function editList(list: List) {
    if (!supabase || !canEdit) return; Alert.prompt('Liste umbenennen', 'Neuer Name', async name => { if (!name?.trim() || name.trim() === list.name) return; const { error } = await supabase.from('lists').update({ name: name.trim() }).eq('id', list.id); if (error) Alert.alert('Liste', error.message); });
  }
  function deleteList(list: List) {
    if (!supabase || !canManage) return; Alert.alert('Liste löschen', `„${list.name}“ und die enthaltenen Aufgaben löschen?`, [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: async () => { const { error } = await supabase.from('lists').delete().eq('id', list.id); if (error) Alert.alert('Liste', error.message); } }]);
  }
  function openBoardEditor() { if (!activeBoard || !canManage) return; setBoardName(activeBoard.name); setBoardDescription(activeBoard.description ?? ''); setShowBoardEditor(true); }
  async function saveBoard() { if (!supabase || !activeBoard || !canManage || !boardName.trim()) return; setSavingBoard(true); const { data, error } = await supabase.from('boards').update({ name: boardName.trim(), description: boardDescription.trim() || null }).eq('id', activeBoard.id).select('*').single(); if (error) Alert.alert('Board', error.message); else if (data) setBoards(v => v.map(b => b.id === activeBoard.id ? data as Board : b)); setSavingBoard(false); setShowBoardEditor(false); }
  function deleteBoard() { if (!supabase || !activeBoard || boardRole !== 'owner') return; Alert.alert('Board löschen', `„${activeBoard.name}“ wirklich löschen?`, [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: async () => { const { error } = await supabase.from('boards').delete().eq('id', activeBoard.id); if (error) Alert.alert('Board', error.message); else { setShowBoardEditor(false); await loadBoards(); } } }]); }
  async function createBoard() { if (!supabase || !user) return; Alert.prompt('Neues Board', 'Name des Boards', async name => { if (!name?.trim()) return; const { data, error } = await supabase.from('boards').insert({ name: name.trim(), owner_id: user.id }).select('*').single(); if (error || !data) return Alert.alert('Board', error?.message ?? 'Board konnte nicht erstellt werden.'); await supabase.from('board_members').insert({ board_id: data.id, user_id: user.id, role: 'owner' }); await supabase.from('lists').insert(['Ideen','In Arbeit','Erledigt'].map((n,i) => ({ board_id: data.id, name: n, position: i }))); await loadBoards(); setSelectedBoard(data.id); onSelectedBoardChange?.(data.id); }); }

  const activeLists = useMemo(() => lists.filter(l => l.board_id === selectedBoard).sort((a,b) => a.position - b.position), [lists, selectedBoard]);
  const filteredCards = (listId: string) => cards.filter(c => c.list_id === listId && (!search.trim() || `${c.title} ${c.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))).sort((a,b) => a.position - b.position);
  const profileName = (id?: string | null) => profiles.find(p => p.id === id)?.full_name || '';

  if (!supabase) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.brand}>Essentia</Text><Text>Mobile Supabase-Konfiguration fehlt.</Text></View></SafeAreaView>;
  if (!user) return <SafeAreaView style={styles.safe}><StatusBar style="auto" /><View style={styles.auth}><Text style={styles.brand}>Essentia</Text><Text style={styles.heading}>{authMode === 'login' ? 'Anmelden' : 'Konto erstellen'}</Text><TextInput style={styles.input} placeholder="E-Mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /><TextInput style={styles.input} placeholder="Passwort" value={password} onChangeText={setPassword} secureTextEntry /><Pressable style={styles.primary} onPress={() => void submitAuth()} disabled={authBusy}><Text style={styles.primaryText}>{authBusy ? 'Bitte warten …' : authMode === 'login' ? 'Anmelden' : 'Registrieren'}</Text></Pressable>{message ? <Text style={styles.message}>{message}</Text> : null}<Pressable onPress={() => { setAuthMode(v => v === 'login' ? 'signup' : 'login'); setMessage(''); }}><Text style={styles.link}>{authMode === 'login' ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Anmelden'}</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><StatusBar style="auto" /><View style={styles.header}><View><Text style={styles.brandSmall}>Essentia</Text><Text style={styles.subtitle}>{activeBoard?.name ?? 'Arbeitsbereich'} · {boardRole === 'viewer' ? 'Nur Lesen' : boardRole ? boardRole : ''}</Text></View><View style={styles.headerActions}><NotificationCenter supabase={supabase} userId={user.id} /><Pressable onPress={() => void signOut()} style={styles.secondary}><Text>Abmelden</Text></Pressable></View></View>
    <View style={styles.quickRow}><Pressable style={styles.quickActive} onPress={() => onNavigate?.(null)}><Text>Boards</Text></Pressable><Pressable style={styles.quick} onPress={() => onNavigate?.('tasks')}><Text>Aufgaben</Text></Pressable><Pressable style={styles.quick} onPress={() => onNavigate?.('calendar')}><Text>Kalender</Text></Pressable><Pressable style={styles.quick} onPress={() => onNavigate?.('documents')}><Text>Dokumente</Text></Pressable></View>
    <View style={styles.toolbar}><TextInput style={styles.search} placeholder="Aufgaben durchsuchen …" value={search} onChangeText={setSearch} autoCapitalize="none" /><Pressable style={styles.primarySmall} onPress={createBoard}><Text style={styles.primaryText}>＋ Board</Text></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boards}>{boards.map(board => <Pressable key={board.id} onPress={() => { setSelectedBoard(board.id); onSelectedBoardChange?.(board.id); }} style={[styles.boardChip, board.id === selectedBoard && styles.boardChipActive]}><Text style={board.id === selectedBoard ? styles.boardChipTextActive : undefined}>{board.name}</Text></Pressable>)}</ScrollView>
    {activeBoard && <View style={styles.workspaceActions}><View style={{flex:1}}><Text style={styles.workspaceTitle}>{activeBoard.name}</Text>{activeBoard.description ? <Text style={styles.muted}>{activeBoard.description}</Text> : null}</View>{canManage ? <Pressable style={styles.secondary} onPress={openBoardEditor}><Text>Verwalten</Text></Pressable> : null}</View>}
    {selectedBoard && boardRole === 'viewer' ? <View style={styles.readOnly}><Text style={styles.readOnlyText}>Nur Lesen – dieses Board kann auf dem Mobilgerät angesehen werden.</Text></View> : null}
    {loadingBoard ? <View style={styles.center}><Text>Board wird geladen …</Text></View> : <ScrollView horizontal contentContainerStyle={styles.board} showsHorizontalScrollIndicator={false}>{activeLists.map(list => <View key={list.id} style={styles.column}><View style={styles.columnHead}><View style={{flex:1}}><Text style={styles.columnTitle}>{list.name}</Text><Text style={styles.meta}>{filteredCards(list.id).length} Aufgaben</Text></View>{canEdit ? <Pressable onPress={() => editList(list)} style={styles.icon}><Text>⋯</Text></Pressable> : null}</View>{filteredCards(list.id).map(card => <Pressable key={card.id} style={styles.card} onPress={() => openCard(card)} onLongPress={() => canEdit && openCard(card)}><Text style={styles.cardTitle}>{card.title}</Text><Text style={styles.meta}>{priorityLabels[card.priority ?? 'normal']}{card.due_at ? ` · ${new Date(card.due_at).toLocaleDateString('de-DE')}` : ''}</Text>{card.assignee_id && profileName(card.assignee_id) ? <Text style={styles.meta}>{profileName(card.assignee_id)}</Text> : null}</Pressable>)}{canEdit ? <Pressable style={styles.addCard} onPress={() => openNewCard(list.id)}><Text>＋ Aufgabe hinzufügen</Text></Pressable> : null}{canManage ? <Pressable style={styles.deleteList} onPress={() => deleteList(list)}><Text style={styles.deleteText}>Liste löschen</Text></Pressable> : null}</View>)}{canEdit ? <Pressable style={styles.addColumn} onPress={addList}><Text>＋ Liste hinzufügen</Text></Pressable> : null}{!activeLists.length && <View style={styles.empty}><Text style={styles.title}>{boards.length ? 'Keine Listen vorhanden' : 'Keine Boards vorhanden'}</Text></View>}</ScrollView>}

    <Modal visible={!!editingCard} animationType="slide" transparent onRequestClose={() => setEditingCard(null)}><View style={styles.modalBackdrop}><View style={styles.modal}><ScrollView keyboardShouldPersistTaps="handled"><View style={styles.modalHead}><Text style={styles.heading}>{editingCard?.id ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</Text><Pressable onPress={() => setEditingCard(null)}><Text style={styles.close}>×</Text></Pressable></View><TextInput style={styles.input} placeholder="Titel" value={cardTitle} onChangeText={setCardTitle} editable={canEdit} autoFocus /><TextInput style={[styles.input, styles.textarea]} placeholder="Beschreibung" value={cardDescription} onChangeText={setCardDescription} multiline textAlignVertical="top" editable={canEdit} /><Text style={styles.label}>Spalte</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{activeLists.map(l => <Pressable key={l.id} onPress={() => setCardListId(l.id)} style={[styles.priority, cardListId === l.id && styles.priorityActive]}><Text>{l.name}</Text></Pressable>)}</ScrollView><Text style={styles.label}>Priorität</Text><View style={styles.priorityRow}>{priorities.map(p => <Pressable key={p} onPress={() => setCardPriority(p)} disabled={!canEdit} style={[styles.priority, cardPriority === p && styles.priorityActive]}><Text>{priorityLabels[p]}</Text></Pressable>)}</View><Text style={styles.label}>Fällig am (JJJJ-MM-TT)</Text><TextInput style={styles.input} placeholder="2026-09-30" value={cardDue} onChangeText={setCardDue} editable={canEdit} autoCapitalize="none" /><Text style={styles.label}>Zuständig</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{<Pressable onPress={() => setCardAssignee('')} style={[styles.priority, !cardAssignee && styles.priorityActive]}><Text>Niemand</Text></Pressable>}{profiles.map(p => <Pressable key={p.id} onPress={() => setCardAssignee(p.id)} style={[styles.priority, cardAssignee === p.id && styles.priorityActive]}><Text>{p.full_name || 'Teammitglied'}</Text></Pressable>)}</ScrollView>{canEdit ? <Pressable style={styles.primary} onPress={() => void saveCard()} disabled={savingCard}><Text style={styles.primaryText}>{savingCard ? 'Speichern …' : 'Speichern'}</Text></Pressable> : <Text style={styles.muted}>Nur-Lesen-Modus</Text>}{editingCard?.id && user ? <CardCollaboration supabase={supabase} cardId={editingCard.id} userId={user.id} /> : null}{editingCard?.id && canEdit ? <Pressable style={styles.delete} onPress={deleteCard}><Text style={styles.deleteText}>Aufgabe löschen</Text></Pressable> : null}</ScrollView></View></View></Modal>
    <Modal visible={showBoardEditor} animationType="slide" transparent onRequestClose={() => setShowBoardEditor(false)}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHead}><Text style={styles.heading}>Board verwalten</Text><Pressable onPress={() => setShowBoardEditor(false)}><Text style={styles.close}>×</Text></Pressable></View><TextInput style={styles.input} placeholder="Boardname" value={boardName} onChangeText={setBoardName} /><TextInput style={[styles.input, styles.textarea]} placeholder="Beschreibung" value={boardDescription} onChangeText={setBoardDescription} multiline textAlignVertical="top" /><Pressable style={styles.primary} onPress={() => void saveBoard()} disabled={savingBoard}><Text style={styles.primaryText}>{savingBoard ? 'Speichern …' : 'Board speichern'}</Text></Pressable>{boardRole === 'owner' ? <Pressable style={styles.delete} onPress={deleteBoard}><Text style={styles.deleteText}>Board löschen</Text></Pressable> : null}</View></View></Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:'#f8fafc'}, auth:{padding:24,marginTop:60}, center:{flex:1,justifyContent:'center',alignItems:'center',padding:24}, brand:{fontSize:30,fontWeight:'800',marginBottom:24}, brandSmall:{fontSize:22,fontWeight:'800'}, heading:{fontSize:24,fontWeight:'700',marginBottom:18}, subtitle:{fontSize:12,color:'#6b7280',marginTop:2}, header:{paddingHorizontal:16,paddingTop:10,paddingBottom:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, headerActions:{flexDirection:'row',alignItems:'center',gap:8}, input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:12,padding:14,marginBottom:12,fontSize:16}, search:{flex:1,backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:12,padding:11,fontSize:15}, toolbar:{flexDirection:'row',gap:8,paddingHorizontal:16,paddingBottom:8}, primary:{backgroundColor:'#111827',borderRadius:12,padding:15,alignItems:'center',marginTop:8}, primarySmall:{backgroundColor:'#111827',borderRadius:12,paddingHorizontal:14,justifyContent:'center'}, primaryText:{color:'#fff',fontWeight:'700',fontSize:15}, secondary:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:10,paddingHorizontal:11,paddingVertical:9}, message:{marginTop:14,color:'#b91c1c'}, link:{marginTop:18,color:'#2563eb'}, boards:{paddingHorizontal:16,paddingBottom:10,gap:8}, boardChip:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:999,paddingHorizontal:15,paddingVertical:9}, boardChipActive:{backgroundColor:'#111827',borderColor:'#111827'}, boardChipTextActive:{color:'#fff',fontWeight:'700'}, workspaceActions:{paddingHorizontal:16,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:8},workspaceTitle:{fontSize:20,fontWeight:'800'},muted:{color:'#6b7280',marginTop:4},readOnly:{marginHorizontal:16,marginBottom:8,padding:10,borderRadius:10,backgroundColor:'#f3f4f6'},readOnlyText:{color:'#4b5563',fontSize:12},board:{padding:16,gap:12,alignItems:'flex-start'},column:{width:285,backgroundColor:'#eef2f7',borderRadius:16,padding:12},columnHead:{flexDirection:'row',alignItems:'center',marginBottom:10},columnTitle:{fontSize:16,fontWeight:'800'},card:{backgroundColor:'#fff',borderRadius:12,padding:13,marginBottom:8,borderWidth:1,borderColor:'#e5e7eb'},cardTitle:{fontSize:15,fontWeight:'700'},meta:{fontSize:11,color:'#6b7280',marginTop:5},addCard:{padding:12,alignItems:'center'},addColumn:{width:190,padding:18,borderRadius:14,borderWidth:1,borderColor:'#d1d5db',backgroundColor:'#fff',alignItems:'center'},deleteList:{padding:8,alignItems:'center'},deleteText:{color:'#dc2626',fontWeight:'700'},icon:{padding:6},empty:{padding:30},title:{fontSize:18,fontWeight:'700'},modalBackdrop:{flex:1,backgroundColor:'rgba(15,23,42,.35)',justifyContent:'flex-end'},modal:{backgroundColor:'#f8fafc',borderTopLeftRadius:22,borderTopRightRadius:22,padding:18,maxHeight:'92%'},modalHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},close:{fontSize:30,color:'#6b7280'},textarea:{height:120},label:{fontSize:13,fontWeight:'700',marginTop:8,marginBottom:7},priorityRow:{flexDirection:'row',flexWrap:'wrap',gap:7},priority:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:10,paddingHorizontal:11,paddingVertical:9,marginBottom:8,marginRight:6},priorityActive:{backgroundColor:'#e5e7eb',borderColor:'#111827'},delete:{borderWidth:1,borderColor:'#dc2626',borderRadius:12,padding:14,alignItems:'center',marginTop:12},quickRow:{flexDirection:'row',paddingHorizontal:16,paddingBottom:8,gap:6},quick:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e7eb',borderRadius:999,paddingHorizontal:12,paddingVertical:8},quickActive:{backgroundColor:'#e5e7eb',borderWidth:1,borderColor:'#111827',borderRadius:999,paddingHorizontal:12,paddingVertical:8} });
