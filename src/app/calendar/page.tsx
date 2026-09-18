'use client';

import { useEffect, useMemo, useState } from 'react';
import WorkspaceModulePage from '@/components/WorkspaceModulePage';
import { supabase } from '@/lib/supabase-browser';
import type { Board, CalendarEvent } from '@/lib/types';

type BoardEvent = {
  id: string;
  boardId: string;
  title: string;
  date: string;
  kind: 'board';
};
type CalendarItem = BoardEvent | (CalendarEvent & { kind: 'manual'; boardName: string | null });

function localDateValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function localDateTimeValue(date: Date) {
  return `${localDateValue(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function toLocalDateTime(value: string | null) {
  return value ? localDateTimeValue(new Date(value)) : '';
}

export default function CalendarPage() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [boards, setBoards] = useState<Board[]>([]);
  const [manualEvents, setManualEvents] = useState<Array<CalendarEvent & { kind: 'manual'; boardName: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(localDateValue(new Date()));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [boardId, setBoardId] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const [{ data: boardData, error: boardError }, { data: eventData, error: eventError }] = await Promise.all([
      supabase.from('boards').select('*').order('updated_at', { ascending: false }),
      supabase.from('calendar_events').select('*').order('starts_at', { ascending: true }),
    ]);
    if (boardError) setNotice(boardError.message);
    if (eventError) setNotice(eventError.message);
    const nextBoards = (boardData ?? []) as Board[];
    setBoards(nextBoards);
    const boardMap = new Map(nextBoards.map(board => [board.id, board.name]));
    setManualEvents(((eventData ?? []) as CalendarEvent[]).map(event => ({ ...event, kind: 'manual' as const, boardName: event.board_id ? boardMap.get(event.board_id) ?? 'Board' : null })));
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const boardEvents = useMemo<BoardEvent[]>(() => boards.filter(board => board.scheduled_date).map(board => ({
    id: `board-${board.id}`,
    boardId: board.id,
    title: board.name,
    date: board.scheduled_date!,
    kind: 'board' as const,
  })), [boards]);

  const items = useMemo<CalendarItem[]>(() => [...boardEvents, ...manualEvents], [boardEvents, manualEvents]);
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
      const n = i - offset + 1;
      return n < 1 || n > count ? null : new Date(month.getFullYear(), month.getMonth(), n);
    });
  }, [month]);

  const monthItems = items.filter(item => {
    const d = item.kind === 'board' ? new Date(`${item.date}T00:00:00`) : new Date(item.starts_at);
    return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
  });

  function eventFor(day: Date) {
    const key = localDateValue(day);
    return monthItems.filter(item => {
      const d = item.kind === 'board' ? item.date : localDateValue(new Date(item.starts_at));
      return d === key;
    });
  }

  function openCreate(prefillDate = localDateValue(new Date())) {
    setEditing(null);
    setTitle('');
    setDescription('');
    setDate(prefillDate);
    setStartTime('09:00');
    setEndTime('10:00');
    setAllDay(false);
    setBoardId('');
    setFormOpen(true);
  }

  function openEdit(event: CalendarEvent) {
    setEditing(event);
    setTitle(event.title);
    setDescription(event.description ?? '');
    setDate(localDateValue(new Date(event.starts_at)));
    setStartTime(new Date(event.starts_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
    setEndTime(event.ends_at ? new Date(event.ends_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '');
    setAllDay(event.all_day);
    setBoardId(event.board_id ?? '');
    setFormOpen(true);
  }

  async function saveEvent() {
    if (!supabase || !title.trim() || !date || saving) return;
    setSaving(true);
    setNotice('');
    const startsAt = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${startTime || '09:00'}`);
    const endsAt = allDay ? null : (endTime ? new Date(`${date}T${endTime}`) : null);
    if (endsAt && endsAt < startsAt) {
      setNotice('Das Enddatum bzw. die Endzeit darf nicht vor dem Beginn liegen.');
      setSaving(false);
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() ?? null,
      all_day: allDay,
      board_id: boardId || null,
    };
    const result = editing
      ? await supabase.from('calendar_events').update(payload).eq('id', editing.id).select().single()
      : await supabase.from('calendar_events').insert(payload).select().single();
    if (result.error || !result.data) {
      setNotice(result.error?.message ?? 'Termin konnte nicht gespeichert werden.');
      setSaving(false);
      return;
    }
    setFormOpen(false);
    setSaving(false);
    await load();
  }

  async function deleteEvent() {
    if (!supabase || !editing || !window.confirm(`Termin „${editing.title}“ wirklich löschen?`)) return;
    const { error } = await supabase.from('calendar_events').delete().eq('id', editing.id);
    if (error) setNotice(error.message);
    else { setFormOpen(false); setEditing(null); await load(); }
  }

  return <WorkspaceModulePage title="Kalender" eyebrow="Planung" active="Kalender" description="Boards, Fälligkeiten und eigene Termine in einer gemeinsamen Kalenderansicht.">
    <section className="module-grid">
      <article className="module-card module-card-wide">
        <div className="module-toolbar">
          <strong>{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</strong>
          <div className="calendar-toolbar-actions">
            <button className="ghost" onClick={() => openCreate()}>＋ Termin</button>
            <button className="ghost" onClick={() => setMonth(new Date())}>Heute</button>
            <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
            <button className="ghost" onClick={() => void load()}>Aktualisieren</button>
          </div>
        </div>
        <div className="calendar-grid">
          {['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => <strong key={d}>{d}</strong>)}
          {days.map((day, i) => <div className={`calendar-day ${day && day.toDateString() === new Date().toDateString() ? 'today' : ''}`} key={i}>
            {day && <>
              <button className="calendar-day-number" onClick={() => openCreate(localDateValue(day))} aria-label={`Termin am ${day.toLocaleDateString('de-DE')}`}>{day.getDate()}</button>
              {eventFor(day).slice(0, 5).map(item => item.kind === 'board'
                ? <a className="calendar-event calendar-event-board" key={item.id} href={`/?board=${item.boardId}`} title={`Board-Datum: ${item.title}`}><b>{item.title}</b><small>Board-Datum</small></a>
                : <button className="calendar-event" key={item.id} onClick={() => openEdit(item)} title="Termin bearbeiten"><b>{item.title}</b><small>{item.all_day ? 'Ganztägig' : new Date(item.starts_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}{item.boardName ? ` · ${item.boardName}` : ''}</small></button>
              )}
            </>}
          </div>)}
        </div>
        {loading && <p className="muted">Kalender wird geladen …</p>}
        {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      </article>
    </section>
    {formOpen && <div className="board-create-overlay" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title">
      <div className="board-create-dialog calendar-event-dialog">
        <header><div><p className="eyebrow">Kalender</p><h2 id="calendar-event-title">{editing ? 'Termin bearbeiten' : 'Termin anlegen'}</h2><p>Lege einen eigenen Termin an oder ordne ihn optional einem Board zu.</p></div><button className="modal-close" onClick={() => setFormOpen(false)} aria-label="Schließen">×</button></header>
        <div className="board-create-fields">
          <label>Titel<input value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. Kundentermin" autoFocus /></label>
          <label>Beschreibung<textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Optionale Beschreibung" /></label>
          <div className="calendar-event-fields">
            <label>Datum<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
            <label className="calendar-event-check"><span>Ganztägig</span><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /></label>
          </div>
          {!allDay && <div className="calendar-event-fields"><label>Beginn<input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></label><label>Ende<input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></label></div>}
          <label>Board (optional)<select value={boardId} onChange={e => setBoardId(e.target.value)}><option value="">Keinem Board zugeordnet</option>{boards.map(board => <option key={board.id} value={board.id}>{board.name}</option>)}</select></label>
        </div>
        <footer><div>{editing && <button className="danger" onClick={() => void deleteEvent()}>Termin löschen</button>}</div><div><button className="ghost" onClick={() => setFormOpen(false)}>Abbrechen</button><button className="primary" onClick={() => void saveEvent()} disabled={saving || !title.trim() || !date}>{saving ? 'Speichern …' : editing ? 'Änderungen speichern' : 'Termin anlegen'}</button></div></footer>
      </div>
    </div>}
  </WorkspaceModulePage>;
}
