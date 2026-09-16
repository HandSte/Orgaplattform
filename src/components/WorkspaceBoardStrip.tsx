'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';
import type { Board } from '@/lib/types';

export default function WorkspaceBoardStrip() {
  const [boards, setBoards] = useState<Board[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let mounted = true;
    const load = async () => {
      const { data: session } = await client.auth.getSession();
      if (!session.session?.user || !mounted) return;
      const { data } = await client.from('boards').select('*').order('updated_at', { ascending: false });
      if (mounted) setBoards((data ?? []) as Board[]);
    };
    void load();
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) setBoards([]);
      else void load();
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  if (!boards.length) return null;

  return (
    <section className="board-strip-section shared-board-strip">
      <div className="board-strip-head">
        <div><p className="eyebrow">Meine Boards</p><span>Alle aktiven Arbeitsflächen, an denen du beteiligt bist</span></div>
        <strong>{boards.length}</strong>
      </div>
      <div className="board-strip" role="navigation" aria-label="Aktive Boards">
        {boards.map((board, index) => (
          <a key={board.id} className="board-tab" href={`/?board=${encodeURIComponent(board.id)}`}>
            <span className="board-tab-mark">{board.name.slice(0, 1).toUpperCase()}</span>
            <span className="board-tab-copy"><strong>{board.name}</strong><small>{index === 0 ? 'Aktive Arbeitsfläche' : 'Kanban-Arbeitsfläche'}</small></span>
          </a>
        ))}
        <a className="board-tab board-tab-add" href="/">＋ <span>Dashboard öffnen</span></a>
      </div>
    </section>
  );
}
