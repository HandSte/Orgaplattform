'use client';

import { useEffect, useMemo, useState } from 'react';
import CardModal from '@/components/CardModal';
import { supabase, supabaseConfigured } from '@/lib/supabase-browser';
import type { Board, BoardMember, Card, List, BoardRole } from '@/lib/types';

const demoColumns = [
  { title: 'Backlog', cards: ['Grundstruktur planen', 'Benutzerrollen definieren', 'Dateianhänge vorbereiten'] },
  { title: 'In Arbeit', cards: ['Supabase anbinden', 'Dashboard entwickeln'] },
  { title: 'Erledigt', cards: ['GitHub verbinden', 'Projekt anlegen'] },
];
const priorityLabels = { low: 'Niedrig', normal: 'Normal', high: 'Hoch', urgent: 'Dringend' } as const;
const roleLabels: Record<BoardRole, string> = { owner: 'Eigentümer', admin: 'Administrator', member: 'Mitglied', viewer: 'Betrachter' };
type MemberRow = BoardMember & { profile?: { full_name: string | null; avatar_url: string | null } | null };

export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null), [userId, setUserId] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]), [lists, setLists] = useState<List[]>([]), [cards, setCards] = useState<Card[]>([]), [members, setMembers] = useState<MemberRow[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null), [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured), [loadingMembers, setLoadingMembers] = useState(false), [notice, setNotice] = useState('');
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null), [dragOverListId, setDragOverListId] = useState<string | null>(null), [movingCard, setMovingCard] = useState(false);
  const [inviteEmail, setInviteEmail] = useState(''), [inviteRole, setInviteRole] = useState<BoardRole>('member'), [inviteLink, setInviteLink] = useState(''), [inviting, setInviting] = useState(false);

  const activeBoard = boards.find((board) => board.id === selectedBoard) ?? boards[0] ?? null;
  const activeLists = useMemo(() => lists.filter((list) => list.board_id === activeBoard?.id).sort((a, b) => a.position - b.position), [lists, activeBoard]);
  const activeCards = useMemo(() => cards.filter((card) => activeLists.some((list) => list.id === card.list_id)).sort((a, b) => a.position - b.position), [cards, activeLists]);
  const canManageTeam = !!userId && !!activeBoard && (activeBoard.owner_id === userId || members.find((member) => member.user_id === userId)?.role === 'admin');

  async function loadData() {
    if (!supabase) return; setLoading(true);
    const { data: session } = await supabase.auth.getSession(); const user = session.session?.user;
    setUserEmail(user?.email ?? null); setUserId(user?.id ?? null);
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase.from('boards').select('*').order('updated_at', { ascending: false });
    if (error) setNotice(error.message); else { setBoards(data ?? []); setSelectedBoard((current) => current && data?.some((b) => b.id === current) ? current : data?.[0]?.id ?? null); }
    setLoading(false);
  }
  async function loadBoardContent(boardId: string) {
    if (!supabase) return;
    const { data: listData, error: listError } = await supabase.from('lists').select('*').eq('board_id', boardId).order('position');
    if (listError) setNotice(listError.message); const ids = (listData ?? []).map((list) => list.id); setLists(listData ?? []);
    if (ids.length) { const { data, error } = await supabase.from('cards').select('*').in('list_id', ids).order('position'); if (error) setNotice(error.message); setCards(data ?? []); } else setCards([]);
  }
  async function loadMembers(boardId: string) {
    if (!supabase) return; setLoadingMembers(true);
    const { data, error } = await supabase.from('board_members').select('board_id,user_id,role,profiles!board_members_user_id_fkey(full_name,avatar_url)').eq('board_id', boardId).order('created_at');
    if (error) setNotice(error.message); setMembers((data ?? []) as unknown as MemberRow[]); setLoadingMembers(false);
  }
  useEffect(() => { loadData(); if (!supabase) return; const client = supabase; const { data } = client.auth.onAuthStateChange((_event, session) => { setUserEmail(session?.user?.email ?? null); setUserId(session?.user?.id ?? null); }); return () => data.subscription.unsubscribe(); }, []);
  useEffect(() => { if (selectedBoard) { loadBoardContent(selectedBoard); loadMembers(selectedBoard); setInviteLink(''); } }, [selectedBoard]);
  useEffect(() => { if (!supabase || !activeBoard) return; const client = supabase; const channel = client.channel(`board-${activeBoard.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter: `board_id=eq.${activeBoard.id}` }, () => loadBoardContent(activeBoard.id)).on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => loadBoardContent(activeBoard.id)).on('postgres_changes', { event: '*', schema: 'public', table: 'board_members', filter: `board_id=eq.${activeBoard.id}` }, () => loadMembers(activeBoard.id)).subscribe(); return () => { client.removeChannel(channel); }; }, [activeBoard?.id]);

  async function createBoard() {
    if (!supabase) return; const { data: session } = await supabase.auth.getSession(); const user = session.session?.user; if (!user) return (window.location.href = '/auth');
    const name = window.prompt('Name des neuen Boards', 'Neues Projekt'); if (!name?.trim()) return;
    const { data: board, error } = await supabase.from('boards').insert({ name: name.trim(), owner_id: user.id }).select().single(); if (error || !board) return setNotice(error?.message ?? 'Board konnte nicht erstellt werden.');
    const { error: memberError } = await supabase.from('board_members').insert({ board_id: board.id, user_id: user.id, role: 'owner' }); if (memberError) return setNotice(memberError.message);
    for (const [index, title] of ['Backlog', 'In Arbeit', 'Erledigt'].entries()) await supabase.from('lists').insert({ board_id: board.id, name: title, position: index }); await loadData(); setSelectedBoard(board.id);
  }
  async function addCard(listId: string) {
    if (!supabase) return; const title = window.prompt('Aufgabe', 'Neue Aufgabe'); if (!title?.trim()) return; const listCards = cards.filter((card) => card.list_id === listId); const position = listCards.length ? Math.max(...listCards.map((card) => card.position)) + 1 : 0;
    const { data, error } = await supabase.from('cards').insert({ list_id: listId, title: title.trim(), position, priority: 'normal' }).select().single(); if (error) setNotice(error.message); else { setCards((current) => [...current, data as Card]); if (activeBoard) loadBoardContent(activeBoard.id); }
  }
  async function addList() { if (!supabase || !activeBoard) return; const name = window.prompt('Name der Liste', 'Neue Liste'); if (!name?.trim()) return; const { error } = await supabase.from('lists').insert({ board_id: activeBoard.id, name: name.trim(), position: activeLists.length }); if (error) setNotice(error.message); else loadBoardContent(activeBoard.id); }
  async function moveCard(cardId: string, targetListId: string) {
    if (!supabase || movingCard) return; const card = cards.find((item) => item.id === cardId); if (!card) return; const targetCards = cards.filter((item) => item.list_id === targetListId && item.id !== cardId); const targetPosition = targetCards.length ? Math.max(...targetCards.map((item) => item.position)) + 1 : 0;
    if (card.list_id === targetListId) { setDraggedCardId(null); setDragOverListId(null); return; } setMovingCard(true); setCards((current) => current.map((item) => item.id === cardId ? { ...item, list_id: targetListId, position: targetPosition } : item));
    const { error } = await supabase.from('cards').update({ list_id: targetListId, position: targetPosition }).eq('id', cardId); if (error) { setNotice(`Aufgabe konnte nicht verschoben werden: ${error.message}`); if (activeBoard) await loadBoardContent(activeBoard.id); } else if (activeBoard) await loadBoardContent(activeBoard.id); setMovingCard(false); setDraggedCardId(null); setDragOverListId(null);
  }
  async function inviteMember() {
    if (!supabase || !activeBoard || !inviteEmail.trim()) return; setInviting(true); setInviteLink('');
    const { data, error } = await supabase.functions.invoke('board-invites', { body: { action: 'create', board_id: activeBoard.id, email: inviteEmail.trim(), role: inviteRole } });
    if (error || data?.error) setNotice(error?.message ?? data?.error ?? 'Einladung konnte nicht erstellt werden.'); else { setInviteLink(`${window.location.origin}/invite/${data.token}`); setInviteEmail(''); } setInviting(false);
  }
  async function changeRole(member: MemberRow, role: BoardRole) { if (!supabase || member.role === role) return; const { error } = await supabase.from('board_members').update({ role }).eq('board_id', member.board_id).eq('user_id', member.user_id); if (error) setNotice(error.message); else if (activeBoard) loadMembers(activeBoard.id); }
  async function removeMember(member: MemberRow) { if (!supabase || member.user_id === activeBoard?.owner_id) return; const name = member.profile?.full_name || 'dieses Teammitglied'; if (!window.confirm(`${name} wirklich aus dem Board entfernen?`)) return; const { error } = await supabase.from('board_members').delete().eq('board_id', member.board_id).eq('user_id', member.user_id); if (error) setNotice(error.message); else if (activeBoard) loadMembers(activeBoard.id); }
  function updateCard(updated: Card) { setCards((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelectedCard(updated); }
  function deleteCard(cardId: string) { setCards((current) => current.filter((item) => item.id !== cardId)); setSelectedCard(null); }
  async function signOut() { if (supabase) await supabase.auth.signOut(); setUserEmail(null); setUserId(null); }

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">O</span><span>Orgaplattform</span></div><nav><a className="active" href="#dashboard">Übersicht</a><a href="#boards">Meine Boards</a><a href="#team">Team</a><a href="#settings">Einstellungen</a></nav><div className="sidebar-footer">Professionelle Zusammenarbeit</div></aside>
    <section className="content" id="dashboard">
      <header className="topbar"><div><div className="eyebrow">Arbeitsbereich</div><h1>Mein Dashboard</h1></div><div className="top-actions">{userEmail ? <button className="ghost" onClick={signOut}>Abmelden</button> : <a className="ghost button-link" href="/auth">Anmelden</a>}<button className="primary" onClick={createBoard}>+ Neues Board</button></div></header>
      {!supabaseConfigured && <div className="setup-banner"><strong>Supabase-Verbindung fehlt.</strong><span>Die Oberfläche läuft bereits. Für echte Benutzer, Boards und Echtzeit-Daten müssen in Vercel die beiden NEXT_PUBLIC_SUPABASE_* Variablen gesetzt werden.</span></div>}
      {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      <section className="hero"><div><p className="eyebrow">Orgaplattform</p><h2>Alles im Blick. Gemeinsam arbeiten.</h2><p>Boards, Aufgaben und Teams – vorbereitet für Echtzeit-Zusammenarbeit.</p></div><div className="hero-stat"><strong>{supabaseConfigured ? boards.length : 3}</strong><span>aktive Boards</span></div></section>
      <section className="board-section" id="boards">
        <div className="section-heading"><div><p className="eyebrow">Aktuelles Board</p><h2>{activeBoard?.name ?? 'Projektübersicht'}</h2></div>{supabaseConfigured && userEmail && boards.length > 1 ? <label className="board-selector ghost">Board<select value={activeBoard?.id ?? ''} onChange={(event) => setSelectedBoard(event.target.value)} aria-label="Board auswählen">{boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</select></label> : supabaseConfigured && !userEmail ? <a className="ghost button-link" href="/auth">Board öffnen</a> : null}</div>
        {supabaseConfigured && !userEmail ? <div className="empty-state"><h3>Bereit für dein erstes Board</h3><p>Melde dich an oder registriere dich, um Boards dauerhaft in Supabase zu speichern.</p><a className="primary button-link" href="/auth">Jetzt starten</a></div> : supabaseConfigured && loading ? <div className="empty-state"><h3>Daten werden geladen …</h3></div> : supabaseConfigured && !activeBoard ? <div className="empty-state"><h3>Noch kein Board vorhanden</h3><p>Erstelle oben dein erstes Projektboard.</p><button className="primary" onClick={createBoard}>+ Erstes Board erstellen</button></div> : supabaseConfigured ? <div className="kanban">{activeLists.map((list) => <div className={`column ${dragOverListId === list.id ? 'drag-over' : ''}`} key={list.id} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverListId(list.id); }} onDragEnter={(event) => { event.preventDefault(); setDragOverListId(list.id); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOverListId(null); }} onDrop={(event) => { event.preventDefault(); const cardId = event.dataTransfer.getData('text/plain') || draggedCardId; if (cardId) moveCard(cardId, list.id); }}><div className="column-head"><span>{list.name}</span><span className="count">{activeCards.filter((c) => c.list_id === list.id).length}</span></div>{activeCards.filter((c) => c.list_id === list.id).map((card) => <article className={`card ${draggedCardId === card.id ? 'dragging' : ''}`} key={card.id} draggable onClick={() => { if (!movingCard) setSelectedCard(card); }} onDragStart={(event) => { setDraggedCardId(card.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', card.id); }} onDragEnd={() => { setDraggedCardId(null); setDragOverListId(null); }}><div className="card-title">{card.title}</div><div className="card-meta"><span>{card.due_at ? `Fällig: ${new Date(card.due_at).toLocaleDateString('de-DE')}` : `Priorität: ${priorityLabels[card.priority ?? 'normal']}`}</span><span>⋯</span></div>{card.due_at && <div className="card-meta"><span>Priorität: {priorityLabels[card.priority ?? 'normal']}</span></div>}</article>)}<button className="add-card" onClick={() => addCard(list.id)} disabled={movingCard}>+ Aufgabe hinzufügen</button></div>)}<div className="column-add"><button className="add-card" onClick={addList}>+ Liste hinzufügen</button></div></div> : <div className="kanban">{demoColumns.map((column) => <div className="column" key={column.title}><div className="column-head"><span>{column.title}</span><span className="count">{column.cards.length}</span></div>{column.cards.map((card, index) => <article className="card" key={card}><div className="card-title">{card}</div><div className="card-meta"><span>Aufgabe</span><span>⋯</span></div>{index === 0 && <div className="progress"><i /></div>}</article>)}<button className="add-card">+ Aufgabe hinzufügen</button></div>)}</div>}
      </section>
      {supabaseConfigured && activeBoard && userEmail && <section className="team-section" id="team"><div className="section-heading"><div><p className="eyebrow">Zusammenarbeit</p><h2>Team</h2></div><span className="team-count">{members.length} Mitglieder</span></div><div className="team-card">
        {canManageTeam && <div className="invite-panel"><div><strong>Person einladen</strong><p>Erstelle einen sicheren Einladungslink für dieses Board.</p></div><div className="invite-form"><input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="E-Mail-Adresse" aria-label="E-Mail-Adresse"/><select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as BoardRole)} aria-label="Rolle"><option value="admin">Administrator</option><option value="member">Mitglied</option><option value="viewer">Betrachter</option></select><button className="primary" onClick={inviteMember} disabled={inviting || !inviteEmail.trim()}>{inviting ? 'Erstelle …' : 'Einladung erstellen'}</button></div>{inviteLink && <div className="invite-result"><span>Einladungslink erstellt</span><input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} aria-label="Einladungslink"/><button className="ghost" onClick={() => navigator.clipboard?.writeText(inviteLink)}>Kopieren</button></div>}</div>}
        {loadingMembers ? <p className="team-muted">Mitglieder werden geladen …</p> : members.length === 0 ? <p className="team-muted">Noch keine Teammitglieder.</p> : <div className="member-list">{members.map((member) => <div className="member-row" key={`${member.board_id}-${member.user_id}`}><div className="member-person"><span className="member-avatar">{(member.profile?.full_name || '?').slice(0,1).toUpperCase()}</span><div><strong>{member.profile?.full_name || (member.user_id === userId ? userEmail : 'Teammitglied')}</strong><span>{member.user_id === userId ? userEmail : 'Mitglied des Boards'}</span></div></div><div className="member-actions">{canManageTeam && member.user_id !== activeBoard.owner_id ? <select value={member.role} onChange={(e) => changeRole(member, e.target.value as BoardRole)} aria-label="Rolle ändern"><option value="admin">Administrator</option><option value="member">Mitglied</option><option value="viewer">Betrachter</option></select> : <span className="role-pill">{roleLabels[member.role]}</span>}{canManageTeam && member.user_id !== activeBoard.owner_id && <button className="remove-button" onClick={() => removeMember(member)}>Entfernen</button>}</div></div>)}</div>}
      </div></section>}
    </section>
    {selectedCard && <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} onSaved={updateCard} onDeleted={deleteCard} />}
  </main>;
}
