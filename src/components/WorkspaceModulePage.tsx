'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import NotificationCenter from '@/components/NotificationCenter';
import { supabase } from '@/lib/supabase-browser';
import type { Board } from '@/lib/types';

type Props = { title: string; eyebrow: string; active: string; description: string; children?: ReactNode };
const items = [['Übersicht', '/', '⌂'], ['Meine Boards', '/boards', '▦'], ['Aufgaben', '/tasks', '☑'], ['Team', '/team', '♙'], ['Kalender', '/calendar', '□'], ['Dokumente', '/documents', '▤'], ['Einstellungen', '/settings', '⚙']] as const;

export default function WorkspaceModulePage({ title, eyebrow, active, description, children }: Props) {
  const [email, setEmail] = useState(''); const [name, setName] = useState('Benutzer'); const [search, setSearch] = useState(''); const [boards, setBoards] = useState<Board[]>([]); const [selectedBoardId, setSelectedBoardId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const client = supabase; if (!client) return;
    client.auth.getSession().then(async ({ data }) => { const user = data.session?.user; if (!user) return; setEmail(user.email ?? ''); const { data: profile } = await client.from('profiles').select('full_name').eq('id', user.id).maybeSingle(); if (profile?.full_name) setName(profile.full_name); const { data: boardRows } = await client.from('boards').select('*').order('updated_at', { ascending: false }); const next = (boardRows ?? []) as Board[]; setBoards(next); const requested = new URLSearchParams(window.location.search).get('board'); setSelectedBoardId(requested && next.some(board => board.id === requested) ? requested : next[0]?.id ?? ''); });
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); inputRef.current?.focus(); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  function openBoard(id: string) { setSelectedBoardId(id); window.location.href = `/?board=${encodeURIComponent(id)}`; }
  function submitSearch(event: React.FormEvent) { event.preventDefault(); const q = search.trim(); if (q) window.location.href = `/tasks?search=${encodeURIComponent(q)}`; }
  async function signOut() { const client = supabase; if (client) await client.auth.signOut(); window.location.href = '/auth'; }
  return <main className="shell boards-workspace-shell module-workspace-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">O</span><span>Essentia</span></div><nav>{items.map(([label, href, icon]) => <a key={label} className={active === label ? 'active' : ''} href={href}><span className="menu-icon" aria-hidden="true">{icon}</span>{label}</a>)}</nav><div className="sidebar-footer"><strong>{name}</strong><span>{email || 'Professionelle Zusammenarbeit'}</span></div></aside>
    <section className="content workspace-content">
      <header className="topbar"><form className="global-search-wrap" onSubmit={submitSearch}><span>⌕</span><input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Aufgaben, Boards oder Inhalte suchen …" aria-label="Global suchen"/><kbd>⌘ K</kbd></form><div className="top-actions"><NotificationCenter onOpenCard={() => { window.location.href = '/'; }} /><span className="profile-chip"><span>{name.slice(0,1).toUpperCase()}</span><strong>{name}</strong><small>Essentia</small></span><button type="button" className="ghost compact-action" onClick={() => void signOut()}>Abmelden</button></div></header>
      <section className="board-strip-section"><div className="board-strip-head"><div><p className="eyebrow">Meine Boards</p><span>Alle aktiven Arbeitsflächen, an denen du beteiligt bist</span></div><strong>{boards.length}</strong></div><div className="board-strip" role="tablist" aria-label="Aktive Boards">{boards.map(board => <button key={board.id} role="tab" aria-selected={selectedBoardId === board.id} className={`board-tab ${selectedBoardId === board.id ? 'active' : ''}`} onClick={() => openBoard(board.id)}><span className="board-tab-mark">{board.name.slice(0,1).toUpperCase()}</span><span className="board-tab-copy"><strong>{board.name}</strong><small>{board.owner_id ? 'Arbeitsfläche' : 'Board'}</small></span></button>)}<button className="board-tab board-tab-add" onClick={() => { window.location.href = '/boards'; }}>＋ <span>Neues Board</span></button></div></section>
      <section className="module-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div></section>{children}
    </section>
  </main>;
}
