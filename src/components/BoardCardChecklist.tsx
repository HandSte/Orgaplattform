'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

type ChecklistItem = {
  id: string;
  title: string;
  completed: boolean;
  position: number;
};

type Props = {
  cardId: string;
  canEdit: boolean;
};

export default function BoardCardChecklist({ cardId, canEdit }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const client = supabase;
    if (!client || !cardId) return;
    const { data } = await client
      .from('card_checklist_items')
      .select('id,title,completed,position')
      .eq('card_id', cardId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    setItems((data ?? []) as ChecklistItem[]);
  }

  useEffect(() => {
    void load();
    const client = supabase;
    if (!client || !cardId) return;
    const channel = client
      .channel(`board-card-checklist-${cardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_checklist_items', filter: `card_id=eq.${cardId}` }, () => void load())
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [cardId]);

  const completed = useMemo(() => items.filter((item) => item.completed).length, [items]);
  const progress = items.length ? Math.round((completed / items.length) * 100) : 0;

  async function addItem() {
    const client = supabase;
    const title = draft.trim();
    if (!client || !canEdit || !title || busy) return;
    setBusy(true);
    const { data: session } = await client.auth.getSession();
    const user = session.session?.user;
    if (!user) {
      setBusy(false);
      return;
    }
    const position = items.length ? Math.max(...items.map((item) => Number(item.position) || 0)) + 1 : 0;
    const { data, error } = await client
      .from('card_checklist_items')
      .insert({ card_id: cardId, title, completed: false, position, created_by: user.id })
      .select('id,title,completed,position')
      .single();
    if (!error && data) {
      setItems((current) => current.some((item) => item.id === data.id) ? current : [...current, data as ChecklistItem]);
      setDraft('');
    }
    setBusy(false);
  }

  async function toggleItem(item: ChecklistItem) {
    const client = supabase;
    if (!client || !canEdit) return;
    const next = !item.completed;
    setItems((current) => current.map((value) => value.id === item.id ? { ...value, completed: next } : value));
    const { error } = await client.from('card_checklist_items').update({ completed: next, updated_at: new Date().toISOString() }).eq('id', item.id);
    if (error) void load();
  }

  async function deleteItem(item: ChecklistItem) {
    const client = supabase;
    if (!client || !canEdit) return;
    setItems((current) => current.filter((value) => value.id !== item.id));
    const { error } = await client.from('card_checklist_items').delete().eq('id', item.id);
    if (error) void load();
  }

  return (
    <div className="board-card-checklist" onClick={(event) => event.stopPropagation()}>
      <div className="board-card-checklist-head">
        <strong>Checkliste</strong>
        <span>{completed}/{items.length}</span>
      </div>
      {items.length > 0 && (
        <div className="board-card-checklist-progress" aria-label={`${progress} Prozent erledigt`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="board-card-checklist-items">
        {items.map((item) => (
          <div className={`board-card-checklist-item ${item.completed ? 'completed' : ''}`} key={item.id}>
            <button
              type="button"
              className="board-card-check"
              onClick={() => void toggleItem(item)}
              disabled={!canEdit}
              aria-label={item.completed ? 'Punkt als offen markieren' : 'Punkt abhaken'}
            >{item.completed ? '✓' : ''}</button>
            <span>{item.title}</span>
            {canEdit && <button type="button" className="board-card-check-delete" onClick={() => void deleteItem(item)} aria-label={`„${item.title}“ löschen`}>×</button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="board-card-checklist-add">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addItem(); } }}
            placeholder="To-do hinzufügen …"
            aria-label="Neues To-do"
          />
          <button type="button" onClick={() => void addItem()} disabled={busy || !draft.trim()} aria-label="To-do hinzufügen">＋</button>
        </div>
      )}
      {!items.length && !canEdit && <span className="board-card-checklist-empty">Keine Punkte.</span>}
    </div>
  );
}
