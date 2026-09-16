'use client';

import { useEffect, useState } from 'react';
import WorkspaceModulePage from '@/components/WorkspaceModulePage';
import { supabase } from '@/lib/supabase-browser';

type Attachment = { id: string; card_id: string; uploader_id: string; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null; created_at: string };
type CardRow = { id: string; title: string; list_id: string };
type ListRow = { id: string; name: string; board_id: string };
type BoardRow = { id: string; name: string; owner_id: string };

export default function DocumentsPage() {
  const [items, setItems] = useState<(Attachment & { cardTitle: string; boardName: string; boardOwnerId: string })[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  async function load() {
    if (!supabase) return;
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user;
    setUserId(user?.id ?? null);
    const { data, error } = await supabase.from('card_attachments').select('id,card_id,uploader_id,storage_path,file_name,mime_type,size_bytes,created_at').order('created_at', { ascending: false });
    if (error) { setNotice(error.message); setLoading(false); return; }
    const attachments = (data ?? []) as Attachment[];
    const cardIds = [...new Set(attachments.map(a => a.card_id))];
    if (!cardIds.length) { setItems([]); setLoading(false); return; }
    const { data: cards } = await supabase.from('cards').select('id,title,list_id').in('id', cardIds);
    const cardMap = new Map(((cards ?? []) as CardRow[]).map(c => [c.id, c]));
    const listIds = [...new Set(((cards ?? []) as CardRow[]).map(c => c.list_id))];
    const { data: lists } = await supabase.from('lists').select('id,name,board_id').in('id', listIds);
    const listMap = new Map(((lists ?? []) as ListRow[]).map(l => [l.id, l]));
    const boardIds = [...new Set(((lists ?? []) as ListRow[]).map(l => l.board_id))];
    const { data: boards } = await supabase.from('boards').select('id,name,owner_id').in('id', boardIds);
    const boardMap = new Map(((boards ?? []) as BoardRow[]).map(b => [b.id, b]));
    setItems(attachments.map(a => { const card = cardMap.get(a.card_id); const list = card ? listMap.get(card.list_id) : undefined; const board = list ? boardMap.get(list.board_id) : undefined; return { ...a, cardTitle: card?.title ?? 'Aufgabe', boardName: board?.name ?? 'Board', boardOwnerId: board?.owner_id ?? '' }; }));
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);
  const visible = items.filter(item => `${item.file_name} ${item.cardTitle} ${item.boardName}`.toLowerCase().includes(query.trim().toLowerCase()));
  async function open(item: typeof items[number]) { if (!supabase) return; const { data, error } = await supabase.storage.from('card-attachments').createSignedUrl(item.storage_path, 120); if (error || !data?.signedUrl) setNotice(error?.message ?? 'Datei konnte nicht geöffnet werden.'); else window.open(data.signedUrl, '_blank', 'noopener,noreferrer'); }
  async function remove(item: typeof items[number]) {
    if (!supabase || !userId || (item.uploader_id !== userId && item.boardOwnerId !== userId)) return;
    if (!window.confirm(`Datei „${item.file_name}“ wirklich löschen?`)) return;
    const { error: storageError } = await supabase.storage.from('card-attachments').remove([item.storage_path]);
    if (storageError) { setNotice(storageError.message); return; }
    const { error } = await supabase.from('card_attachments').delete().eq('id', item.id);
    if (error) { setNotice(error.message); return; }
    setItems(current => current.filter(entry => entry.id !== item.id));
  }

  return <WorkspaceModulePage title="Dokumente" eyebrow="Arbeitsbereich" active="Dokumente" description="Projektunterlagen und Dateien zentral verwalten und direkt mit Aufgaben und Boards verknüpfen.">
    <section className="module-grid"><article className="module-card module-card-wide">
      <div className="module-toolbar"><div><strong>{visible.length}</strong><span className="muted"> Dateien</span></div><input className="module-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Dateien durchsuchen …"/><button className="ghost" onClick={() => void load()}>Aktualisieren</button></div>
      {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      {loading ? <p className="muted">Dokumente werden geladen …</p> : visible.length === 0 ? <div className="empty-state"><h3>Keine Dokumente vorhanden</h3><p>Dateien können direkt in einer Karten-Detailansicht hochgeladen werden.</p><a className="primary button-link" href="/">Boards öffnen</a></div> : <div className="document-list">{visible.map(item => { const canDelete = item.uploader_id === userId || item.boardOwnerId === userId; return <div className="document-row" key={item.id}><button className="document-open" onClick={() => void open(item)}><span className="document-icon">▤</span><span><strong>{item.file_name}</strong><small>{item.boardName} · {item.cardTitle}{item.size_bytes ? ` · ${Math.round(item.size_bytes / 1024)} KB` : ''}</small></span></button>{canDelete && <button className="document-delete" onClick={() => void remove(item)} aria-label={`${item.file_name} löschen`}>Löschen</button>}</div>; })}</div>}
    </article></section>
  </WorkspaceModulePage>;
}
