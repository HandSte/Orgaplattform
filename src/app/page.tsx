'use client';

import { useEffect, useMemo, useState } from 'react';
import CardModal from '@/components/CardModal';
import { supabase, supabaseConfigured } from '@/lib/supabase-browser';
import type { Board, Card, List } from '@/lib/types';

const demoColumns = [
  { title: 'Backlog', cards: ['Grundstruktur planen', 'Benutzerrollen definieren', 'Dateianhänge vorbereiten'] },
  { title: 'In Arbeit', cards: ['Supabase anbinden', 'Dashboard entwickeln'] },
  { title: 'Erledigt', cards: ['GitHub verbinden', 'Projekt anlegen'] },
];

const priorityLabels = { low: 'Niedrig', normal: 'Normal', high: 'Hoch', urgent: 'Dringend' } as const;

export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [notice, setNotice] = useState('');
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);
  const [movingCard, setMovingCard] = useState(false);

  const activeBoard = boards.find((board) => board.id === selectedBoard) ?? boards[0] ?? null;
  const activeLists = useMemo(() => lists.filter((list) => list.board_id === activeBoard?.id).sort((a, b) => a.position - b.position), [lists, activeBoard]);
  const activeCards = useMemo(() => cards.filter((card) => activeLists.some((list) => list.id === card.list_id)).sort((a, b) => a.position - b.position), [cards, activeLists]);

  async function loadData() {
    if (!supabase) return;
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user;
    setUserEmail(user?.email ?? null);
    if (!user) { setLoading(false); return; }
    const { data: boardData, error } = await supabase.from('boards').select('*').order('updated_at', { ascending: false });
    if (error) setNotice(error.message);
    else {
      setBoards(boardData ?? []);
      setSelectedBoard((current) => current && boardData?.some((b) => b.id === current) ? current : boardData?.[0]?.id ?? null);
    }
    setLoading(false);
  }

  async function loadBoardContent(boardId: string) {
    if (!supabase) return;
    const { data: listData } = await supabase.from('lists').select('*').eq('board_id', boardId).order('position');
    const ids = (listData ?? []).map((list) => list.id);
    setLists(listData ?? []);
    if (ids.length) {
      const { data: cardData } = await supabase.from('cards').select('*').in('list_id', ids).order('position');
      setCards(cardData ?? []);
    } else setCards([]);
  }

  useEffect(() => {
    loadData();
    if (!supabase) return;
    const client = supabase;
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => setUserEmail(session?.user?.email ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (selectedBoard) loadBoardContent(selectedBoard); }, [selectedBoard]);

  useEffect(() => {
    if (!supabase || !activeBoard) return;
    const client = supabase;
    const channel = client.channel(`board-${activeBoard.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter: `board_id=eq.${activeBoard.id}` }, () => loadBoardContent(activeBoard.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => loadBoardContent(activeBoard.id))
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [activeBoard?.id]);

  async function createBoard() {
    if (!supabase) return;
    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user;
    if (!user) return (window.location.href = '/auth');
    const name = window.prompt('Name des neuen Boards', 'Neues Projekt');
    if (!name?.trim()) return;
    const { data: board, error } = await supabase.from('boards').insert({ name: name.trim(), owner_id: user.id }).select().single();
    if (error || !board) return setNotice(error?.message ?? 'Board konnte nicht erstellt werden.');
    await supabase.from('board_members').insert({ board_id: board.id, user_id: user.id, role: 'owner' });
    for (const [index, title] of ['Backlog', 'In Arbeit', 'Erledigt'].entries()) await supabase.from('lists').insert({ board_id: board.id, name: title, position: index });
    await loadData();
    setSelectedBoard(board.id);
  }

  async function addCard(listId: string) {
    if (!supabase) return;
    const title = window.prompt('Aufgabe', 'Neue Aufgabe');
    if (!title?.trim()) return;
    const listCards = cards.filter((card) => card.list_id === listId);
    const position = listCards.length ? Math.max(...listCards.map((card) => card.position)) + 1 : 0;
    const { data, error } = await supabase.from('cards').insert({ list_id: listId, title: title.trim(), position, priority: 'normal' }).select().single();
    if (error) setNotice(error.message);
    else { setCards((current) => [...current, data as Card]); if (activeBoard) loadBoardContent(activeBoard.id); }
  }

  async function addList() {
    if (!supabase || !activeBoard) return;
    const name = window.prompt('Name der Liste', 'Neue Liste');
    if (!name?.trim()) return;
    const { error } = await supabase.from('lists').insert({ board_id: activeBoard.id, name: name.trim(), position: activeLists.length });
    if (error) setNotice(error.message); else loadBoardContent(activeBoard.id);
  }

  async function moveCard(cardId: string, targetListId: string) {
    if (!supabase || movingCard) return;
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    const targetCards = cards.filter((item) => item.list_id === targetListId && item.id !== cardId);
    const targetPosition = targetCards.length ? Math.max(...targetCards.map((item) => item.position)) + 1 : 0;
    if (card.list_id === targetListId) { setDraggedCardId(null); setDragOverListId(null); return; }
    setMovingCard(true);
    setCards((current) => current.map((item) => item.id === cardId ? { ...item, list_id: targetListId, position: targetPosition } : item));
    const { error } = await supabase.from('cards').update({ list_id: targetListId, position: targetPosition }).eq('id', cardId);
    if (error) {
      setNotice(`Aufgabe konnte nicht verschoben werden: ${error.message}`);
      if (activeBoard) await loadBoardContent(activeBoard.id);
    } else if (activeBoard) await loadBoardContent(activeBoard.id);
    setMovingCard(false); setDraggedCardId(null); setDragOverListId(null);
  }

  function updateCard(updated: Card) {
    setCards((current) => current.map((item) => item.id === updated.id ? updated : item));
    setSelectedCard(updated);
  }

  function deleteCard(cardId: string) {
    setCards((current) => current.filter((item) => item.id !== cardId));
    setSelectedCard(null);
  }

  async function signOut() { if (supabase) await supabase.auth.signOut(); setUserEmail(null); }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">O</span><span>Orgaplattform</span></div>
        <nav><a className="active" href="#dashboard">Übersicht</a><a href="#boards">Meine Boards</a><a href="#team">Team</a><a href="#settings">Einstellungen</a></nav>
        <div className="sidebar-footer">Professionelle Zusammenarbeit</div>
      </aside>
      <section className="content" id="dashboard">
        <header className="topbar">
          <div><div className="eyebrow">Arbeitsbereich</div><h1>Mein Dashboard</h1></div>
          <div className="top-actions">{userEmail ? <button className="ghost" onClick={signOut}>Abmelden</button> : <a className="ghost button-link" href="/auth">Anmelden</a>}<button className="primary" onClick={createBoard}>+ Neues Board</button></div>
        </header>
        {!supabaseConfigured && <div className="setup-banner"><strong>Supabase-Verbindung fehlt.</strong><span>Die Oberfläche läuft bereits. Für echte Benutzer, Boards und Echtzeit-Daten müssen in Vercel die beiden NEXT_PUBLIC_SUPABASE_* Variablen gesetzt werden.</span></div>}
        {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
        <section className="hero"><div><p className="eyebrow">Orgaplattform</p><h2>Alles im Blick. Gemeinsam arbeiten.</h2><p>Boards, Aufgaben und Teams – vorbereitet für Echtzeit-Zusammenarbeit.</p></div><div className="hero-stat"><strong>{supabaseConfigured ? boards.length : 3}</strong><span>aktive Boards</span></div></section>
        <section className="board-section" id="boards">
          <div className="section-heading"><div><p className="eyebrow">Aktuelles Board</p><h2>{activeBoard?.name ?? 'Projektübersicht'}</h2></div>{supabaseConfigured && !userEmail ? <a className="ghost button-link" href="/auth">Board öffnen</a> : null}</div>
          {supabaseConfigured && !userEmail ? <div className="empty-state"><h3>Bereit für dein erstes Board</h3><p>Melde dich an oder registriere dich, um Boards dauerhaft in Supabase zu speichern.</p><a className="primary button-link" href="/auth">Jetzt starten</a></div>
          : supabaseConfigured && loading ? <div className="empty-state"><h3>Daten werden geladen …</h3></div>
          : supabaseConfigured && !activeBoard ? <div className="empty-state"><h3>Noch kein Board vorhanden</h3><p>Erstelle oben dein erstes Projektboard.</p><button className="primary" onClick={createBoard}>+ Erstes Board erstellen</button></div>
          : supabaseConfigured ? <div className="kanban">{activeLists.map((list) => <div className={`column ${dragOverListId === list.id ? 'drag-over' : ''}`} key={list.id} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverListId(list.id); }} onDragEnter={(event) => { event.preventDefault(); setDragOverListId(list.id); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOverListId(null); }} onDrop={(event) => { event.preventDefault(); const cardId = event.dataTransfer.getData('text/plain') || draggedCardId; if (cardId) moveCard(cardId, list.id); }}><div className="column-head"><span>{list.name}</span><span className="count">{activeCards.filter((c) => c.list_id === list.id).length}</span></div>{activeCards.filter((c) => c.list_id === list.id).map((card) => <article className={`card ${draggedCardId === card.id ? 'dragging' : ''}`} key={card.id} draggable onClick={() => { if (!movingCard) setSelectedCard(card); }} onDragStart={(event) => { setDraggedCardId(card.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', card.id); }} onDragEnd={() => { setDraggedCardId(null); setDragOverListId(null); }}><div className="card-title">{card.title}</div><div className="card-meta"><span>{card.due_at ? `Fällig: ${new Date(card.due_at).toLocaleDateString('de-DE')}` : `Priorität: ${priorityLabels[card.priority ?? 'normal']}`}</span><span>⋯</span></div>{card.due_at && <div className="card-meta"><span>Priorität: {priorityLabels[card.priority ?? 'normal']}</span></div>}</article>)}<button className="add-card" onClick={() => addCard(list.id)} disabled={movingCard}>+ Aufgabe hinzufügen</button></div>)}<div className="column-add"><button className="add-card" onClick={addList}>+ Liste hinzufügen</button></div></div>
          : <div className="kanban">{demoColumns.map((column) => <div className="column" key={column.title}><div className="column-head"><span>{column.title}</span><span className="count">{column.cards.length}</span></div>{column.cards.map((card, index) => <article className="card" key={card}><div className="card-title">{card}</div><div className="card-meta"><span>Aufgabe</span><span>⋯</span></div>{index === 0 && <div className="progress"><i /></div>}</article>)}<button className="add-card">+ Aufgabe hinzufügen</button></div>)}</div>}
        </section>
      </section>
      {selectedCard && <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} onSaved={updateCard} onDeleted={deleteCard} />}
    </main>
  );
}
