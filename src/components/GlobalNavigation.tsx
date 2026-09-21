'use client';

import { useEffect, useState } from 'react';

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileVisible, setMobileVisible] = useState(false);

  useEffect(() => {
    const sync = () => {
      const path = window.location.pathname;
      const hasShell = !!document.querySelector('.shell');
      setMobileVisible(hasShell);
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

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 700) setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [mobileOpen]);

  if (!mobileVisible) return null;

  const path = typeof window !== 'undefined' ? window.location.pathname : '/';

  return (
    <div className={mobileOpen ? 'mobile-navigation mobile-navigation-open' : 'mobile-navigation'}>
      <button
        type="button"
        className="mobile-menu-toggle"
        aria-label={mobileOpen ? 'Menü schließen' : 'Menü öffnen'}
        aria-expanded={mobileOpen}
        aria-controls="mobile-navigation-panel"
        onClick={() => setMobileOpen((open) => !open)}
      >
        <span aria-hidden="true" className="mobile-menu-icon"><i></i><i></i><i></i></span>
        <span className="mobile-menu-label">Menü</span>
      </button>

      {mobileOpen && <button type="button" className="mobile-navigation-backdrop" aria-label="Menü schließen" onClick={() => setMobileOpen(false)} />}

      <aside id="mobile-navigation-panel" className="mobile-navigation-panel" aria-hidden={!mobileOpen}>
        <div className="mobile-navigation-head">
          <div>
            <p className="eyebrow">Essentia</p>
            <strong>Navigation</strong>
          </div>
          <button type="button" className="mobile-navigation-close" aria-label="Menü schließen" onClick={() => setMobileOpen(false)}>×</button>
        </div>
        <nav>
          {items.map(([label, href, icon]) => (
            <a
              key={href}
              href={href}
              className={path === href ? 'active' : ''}
              aria-current={path === href ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <span className="menu-icon" aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </aside>
    </div>
  );
}
