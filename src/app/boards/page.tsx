'use client';

import { useEffect, useMemo, useState } from 'react';
import BoardCardChecklist from '@/components/BoardCardChecklist';
import CardModal from '@/components/CardModal';
import './boards.css';
import '../workspace.css';
import { supabase, supabaseConfigured } from '@/lib/supabase-browser';
import type { Board, BoardRole, Card, List } from '@/lib/types';

type Profile = { id: string; full_name: string | null; avatar_url: string | null; email?: string | null };
type TeamOption = Profile & { currentRole?: BoardRole };
type BoardMemberRow = { user_id: string; role: BoardRole };

const roleLabels: Record<BoardRole, string> = {
  owner: 'Eigentümer',
  admin: 'Administrator',
  member: 'Mitglied',
  viewer: 'Betrachter',
};

const editableRoles: BoardRole[] = ['owner', 'admin', 'member'];

export default function BoardsPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<BoardRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDescription, setNewBoardDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Record<string, BoardRole>>({});
  const [creating, setCreating] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [savingBoard, setSavingBoard] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState('');
  const [boardDescriptionDraft, setBoardDescriptionDraft] = useState('');

  const activeBoard = boards.find((board) => board.id === selectedBoardId) ?? boards[0] ?? null;
  const activeLists = useMemo(
    () => lists.filter((list) => list.board_id === activeBoard?.id).sort((a, b) => a.position - b.position),
    [lists, activeBoard?.id],
  );
  const activeCards = useMemo(
    () => cards.filter((card) => activeLists.some((list) => list.id === card.list_id)).sort((a, b) => a.position - b.position),
    [cards, activeLists],
  );
  const canEdit = activeRole ? editableRoles.includes(activeRole) : false;
  const canManageBoard = activeRole === 'owner' || activeRole === 'admin';

  async function loadBoards() {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: session } = await client.auth.getSession();
    const user = session.session?.user;
    setUserId(user?.id ?? null);
    setUserEmail(user?.email ?? null);
    if (!user) {
      setLoading(false);
      return;
    }
    const { data, error } = await client.from('boards').select('*').order('updated_at', { ascending: false });
    if (error) setNotice(error.message);
    const nextBoards = (data ?? []) as Board[];
    setBoards(nextBoards);
    const requestedBoard = new URLSearchParams(window.location.search).get('board');
    let storedBoard: string | null = null;
    try { storedBoard = window.localStorage.getItem(`essentia.activeBoard.${user.id}`); } catch {}
    const restoredBoard = requestedBoard && nextBoards.some((board) => board.id === requestedBoard)
      ? requestedBoard
      : storedBoard && nextBoards.some((board) => board.id === storedBoard)
        ? storedBoard
        : nextBoards[0]?.id ?? null;
    setSelectedBoardId(restoredBoard);
    if (restoredBoard && requestedBoard !== restoredBoard) {
      const url = new URL(window.location.href);
      url.searchParams.set('board', restoredBoard);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
    setLoading(false);
  }

  async function loadBoard(boardId: string) {
    const client = supabase;
    if (!client || !userId) return;
    const [{ data: snapshotData, error: snapshotError }, { data: memberData, error: memberError }] = await Promise.all([
      client.rpc('get_board_snapshot', { p_board_id: boardId }),
      client.from('board_members').select('user_id,role').eq('board_id', boardId).eq('user_id', userId).maybeSingle(),
    ]);
    if (snapshotError) setNotice(snapshotError.message);
    if (memberError) setNotice(memberError.message);
    const snapshot = snapshotData as { lists?: List[]; cards?: Card[]; profiles?: Profile[] } | null;
    setLists(snapshot?.lists ?? []);
    setCards(snapshot?.cards ?? []);
    setProfiles(snapshot?.profiles ?? []);
    setActiveRole((memberData as BoardMemberRow | null)?.role ?? null);
  }

  async function loadTeamOptions() {
    const client = supabase;
    if (!client || !userId) return;
    const { data: memberRows, error: memberError } = await client
      .from('board_members')
      .select('user_id,role,board_id')
      .neq('user_id', userId);
    if (memberError) {
      setNotice(memberError.message);
      return;
    }
    const roleMap = new Map<string, BoardRole>();
    for (const row of memberRows ?? []) if (!roleMap.has(row.user_id)) roleMap.set(row.user_id, row.role as BoardRole);
    const ids = [...roleMap.keys()];
    if (!ids.length) {
      setTeamOptions([]);
      return;
    }
    const { data: profileRows, error: profileError } = await client
      .from('profiles')
      .select('id,full_name,avatar_url')
      .in('id', ids)
      .order('full_name');
    if (profileError) {
      setNotice(profileError.message);
      return;
    }
    setTeamOptions((profileRows ?? []).map((profile) => ({ ...(profile as Profile), currentRole: roleMap.get(profile.id) })));
  }

  useEffect(() => {
    void loadBoards();
    const client = supabase;
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? null);
      if (!session) {
        setBoards([]);
        setLists([]);
        setCards([]);
        setProfiles([]);
        setSelectedBoardId(null);
        setActiveRole(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedBoardId) {
      try { if (userId) window.localStorage.setItem(`essentia.activeBoard.${userId}`, selectedBoardId); } catch {}
      const url = new URL(window.location.href);
      url.searchParams.set('board', selectedBoardId);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      void loadBoard(selectedBoardId);
    }
    else {
      setLists([]);
      setCards([]);
      setProfiles([]);
      setActiveRole(null);
    }
  }, [selectedBoardId, userId]);

  useEffect(() => {
    if (userId) void loadTeamOptions();
  }, [userId, boards.length]);

  useEffect(() => {
    const client = supabase;
    if (!client || !activeBoard) return;
    const boardId = activeBoard.id;
    const channel = client
      .channel(`boards-workspace-${boardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter: `board_id=eq.${boardId}` }, () => void loadBoard(boardId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => void loadBoard(boardId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` }, () => {
        void loadBoards();
        void loadBoard(boardId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_members', filter: `board_id=eq.${boardId}` }, () => {
        void loadBoard(boardId);
        void loadTeamOptions();
      })
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [activeBoard?.id, userId]);

  function openCreate() {
    setNewBoardName('');
    setNewBoardDescription('');
    setSelectedMembers({});
    setNotice('');
    setShowCreate(true);
  }

  function toggleMember(id: string) {
    setSelectedMembers((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = 'member';
      return next;
    });
  }

  async function createBoard() {
    const client = supabase;
    if (!client || !userId || !newBoardName.trim() || creating) return;
    setCreating(true);
    setNotice('');
    const { data: board, error } = await client
      .from('boards')
      .insert({ name: newBoardName.trim(), description: newBoardDescription.trim() || null, owner_id: userId })
      .select()
      .single();
    if (error || !board) {
      setNotice(error?.message ?? 'Board konnte nicht erstellt werden.');
      setCreating(false);
      return;
    }
    const memberRows = [
      { board_id: board.id, user_id: userId, role: 'owner' as BoardRole },
      ...Object.entries(selectedMembers)
        .filter(([id]) => id !== userId)
        .map(([id, role]) => ({ board_id: board.id, user_id: id, role })),
    ];
    const { error: memberError } = await client.from('board_members').insert(memberRows);
    if (memberError) setNotice(`Board erstellt, aber Mitglieder konnten nicht vollständig hinzugefügt werden: ${memberError.message}`);
    const defaultLists = ['Ideen', 'In Arbeit', 'Erledigt'];
    const { error: listError } = await client
      .from('lists')
      .insert(defaultLists.map((name, position) => ({ board_id: board.id, name, position })));
    if (listError) setNotice(`Board erstellt, aber Standardlisten konnten nicht angelegt werden: ${listError.message}`);
    await loadBoards();
    setSelectedBoardId(board.id);
    setShowCreate(false);
    setCreating(false);
  }

  async function addList() {
    const client = supabase;
    if (!client || !activeBoard || !canEdit) return;
    const name = window.prompt('Name der Liste', 'Neue Liste');
    if (!name?.trim()) return;
    const position = activeLists.length ? Math.max(...activeLists.map((list) => Number(list.position))) + 1 : 0;
    const { data, error } = await client
      .from('lists')
      .insert({ board_id: activeBoard.id, name: name.trim(), position })
      .select()
      .single();
    if (error) setNotice(error.message);
    else if (data) setLists((current) => [...current, data as List]);
  }

  async function renameList(list: List) {
    const client = supabase;
    if (!client || !canManageBoard) return;
    const name = window.prompt('Name der Liste', list.name);
    if (!name?.trim() || name.trim() === list.name) return;
    const { error } = await client.from('lists').update({ name: name.trim() }).eq('id', list.id);
    if (error) setNotice(error.message);
    else setLists((current) => current.map((item) => (item.id === list.id ? { ...item, name: name.trim() } : item)));
  }

  async function deleteList(list: List) {
    const client = supabase;
    if (!client || !canManageBoard) return;
    const count = cards.filter((card) => card.list_id === list.id).length;
    if (!window.confirm(`Liste „${list.name}“ wirklich löschen?${count ? ` Dabei werden auch ${count} Aufgabe(n) gelöscht.` : ''}`)) return;
    const { error } = await client.from('lists').delete().eq('id', list.id);
    if (error) setNotice(error.message);
    else {
      setLists((current) => current.filter((item) => item.id !== list.id));
      setCards((current) => current.filter((card) => card.list_id !== list.id));
    }
  }

  async function addCard(listId: string) {
    const client = supabase;
    if (!client || !activeBoard || !canEdit) return;
    const title = window.prompt('Neue Aufgabe', 'Neue Aufgabe');
    if (!title?.trim()) return;
    const listCards = cards.filter((card) => card.list_id === listId);
    const position = listCards.length ? Math.max(...listCards.map((card) => Number(card.position))) + 1 : 0;
    const { data, error } = await client
      .from('cards')
      .insert({ list_id: listId, title: title.trim(), position, priority: 'normal', created_by: userId })
      .select()
      .single();
    if (error) setNotice(error.message);
    else if (data) setCards((current) => [...current, data as Card]);
  }

  async function moveCard(cardId: string, targetListId: string, beforeCardId: string | null = null) {
    const client = supabase;
    if (!client || !canEdit || !cardId) return;
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    setDraggingCardId(null);
    if (card.list_id === targetListId && beforeCardId === cardId) return;
    const previousCards = cards;
    const targetCards = cards
      .filter((item) => item.list_id === targetListId && item.id !== cardId)
      .sort((a, b) => Number(a.position) - Number(b.position));
    const beforeIndex = beforeCardId ? targetCards.findIndex((item) => item.id === beforeCardId) : -1;
    const ordered = [...targetCards];
    const insertAt = beforeIndex >= 0 ? beforeIndex : ordered.length;
    ordered.splice(insertAt, 0, card);
    const optimistic = ordered.map((item, index) => ({ ...item, list_id: targetListId, position: index }));
    const affectedIds = new Set([cardId, ...targetCards.map((item) => item.id)]);
    setCards((current) => current.map((item) => (affectedIds.has(item.id) ? optimistic.find((next) => next.id === item.id) ?? item : item)));
    const { data, error } = await client.rpc('move_card', {
      p_card_id: cardId,
      p_target_list_id: targetListId,
      p_before_card_id: beforeCardId,
    });
    if (error || !data) {
      setCards(previousCards);
      setNotice(error?.message ?? 'Aufgabe konnte nicht verschoben werden.');
      return;
    }
    setCards((current) => current.map((item) => (item.id === cardId ? (data as Card) : item)));
  }

  function openBoardSettings() {
    if (!activeBoard) return;
    setBoardNameDraft(activeBoard.name);
    setBoardDescriptionDraft(activeBoard.description ?? '');
    setNotice('');
    setShowBoardSettings(true);
  }

  async function saveBoardSettings() {
    const client = supabase;
    if (!client || !activeBoard || !canManageBoard || !boardNameDraft.trim() || savingBoard) return;
    setSavingBoard(true);
    const { data, error } = await client
      .from('boards')
      .update({ name: boardNameDraft.trim(), description: boardDescriptionDraft.trim() || null })
      .eq('id', activeBoard.id)
      .select()
      .single();
    if (error || !data) setNotice(error?.message ?? 'Board konnte nicht gespeichert werden.');
    else {
      setBoards((current) => current.map((board) => (board.id === activeBoard.id ? (data as Board) : board)));
      setShowBoardSettings(false);
    }
    setSavingBoard(false);
  }

  async function deleteBoard() {
    const client = supabase;
    if (!client || !activeBoard || activeBoard.owner_id !== userId) return;
    if (!window.confirm(`Board „${activeBoard.name}“ wirklich löschen? Alle Listen und Aufgaben dieses Boards werden entfernt.`)) return;
    const boardId = activeBoard.id;
    const { error } = await client.from('boards').delete().eq('id', boardId);
    if (error) {
      setNotice(error.message);
      return;
    }
    setShowBoardSettings(false);
    const remaining = boards.filter((board) => board.id !== boardId);
    setBoards(remaining);
    setSelectedBoardId(remaining[0]?.id ?? null);
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    window.location.href = '/';
  }

  if (!supabaseConfigured)
    return (
      <main className="shell">
        <section className="content">
          <div className="empty-state">
            <h2>Supabase-Verbindung fehlt</h2>
            <p>Die Boardansicht benötigt die konfigurierte Supabase-Verbindung.</p>
            <a className="primary button-link" href="/">Zur Übersicht</a>
          </div>
        </section>
      </main>
    );

  if (!userId && !loading)
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand auth-brand"><span className="brand-mark">O</span><span>Orgaplattform</span></div>
          <h1>Meine Boards</h1>
          <p className="auth-copy">Bitte melde dich an, um deine Boards zu öffnen.</p>
          <a className="primary button-link auth-submit" href="/auth">Anmelden</a>
        </section>
      </main>
    );

  return (
    <main className="shell boards-workspace-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">O</span><span>Essentia</span></div>
        <nav>
          <a href="/"><span className="menu-icon" aria-hidden="true">⌂</span>Übersicht</a>
          <a className="active" href="/boards"><span className="menu-icon" aria-hidden="true">▦</span>Meine Boards</a>
          <a href="/tasks"><span className="menu-icon" aria-hidden="true">☑</span>Aufgaben</a>
          <a href="/team"><span className="menu-icon" aria-hidden="true">♙</span>Team</a>
          <a href="/calendar"><span className="menu-icon" aria-hidden="true">□</span>Kalender</a>
          <a href="/documents"><span className="menu-icon" aria-hidden="true">▤</span>Dokumente</a>
          <a href="/settings"><span className="menu-icon" aria-hidden="true">⚙</span>Einstellungen</a>
        </nav>
        <div className="sidebar-footer">{userEmail ?? 'Professionelle Zusammenarbeit'}</div>
      </aside>

      <section className="content workspace-content">
        <header className="topbar">
          <div><div className="eyebrow">Arbeitsbereich</div><h1>Meine Boards</h1></div>
          <div className="top-actions">
            <button className="ghost" onClick={signOut}>Abmelden</button>
            <button className="primary" onClick={openCreate}>+ Neues Board</button>
          </div>
        </header>

        {notice && <div className="notice">{notice}<button onClick={() => setNotice('')} aria-label="Hinweis schließen">×</button></div>}

        <section className="board-strip-section">
          <div className="board-strip-head">
            <div><p className="eyebrow">Aktive Boards</p><span>Alle Boards, an denen du beteiligt bist</span></div>
            <strong>{boards.length}</strong>
          </div>
          <div className="board-strip" role="tablist" aria-label="Aktive Boards">
            {boards.map((board) => (
              <button key={board.id} role="tab" aria-selected={activeBoard?.id === board.id} className={`board-tab ${activeBoard?.id === board.id ? 'active' : ''}`} onClick={() => setSelectedBoardId(board.id)}>
                <span className="board-tab-mark">{board.name.slice(0, 1).toUpperCase()}</span>
                <span className="board-tab-copy"><strong>{board.name}</strong><small>{board.owner_id === userId ? 'Eigentümer' : 'Mitglied'}</small></span>
              </button>
            ))}
            <button className="board-tab board-tab-add" onClick={openCreate}>＋ <span>Board erstellen</span></button>
          </div>
        </section>

        {loading ? (
          <div className="empty-state"><h3>Boards werden geladen …</h3></div>
        ) : activeBoard ? (
          <>
            <section className="workspace-header">
              <div>
                <p className="eyebrow">Dashboard · {roleLabels[activeRole ?? 'viewer']}</p>
                <h2>{activeBoard.name}</h2>
                {activeBoard.description && <p className="muted">{activeBoard.description}</p>}
              </div>
              <div className="top-actions board-context-actions">
                <a className="ghost button-link" href={`/tasks?board=${activeBoard.id}`}>Aufgaben</a>
                <a className="ghost button-link" href={`/calendar?board=${activeBoard.id}`}>Kalender</a>
                <a className="ghost button-link" href={`/documents?board=${activeBoard.id}`}>Dokumente</a>
                <a className="ghost button-link" href={`/team?board=${activeBoard.id}`}>Team</a>
                {canManageBoard && <button className="ghost" onClick={openBoardSettings}>Board verwalten</button>}
              </div>
            </section>

            <section className="kanban-board" aria-label={`Dashboard ${activeBoard.name}`}>
              {activeLists.map((list) => {
                const listCards = activeCards.filter((card) => card.list_id === list.id);
                return (
                  <article
                    className={`kanban-column ${draggingCardId ? 'drop-ready' : ''}`}
                    key={list.id}
                    onDragOver={(event) => { if (canEdit) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
                    onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/card-id') || draggingCardId; if (id) void moveCard(id, list.id); }}
                  >
                    <header>
                      <div><h3>{list.name}</h3><span>{listCards.length} Aufgaben</span></div>
                      {canManageBoard && (
                        <div className="column-actions">
                          <button className="column-menu" onClick={() => void renameList(list)} aria-label={`${list.name} umbenennen`}>✎</button>
                          <button className="column-menu danger-icon" onClick={() => void deleteList(list)} aria-label={`${list.name} löschen`}>×</button>
                        </div>
                      )}
                    </header>
                    <div className="kanban-cards">
                      {listCards.map((card) => {
                        const isTodoCard = card.title.trim().toLowerCase() === 'to-do-liste';
                        return (
                          <article
                            className={`kanban-card ${isTodoCard ? 'kanban-card-todo' : ''} ${draggingCardId === card.id ? 'dragging' : ''}`}
                            key={card.id}
                            draggable={canEdit}
                            onDragStart={(event) => { if (!canEdit) return; setDraggingCardId(card.id); event.dataTransfer.setData('text/card-id', card.id); event.dataTransfer.effectAllowed = 'move'; }}
                            onDragEnd={() => setDraggingCardId(null)}
                            onDragOver={(event) => { if (canEdit && draggingCardId && draggingCardId !== card.id) { event.preventDefault(); event.stopPropagation(); } }}
                            onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const id = event.dataTransfer.getData('text/card-id') || draggingCardId; if (id && id !== card.id) void moveCard(id, list.id, card.id); }}
                            onClick={() => { if (!isTodoCard) setSelectedCard(card); }}
                            role={isTodoCard ? undefined : 'button'}
                            tabIndex={isTodoCard ? undefined : 0}
                            onKeyDown={(event) => { if (!isTodoCard && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedCard(card); } }}
                          >
                            <strong>{card.title}</strong>
                            {!isTodoCard && card.description && <span>{card.description}</span>}
                            {!isTodoCard && <small>{card.priority === 'urgent' ? 'Dringend' : card.priority === 'high' ? 'Hoch' : card.priority === 'low' ? 'Niedrig' : ''}{card.due_at ? ` · Fällig ${new Date(card.due_at).toLocaleDateString('de-DE')}` : ''}</small>}
                            {isTodoCard && <BoardCardChecklist cardId={card.id} canEdit={canEdit} />}
                          </article>
                        );
                      })}
                    </div>
                    {canEdit && <button className="add-card-link" onClick={() => void addCard(list.id)}>＋ Aufgabe hinzufügen</button>}
                  </article>
                );
              })}
              {canEdit && <button className="add-column" onClick={() => void addList()}>＋ Liste hinzufügen</button>}
            </section>
          </>
        ) : (
          <div className="empty-state">
            <h2>Noch kein Board</h2>
            <p>Erstelle dein erstes Board und wähle direkt die passenden Teammitglieder aus.</p>
            <button className="primary" onClick={openCreate}>+ Neues Board</button>
          </div>
        )}

        {selectedCard && (
          <CardModal
            card={selectedCard}
            onClose={() => setSelectedCard(null)}
            onSaved={(card) => { setCards((current) => current.map((item) => item.id === card.id ? card : item)); setSelectedCard(card); }}
            onDeleted={(id) => { setCards((current) => current.filter((item) => item.id !== id)); setSelectedCard(null); }}
          />
        )}

        {showBoardSettings && activeBoard && (
          <div className="board-create-overlay" role="dialog" aria-modal="true" aria-labelledby="board-settings-title">
            <div className="board-create-dialog">
              <header>
                <div><p className="eyebrow">Board-Verwaltung</p><h2 id="board-settings-title">{activeBoard.name}</h2><p>Boardname, Beschreibung und die Lebensdauer des Boards verwalten.</p></div>
                <button className="modal-close" onClick={() => setShowBoardSettings(false)} aria-label="Schließen">×</button>
              </header>
              <div className="board-create-fields">
                <label>Boardname<input value={boardNameDraft} onChange={(event) => setBoardNameDraft(event.target.value)} autoFocus /></label>
                <label>Beschreibung<textarea value={boardDescriptionDraft} onChange={(event) => setBoardDescriptionDraft(event.target.value)} rows={4} /></label>
              </div>
              <footer>
                <button className="danger" onClick={() => void deleteBoard()} disabled={activeBoard.owner_id !== userId}>Board löschen</button>
                <div className="top-actions"><button className="ghost" onClick={() => setShowBoardSettings(false)}>Abbrechen</button><button className="primary" onClick={() => void saveBoardSettings()} disabled={savingBoard || !boardNameDraft.trim()}>{savingBoard ? 'Speichern …' : 'Speichern'}</button></div>
              </footer>
            </div>
          </div>
        )}

        {showCreate && (
          <div className="board-create-overlay" role="dialog" aria-modal="true" aria-labelledby="create-board-title">
            <div className="board-create-dialog">
              <header>
                <div><p className="eyebrow">Neues Projekt</p><h2 id="create-board-title">Board erstellen</h2><p>Lege das Board an und wähle direkt die bereits bekannten Teammitglieder aus.</p></div>
                <button className="modal-close" onClick={() => setShowCreate(false)} aria-label="Schließen">×</button>
              </header>
              <div className="board-create-fields">
                <label>Boardname<input value={newBoardName} onChange={(event) => setNewBoardName(event.target.value)} placeholder="z. B. Projekt Musterstraße" autoFocus /></label>
                <label>Beschreibung<textarea value={newBoardDescription} onChange={(event) => setNewBoardDescription(event.target.value)} placeholder="Kurze Beschreibung des Projekts …" rows={3} /></label>
              </div>
              <div className="member-picker">
                <div className="member-picker-head"><div><strong>Teammitglieder hinzufügen</strong><span>Personen auswählen, die bereits in deinem Team vorhanden sind.</span></div><span>{Object.keys(selectedMembers).length} ausgewählt</span></div>
                {teamOptions.length ? (
                  <div className="member-picker-list">
                    {teamOptions.map((person) => {
                      const selected = !!selectedMembers[person.id];
                      return (
                        <div className={`member-picker-row ${selected ? 'selected' : ''}`} key={person.id}>
                          <label><input type="checkbox" checked={selected} onChange={() => toggleMember(person.id)} /><span className="member-avatar">{(person.full_name || '?').slice(0, 1).toUpperCase()}</span><span><strong>{person.full_name || 'Teammitglied'}</strong><small>{roleLabels[person.currentRole ?? 'member']}</small></span></label>
                          {selected && <select value={selectedMembers[person.id]} onChange={(event) => setSelectedMembers((current) => ({ ...current, [person.id]: event.target.value as BoardRole }))}><option value="member">Mitglied</option><option value="admin">Administrator</option><option value="viewer">Betrachter</option></select>}
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="member-picker-empty">Es wurden noch keine weiteren Teammitglieder gefunden. Du kannst sie später über die Teamverwaltung hinzufügen.</div>}
              </div>
              <footer><button className="ghost" onClick={() => setShowCreate(false)}>Abbrechen</button><button className="primary" onClick={() => void createBoard()} disabled={creating || !newBoardName.trim()}>{creating ? 'Wird erstellt …' : 'Board erstellen'}</button></footer>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
