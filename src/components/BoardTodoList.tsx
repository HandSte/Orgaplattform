'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

type Todo = { id: string; board_id: string; title: string; completed: boolean; position: number };

type Props = { boardId: string; canEdit: boolean };

export default function BoardTodoList({ boardId, canEdit }: Props) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadTodos() {
    if (!supabase || !boardId) return;
    const { data } = await supabase.from('board_todos').select('id,board_id,title,completed,position').eq('board_id', boardId).order('position').order('created_at');
    setTodos((data ?? []) as Todo[]);
  }

  useEffect(() => {
    void loadTodos();
    if (!supabase || !boardId) return;
    const channel = supabase.channel(`board-todos-${boardId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'board_todos', filter: `board_id=eq.${boardId}` }, () => void loadTodos()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [boardId]);

  async function addTodo() {
    if (!supabase || !canEdit || !draft.trim() || busy) return;
    setBusy(true);
    const position = todos.length ? Math.max(...todos.map(todo => Number(todo.position) || 0)) + 1 : 0;
    const { data: session } = await supabase.auth.getSession();
    const { data, error } = await supabase.from('board_todos').insert({ board_id: boardId, title: draft.trim(), position, created_by: session.session?.user.id }).select('id,board_id,title,completed,position').single();
    if (!error && data) { setTodos(current => [...current, data as Todo]); setDraft(''); }
    setBusy(false);
  }

  async function toggleTodo(todo: Todo) {
    if (!supabase || !canEdit) return;
    const next = !todo.completed;
    setTodos(current => current.map(item => item.id === todo.id ? { ...item, completed: next } : item));
    const { error } = await supabase.from('board_todos').update({ completed: next }).eq('id', todo.id);
    if (error) setTodos(current => current.map(item => item.id === todo.id ? { ...item, completed: todo.completed } : item));
  }

  async function deleteTodo(todo: Todo) {
    if (!supabase || !canEdit) return;
    setTodos(current => current.filter(item => item.id !== todo.id));
    const { error } = await supabase.from('board_todos').delete().eq('id', todo.id);
    if (error) setTodos(current => [...current, todo].sort((a, b) => Number(a.position) - Number(b.position)));
  }

  const completed = todos.filter(todo => todo.completed).length;

  return <section className="board-todo-panel" aria-label="To-do-Liste">
    <div className="board-todo-head"><div><strong>To-do-Liste</strong><span>{completed}/{todos.length} erledigt</span></div></div>
    <div className="board-todo-items">
      {todos.map(todo => <div className={`board-todo-item ${todo.completed ? 'completed' : ''}`} key={todo.id}>
        <button type="button" className="board-todo-check" onClick={() => void toggleTodo(todo)} disabled={!canEdit} aria-label={todo.completed ? 'Aufgabe als offen markieren' : 'Aufgabe abhaken'}>{todo.completed ? '✓' : ''}</button>
        <span>{todo.title}</span>
        {canEdit && <button type="button" className="board-todo-delete" onClick={() => void deleteTodo(todo)} aria-label="To-do löschen">×</button>}
      </div>)}
      {!todos.length && <span className="board-todo-empty">Noch keine To-dos angelegt.</span>}
    </div>
    {canEdit && <div className="board-todo-add"><input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void addTodo(); }} placeholder="To-do hinzufügen …" aria-label="Neues To-do"/><button type="button" onClick={() => void addTodo()} disabled={busy || !draft.trim()}>＋</button></div>}
  </section>;
}
