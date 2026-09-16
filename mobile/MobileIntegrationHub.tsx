import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SupabaseClient } from '@supabase/supabase-js';

type Board = { id: string; name: string };
type List = { id: string; board_id: string; name: string };
type Card = { id: string; list_id: string; title: string; description?: string | null; due_at?: string | null; assignee_id?: string | null; priority?: string | null };
type Profile = { id: string; full_name: string | null };
type Member = { user_id: string; role: string };
type Attachment = { id: string; card_id: string; file_name: string; mime_type?: string | null; size_bytes?: number | null; storage_path: string; created_at: string };
type View = 'tasks' | 'calendar' | 'documents' | 'team';

export default function MobileIntegrationHub({ supabase, userId, selectedBoard, boards, onOpenCard }: { supabase: SupabaseClient; userId: string; selectedBoard: string | null; boards: Board[]; onOpenCard?: (card: Card) => void }) {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const boardIds = useMemo(() => selectedBoard ? [selectedBoard] : boards.map(b => b.id), [selectedBoard, boards]);

  async function loadData() {
    if (!boardIds.length || !userId) return;
    setLoading(true); setMessage('');
    const listResult = await supabase.from('lists').select('id,board_id,name').in('board_id', boardIds).order('position');
    if (listResult.error) { setMessage(listResult.error.message); setLoading(false); return; }
    const nextLists = (listResult.data ?? []) as List[];
    const listIds = nextLists.map(l => l.id);
    let nextCards: Card[] = [];
    if (listIds.length) {
      const cardResult = await supabase.from('cards').select('id,list_id,title,description,due_at,assignee_id,priority').in('list_id', listIds).order('position');
      if (cardResult.error) { setMessage(cardResult.error.message); setLoading(false); return; }
      nextCards = (cardResult.data ?? []) as Card[];
    }
    const memberBoard = selectedBoard ?? boardIds[0];
    let nextMembers: Member[] = [];
    if (memberBoard) {
      const memberResult = await supabase.from('board_members').select('user_id,role').eq('board_id', memberBoard);
      if (memberResult.error) { setMessage(memberResult.error.message); setLoading(false); return; }
      nextMembers = (memberResult.data ?? []) as Member[];
    }
    let nextAttachments: Attachment[] = [];
    if (view === 'documents' && nextCards.length) {
      const attachmentResult = await supabase.from('card_attachments').select('id,card_id,file_name,mime_type,size_bytes,storage_path,created_at').in('card_id', nextCards.map(c => c.id)).order('created_at', { ascending: false });
      if (attachmentResult.error) { setMessage(attachmentResult.error.message); setLoading(false); return; }
      nextAttachments = (attachmentResult.data ?? []) as Attachment[];
    }
    const profileIds = Array.from(new Set([...nextMembers.map(m => m.user_id), ...nextCards.map(c => c.assignee_id).filter(Boolean) as string[]]));
    let nextProfiles: Profile[] = [];
    if (profileIds.length) {
      const profileResult = await supabase.from('profiles').select('id,full_name').in('id', profileIds);
      if (!profileResult.error) nextProfiles = (profileResult.data ?? []) as Profile[];
    }
    setLists(nextLists); setCards(nextCards); setMembers(nextMembers); setProfiles(nextProfiles); setAttachments(nextAttachments); setLoading(false);
  }

  useEffect(() => {
    if (!view) return;
    let alive = true;
    void loadData().then(() => { if (!alive) return; });
    const channel = supabase.channel(`mobile-hub-${selectedBoard ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_attachments' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_members' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void loadData())
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [view, selectedBoard, userId, boardIds.join(','), supabase]);

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
    const card = cards.find(c => c.id === item.card_id);
    const list = card ? listMap.get(card.list_id) : undefined;
    const role = members.find(m => m.user_id === userId)?.role;
    const allowed = role === 'owner' || role === 'admin';
    if (!card || !list || !allowed) return;
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

  const title = view === 'tasks' ? 'Aufgaben' : view === 'calendar' ? 'Kalender' : view === 'documents' ? 'Dokumente' : 'Team';
  const boardLabel = selectedBoard ? boardMap.get(selectedBoard)?.name : 'Alle Boards';

  return <>
    <View style={styles.row}>
      <Tab label="Aufgaben" active={view === 'tasks'} onPress={() => setView('tasks')} />
      <Tab label="Kalender" active={view === 'calendar'} onPress={() => setView('calendar')} />
      <Tab label="Dokumente" active={view === 'documents'} onPress={() => setView('documents')} />
      <Tab label="Team" active={view === 'team'} onPress={() => setView('team')} />
    </View>
    <Modal visible={!!view} animationType="slide" onRequestClose={() => setView(null)}>
      <View style={styles.safe}>
        <View style={styles.header}><View><Text style={styles.title}>{title}</Text><Text style={styles.meta}>{boardLabel}</Text></View><Pressable onPress={() => setView(null)}><Text style={styles.close}>Schließen</Text></Pressable></View>
        {loading ? <View style={styles.center}><Text>Wird geladen …</Text></View> : <ScrollView contentContainerStyle={styles.content}>
          {message ? <Text style={styles.error}>{message}</Text> : null}
          {view === 'tasks' && (cards.length ? cards.map(card => <Pressable key={card.id} style={styles.card} onPress={() => onOpenCard?.(card)}><Text style={styles.cardTitle}>{card.title}</Text><Text style={styles.meta}>{listMap.get(card.list_id)?.name ?? 'Aufgabe'}{card.assignee_id && profileMap.get(card.assignee_id)?.full_name ? ` · ${profileMap.get(card.assignee_id)?.full_name}` : ''}</Text>{card.due_at ? <Text style={styles.meta}>Fällig: {new Date(card.due_at).toLocaleDateString('de-DE')}</Text> : null}</Pressable>) : <Empty text="Keine Aufgaben gefunden." />)}
          {view === 'calendar' && (dueCards.length ? dueCards.map(card => <Pressable key={card.id} style={styles.card} onPress={() => onOpenCard?.(card)}><Text style={styles.date}>{new Date(card.due_at!).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</Text><Text style={styles.cardTitle}>{card.title}</Text><Text style={styles.meta}>{listMap.get(card.list_id)?.name ?? 'Aufgabe'}</Text></Pressable>) : <Empty text="Keine fälligen Aufgaben vorhanden." />)}
          {view === 'documents' && (attachments.length ? attachments.map(item => { const card = cards.find(c => c.id === item.card_id); const canDelete = members.some(m => m.user_id === userId && (m.role === 'owner' || m.role === 'admin')); return <View key={item.id} style={styles.card}><Pressable onPress={() => void openAttachment(item)}><Text style={styles.cardTitle}>{item.file_name}</Text><Text style={styles.meta}>{listMap.get(card?.list_id ?? '')?.name ?? 'Dokument'} · {card?.title ?? 'Aufgabe'}</Text><Text style={styles.link}>Öffnen</Text></Pressable>{canDelete ? <Pressable onPress={() => void deleteAttachment(item)}><Text style={styles.delete}>Löschen</Text></Pressable> : null}</View>; }) : <Empty text="Keine Dokumente im aktuellen Bereich." />)}
          {view === 'team' && (members.length ? members.map(member => <View key={member.user_id} style={styles.card}><Text style={styles.cardTitle}>{profileMap.get(member.user_id)?.full_name || 'Teammitglied'}</Text><Text style={styles.meta}>{member.role === 'viewer' ? 'Nur Lesen' : member.role}</Text></View>) : <Empty text="Keine Teammitglieder gefunden." />)}
        </ScrollView>}
      </View>
    </Modal>
  </>;
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}><Text style={active ? styles.tabTextActive : styles.tabText}>{label}</Text></Pressable>; }
function Empty({ text }: { text: string }) { return <View style={styles.empty}><Text>{text}</Text></View>; }

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f8fafc'}, row:{flexDirection:'row',paddingHorizontal:12,paddingBottom:8,gap:6}, tab:{flex:1,minHeight:40,borderRadius:10,borderWidth:1,borderColor:'#d1d5db',alignItems:'center',justifyContent:'center',backgroundColor:'#fff'}, tabActive:{backgroundColor:'#111827',borderColor:'#111827'}, tabText:{fontSize:12}, tabTextActive:{fontSize:12,color:'#fff',fontWeight:'700'}, header:{padding:16,paddingTop:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#e5e7eb'}, title:{fontSize:24,fontWeight:'800'}, close:{fontSize:14,fontWeight:'700'}, content:{padding:16,gap:10}, center:{flex:1,justifyContent:'center',alignItems:'center'}, card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e7eb',borderRadius:14,padding:14}, cardTitle:{fontSize:16,fontWeight:'700'}, meta:{fontSize:12,color:'#6b7280',marginTop:4}, date:{fontSize:13,fontWeight:'700',marginBottom:4}, link:{fontSize:13,fontWeight:'700',marginTop:8}, delete:{fontSize:13,fontWeight:'700',marginTop:12}, error:{color:'#b91c1c',padding:12,backgroundColor:'#fee2e2',borderRadius:10}, empty:{padding:24,alignItems:'center'}, link:{fontSize:13,fontWeight:'700',marginTop:8}
});
