'use client';

import { useEffect, useMemo, useState } from 'react';
import WorkspaceModulePage from '@/components/WorkspaceModulePage';
import { supabase } from '@/lib/supabase-browser';
import type { Card, List } from '@/lib/types';

type EventRow = Card & { listName: string; boardId: string; boardName: string };

export default function CalendarPage() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data: boards } = await supabase.from('boards').select('id,name');
    const boardMap = new Map((boards ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));
    const ids = [...boardMap.keys()];
    if (!ids.length) { setEvents([]); setLoading(false); return; }
    const { data: lists, error: listError } = await supabase.from('lists').select('id,name,board_id').in('board_id', ids);
    if (listError) { setNotice(listError.message); setLoading(false); return; }
    const listMap = new Map((lists ?? []).map((l: List) => [l.id, l]));
    const listIds = [...listMap.keys()];
    if (!listIds.length) { setEvents([]); setLoading(false); return; }
    const { data: cards, error } = await supabase.from('cards').select('*').not('due_at', 'is', null).in('list_id', listIds);
    if (error) setNotice(error.message);
    setEvents(((cards ?? []) as Card[]).map(card => { const list = listMap.get(card.list_id)!; return { ...card, listName: list.name, boardId: list.board_id, boardName: boardMap.get(list.board_id) ?? 'Board' }; }));
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1); const offset = (first.getDay() + 6) % 7; const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => { const n = i - offset + 1; return n < 1 || n > count ? null : new Date(month.getFullYear(), month.getMonth(), n); });
  }, [month]);
  const monthEvents = events.filter(e => { const d = new Date(e.due_at!); return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth(); });
  const eventFor = (day: Date) => monthEvents.filter(e => { const d = new Date(e.due_at!); return d.getDate() === day.getDate(); });

  return <WorkspaceModulePage title="Kalender" eyebrow="Planung" active="Kalender" description="Fälligkeiten und Projektplanung in einer gemeinsamen Kalenderansicht.">
    <section className="module-grid"><article className="module-card module-card-wide">
      <div className="module-toolbar"><strong>{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</strong><div><button className="ghost" onClick={() => setMonth(new Date())}>Heute</button><button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div><button className="ghost" onClick={() => void load()}>Aktualisieren</button></div>
      <div className="calendar-grid">{['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => <strong key={d}>{d}</strong>)}{days.map((day, i) => <div className={`calendar-day ${day && day.toDateString() === new Date().toDateString() ? 'today' : ''}`} key={i}>{day && <><span>{day.getDate()}</span>{eventFor(day).slice(0, 3).map(event => <a key={event.id} href={`/?board=${event.boardId}`} title={`${event.title} · ${event.boardName}`}><b>{event.title}</b></a>)}</>}</div>)}</div>
      {loading && <p className="muted">Kalender wird geladen …</p>}
    </article></section>
  </WorkspaceModulePage>;
}
