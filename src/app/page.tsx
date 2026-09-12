'use client';

import { useEffect, useMemo, useState } from 'react';
import CardModal from '@/components/CardModal';
import NotificationCenter from '@/components/NotificationCenter';
import { supabase, supabaseConfigured } from '@/lib/supabase-browser';
import type { Board, Card, List } from '@/lib/types';

const demoColumns = [
  { title: 'Backlog', cards: ['Grundstruktur planen', 'Benutzerrollen definieren', 'Dateianhänge vorbereiten'] },
  { title: 'In Arbeit', cards: ['Supabase anbinden', 'Dashboard entwickeln'] },
  { title: 'Erledigt', cards: ['GitHub verbinden', 'Projekt anlegen'] },
];
const priorityLabels = { low: 'Niedrig', normal: 'Normal', high: 'Hoch', urgent: 'Dringend' } as const;
type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type Filter = 'all' | 'overdue' | 'today' | 'high';
type ChecklistProgress = { total_items: number; completed_items: number };

function ChecklistProgressBadge({ cardId }: { cardId: string }) {
  const [progress, setProgress] = useState<ChecklistProgress | null>(null);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const load = async () => {
      const { data } = await client.from('card_checklist_progress').select('total_items,completed_items').eq('card_id', cardId).maybeSingle();
      if (active) setProgress((data as ChecklistProgress | null) ?? null);
    };
    load();
    const channel = client.channel(`checklist-progress-${cardId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'card_checklist_items', filter: `card_id=eq.${cardId}` }, load).subscribe();
    return () => { active = false; client.removeChannel(channel); };
  }, [cardId]);
  if (!progress || progress.total_items === 0) return null;
  const percent = Math.round((progress.completed_items / progress.total_items) * 100);
  return <div className="checklist-card-progress" aria-label={`Checkliste: ${progress.completed_items} von ${progress.total_items} erledigt`}><div className="checklist-card-head"><span>Checkliste</span><strong>{progress.completed_items}/{progress.total_items}</strong></div><div className="checklist-card-bar"><span style={{ width: `${percent}%` }} /></div></div>;
}

export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [notice, setNotice] = useState('');
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);
  const [movingCard, setMovingCard] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const activeBoard = boards.find((board) => board.id === selectedBoard) ?? boards[0] ?? null;
  const activeLists = useMemo(() => lists.filter((list) => list.board_id === activeBoard?.id).sort((a, b) => a.position - b.position), [lists, activeBoard]);
  const activeCards = useMemo(() => cards.filter((card) => activeLists.some((list) => list.id === card.list_id)).sort((a, b) => a.position - b.position), [cards, activeLists]);
  const visibleCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return activeCards.filter((card) => {
      const matchesSearch = !query || `${card.title} ${card.description ?? ''} ${priorityLabels[card.priority ?? 'normal']} ${profiles.find((p) => p.id === card.assignee_id)?.full_name ?? ''}`.toLowerCase().includes(query);
      if (!matchesSearch) return false;
      if (filter === 'high') return card.priority === 'high' || card.priority === 'urgent';
      if (!card.due_at) return false;
      const due = new Date(card.due_at);
      if (filter === 'overdue') return due < now;
      if (filter === 'today') return due >= start && due < end;
      return true;
    });
  }, [activeCards, search, profiles, filter]);
  const profileName = (id: string | null) => id ? (profiles.find((p) => p.id === id)?.full_name || 'Teammitglied') : '';

  async function loadData() {
    const client = supabase; if (!client) return;
    setLoading(true);
    const { data: session } = await client.auth.getSession();
    const user = session.session?.user; setUserEmail(user?.email ?? null);
    if (!user) { setLoading(false); return; }
    const { data, error } = await client.from('boards').select('*').order('updated_at', { ascending: false });
    if (error) setNotice(error.message); else { setBoards(data ?? []); setSelectedBoard((current) => current && data?.some((b) => b.id === current) ? current : data?.[0]?.id ?? null); }
    setLoading(false);
  }
  async function loadBoardContent(boardId: string) {
    const client = supabase; if (!client) return;
    const { data: listData, error: listError } = await client.from('lists').select('*').eq('board_id', boardId).order('position');
    if (listError) setNotice(listError.message);
    const ids = (listData ?? []).map((list) => list.id); setLists(listData ?? []);
    if (ids.length) { const { data, error } = await client.from('cards').select('*').in('list_id', ids).order('position'); if (error) setNotice(error.message); setCards(data ?? []); } else setCards([]);
    const { data: memberData, error: memberError } = await client.from('board_members').select('user_id,profiles!board_members_user_id_fkey(id,full_name,avatar_url)').eq('board_id', boardId);
    if (memberError) setNotice(memberError.message); setProfiles(((memberData ?? []).map((m: any) => m.profiles).filter(Boolean)) as Profile[]);
  }
  async function openNotificationCard(id: string) { const client = supabase; const card = cards.find((c) => c.id === id); if (card) return setSelectedCard(card); if (activeBoard && client) { await loadBoardContent(activeBoard.id); const { data } = await client.from('cards').select('*').eq('id', id).maybeSingle(); if (data) setSelectedCard(data as Card); } }
  useEffect(() => { loadData(); const client = supabase; if (!client) return; const { data: listener } = client.auth.onAuthStateChange((_event, session) => setUserEmail(session?.user?.email ?? null)); return () => listener.subscription.unsubscribe(); }, []);
  useEffect(() => { if (selectedBoard) loadBoardContent(selectedBoard); }, [selectedBoard]);
  useEffect(() => { if (!supabase || !activeBoard) return; const client = supabase; const channel = client.channel(`board-${activeBoard.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter: `board_id=eq.${activeBoard.id}` }, () => loadBoardContent(activeBoard.id)).on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => loadBoardContent(activeBoard.id)).on('postgres_changes', { event: '*', schema: 'public', table: 'board_members', filter: `board_id=eq.${activeBoard.id}` }, () => loadBoardContent(activeBoard.id)).subscribe(); return () => { client.removeChannel(channel); }; }, [activeBoard?.id]);
  async function createBoard() { const client = supabase; if (!client) return; const { data: session } = await client.auth.getSession(); const user = session.session?.user; if (!user) return (window.location.href = '/auth'); const name = window.prompt('Name des neuen Boards', 'Neues Projekt'); if (!name?.trim()) return; const { data: board, error } = await client.from('boards').insert({ name: name.trim(), owner_id: user.id }).select().single(); if (error || !board) return setNotice(error?.message ?? 'Board konnte nicht erstellt werden.'); await client.from('board_members').insert({ board_id: board.id, user_id: user.id, role: 'owner' }); for (const [index, title] of ['Backlog', 'In Arbeit', 'Erledigt'].entries()) await client.from('lists').insert({ board_id: board.id, name: title, position: index }); await loadData(); setSelectedBoard(board.id); }
  async function addCard(listId: string) { const client = supabase; if (!client) return; const title = window.prompt('Aufgabe', 'Neue Aufgabe'); if (!title?.trim()) return; const listCards = cards.filter((card) => card.list_id === listId); const position = listCards.length ? Math.max(...listCards.map((card) => card.position)) + 1 : 0; const { data, error } = await client.from('cards').insert({ list_id: listId, title: title.trim(), position, priority: 'normal' }).select().single(); if (error) setNotice(error.message); else { setCards((current) => [...current, data as Card]); if (activeBoard) loadBoardContent(activeBoard.id); } }
  async function addList() { const client = supabase; if (!client || !activeBoard) return; const name = window.prompt('Name der Liste', 'Neue Liste'); if (!name?.trim()) return; const { error } = await client.from('lists').insert({ board_id: activeBoard.id, name: name.trim(), position: activeLists.length }); if (error) setNotice(error.message); else loadBoardContent(activeBoard.id); }
  async function moveCard(cardId: string, targetListId: string, beforeCardId?: string | null) { const client = supabase; if (!client || movingCard) return; const card = cards.find((item) => item.id === cardId); if (!card || beforeCardId === cardId) return; const targetCards = cards.filter((item) => item.list_id === targetListId && item.id !== cardId).sort((a, b) => a.position - b.position); if (beforeCardId && targetCards.findIndex((item) => item.id === beforeCardId) < 0) return; setMovingCard(true); const { data, error } = await client.rpc('move_card', { p_card_id: cardId, p_target_list_id: targetListId, p_before_card_id: beforeCardId ?? null }); if (error || !data) { setNotice(error?.message ?? 'Aufgabe konnte nicht verschoben werden.'); if (activeBoard) await loadBoardContent(activeBoard.id); } else { setCards((current) => current.map((item) => item.id === cardId ? data as Card : item)); if (activeBoard) await loadBoardContent(activeBoard.id); } setMovingCard(false); setDraggedCardId(null); setDragOverListId(null); }
  async function signOut() { const client = supabase; if (client) await client.auth.signOut(); setUserEmail(null); }

  return <main className="shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">O</span><span>Orgaplattform</span></div><nav><a className="active" href="#dashboard">Übersicht</a><a href="#boards">Meine Boards</a><a href="/team">Team</a><a href="/settings">Einstellungen</a></nav><div className="sidebar-footer">Professionelle Zusammenarbeit</div></aside><section className="content" id="dashboard"><header className="topbar"><div><div className="eyebrow">Arbeitsbereich</div><h1>Mein Dashboard</h1></div><div className="top-actions">{userEmail && <NotificationCenter onOpenCard={openNotificationCard} />}{userEmail ? <button className="ghost" onClick={signOut}>Abmelden</button> : <a className="ghost button-link" href="/auth">Anmelden</a>}<button className="primary" onClick={createBoard}>+ Neues Board</button></div></header>{!supabaseConfigured && <div className="setup-banner"><strong>Supabase-Verbindung fehlt.</strong><span>Für echte Benutzer, Boards und Echtzeit-Daten müssen die NEXT_PUBLIC_SUPABASE_* Variablen gesetzt werden.</span></div>}{notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}<section className="hero"><div><p className="eyebrow">Orgaplattform</p><h2>Alles im Blick. Gemeinsam arbeiten.</h2><p>Boards, Aufgaben und Teams – vorbereitet für Echtzeit-Zusammenarbeit.</p></div><div className="hero-stat"><strong>{supabaseConfigured ? boards.length : 3}</strong><span>aktive Boards</span></div></section><section className="board-section" id="boards"><div className="section-heading"><div><p className="eyebrow">Aktuelles Board</p><h2>{activeBoard?.name ?? 'Projektübersicht'}</h2></div><div className="top-actions">{supabaseConfigured && userEmail && boards.length > 1 ? <label className="ghost"><span>Board</span><select value={activeBoard?.id ?? ''} onChange={(event) => setSelectedBoard(event.target.value)} aria-label="Board auswählen">{boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</select></label> : supabaseConfigured && !userEmail ? <a className="ghost button-link" href="/auth">Board öffnen</a> : null}{supabaseConfigured && userEmail && activeBoard && <><label className="ghost"><span>Suche</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Aufgaben filtern…" aria-label="Aufgaben durchsuchen" style={{ border: 0, outline: 0, background: 'transparent', minWidth: 170 }} /></label><label className="ghost"><span>Filter</span><select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="Aufgabenfilter"><option value="all">Alle Aufgaben</option><option value="overdue">Überfällig</option><option value="today">Heute fällig</option><option value="high">Hohe Priorität</option></select></label></>}</div></div>{supabaseConfigured && !userEmail ? <div className="empty-state"><h3>Bereit für dein erstes Board</h3><p>Melde dich an oder registriere dich, um Boards dauerhaft in Supabase zu speichern.</p><a className="primary button-link" href="/auth">Jetzt starten</a></div> : supabaseConfigured && loading ? <div className="empty-state"><h3>Daten werden geladen …</h3></div> : supabaseConfigured && !activeBoard ? <div className="empty-state"><h3>Noch kein Board vorhanden</h3><p>Erstelle oben dein erstes Projektboard.</p><button className="primary" onClick={createBoard}>+ Erstes Board erstellen</button></div> : supabaseConfigured ? <div className="kanban">{activeLists.map((list) => <div className={`column ${dragOverListId === list.id ? 'drag-over' : ''}`} key={list.id} onDragOver={(event) => { event.preventDefault(); setDragOverListId(list.id); }} onDrop={(event) => { event.preventDefault(); const cardId = event.dataTransfer.getData('text/plain') || draggedCardId; if (cardId) moveCard(cardId, list.id); }}><div className="column-head"><span>{list.name}</span><span className="count">{visibleCards.filter((c) => c.list_id === list.id).length}{filter !== 'all' || search ? ` / ${activeCards.filter((c) => c.list_id === list.id).length}` : ''}</span></div>{visibleCards.filter((c) => c.list_id === list.id).map((card) => <article className={`card ${draggedCardId === card.id ? 'dragging' : ''}`} key={card.id} draggable onClick={() => !movingCard && setSelectedCard(card)} onDragStart={(event) => { setDraggedCardId(card.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', card.id); }} onDragEnd={() => { setDraggedCardId(null); setDragOverListId(null); }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDragOverListId(list.id); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const cardId = event.dataTransfer.getData('text/plain') || draggedCardId; if (cardId) moveCard(cardId, list.id, card.id); }}><div className="card-title">{card.title}</div><div className="card-meta"><span>{card.due_at ? `Fällig: ${new Date(card.due_at).toLocaleDateString('de-DE')}` : `Priorität: ${priorityLabels[card.priority ?? 'normal']}`}</span><span>{card.assignee_id ? `👤 ${profileName(card.assignee_id)}` : 'Nicht zugewiesen'}</span></div>{card.due_at && <div className="card-meta"><span>Priorität: {priorityLabels[card.priority ?? 'normal']}</span><span className={new Date(card.due_at) < new Date() ? 'overdue' : ''}>{new Date(card.due_at) < new Date() ? 'Überfällig' : 'Termin'}</span></div>}<ChecklistProgressBadge cardId={card.id} /></article>)}<button className="add-card" onClick={() => addCard(list.id)} disabled={movingCard}>+ Aufgabe hinzufügen</button></div>)}<div className="column-add"><button className="add-card" onClick={addList}>+ Liste hinzufügen</button></div></div> : <div className="kanban">{demoColumns.map((column) => <div className="column" key={column.title}><div className="column-head"><span>{column.title}</span><span className="count">{column.cards.length}</span></div>{column.cards.map((card, index) => <article className="card" key={card}><div className="card-title">{card}</div><div className="card-meta"><span>Aufgabe</span><span>⋯</span></div>{index === 0 && <div className="progress"><i /></div>}</article>)}<button className="add-card">+ Aufgabe hinzufügen</button></div>)}</div>}</section></section>{selectedCard && <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} onSaved={(updated) => { setCards((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelectedCard(updated); }} onDeleted={(id) => { setCards((current) => current.filter((item) => item.id !== id)); setSelectedCard(null); }} />}</main>;
}
