'use client';

import { ReactNode } from 'react';
import NotificationCenter from '@/components/NotificationCenter';

type Props = { title: string; eyebrow: string; active: string; description: string; children?: ReactNode };

const items = [
  ['Übersicht', '/', '⌂'], ['Meine Boards', '/boards', '▦'], ['Aufgaben', '/tasks', '☑'], ['Team', '/team', '♙'], ['Kalender', '/calendar', '□'], ['Dokumente', '/documents', '▤'], ['Einstellungen', '/settings', '⚙'],
] as const;

export default function WorkspaceModulePage({ title, eyebrow, active, description, children }: Props) {
  return <main className="shell boards-workspace-shell module-workspace-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">O</span><span>Essentia</span></div><nav>{items.map(([label, href, icon]) => <a key={label} className={active === label ? 'active' : ''} href={href}><span className="menu-icon" aria-hidden="true">{icon}</span>{label}</a>)}</nav><div className="sidebar-footer"><strong>Essentia Team</strong><span>Professionelle Zusammenarbeit</span></div></aside><section className="content workspace-content"><header className="topbar"><div className="global-search-wrap"><span>⌕</span><input placeholder="Aufgaben, Boards oder Inhalte suchen …" aria-label="Global suchen"/><kbd>⌘ K</kbd></div><div className="top-actions"><NotificationCenter onOpenCard={() => undefined} /><span className="profile-chip"><span>U</span><strong>Benutzer</strong><small>Essentia Team</small></span></div></header><section className="module-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div></section>{children}</section></main>;
}
