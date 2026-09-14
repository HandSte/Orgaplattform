import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import CardCollaboration from './CardCollaboration';

type Board = { id: string; name: string };
type List = { id: string; board_id: string; name: string; position: number };
type Card = { id: string; list_id: string; title: string; description?: string | null; position: number; priority: string | null };
type SessionUser = { id: string; email?: string | null };

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }) : null;

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login'); const [authBusy, setAuthBusy] = useState(false); const [message, setMessage] = useState('');
  const [boards, setBoards] = useState<Board[]>([]); const [lists, setLists] = useState<List[]>([]); const [cards, setCards] = useState<Card[]>([]); const [selectedBoard, setSelectedBoard] = useState<string | null>(null); const [loadingBoard, setLoadingBoard] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null); const [cardTitle, setCardTitle] = useState(''); const [cardDescription, setCardDescription] = useState(''); const [cardPriority, setCardPriority] = useState('normal'); const [savingCard, setSavingCard] = useState(false);
  const listIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => { if (mounted) setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ? { id: session.user.id, email: session.user.email } : null));
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !user) { setBoards([]); setSelectedBoard(null); return; }
    void (async () => {
      const { data, error } = await supabase.from('boards').select('id,name').order('updated_at', { ascending: false });
      if (error) { setMessage(error.message); return; }
      setBoards((data ?? []) as Board[]);
      setSelectedBoard(current => current && data?.some(b => b.id === current) ? current : data?.[0]?.id ?? null);
    })();
  }, [user]);

  useEffect(() => {
    if (!supabase || !selectedBoard || !user) return;
    let alive = true; setLoadingBoard(true); listIdsRef.current = new Set();
    void (async () => {
      const { data, error } = await supabase.rpc('get_board_snapshot', { p_board_id: selectedBoard });
      if (!alive) return;
      if (error) { setMessage(error.message); setLists([]); setCards([]); setLoadingBoard(false); return; }
      const snapshot = data as { lists?: List[]; cards?: Card[] } | null;
      const nextLists = snapshot?.lists ?? [];
      listIdsRef.current = new Set(nextLists.map(list => list.id));
      setLists(nextLists); setCards(snapshot?.cards ?? []); setLoadingBoard(false);
    })();
    const channel = supabase.channel(`mobile-board-${selectedBoard}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter: `board_id=eq.${selectedBoard}` }, payload => {
        if (payload.eventType === 'INSERT') { const list = payload.new as List; listIdsRef.current.add(list.id); setLists(v => v.some(x => x.id === list.id) ? v : [...v, list]); }
        if (payload.eventType === 'UPDATE') setLists(v => v.map(x => x.id === payload.new.id ? payload.new as List : x));
        if (payload.eventType === 'DELETE') { listIdsRef.current.delete(payload.old.id as string); setLists(v => v.filter(x => x.id !== payload.old.id)); setCards(v => v.filter(x => x.list_id !== payload.old.id)); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, payload => {
        if (payload.eventType === 'INSERT') { const card = payload.new as Card; if (!listIdsRef.current.has(card.list_id)) return; setCards(v => v.some(x => x.id === card.id) ? v : [...v, card]); }
        if (payload.eventType === 'UPDATE') { const card = payload.new as Card; const belongs = listIdsRef.current.has(card.list_id); setCards(v => belongs ? (v.some(x => x.id === card.id) ? v.map(x => x.id === card.id ? card : x) : [...v, card]) : v.filter(x => x.id !== card.id)); }
        if (payload.eventType === 'DELETE') setCards(v => v.filter(x => x.id !== payload.old.id));
      }).subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [selectedBoard, user]);

  async function submitAuth() {
    if (!supabase || !email.trim() || !password) return;
    setAuthBusy(true); setMessage('');
    const result = authMode === 'login' ? await supabase.auth.signInWithPassword({ email: email.trim(), password }) : await supabase.auth.signUp({ email: email.trim(), password });
    setAuthBusy(false); if (result.error) { setMessage(result.error.message); return; }
    setMessage(authMode === 'login' ? '' : 'Konto angelegt. Bitte bestätige ggf. deine E-Mail-Adresse.');
  }
  async function signOut() { if (!supabase) return; const { error } = await supabase.auth.signOut(); if (error) Alert.alert('Abmelden', error.message); }

  function openCard(card: Card) { setEditingCard(card); setCardTitle(card.title); setCardDescription(card.description ?? ''); setCardPriority(card.priority ?? 'normal'); }
  function openNewCard(listId: string) { setEditingCard({ id: '', list_id: listId, title: '', description: '', position: 999999, priority: 'normal' }); setCardTitle(''); setCardDescription(''); setCardPriority('normal'); }
  async function saveCard() {
    if (!supabase || !editingCard || !cardTitle.trim()) return;
    setSavingCard(true);
    if (editingCard.id) {
      const { data, error } = await supabase.from('cards').update({ title: cardTitle.trim(), description: cardDescription.trim() || null, priority: cardPriority }).eq('id', editingCard.id).select('*').single();
      if (error) Alert.alert('Karte speichern', error.message); else setCards(v => v.map(c => c.id === editingCard.id ? data as Card : c));
    } else {
      const positions = cards.filter(card => card.list_id === editingCard.list_id).map(card => Number(card.position) || 0);
      const nextPosition = Math.max(0, ...positions) + 1;
      const { data, error } = await supabase.from('cards').insert({ list_id: editingCard.list_id, title: cardTitle.trim(), description: cardDescription.trim() || null, priority: cardPriority, position: nextPosition }).select('*').single();
      if (error) Alert.alert('Karte anlegen', error.message); else if (data) setCards(v => [...v, data as Card]);
    }
    setSavingCard(false); setEditingCard(null);
  }
  function deleteCard() {
    if (!supabase || !editingCard?.id) return;
    Alert.alert('Karte löschen', 'Diese Karte wirklich löschen?', [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: async () => { const { error } = await supabase.from('cards').delete().eq('id', editingCard.id); if (error) Alert.alert('Karte löschen', error.message); else { setCards(v => v.filter(c => c.id !== editingCard.id)); setEditingCard(null); } } }]);
  }

  const activeLists = useMemo(() => [...lists].filter(x => x.board_id === selectedBoard).sort((a,b) => a.position - b.position), [lists, selectedBoard]);
  const cardsByList = (listId: string) => [...cards].filter(x => x.list_id === listId).sort((a,b) => a.position - b.position);
  if (!supabase) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.brand}>Orgaplattform</Text><Text>Mobile Supabase-Konfiguration fehlt.</Text></View></SafeAreaView>;
  if (!user) return <SafeAreaView style={styles.safe}><StatusBar style="auto" /><View style={styles.auth}><Text style={styles.brand}>Orgaplattform</Text><Text style={styles.heading}>{authMode === 'login' ? 'Anmelden' : 'Konto erstellen'}</Text><TextInput style={styles.input} placeholder="E-Mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" /><TextInput style={styles.input} placeholder="Passwort" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" /><Pressable style={styles.primary} onPress={() => void submitAuth()} disabled={authBusy}><Text style={styles.primaryText}>{authBusy ? 'Bitte warten …' : authMode === 'login' ? 'Anmelden' : 'Registrieren'}</Text></Pressable>{message ? <Text style={styles.message}>{message}</Text> : null}<Pressable onPress={() => { setAuthMode(v => v === 'login' ? 'signup' : 'login'); setMessage(''); }}><Text style={styles.link}>{authMode === 'login' ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Anmelden'}</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><StatusBar style="auto" /><View style={styles.header}><View><Text style={styles.brandSmall}>Orgaplattform</Text><Text style={styles.subtitle}>{user.email ?? 'Angemeldet'}</Text></View><Pressable onPress={() => void signOut()} style={styles.secondary}><Text>Abmelden</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boards}>{boards.map(board => <Pressable key={board.id} onPress={() => setSelectedBoard(board.id)} style={[styles.boardChip, board.id === selectedBoard && styles.boardChipActive]}><Text style={board.id === selectedBoard ? styles.boardChipTextActive : undefined}>{board.name}</Text></Pressable>)}</ScrollView>{loadingBoard ? <View style={styles.center}><Text>Board wird geladen …</Text></View> : <ScrollView horizontal contentContainerStyle={styles.board} showsHorizontalScrollIndicator={false}>{activeLists.map(list => <View key={list.id} style={styles.column}><View style={styles.columnHead}><Text style={styles.columnTitle}>{list.name}</Text><Pressable onPress={() => openNewCard(list.id)} style={styles.add}><Text style={styles.addText}>＋</Text></Pressable></View>{cardsByList(list.id).map(card => <Pressable key={card.id} style={styles.card} onPress={() => openCard(card)}><Text style={styles.cardTitle}>{card.title}</Text><Text style={styles.meta}>{card.priority ?? 'normal'}</Text></Pressable>)}</View>)}{!activeLists.length && <View style={styles.empty}><Text style={styles.title}>{boards.length ? 'Keine Listen vorhanden' : 'Keine Boards vorhanden'}</Text></View>}</ScrollView>}
    <Modal visible={!!editingCard} animationType="slide" transparent onRequestClose={() => setEditingCard(null)}><View style={styles.modalBackdrop}><View style={styles.modal}><ScrollView keyboardShouldPersistTaps="handled"><View style={styles.modalHead}><Text style={styles.heading}>{editingCard?.id ? 'Karte bearbeiten' : 'Neue Karte'}</Text><Pressable onPress={() => setEditingCard(null)}><Text style={styles.close}>×</Text></Pressable></View><TextInput style={styles.input} placeholder="Titel" value={cardTitle} onChangeText={setCardTitle} autoFocus /><TextInput style={[styles.input, styles.textarea]} placeholder="Beschreibung" value={cardDescription} onChangeText={setCardDescription} multiline textAlignVertical="top" /><Text style={styles.label}>Priorität</Text><View style={styles.priorityRow}>{['low','normal','high','urgent'].map(p => <Pressable key={p} onPress={() => setCardPriority(p)} style={[styles.priority, cardPriority === p && styles.priorityActive]}><Text style={cardPriority === p ? styles.priorityTextActive : undefined}>{p}</Text></Pressable>)}</View><Pressable style={styles.primary} onPress={() => void saveCard()} disabled={savingCard}><Text style={styles.primaryText}>{savingCard ? 'Speichern …' : 'Speichern'}</Text></Pressable>{editingCard?.id && user ? <CardCollaboration supabase={supabase} cardId={editingCard.id} userId={user.id} /> : null}{editingCard?.id ? <Pressable style={styles.delete} onPress={deleteCard}><Text style={styles.deleteText}>Karte löschen</Text></Pressable> : null}</ScrollView></View></View></Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:'#f8fafc'},auth:{padding:24,marginTop:60},center:{flex:1,justifyContent:'center',alignItems:'center',padding:24},brand:{fontSize:30,fontWeight:'800',marginBottom:24},heading:{fontSize:24,fontWeight:'700',marginBottom:18},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:12,padding:14,marginBottom:12,fontSize:16},textarea:{height:120},primary:{backgroundColor:'#111827',borderRadius:12,padding:15,alignItems:'center',marginTop:4},primaryText:{color:'#fff',fontWeight:'700',fontSize:16},message:{marginTop:14,color:'#b91c1c'},link:{textAlign:'center',marginTop:18,color:'#2563eb'},header:{padding:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brandSmall:{fontSize:22,fontWeight:'800'},subtitle:{fontSize:12,color:'#6b7280',marginTop:2},secondary:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',paddingHorizontal:12,paddingVertical:9,borderRadius:10},boards:{paddingHorizontal:16,paddingBottom:10,gap:8},boardChip:{paddingHorizontal:14,paddingVertical:10,borderRadius:20,backgroundColor:'#e5e7eb'},boardChipActive:{backgroundColor:'#111827'},boardChipTextActive:{color:'#fff',fontWeight:'700'},board:{padding:16,gap:14},column:{width:300,backgroundColor:'#e5e7eb',borderRadius:14,padding:12,minHeight:180},columnHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10},columnTitle:{fontSize:17,fontWeight:'700'},add:{width:34,height:34,borderRadius:10,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},addText:{fontSize:22},card:{backgroundColor:'#fff',borderRadius:12,padding:13,marginBottom:9},cardTitle:{fontSize:15,fontWeight:'600'},meta:{fontSize:12,color:'#6b7280',marginTop:6},title:{fontSize:22,fontWeight:'800',marginBottom:8},empty:{padding:20},modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.35)',justifyContent:'flex-end'},modal:{backgroundColor:'#f8fafc',borderTopLeftRadius:22,borderTopRightRadius:22,padding:20,paddingBottom:34,maxHeight:'92%'},modalHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},close:{fontSize:32,color:'#6b7280'},label:{fontWeight:'700',marginBottom:8},priorityRow:{flexDirection:'row',gap:8,marginBottom:16},priority:{paddingHorizontal:12,paddingVertical:9,borderRadius:10,backgroundColor:'#e5e7eb'},priorityActive:{backgroundColor:'#111827'},priorityTextActive:{color:'#fff',fontWeight:'700'},delete:{padding:14,alignItems:'center',marginTop:8},deleteText:{color:'#dc2626',fontWeight:'700'} });
