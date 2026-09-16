'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase-browser';
import './ListDragEnhancer.css';

export default function ListDragEnhancer() {
  useEffect(() => {
    const install = () => {
      const columns = Array.from(document.querySelectorAll<HTMLElement>('.kanban-column'));
      if (!columns.length || !supabase) return;
      if (!document.querySelector('.add-column') && !document.querySelector('.add-card-link')) return;
      let dragged: HTMLElement | null = null;
      columns.forEach((column) => {
        if (column.dataset.listDragInstalled === 'true') return;
        column.dataset.listDragInstalled = 'true';
        column.draggable = true;
        column.addEventListener('dragstart', (event) => {
          dragged = column;
          const e = event as DragEvent;
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          column.classList.add('list-dragging');
        });
        column.addEventListener('dragover', (event) => {
          if (!dragged || dragged === column) return;
          event.preventDefault();
          column.classList.add('list-drag-over');
        });
        column.addEventListener('dragleave', () => column.classList.remove('list-drag-over'));
        column.addEventListener('dragend', () => {
          column.classList.remove('list-dragging');
          columns.forEach((item) => item.classList.remove('list-drag-over'));
          dragged = null;
        });
        column.addEventListener('drop', async (event) => {
          event.preventDefault();
          columns.forEach((item) => item.classList.remove('list-drag-over'));
          if (!dragged || dragged === column || !supabase) return;
          const activeBoardName = document.querySelector<HTMLElement>('.board-tab.active .board-tab-copy strong')?.textContent?.trim();
          if (!activeBoardName) return;
          const { data: boards } = await supabase.from('boards').select('id,name');
          const activeBoard = (boards ?? []).find((item: { id: string; name: string }) => item.name === activeBoardName);
          if (!activeBoard) return;
          const { data: lists, error } = await supabase.from('lists').select('id,position').eq('board_id', activeBoard.id).order('position');
          if (error || !lists?.length) return;
          const source = lists[columns.indexOf(dragged)] as { id: string } | undefined;
          const target = lists[columns.indexOf(column)] as { id: string } | undefined;
          if (!source || !target) return;
          const result = await supabase.rpc('move_list', { p_list_id: source.id, p_before_list_id: target.id });
          if (result.error) {
            window.dispatchEvent(new CustomEvent('essentia:notice', { detail: result.error.message }));
            return;
          }
          window.location.reload();
        });
      });
    };
    install();
    const observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
