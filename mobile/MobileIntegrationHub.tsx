import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SupabaseClient } from '@supabase/supabase-js';
import CardCollaboration from './CardCollaboration';

type Board = { id: string; name: string };
type List = { id: string; board_id: string; name: string };
type Card = { id: string; list_id: string; title: string; description?: string | null; due_at?: string | null; assignee_id?: string | null; priority?: string | null };
type Profile = { id: string; full_name: string | null };
type Member = { user_id: string; role: string };
type Attachment = { id: string; card_id: string; file_name: string; mime_type?: string | null; size_bytes?: number | null; storage_path: string; created_at: string };
type View = 'tasks' | 'calendar' | 'documents' | 'team';

type Props = { supabase: SupabaseClient; userId: string; selectedBoard: string | null; boards: Board[]; onSelectedBoardChange?: (boardId: string) => void; onOpenCard?: (card: Card) => void; view?: View | null; onViewChange?: (view: View | null) => void };

export default function MobileIntegrationHub({ supabase, userId, selectedBoard, boards, onSelectedBoardChange, onOpenCard, view: controlledView, onViewChange }: Props) {
  const [localView, setLocalView] = useState<View | null>(controlledView ?? null);
  const view = controlledView !== undefined ? controlledView : localView;
  const changeView = (next: View | null) => { setLocalView(next); onViewChange?.(next); };
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const boardIds = useMemo(() => selectedBoard ? [selectedBoard] : boards.map(b => b.id), [selectedBoard, boards]);
  const loadSeq = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listIdsRef = useRef<Set<string>>(new Set());
  const cardIdsRef = useRef<Set<string>>(new Set());
  const profileIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    listIdsRef.current = new Set(lists.map(list => list.id));
    cardIdsRef.current = new Set(cards.map(card => card.id));
    profileIdsRef.current = new Set([
      ...members.map(member => member.user_id),
      ...cards.map(card => card.assignee_id).filter(Boolean) as string[],
    ]);
  }, [lists, cards, members]);

  async function loadData() {
    if (!boardIds.length || !userId) return;
    const requestId = ++loadSeq.current;
    setLoading(true); setMessage('');
    const listResult = await supabase.from('lists').select('id,board_id,name').in('board_id', boardIds).order('position');
    if (requestId !== loadSeq.current) return;
    if (listResult.error) { setMessage(listResult.error.message); setLoading(false); return; }
    const nextLists = (listResult.data ?? []) as List[];
    const listIds = nextLists.map(l => l.id);
    let nextCards: Card[] = [];
    if (listIds.length) {
      const cardResult = await supabase.from('cards').select('id,list_id,title,description,due_at,assignee_id,priority').in('list_id', listIds).order('position');
      if (requestId !== loadSeq.current) return;
      if (cardResult.error) { setMessage(cardResult.error.message); setLoading(false); return; }
      nextCards = (cardResult.data ?? []) as Card[];
    }
    const memberBoard = selectedBoard ?? boardIds[0];
    let nextMembers: Member[] = [];
    if (memberBoard) {
      const memberResult = await supabase.from('board_members').select('user_id,role').eq('board_id', memberBoard);
      if (requestId !== loadSeq.current) return;
      if (memberResult.error) { setMessage(memberResult.error.message); setLoading(false); return; }
      nextMembers = (memberResult.data ?? []) as Member[];
    }
    let nextAttachments: Attachment[] = [];
    if (view === 'documents' && nextCards.length) {
      const attachmentResult = await supabase.from('card_attachments').select('id,card_id,file_name,mime_type,size_bytes,storage_path,created_at').in('card_id', nextCards.map(c => c.id)).order('created_at', { ascending: false });
      if (requestId !== loadSeq.current) return;
      if (attachmentResult.error) { setMessage(attachmentResult.error.message); setLoading(false); return; }
      nextAttachments = (attachmentResult.data ?? []) as Attachment[];
    }
    const profileIds = Array.from(new Set([...nextMembers.map(m => m.user_id), ...nextCards.map(c => c.assignee_id).filter(Boolean) as string[]]));
    let nextProfiles: Profile[] = [];
    if (profileIds.length) {
      const profileResult = await supabase.from('profiles').select('id,full_name').in('id', profileIds);
      if (requestId !== loadSeq.current) return;
      if (!profileResult.error) nextProfiles = (profileResult.data ?? []) as Profile[];
    }
    if (requestId !== loadSeq.current) return;
    listIdsRef.current = new Set(nextLists.map(list => list.id));
    cardIdsRef.current = new Set(nextCards.map(card => card.id));
    profileIdsRef.current = new Set([
      ...nextMembers.map(member => member.user_id),
      ...nextCards.map(card => card.assignee_id).filter(Boolean) as string[],
    ]);
    setLists(nextLists); setCards(nextCards); setMembers(nextMembers); setProfiles(nextProfiles); setAttachments(nextAttachments); setLoading(false);
  }

  function scheduleRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { refreshTimer.current = null; void loadData(); }, 200);
  }

  useEffect(() => {
    if (!view) return;
    void loadData();
    const channel = supabase.channel(`mobile-hub-${selectedBoard ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', ...(selectedBoard ? { filter: `board_id=eq.${selectedBoard}` } : {}) }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, payload => {
        const oldRow = payload.old as Partial<Card>;
        const newRow = payload.new as Partial<Card>;
        const relevantListIds = [oldRow.list_id, newRow.list_id].filter((id): id is string => Boolean(id));
        if (!relevantListIds.some(id => listIdsRef.current.has(id))) return;
        scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_attachments' }, payload => {
        const oldRow = payload.old as Partial<Attachment>;
        const newRow = payload.new as Partial<Attachment>;
        const relevantCardIds = [oldRow.card_id, newRow.card_id].filter((id): id is string => Boolean(id));
        if (!relevantCardIds.some(id => cardIdsRef.current.has(id))) return;
        scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_members', ...(selectedBoard ? { filter: `board_id=eq.${selectedBoard}` } : {}) }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, payload => {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Partial<Profile>;
        if (!row.id || !profileIdsRef.current.has(row.id)) return;
        scheduleRefresh();
      })
      .subscribe();
    return () => {
      ++loadSeq.current;
      if (refreshTimer.current) { clearTimeout(refreshTimer.current); refreshTimer.current = null; }
      void supabase.removeChannel(channel);
    };
  }, [view, selectedBoard, userId, boardIds.join(','), supabase]);

  useEffect(() => {
    if (!selectedCard) return;
    if (!cards.some(card => card.id === selectedCard.id)) setSelectedCard(null);
  }, [cards, selectedCard]);

  const listMap = useMemo(() => new Map(lists.map(l => [l.id, l])), [lists]);
  const boardMap = useMemo(() => new Map(boards.map(b => [b.id, b])), [boards]);
  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const dueCards = useMemo(() => cards.filter(c => c.due_at).sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()), [cards]);

  async function openAttachment(item: Attachment) {
    const { data, error } = await supabase.storage.from('card-attachments').createSignedUrl(item.storage_path, 60 * 10);
    if (error || !data?.signedUrl) { Alert.alert('Dokument öffnen', error?.message ?? 'Dokument konnte nicht geöffnet werden.'); return; }
    try { await Linking.openURL(data.signedUrl); } catch { Alert.alert('Dokument öffnen', 'Auf diesem Gerät konnte der Link nicht geöffnet werden.'); }
  }

  async function deleteAttachment(item: Attachment) {
    const role = members.find(m => m.user_id === userId)?.role;
    if (role !== 'owner' && role !== 'admin') return;
    Alert.alert('Dokument löschen', `„${item.file_name}“ wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        const storageResult = await supabase.storage.from('card-attachments').remove([item.storage_path]);
        if (storageResult.error) { Alert.alert('Dokument löschen', storageResult.error.message); return; }
        const result = await supabase.from('card_attachments').delete().eq('id', item.id);
        if (result.error) Alert.alert('Dokument löschen', result.error.message); else setAttachments(v => v.filter(a => a.id !== item.id));
      } },
    ]);
  }

  function openTask(card: Card) {
    if (onOpenCard) onOpenCard(card);
    else setSelectedCard(card);
  }

  const title = view === 'tasks' ? 'Aufgaben' : view === 'calendar' ? 'Kalender' : view === 'documents' ? 'Dokumente' : 'Team';
  const boardLabel = selectedBoard ? boardMap.get(selectedBoard)?.name : 'Alle Boards';
  const selectedList = selectedCard ? listMap.get(selectedCard.list_id) : null;
  const selectedAssignee = selectedCard?.assignee_id ? profileMap.get(selectedCard.assignee_id)?.full_name : null;

  return <>
    <View style={styles.row}>
      <Tab label="Aufgaben" active={view === 'tasks'} onPress={() => changeView('tasks')} />
      <Tab label="Kalender" active={view === 'calendar'} onPress={() => changeView('calendar')} />
      <Tab label="Dokumente" active={view === 'documents'} onPress={() => changeView('documents')} />
      <Tab label="Team" active={view === 'team'} onPress={() => changeView('team')} />
    </View>
    <Modal visible={!!view} animationType="slide" onRequestClose={() => changeView(null)}>
      <View style={styles.safe}>
        <View style={styles.header}><View style={styles.headerMain}><Text style={styles.title}>{title}</Text><Text style={styles.meta}>{boardLabel}</Text></View><Pressable onPress={() => changeView(null)}><Text style={styles.close}>Schließen</Text></Pressable></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardPicker}>
          {boards.map(board => <Pressable key={board.id} onPress={() => onSelectedBoardChange?.(board.id)} style={[styles.boardChip, board.id === selectedBoard && styles.boardChipActive]}><Text style={board.id === selectedBoard ? styles.boardChipTextActive : styles.boardChipText}>{board.name}</Text></Pressable>)}
        </ScrollView>
        {loading ? <View style={styles.center}><Text>Wird geladen …</Text></View> : <ScrollView contentContainerStyle={styles.content}>
          {message ? <Text style={styles.error}>{message}</Text> : null}
          {view === 'tasks' && (cards.length ? cards.map(card => <Pressable key={card.id} style={styles.card} onPress={() => openTask(card)}><Text style={styles.cardTitle}>{card.title}</Text><Text style={styles.meta}>{listMap.get(card.list_id)?.name ?? 'Aufgabe'}{card.assignee_id && profileMap.get(card.assignee_id)?.full_name ? ` · ${profileMap.get(card.assignee_id)?.full_name}` : ''}</Text>{card.due_at ? <Text style={styles.meta}>Fällig: {new Date(card.due_at).toLocaleDateString('de-DE')}</Text> : null}<Text style={styles.openHint}>Details öffnen</Text></Pressable>) : <Empty text="Keine Aufgaben gefunden." />)}
          {view === 'calendar' && (dueCards.length ? dueCards.map(card => <Pressable key={card.id} style={styles.card} onPress={() => openTask(card)}><Text style={styles.date}>{new Date(card.due_at!).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</Text><Text style={styles.cardTitle}>{card.title}</Text><Text style={styles.meta}>{listMap.get(card.list_id)?.name ?? 'Aufgabe'}</Text><Text style={styles.openHint}>Details öffnen</Text></Pressable>) : <Empty text="Keine fälligen Aufgaben vorhanden." />)}
          {view === 'documents' && (attachments.length ? attachments.map(item => { const card = cards.find(c => c.id === item.card_id); const canDelete = members.some(m => m.user_id === userId && (m.role === 'owner' || m.role === 'admin')); return <View key={item.id} style={styles.card}><Pressable onPress={() => card ? openTask(card) : void openAttachment(item)}><Text style={styles.cardTitle}>{item.file_name}</Text><Text style={styles.meta}>{listMap.get(card?.list_id ?? '')?.name ?? 'Dokument'} · {card?.title ?? 'Aufgabe'}</Text><Text style={styles.link}>{card ? 'Karte öffnen' : 'Dokument öffnen'}</Text></Pressable><Pressable onPress={() => void openAttachment(item)}><Text style={styles.link}>Datei öffnen</Text></Pressable>{canDelete ? <Pressable onPress={() => void deleteAttachment(item)}><Text style={styles.delete}>Löschen</Text></Pressable> : null}</View>; }) : <Empty text="Keine Dokumente im aktuellen Bereich." />)}
          {view === 'team' && (members.length ? members.map(member => <View key={member.user_id} style={styles.card}><Text style={styles.cardTitle}>{profileMap.get(member.user_id)?.full_name || 'Teammitglied'}</Text><Text style={styles.meta}>{member.role === 'viewer' ? 'Nur Lesen' : member.role}</Text></View>) : <Empty text="Keine Teammitglieder gefunden." />)}
        </ScrollView>}
      </View>
    </Modal>

    <Modal visible={!!selectedCard} animationType="slide" onRequestClose={() => setSelectedCard(null)}>
      <View style={styles.safe}>
        <View style={styles.header}><View style={styles.headerMain}><Text style={styles.title} numberOfLines={2}>{selectedCard?.title}</Text><Text style={styles.meta}>{boardLabel}{selectedList ? ` · ${selectedList.name}` : ''}</Text></View><Pressable onPress={() => setSelectedCard(null)}><Text style={styles.close}>Schließen</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.content}>
          {selectedCard?.description ? <View style={styles.detailBlock}><Text style={styles.detailLabel}>Beschreibung</Text><Text style={styles.detailText}>{selectedCard.description}</Text></View> : null}
          <View style={styles.detailBlock}><Text style={styles.detailLabel}>Details</Text><Text style={styles.meta}>Priorität: {selectedCard?.priority ?? 'normal'}</Text>{selectedCard?.due_at ? <Text style={styles.meta}>Fällig: {new Date(selectedCard.due_at).toLocaleDateString('de-DE')}</Text> : null}{selectedAssignee ? <Text style={styles.meta}>Zuständig: {selectedAssignee}</Text> : null}</View>
          {selectedCard ? <CardCollaboration supabase={supabase} cardId={selectedCard.id} userId={userId} /> : null}
        </ScrollView>
      </View>
    </Modal>
  </>;
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}><Text style={active ? styles.tabTextActive : styles.tabText}>{label}</Text></Pressable>; }
function Empty({ text }: { text: string }) { return <View style={styles.empty}><Text>{text}</Text></View>; }

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f8fafc'}, row:{flexDirection:'row',paddingHorizontal:12,paddingBottom:8,gap:6}, tab:{flex:1,minHeight:40,borderRadius:10,borderWidth:1,borderColor:'#d1d5db',alignItems:'center',justifyContent:'center',backgroundColor:'#fff'}, tabActive:{backgroundColor:'#111827',borderColor:'#111827'}, tabText:{fontSize:12}, tabTextActive:{fontSize:12,color:'#fff',fontWeight:'700'}, header:{padding:16,paddingTop:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#e5e7eb'}, headerMain:{flex:1}, title:{fontSize:24,fontWeight:'800'}, close:{fontSize:14,fontWeight:'700'}, content:{padding:16,gap:10}, boardPicker:{paddingHorizontal:16,paddingVertical:10,gap:8}, boardChip:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:999,paddingHorizontal:13,paddingVertical:8}, boardChipActive:{backgroundColor:'#111827',borderColor:'#111827'}, boardChipText:{fontSize:12}, boardChipTextActive:{fontSize:12,color:'#fff',fontWeight:'700'}, center:{flex:1,justifyContent:'center',alignItems:'center'}, card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e7eb',borderRadius:14,padding:14}, cardTitle:{fontSize:16,fontWeight:'700'}, meta:{fontSize:12,color:'#6b7280',marginTop:4}, date:{fontSize:13,fontWeight:'700',marginBottom:4}, link:{fontSize:13,fontWeight:'700',marginTop:8}, openHint:{fontSize:12,fontWeight:'700',marginTop:10}, error:{color:'#b91c1c',padding:12,backgroundColor:'#fee2e2',borderRadius:10}, empty:{padding:24,alignItems:'center'}, detailBlock:{backgroundColor:'#fff',borderRadius:12,padding:14,borderWidth:1,borderColor:'#e5e7eb'}, detailLabel:{fontSize:12,fontWeight:'700',textTransform:'uppercase'}, detailText:{fontSize:14,lineHeight:20,marginTop:6}, delete:{fontSize:13,fontWeight:'700',color:'#b91c1c',marginTop:10}
});