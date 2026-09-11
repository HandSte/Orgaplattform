'use client';

import { useEffect, useState } from 'react';
import styles from './card-modal.module.css';
import { supabase } from '@/lib/supabase-browser';
import type { Card } from '@/lib/types';

type Comment = { id: string; card_id: string; author_id: string; body: string; created_at: string };
type Props = { card: Card; onClose: () => void; onSaved: (card: Card) => void; onDeleted: (cardId: string) => void };

export default function CardModal({ card, onClose, onSaved, onDeleted }: Props) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? '');
  const [dueAt, setDueAt] = useState(card.due_at ? card.due_at.slice(0, 10) : '');
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingComments, setLoadingComments] = useState(true);
  const [notice, setNotice] = useState('');

  async function loadComments() {
    if (!supabase) return;
    setLoadingComments(true);
    const { data, error } = await supabase.from('card_comments').select('id,card_id,author_id,body,created_at').eq('card_id', card.id).order('created_at', { ascending: true });
    if (error) setNotice(error.message);
    setComments(data ?? []);
    setLoadingComments(false);
  }
  useEffect(() => { loadComments(); }, [card.id]);

  async function save() {
    if (!supabase || !title.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('cards').update({ title: title.trim(), description: description.trim() || null, due_at: dueAt ? `${dueAt}T23:59:59Z` : null }).eq('id', card.id).select().single();
    if (error || !data) setNotice(error?.message ?? 'Aufgabe konnte nicht gespeichert werden.'); else onSaved(data as Card);
    setSaving(false);
  }

  async function addComment() {
    if (!supabase || !comment.trim()) return;
    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user;
    if (!user) return setNotice('Bitte zuerst anmelden.');
    const { error } = await supabase.from('card_comments').insert({ card_id: card.id, author_id: user.id, body: comment.trim() });
    if (error) setNotice(error.message); else { setComment(''); await loadComments(); }
  }

  async function deleteCard() {
    if (!supabase || !window.confirm(`Aufgabe „${card.title}“ wirklich löschen?`)) return;
    setDeleting(true);
    const { error } = await supabase.from('cards').delete().eq('id', card.id);
    if (error) { setNotice(error.message); setDeleting(false); return; }
    onDeleted(card.id);
  }

  return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-label="Aufgabe bearbeiten">
      <div className={styles.head}><div><p className="eyebrow">Aufgabe</p><h2>Aufgabe bearbeiten</h2></div><button className={styles.close} onClick={onClose} aria-label="Schließen">×</button></div>
      <div className={styles.grid}><div className={styles.main}>
        <label className={styles.field}><span>Titel</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className={styles.field}><span>Beschreibung</span><textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Was soll erledigt werden?" /></label>
        <div className={styles.actions}><button className="primary" onClick={save} disabled={saving || !title.trim()}>{saving ? 'Speichern …' : 'Änderungen speichern'}</button><button className={styles.danger} onClick={deleteCard} disabled={deleting}>{deleting ? 'Löschen …' : 'Aufgabe löschen'}</button></div>
      </div><aside className={styles.side}><label className={styles.field}><span>Fällig am</span><input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label><div className={styles.detailBox}><span>Status</span><strong>Wird über die Kanban-Spalte gesteuert</strong></div></aside></div>
      <div className={styles.comments}><div className={styles.commentsHead}><h3>Kommentare</h3><span>{comments.length}</span></div>
        {loadingComments ? <p className={styles.muted}>Kommentare werden geladen …</p> : comments.length === 0 ? <p className={styles.muted}>Noch keine Kommentare.</p> : <div className={styles.commentList}>{comments.map((item) => <article className={styles.comment} key={item.id}><div className={styles.commentMeta}>{item.author_id === card.created_by ? 'Ersteller' : 'Teammitglied'} · {new Date(item.created_at).toLocaleString('de-DE')}</div><div>{item.body}</div></article>)}</div>}
        <div className={styles.commentForm}><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Kommentar schreiben …" /><button className="ghost" onClick={addComment} disabled={!comment.trim()}>Kommentar hinzufügen</button></div>
      </div>{notice && <div className={styles.notice}><div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div></div>}
    </section>
  </div>;
}
