'use client';

import { useEffect } from 'react';

const items = [
  ['Übersicht', '/', '⌂'],
  ['Meine Boards', '/boards', '▦'],
  ['Aufgaben', '/tasks', '☑'],
  ['Team', '/team', '♙'],
  ['Kalender', '/calendar', '□'],
  ['Dokumente', '/documents', '▤'],
  ['Einstellungen', '/settings', '⚙'],
] as const;

export default function GlobalNavigation() {
  useEffect(() => {
    const sync = () => {
      const path = window.location.pathname;
      document.querySelectorAll<HTMLElement>('.sidebar nav').forEach((nav) => {
        const signature = `${path}|${items.map(([label, href]) => `${label}:${href}`).join('|')}`;
        if (nav.dataset.globalNavigation === signature) return;
        nav.dataset.globalNavigation = signature;
        nav.replaceChildren();
        for (const [label, href, icon] of items) {
          const link = document.createElement('a');
          link.href = href;
          link.className = path === href ? 'active' : '';
          if (link.className) link.setAttribute('aria-current', 'page');
          const iconNode = document.createElement('span');
          iconNode.className = 'menu-icon';
          iconNode.setAttribute('aria-hidden', 'true');
          iconNode.textContent = icon;
          link.append(iconNode, document.createTextNode(label));
          nav.appendChild(link);
        }
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
