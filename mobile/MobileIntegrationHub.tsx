import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SupabaseClient } from '@supabase/supabase-js';
import CardCollaboration from './CardCollaboration';

type Board = { id: string; name: string; description?: string | null; owner_id?: string; scheduled_date?: string | null };
type List = { id: string; board_id: string; name: string };
type Card = { id: string; list_id: string; title: string; description?: string | null; due_at?: string | null; assignee_id?: string | null; priority?: string | null };
type Profile = { id: string; full_name: string | null };
type Member = { user_id: string; role: 'owner' | 'admin' | 'member' | 'viewer' };
type CalendarEvent = { id: string; title: string; description?: string | null; starts_at: string; ends_at?: string | null; all_day: boolean; board_id?: string | null; created_by: string };
type PendingInvite = { id: string; email: string; role: 'admin' | 'member' | 'viewer'; expires_at: string };
type Attachment = { id: string; card_id: string; uploader_id: string; file_name: string; mime_type?: string | null; size_bytes?: number | null; storage_path: string; created_at: string };
type AppView = 'overview' | 'boards' | 'tasks' | 'calendar' | 'documents' | 'team' | 'settings';

type Props = {
  supabase: SupabaseClient;
  userId: string;
  selectedBoard: string | null;
  boards: Board[];
  onSelectedBoardChange?: (boardId: string) => void;
  onOpenCard?: (card: Card) => void;
  view?: AppView | null;
  onViewChange?: (view: AppView | null) => void;
  showTabs?: boolean;
};

export default function MobileIntegrationHub({ supabase, userId, selectedBoard, boards, onSelectedBoardChange, onOpenCard, view, onViewChange, showTabs = true }: Props) {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [teamBusy, setTeamBusy] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState('');
  const [editingBoardDescription, setEditingBoardDescription] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [calendarDraftTitle, setCalendarDraftTitle] = useState('');
  const [calendarDraftDate, setCalendarDraftDate] = useState(() => new Date().toISOString());
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [taskQuery, setTaskQuery] = useState('');
  const [taskFilter, setTaskFilter] = useState<'all' | 'mine' | 'today' | 'overdue' | 'high'>('all');
  const loadSeq = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listIdsRef = useRef<Set<string>>(new Set());
  const cardIdsRef = useRef<Set<string>>(new Set());
  const profileIdsRef = useRef<Set<string>>(new Set());

  const boardIds = useMemo(() => selectedBoard ? [selectedBoard] : boards.map(b => b.id), [selectedBoard, boards]);
  const listMap = useMemo(() => new Map(lists.map(l => [l.id, l])), [lists]);
  const boardMap = useMemo(() => new Map(boards.map(b => [b.id, b])), [boards]);
  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const dueCards = useMemo(() => cards.filter(c => c.due_at).sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()), [cards]);
  const visibleTasks = useMemo(() => { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const end = new Date(start); end.setDate(end.getDate() + 1); const q = taskQuery.trim().toLowerCase(); return cards.filter(card => { const listName = listMap.get(card.list_id)?.name ?? ''; const haystack = `${card.title} ${card.description ?? ''} ${listName}`.toLowerCase(); if (q && !haystack.includes(q)) return false; if (taskFilter === 'mine' && card.assignee_id !== userId) return false; if (taskFilter === 'high' && card.priority !== 'high' && card.priority !== 'urgent') return false; if (taskFilter === 'overdue') return !!card.due_at && new Date(card.due_at) < now; if (taskFilter === 'today') return !!card.due_at && new Date(card.due_at) >= start && new Date(card.due_at) < end; return true; }).sort((a,b) => new Date(a.due_at ?? '9999-12-31').getTime() - new Date(b.due_at ?? '9999-12-31').getTime()); }, [cards, listMap, taskFilter, taskQuery, userId]);
  const title = view === 'boards' ? 'Meine Boards' : view === 'tasks' ? 'Aufgaben' : view === 'calendar' ? 'Kalender' : view === 'documents' ? 'Dokumente' : view === 'team' ? 'Team' : 'Einstellungen';
  const boardLabel = selectedBoard ? boardMap.get(selectedBoard)?.name ?? 'Board' : 'Alle Boards';
  const myRole = members.find(m => m.user_id === userId)?.role ?? null;
  const canManageTeam = myRole === 'owner' || myRole === 'admin' || (selectedBoard ? boardMap.get(selectedBoard)?.owner_id === userId : false);
  const canEditBoard = selectedBoard ? boardMap.get(selectedBoard)?.owner_id === userId : false;
  const calendarItems = useMemo(() => [...boards.filter(b => b.scheduled_date).map(b => ({ id: `board-${b.id}`, title: b.name, date: b.scheduled_date!, boardId: b.id, kind: 'board' as const })), ...calendarEvents.map(e => ({ id: e.id, title: e.title, date: e.starts_at, boardId: e.board_id ?? null, kind: 'event' as const }))].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [boards, calendarEvents]);
  const monthCalendarItems = useMemo(() => calendarItems.filter(item => { const d = new Date(item.kind === 'board' ? item.date + 'T00:00:00' : item.date); return d.getFullYear() === calendarMonth.getFullYear() && d.getMonth() === calendarMonth.getMonth(); }), [calendarItems, calendarMonth]);

  useEffect(() => {
    listIdsRef.current = new Set(lists.map(list => list.id));
    cardIdsRef.current = new Set(cards.map(card => card.id));
    profileIdsRef.current = new Set([...members.map(member => member.user_id), ...cards.map(card => card.assignee_id).filter(Boolean) as string[]]);
  }, [lists, cards, members]);

  async function loadData() {
    if (!boardIds.length || !userId || !view || view === 'settings' || view === 'boards') return;
    const requestId = ++loadSeq.current;
    setLoading(true);
    setMessage('');
    const effectiveBoardIds = boards.map(b => b.id);
    const listResult = effectiveBoardIds.length ? await supabase.from('lists').select('id,board_id,name').in('board_id', effectiveBoardIds).order('position') : { data: [], error: null as null };
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
    let nextMembers: Member[] = [];
    if (selectedBoard) {
      const memberResult = await supabase.from('board_members').select('user_id,role').eq('board_id', selectedBoard);
      if (requestId !== loadSeq.current) return;
      if (memberResult.error) { setMessage(memberResult.error.message); setLoading(false); return; }
      nextMembers = (memberResult.data ?? []) as Member[];
    }
    let nextAttachments: Attachment[] = [];
    if (view === 'documents' && nextCards.length) {
      const attachmentResult = await supabase.from('card_attachments').select('id,card_id,uploader_id,file_name,mime_type,size_bytes,storage_path,created_at').in('card_id', nextCards.map(c => c.id)).order('created_at', { ascending: false });
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
    setLists(nextLists);
    setCards(nextCards);
    setMembers(nextMembers);
    setProfiles(nextProfiles);
    setAttachments(nextAttachments);
    if (view === 'calendar') {
      const eventResult = await supabase.from('calendar_events').select('id,title,description,starts_at,ends_at,all_day,board_id,created_by').order('starts_at');
      if (eventResult.error) setMessage(eventResult.error.message); else setCalendarEvents((eventResult.data ?? []) as CalendarEvent[]);
    }
    if (view === 'team' && selectedBoard) {
      const inviteResult = await supabase.from('board_invitations').select('id,email,role,expires_at').eq('board_id', selectedBoard).is('accepted_at', null).order('created_at', { ascending: false });
      if (inviteResult.error) setMessage(inviteResult.error.message); else setPendingInvites((inviteResult.data ?? []) as PendingInvite[]);
    }
    setLoading(false);
  }

  async function loadProfile() {
    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user;
    if (!user) return;
    setProfileEmail(user.email ?? '');
    const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    setProfileName(data?.full_name ?? '');
    const board = selectedBoard ? boardMap.get(selectedBoard) : boards[0];
    setEditingBoardName(board?.name ?? '');
    setEditingBoardDescription(board?.description ?? '');
  }

  function scheduleRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { refreshTimer.current = null; void loadData(); }, 200);
  }

  useEffect(() => {
    if (!view || view === 'settings' || view === 'boards') {
      if (view === 'settings') void loadProfile();
      return;
    }
    void loadData();
    const channel = supabase.channel(`mobile-hub-${selectedBoard ?? 'all'}-${view}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', ...(selectedBoard ? { filter: `board_id=eq.${selectedBoard}` } : {}) }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, payload => {
        const oldRow = payload.old as Partial<Card>;
        const newRow = payload.new as Partial<Card>;
        if ([oldRow.list_id, newRow.list_id].some(id => Boolean(id) && listIdsRef.current.has(id as string))) scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_attachments' }, payload => {
        const oldRow = payload.old as Partial<Attachment>;
        const newRow = payload.new as Partial<Attachment>;
        if ([oldRow.card_id, newRow.card_id].some(id => Boolean(id) && cardIdsRef.current.has(id as string))) scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_members', ...(selectedBoard ? { filter: `board_id=eq.${selectedBoard}` } : {}) }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, scheduleRefresh)
      .subscribe();
    return () => {
      ++loadSeq.current;
      if (refreshTimer.current) { clearTimeout(refreshTimer.current); refreshTimer.current = null; }
      void supabase.removeChannel(channel);
    };
  }, [view, selectedBoard, userId, boardIds.join(',')]);

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

  async function saveProfile() {
    setProfileBusy(true);
    const { error } = await supabase.from('profiles').update({ full_name: profileName.trim() || null, updated_at: new Date().toISOString() }).eq('id', userId);
    setProfileBusy(false);
    if (error) setMessage(error.message); else setMessage('Profil gespeichert.');
  }

  async function saveBoardSettings() {
    if (!selectedBoard || !canEditBoard || !editingBoardName.trim() || settingsBusy) return;
    setSettingsBusy(true); setMessage('');
    const result = await supabase.from('boards').update({ name: editingBoardName.trim(), description: editingBoardDescription.trim() || null, updated_at: new Date().toISOString() }).eq('id', selectedBoard).select().single();
    if (result.error || !result.data) setMessage(result.error?.message ?? 'Board konnte nicht gespeichert werden.'); else setMessage('Board gespeichert.');
    setSettingsBusy(false);
  }
  async function inviteMember() {
    if (!selectedBoard || !canManageTeam || !inviteEmail.trim() || teamBusy) return;
    setTeamBusy(true); setMessage('');
    const result = await supabase.functions.invoke('board-invites', { body: { action: 'create', board_id: selectedBoard, email: inviteEmail.trim(), role: inviteRole } });
    if (result.error || result.data?.error) setMessage(result.error?.message ?? result.data?.error ?? 'Einladung fehlgeschlagen.'); else { setInviteEmail(''); setMessage('Einladung wurde versendet.'); await loadData(); }
    setTeamBusy(false);
  }
  async function changeMemberRole(member: Member, role: 'admin' | 'member' | 'viewer') {
    if (!selectedBoard || !canManageTeam || member.user_id === userId || member.role === 'owner') return;
    const result = await supabase.from('board_members').update({ role }).eq('board_id', selectedBoard).eq('user_id', member.user_id);
    if (result.error) setMessage(result.error.message); else await loadData();
  }
  async function removeMember(member: Member) {
    if (!selectedBoard || !canManageTeam || member.user_id === userId || member.role === 'owner') return;
    Alert.alert('Teammitglied entfernen', 'Soll die Person wirklich aus diesem Board entfernt werden?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Entfernen', style: 'destructive', onPress: async () => {
        const result = await supabase.from('board_members').delete().eq('board_id', selectedBoard).eq('user_id', member.user_id);
        if (result.error) setMessage(result.error.message); else await loadData();
      } },
    ]);
  }
  async function saveCalendarEvent() {
    if (!userId || !selectedBoard || !calendarDraftTitle.trim()) return;
    const result = await supabase.from('calendar_events').insert({ title: calendarDraftTitle.trim(), description: null, starts_at: calendarDraftDate, ends_at: null, all_day: true, board_id: selectedBoard, created_by: userId }).select().single();
    if (result.error) setMessage(result.error.message); else { setCalendarDraftTitle(''); await loadData(); }
  }
  async function deleteCalendarEvent(event: CalendarEvent) {
    if (event.created_by !== userId && !canManageTeam) return;
    Alert.alert('Termin löschen', '„' + event.title + '“ wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        const result = await supabase.from('calendar_events').delete().eq('id', event.id);
        if (result.error) setMessage(result.error.message); else await loadData();
      } },
    ]);
  }

  function openTask(card: Card) {
    if (onOpenCard) onOpenCard(card);
    else setSelectedCard(card);
  }

  return <View style={styles.root}>
    {showTabs ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroller}>
      <Tab label="Aufgaben" active={view === 'tasks'} onPress={() => onViewChange?.('tasks')} />
      <Tab label="Kalender" active={view === 'calendar'} onPress={() => onViewChange?.('calendar')} />
      <Tab label="Dokumente" active={view === 'documents'} onPress={() => onViewChange?.('documents')} />
      <Tab label="Team" active={view === 'team'} onPress={() => onViewChange?.('team')} />
      <Tab label="Einstellungen" active={view === 'settings'} onPress={() => onViewChange?.('settings')} />
    </ScrollView> : null}
    <View style={styles.header}>
      <View style={styles.headerMain}><Text style={styles.title}>{title}</Text><Text style={styles.meta}>{boardLabel}</Text></View>
      <Pressable style={styles.closeButton} onPress={() => onViewChange?.('overview')}><Text style={styles.close}>Schließen</Text></Pressable>
    </View>
    {view !== 'boards' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardPicker} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {boards.map(board => <Pressable key={board.id} onPress={() => onSelectedBoardChange?.(board.id)} style={[styles.boardChip, board.id === selectedBoard && styles.boardChipActive]}><Text style={board.id === selectedBoard ? styles.boardChipTextActive : styles.boardChipText}>{board.name}</Text></Pressable>)}
    </ScrollView> : null}
    {loading ? <View style={styles.center}><Text>Wird geladen …</Text></View> : <ScrollView style={styles.mainScroll} contentContainerStyle={styles.content} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {message ? <Text style={styles.error}>{message}</Text> : null}
      {view === 'boards' && (boards.length ? <View style={styles.settingsStack}>{boards.map(board => <View key={board.id} style={[styles.card, board.id === selectedBoard && styles.boardCardActive]}><View style={styles.boardRow}><View style={styles.boardAvatar}><Text style={styles.boardAvatarText}>{board.name.slice(0,1).toUpperCase()}</Text></View><View style={styles.boardInfo}><Text style={styles.cardTitle}>{board.name}</Text><Text style={styles.meta}>{board.id === selectedBoard ? 'Aktuelles Board' : 'Arbeitsfläche'}</Text></View></View><Pressable style={board.id === selectedBoard ? styles.secondary : styles.primary} onPress={() => { onSelectedBoardChange?.(board.id); onViewChange?.(null); }}><Text style={board.id === selectedBoard ? styles.secondaryText : styles.primaryText}>{board.id === selectedBoard ? 'Board geöffnet' : 'Board öffnen'}</Text></Pressable></View>)}<Pressable style={styles.primary} onPress={() => onViewChange?.(null)}><Text style={styles.primaryText}>＋ Neues Board im Arbeitsbereich</Text></Pressable></View> : <Empty text="Noch keine Boards vorhanden." />)}
      {view === 'tasks' && <View style={styles.taskModule}><View style={styles.taskToolbar}><TextInputShim value={taskQuery} onChangeText={setTaskQuery} placeholder="Aufgaben durchsuchen …"/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}><Tab label="Alle" active={taskFilter==='all'} onPress={()=>setTaskFilter('all')}/><Tab label="Meine" active={taskFilter==='mine'} onPress={()=>setTaskFilter('mine')}/><Tab label="Heute" active={taskFilter==='today'} onPress={()=>setTaskFilter('today')}/><Tab label="Überfällig" active={taskFilter==='overdue'} onPress={()=>setTaskFilter('overdue')}/><Tab label="Hoch" active={taskFilter==='high'} onPress={()=>setTaskFilter('high')}/></ScrollView></View>{visibleTasks.length ? visibleTasks.map(card => <Pressable key={card.id} style={styles.card} onPress={() => openTask(card)}><Text style={styles.cardTitle}>{card.title}</Text><Text style={styles.meta}>{listMap.get(card.list_id)?.name ?? 'Aufgabe'}{card.assignee_id && profileMap.get(card.assignee_id)?.full_name ? ` · ${profileMap.get(card.assignee_id)?.full_name}` : ''}</Text>{card.due_at ? <Text style={styles.meta}>Fällig: {new Date(card.due_at).toLocaleDateString('de-DE')}</Text> : <Text style={styles.meta}>Kein Termin</Text>}<Text style={styles.openHint}>Details öffnen</Text></Pressable>) : <Empty text="Keine passenden Aufgaben gefunden." />}</View>}
      {view === 'calendar' && <View style={styles.settingsStack}>
        <View style={styles.card}><View style={styles.calendarHeader}><Pressable style={styles.secondary} onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()-1, 1))}><Text>‹</Text></Pressable><Text style={styles.sectionTitle}>{calendarMonth.toLocaleDateString('de-DE',{month:'long',year:'numeric'})}</Text><Pressable style={styles.secondary} onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()+1, 1))}><Text>›</Text></Pressable></View><TextInputShim value={calendarDraftTitle} onChangeText={setCalendarDraftTitle} placeholder="Neuer Termin …"/><View style={styles.inlineButtons}><Pressable style={styles.secondary} onPress={() => setCalendarDraftDate(new Date(new Date(calendarDraftDate).getTime()-86400000).toISOString())}><Text>‹ Tag</Text></Pressable><Text style={styles.date}>{new Date(calendarDraftDate).toLocaleDateString('de-DE')}</Text><Pressable style={styles.secondary} onPress={() => setCalendarDraftDate(new Date(new Date(calendarDraftDate).getTime()+86400000).toISOString())}><Text>Tag ›</Text></Pressable></View><Pressable style={styles.primary} onPress={() => void saveCalendarEvent()}><Text style={styles.primaryText}>＋ Termin für das aktuelle Board anlegen</Text></Pressable></View>
        {monthCalendarItems.length ? monthCalendarItems.map(item => <Pressable key={item.id} style={styles.card} onPress={() => { if (item.kind === 'event') { const event = calendarEvents.find(e => e.id === item.id); if (event) void deleteCalendarEvent(event); } else if (item.boardId) onSelectedBoardChange?.(item.boardId); }}><Text style={styles.date}>{new Date(item.kind === 'board' ? item.date + 'T00:00:00' : item.date).toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'})}</Text><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.meta}>{item.kind === 'board' ? 'Board-Datum' : (item.boardId ? boardMap.get(item.boardId)?.name ?? 'Kalender' : 'Kalender')}</Text><Text style={styles.openHint}>{item.kind === 'board' ? 'Board öffnen' : 'Antippen = Termin löschen'}</Text></Pressable>) : <Empty text="Keine Termine in diesem Monat." />}
      </View>}
      {view === 'documents' && (attachments.length ? attachments.map(item => { const card = cards.find(c => c.id === item.card_id); const boardId = listMap.get(card?.list_id ?? '')?.board_id; const boardOwner = boardId ? boardMap.get(boardId)?.owner_id : null; const canDelete = item.uploader_id === userId || boardOwner === userId; return <View key={item.id} style={styles.card}><Pressable onPress={() => void openAttachment(item)}><Text style={styles.cardTitle}>{item.file_name}</Text><Text style={styles.meta}>{boardMap.get(listMap.get(card?.list_id ?? '')?.board_id ?? '')?.name ?? 'Board'} · {card?.title ?? 'Aufgabe'}</Text></Pressable><View style={styles.inlineButtons}><Pressable style={styles.secondary} onPress={() => void openAttachment(item)}><Text>Datei öffnen</Text></Pressable>{card ? <Pressable style={styles.secondary} onPress={() => openTask(card)}><Text>Aufgabe</Text></Pressable> : null}{canDelete ? <Pressable style={styles.dangerButton} onPress={() => void deleteAttachment(item)}><Text style={styles.dangerText}>Löschen</Text></Pressable> : null}</View></View>; }) : <Empty text="Keine Dokumente vorhanden." />)}
      {view === 'team' && <View style={styles.settingsStack}>
        {canManageTeam ? <View style={styles.card}><Text style={styles.sectionEyebrow}>TEAM EINLADEN</Text><Text style={styles.sectionTitle}>Neue Person einladen</Text><TextInputShim value={inviteEmail} onChangeText={setInviteEmail} placeholder="E-Mail-Adresse"/><View style={styles.inlineButtons}><Pressable style={styles.secondary} onPress={() => setInviteRole(inviteRole === 'member' ? 'viewer' : inviteRole === 'viewer' ? 'admin' : 'member')}><Text>Rolle: {inviteRole === 'admin' ? 'Administrator' : inviteRole === 'viewer' ? 'Betrachter' : 'Mitglied'}</Text></Pressable><Pressable style={styles.primary} onPress={() => void inviteMember()} disabled={teamBusy}><Text style={styles.primaryText}>{teamBusy ? 'Senden …' : 'Einladung senden'}</Text></Pressable></View></View> : null}
        {pendingInvites.map(inv => <View key={inv.id} style={styles.card}><Text style={styles.cardTitle}>{inv.email}</Text><Text style={styles.meta}>Einladung ausstehend · {inv.role === 'admin' ? 'Administrator' : inv.role === 'viewer' ? 'Betrachter' : 'Mitglied'}</Text></View>)}
        {members.length ? members.map(member => <View key={member.user_id} style={styles.card}><Text style={styles.cardTitle}>{profileMap.get(member.user_id)?.full_name || (member.user_id === userId ? 'Du' : 'Teammitglied')}</Text><Text style={styles.meta}>{member.user_id === userId ? 'Dein Konto' : member.role === 'admin' ? 'Administrator' : member.role === 'viewer' ? 'Betrachter' : member.role === 'owner' ? 'Eigentümer' : 'Mitglied'}</Text>{canManageTeam && member.user_id !== userId && member.role !== 'owner' ? <View style={styles.inlineButtons}><Pressable style={styles.secondary} onPress={() => void changeMemberRole(member, member.role === 'member' ? 'viewer' : member.role === 'viewer' ? 'admin' : 'member')}><Text>Rolle ändern</Text></Pressable><Pressable style={styles.dangerButton} onPress={() => void removeMember(member)}><Text style={styles.dangerText}>Entfernen</Text></Pressable></View> : null}</View>) : <Empty text="Keine Teammitglieder gefunden." />}
      </View>}
      {view === 'settings' ? <View style={styles.settingsStack}>
        <View style={styles.card}><Text style={styles.sectionEyebrow}>MEIN PROFIL</Text><Text style={styles.sectionTitle}>Persönliche Daten</Text><Text style={styles.fieldLabel}>E-Mail</Text><TextInputShim value={profileEmail} readOnly/><Text style={styles.fieldLabel}>Name</Text><TextInputShim value={profileName} onChangeText={setProfileName} placeholder="Vor- und Nachname"/><Pressable style={styles.primary} onPress={() => void saveProfile()} disabled={profileBusy}><Text style={styles.primaryText}>{profileBusy ? 'Speichern …' : 'Profil speichern'}</Text></Pressable></View>
        <View style={styles.card}><Text style={styles.sectionEyebrow}>BOARD</Text><Text style={styles.sectionTitle}>Board-Einstellungen</Text><Text style={styles.meta}>Board: {boardLabel}</Text><Text style={styles.fieldLabel}>Name</Text><TextInputShim value={editingBoardName} onChangeText={setEditingBoardName} placeholder="Boardname"/><Text style={styles.fieldLabel}>Beschreibung</Text><TextInputShim value={editingBoardDescription} onChangeText={setEditingBoardDescription} placeholder="Beschreibung"/><Pressable style={styles.primary} onPress={() => void saveBoardSettings()} disabled={!canEditBoard || settingsBusy}><Text style={styles.primaryText}>{settingsBusy ? 'Speichern …' : 'Board speichern'}</Text></Pressable>{!canEditBoard ? <Text style={styles.settingsHint}>Nur der Eigentümer kann Board-Einstellungen ändern.</Text> : null}</View>
      </View> : null}
    </ScrollView>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bottomActions} nestedScrollEnabled>
      <Pressable style={styles.secondary} onPress={() => onViewChange?.(null)}><Text>← Boards</Text></Pressable>
      {view !== 'settings' ? <Pressable style={styles.secondary} onPress={() => onViewChange?.('settings')}><Text>⚙ Einstellungen</Text></Pressable> : null}
    </ScrollView>

    <View pointerEvents="box-none">
      {selectedCard ? <View style={styles.cardOverlay}><View style={styles.cardModal}><View style={styles.header}><View style={styles.headerMain}><Text style={styles.title} numberOfLines={2}>{selectedCard.title}</Text><Text style={styles.meta}>{boardLabel}{listMap.get(selectedCard.list_id) ? ` · ${listMap.get(selectedCard.list_id)!.name}` : ''}</Text></View><Pressable onPress={() => setSelectedCard(null)}><Text style={styles.close}>Schließen</Text></Pressable></View><ScrollView style={styles.mainScroll} contentContainerStyle={styles.content} nestedScrollEnabled><Text style={styles.detailLabel}>Details</Text>{selectedCard.description ? <Text style={styles.detailText}>{selectedCard.description}</Text> : null}<Text style={styles.meta}>Priorität: {selectedCard.priority ?? 'normal'}</Text>{selectedCard.due_at ? <Text style={styles.meta}>Fällig: {new Date(selectedCard.due_at).toLocaleDateString('de-DE')}</Text> : null}{selectedCard.assignee_id ? <Text style={styles.meta}>Zuständig: {profileMap.get(selectedCard.assignee_id)?.full_name ?? 'Teammitglied'}</Text> : null}<CardCollaboration supabase={supabase} cardId={selectedCard.id} userId={userId}/></ScrollView></View></View> : null}
    </View>
  </View>;
}

function TextInputShim({ value, onChangeText, placeholder, readOnly }: { value: string; onChangeText?: (value: string) => void; placeholder?: string; readOnly?: boolean }) {
  const { TextInput } = require('react-native') as typeof import('react-native');
  return <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} editable={!readOnly}/>;
}
function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}><Text style={active ? styles.tabTextActive : styles.tabText}>{label}</Text></Pressable>; }
function Empty({ text }: { text: string }) { return <View style={styles.empty}><Text>{text}</Text></View>; }

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#f8fafc'},
  tabScroller:{paddingHorizontal:12,paddingVertical:8,gap:8},
  tab:{minWidth:104,minHeight:42,paddingHorizontal:14,borderRadius:12,borderWidth:1,borderColor:'#d1d5db',alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},
  tabActive:{backgroundColor:'#111827',borderColor:'#111827'},
  tabText:{fontSize:12,color:'#374151',fontWeight:'700'},tabTextActive:{fontSize:12,color:'#fff',fontWeight:'800'},
  header:{padding:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#e5e7eb',backgroundColor:'#f8fafc'},
  headerMain:{flex:1,minWidth:0},title:{fontSize:22,fontWeight:'800'},close:{fontSize:13,fontWeight:'800'},closeButton:{padding:9,borderRadius:10,backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db'},
  meta:{fontSize:12,color:'#6b7280',marginTop:4},boardPicker:{paddingHorizontal:14,paddingVertical:9,gap:8},boardChip:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:999,paddingHorizontal:14,paddingVertical:9},boardChipActive:{backgroundColor:'#111827',borderColor:'#111827'},boardChipText:{fontSize:12},boardChipTextActive:{fontSize:12,color:'#fff',fontWeight:'800'},
  mainScroll:{flex:1},content:{padding:14,paddingBottom:32,gap:10},center:{flex:1,justifyContent:'center',alignItems:'center',padding:24},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e7eb',borderRadius:14,padding:14},cardTitle:{fontSize:16,fontWeight:'800'},date:{fontSize:13,fontWeight:'800',marginBottom:4},openHint:{fontSize:12,fontWeight:'800',marginTop:10},link:{fontSize:13,fontWeight:'800',marginTop:8},delete:{fontSize:13,fontWeight:'800',color:'#b91c1c',marginTop:10},error:{color:'#b91c1c',padding:12,backgroundColor:'#fee2e2',borderRadius:10},empty:{padding:30,alignItems:'center'},
  settingsStack:{gap:10},calendarHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},inlineButtons:{flexDirection:'row',gap:8,alignItems:'center',marginTop:8},dangerButton:{backgroundColor:'#fee2e2',borderRadius:10,paddingHorizontal:13,paddingVertical:10},dangerText:{color:'#b91c1c',fontWeight:'800'},sectionEyebrow:{fontSize:10,fontWeight:'900',color:'#64748b',letterSpacing:1},sectionTitle:{fontSize:20,fontWeight:'800',marginTop:4,marginBottom:12},fieldLabel:{fontSize:12,fontWeight:'800',marginTop:6,marginBottom:5},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:12,padding:13,fontSize:16,marginBottom:8},primary:{backgroundColor:'#111827',borderRadius:12,padding:14,alignItems:'center',marginTop:8},primaryText:{color:'#fff',fontWeight:'800'},settingsHint:{fontSize:13,color:'#6b7280',lineHeight:19,marginTop:8},detailLabel:{fontSize:12,fontWeight:'900',textTransform:'uppercase',marginBottom:8},detailText:{fontSize:14,lineHeight:21,marginBottom:10},bottomActions:{paddingHorizontal:14,paddingVertical:8,gap:8,borderTopWidth:1,borderTopColor:'#e5e7eb'},secondary:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:10,paddingHorizontal:13,paddingVertical:10},cardOverlay:{position:'absolute',inset:0,backgroundColor:'rgba(15,23,42,.35)',zIndex:20,elevation:20},cardModal:{flex:1,marginTop:18,backgroundColor:'#f8fafc',borderRadius:20,overflow:'hidden'}
});