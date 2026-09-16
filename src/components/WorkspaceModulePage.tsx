'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import NotificationCenter from '@/components/NotificationCenter';
import { supabase } from '@/lib/supabase-browser';

type Props = { title: string; eyebrow: string; active: string; description: string; children?: ReactNode };
const items = [['Übersicht', '/', '⌂'], ['Meine Boards', '/boards', '▦'], ['Aufgaben', '/tasks', '☑'], ['Team', '/team', '♙'], ['Kalender', '/calendar', '□'], ['Dokumente', '/documents', '▤'], ['Einstellungen', '/settings', '⚙']] as const;

export default function WorkspaceModulePage({ title, eyebrow, active, description, children }: Props) {
  const [email, setEmail] = useState(''); const [name, setName] = useState('Benutzer'); const [search, setSearch] = useState(''); const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const client = supabase; if (!client) return; client.auth.getSession().then(({ data }) => { const user = data.session?.user; if (user) setEmail(user.email ?? ''); }); const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); inputRef.current?.focus(); } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);
  useEffect(() => { const client = supabase; if (!client) return; client.auth.getUser().then(async ({ data }) => { if (!data.user) return; const { data: profile } = await client.from('profiles').select('full_name').eq('id', data.user.id).maybeSingle(); if (profile?.full_name) setName(profile.full_name); }); }, []);
  function submitSearch(event: React.FormEvent) { event.preventDefault(); const q = search.trim(); if (q) window.location.href = `/tasks?search=${encodeURIComponent(q)}`; }
  async function signOut() { const client = supabase; if (client) await client.auth.signOut(); window.location.href = '/auth'; }
  return <main className="shell boards-workspace-shell module-workspace-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">O</span><span>Essentia</span></div><nav>{items.map(([label, href, icon]) => <a key={label} className={active === label ? 'active' : ''} href={href}><span className="menu-icon" aria-hidden="true">{icon}</span>{label}</a>)}</nav><div className="sidebar-footer"><strong>{name}</strong><span>{email || 'Professionelle Zusammenarbeit'}</span></div></aside><section className="content workspace-content"><header className="topbar"><form className="global-search-wrap" onSubmit={submitSearch}><span>⌕</span><input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Aufgaben, Boards oder Inhalte suchen …" aria-label="Global suchen"/><kbd>⌘ K</kbd></form><div className="top-actions"><NotificationCenter onOpenCard={() => { window.location.href = '/'; }} /><span className="profile-chip"><span>{name.slice(0,1).toUpperCase()}</span><strong>{name}</strong><small>Essentia</small></span><button type="button" className="ghost compact-action" onClick={() => void signOut()}>Abmelden</button></div></header><section className="module-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div></section>{children}</section></main>;
}
