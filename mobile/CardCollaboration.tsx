import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

type ChecklistItem = { id: string; card_id: string; title: string; completed: boolean; position: number };
type Comment = { id: string; card_id: string; author_id: string; body: string; created_at: string };
type Attachment = { id: string; card_id: string; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null; created_at: string };
type Props = { supabase: SupabaseClient; cardId: string; userId: string };

export default function CardCollaboration({ supabase, cardId, userId }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [newItem, setNewItem] = useState('');
  const [newComment, setNewComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [roleResolved, setRoleResolved] = useState(false);

  async function load() {
    const [checklist, commentRows, attachmentRows] = await Promise.all([
      supabase.from('card_checklist_items').select('id,card_id,title,completed,position').eq('card_id', cardId).order('position'),
      supabase.from('card_comments').select('id,card_id,author_id,body,created_at').eq('card_id', cardId).order('created_at'),
      supabase.from('card_attachments').select('id,card_id,storage_path,file_name,mime_type,size_bytes,created_at').eq('card_id', cardId).order('created_at', { ascending: false }),
    ]);
    if (checklist.error) Alert.alert('Checkliste', checklist.error.message); else setItems((checklist.data ?? []) as ChecklistItem[]);
    if (commentRows.error) Alert.alert('Kommentare', commentRows.error.message); else setComments((commentRows.data ?? []) as Comment[]);
    if (attachmentRows.error) Alert.alert('Anhänge', attachmentRows.error.message); else setAttachments((attachmentRows.data ?? []) as Attachment[]);
  }

  useEffect(() => {
    let alive = true;
    setRoleResolved(false);
    setCanEdit(false);
    void (async () => {
      const cardResult = await supabase.from('cards').select('list_id').eq('id', cardId).single();
      if (cardResult.error || !cardResult.data) { if (alive) setRoleResolved(true); return; }
      const listResult = await supabase.from('lists').select('board_id').eq('id', cardResult.data.list_id).single();
      const boardId = listResult.data?.board_id;
      if (!alive) return;
      if (!boardId) { setRoleResolved(true); return; }
      const membership = await supabase.from('board_members').select('role').eq('board_id', boardId).eq('user_id', userId).single();
      if (alive) {
        setCanEdit(['owner', 'admin', 'member'].includes(String(membership.data?.role ?? 'viewer')));
        setRoleResolved(true);
      }
    })();
    void load();
    const channel = supabase.channel(`mobile-card-collaboration-${cardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_checklist_items', filter: `card_id=eq.${cardId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_comments', filter: `card_id=eq.${cardId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_attachments', filter: `card_id=eq.${cardId}` }, () => void load())
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [cardId, userId, supabase]);

  async function addChecklistItem() {
    const title = newItem.trim(); if (!title || busy || !canEdit) return;
    setBusy(true);
    const position = items.length ? Math.max(...items.map(item => Number(item.position) || 0)) + 1 : 0;
    const { data, error } = await supabase.from('card_checklist_items').insert({ card_id: cardId, title, completed: false, position, created_by: userId }).select('id,card_id,title,completed,position').single();
    setBusy(false);
    if (error) Alert.alert('Punkt hinzufügen', error.message); else { setItems(current => current.some(item => item.id === data?.id) ? current : [...current, data as ChecklistItem]); setNewItem(''); }
  }

  async function toggleItem(item: ChecklistItem) {
    if (!canEdit) return;
    const { data, error } = await supabase.from('card_checklist_items').update({ completed: !item.completed }).eq('id', item.id).select('id,card_id,title,completed,position').single();
    if (error) Alert.alert('Checkliste', error.message); else if (data) setItems(current => current.map(value => value.id === item.id ? data as ChecklistItem : value));
  }

  function removeItem(item: ChecklistItem) {
    if (!canEdit) return;
    Alert.alert('Punkt löschen', `„${item.title}“ wirklich löschen?`, [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: async () => { const { error } = await supabase.from('card_checklist_items').delete().eq('id', item.id); if (error) Alert.alert('Punkt löschen', error.message); else setItems(current => current.filter(value => value.id !== item.id)); } }]);
  }

  async function addComment() {
    const body = newComment.trim(); if (!body || busy || !canEdit) return;
    setBusy(true);
    const { data, error } = await supabase.from('card_comments').insert({ card_id: cardId, author_id: userId, body }).select('id,card_id,author_id,body,created_at').single();
    setBusy(false);
    if (error) Alert.alert('Kommentar', error.message); else { setComments(current => current.some(comment => comment.id === data?.id) ? current : [...current, data as Comment]); setNewComment(''); }
  }

  async function addAttachment() {
    if (busy || !canEdit) return;
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets?.[0]) return;
    const file = picked.assets[0]; setBusy(true);
    try {
      const cardResult = await supabase.from('cards').select('list_id').eq('id', cardId).single();
      if (cardResult.error || !cardResult.data) throw new Error(cardResult.error?.message ?? 'Karte konnte nicht ermittelt werden.');
      const listResult = await supabase.from('lists').select('board_id').eq('id', cardResult.data.list_id).single();
      const boardId = listResult.data?.board_id;
      if (listResult.error || !boardId) throw new Error(listResult.error?.message ?? 'Board des Anhangs konnte nicht ermittelt werden.');
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${boardId}/${cardId}/${Date.now()}-${safeName}`;
      const body = await (await fetch(file.uri)).arrayBuffer();
      const upload = await supabase.storage.from('card-attachments').upload(path, body, { contentType: file.mimeType ?? 'application/octet-stream', upsert: false });
      if (upload.error) throw upload.error;
      const insert = await supabase.from('card_attachments').insert({ card_id: cardId, uploader_id: userId, storage_path: path, file_name: file.name, mime_type: file.mimeType ?? null, size_bytes: file.size ?? null }).select('id,card_id,storage_path,file_name,mime_type,size_bytes,created_at').single();
      if (insert.error) { await supabase.storage.from('card-attachments').remove([path]); throw insert.error; }
      if (insert.data) setAttachments(current => current.some(item => item.id === insert.data.id) ? current : [insert.data as Attachment, ...current]);
    } catch (error) { Alert.alert('Anhang hinzufügen', error instanceof Error ? error.message : 'Unbekannter Fehler.'); }
    finally { setBusy(false); }
  }

  async function openAttachment(attachment: Attachment) {
    const { data, error } = await supabase.storage.from('card-attachments').createSignedUrl(attachment.storage_path, 600);
    if (error || !data?.signedUrl) { Alert.alert('Anhang öffnen', error?.message ?? 'Link konnte nicht erstellt werden.'); return; }
    try { await Linking.openURL(data.signedUrl); } catch { Alert.alert('Anhang öffnen', 'Der Anhang konnte auf diesem Gerät nicht geöffnet werden.'); }
  }

  function removeAttachment(attachment: Attachment) {
    if (!canEdit) return;
    Alert.alert('Anhang löschen', `„${attachment.file_name}“ wirklich löschen?`, [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: async () => {
      const storage = await supabase.storage.from('card-attachments').remove([attachment.storage_path]);
      if (storage.error) { Alert.alert('Anhang löschen', storage.error.message); return; }
      const { error } = await supabase.from('card_attachments').delete().eq('id', attachment.id);
      if (error) Alert.alert('Anhang löschen', error.message); else setAttachments(current => current.filter(value => value.id !== attachment.id));
    } }]);
  }

  const sizeLabel = (bytes: number | null) => bytes == null ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const ready = roleResolved;

  return <View style={styles.container}>
    <Text style={styles.sectionTitle}>Checkliste</Text>
    {items.map(item => <View key={item.id} style={styles.itemRow}><Pressable style={[styles.checkbox, item.completed && styles.checkboxDone, !canEdit && styles.disabled]} onPress={() => void toggleItem(item)} disabled={!canEdit}><Text style={styles.check}>{item.completed ? '✓' : ''}</Text></Pressable><Text style={[styles.itemText, item.completed && styles.itemDone]}>{item.title}</Text>{canEdit ? <Pressable onPress={() => removeItem(item)}><Text style={styles.remove}>×</Text></Pressable> : null}</View>)}
    {!ready ? <Text style={styles.muted}>Berechtigungen werden geprüft …</Text> : canEdit ? <View style={styles.addRow}><TextInput style={styles.smallInput} placeholder="Neuer Checklistenpunkt" value={newItem} onChangeText={setNewItem} onSubmitEditing={() => void addChecklistItem()} returnKeyType="done" /><Pressable style={styles.smallButton} onPress={() => void addChecklistItem()} disabled={busy}><Text style={styles.smallButtonText}>+</Text></Pressable></View> : <Text style={styles.muted}>Nur-Lesen-Modus</Text>}

    <Text style={[styles.sectionTitle, styles.attachTitle]}>Anhänge</Text>
    {attachments.map(attachment => <View key={attachment.id} style={styles.attachment}><Pressable style={styles.attachmentMain} onPress={() => void openAttachment(attachment)}><Text style={styles.attachmentName} numberOfLines={1}>{attachment.file_name}</Text><Text style={styles.commentMeta}>{attachment.mime_type ?? 'Datei'} {sizeLabel(attachment.size_bytes) ? `· ${sizeLabel(attachment.size_bytes)}` : ''}</Text></Pressable>{canEdit ? <Pressable onPress={() => removeAttachment(attachment)}><Text style={styles.remove}>×</Text></Pressable> : null}</View>)}
    {ready && canEdit ? <Pressable style={styles.secondaryButton} onPress={() => void addAttachment()} disabled={busy}><Text style={styles.secondaryButtonText}>{busy ? 'Bitte warten …' : '＋ Anhang hinzufügen'}</Text></Pressable> : null}

    <Text style={[styles.sectionTitle, styles.commentsTitle]}>Kommentare</Text>
    {comments.map(comment => <View key={comment.id} style={styles.comment}><Text style={styles.commentMeta}>{comment.author_id === userId ? 'Du' : 'Teammitglied'} · {new Date(comment.created_at).toLocaleString('de-DE')}</Text><Text style={styles.commentBody}>{comment.body}</Text></View>)}
    {ready && canEdit ? <View style={styles.commentComposer}><TextInput style={[styles.smallInput, styles.commentInput]} placeholder="Kommentar schreiben …" value={newComment} onChangeText={setNewComment} multiline /><Pressable style={styles.primary} onPress={() => void addComment()} disabled={busy}><Text style={styles.primaryText}>Senden</Text></Pressable></View> : null}
  </View>;
}

const styles = StyleSheet.create({ container:{marginTop:18,paddingTop:16,borderTopWidth:1,borderTopColor:'#e5e7eb'},sectionTitle:{fontSize:17,fontWeight:'800',marginBottom:10},attachTitle:{marginTop:20},commentsTitle:{marginTop:20},itemRow:{flexDirection:'row',alignItems:'center',paddingVertical:7},checkbox:{width:26,height:26,borderWidth:1,borderColor:'#9ca3af',borderRadius:7,alignItems:'center',justifyContent:'center',marginRight:10},checkboxDone:{backgroundColor:'#111827',borderColor:'#111827'},disabled:{opacity:0.65},check:{color:'#fff',fontWeight:'800'},itemText:{flex:1,fontSize:15},itemDone:{textDecorationLine:'line-through',color:'#6b7280'},remove:{fontSize:24,color:'#9ca3af',paddingHorizontal:8},addRow:{flexDirection:'row',alignItems:'center',gap:8},smallInput:{flex:1,backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:10,padding:11,fontSize:14},smallButton:{width:44,height:44,borderRadius:10,backgroundColor:'#111827',alignItems:'center',justifyContent:'center'},smallButtonText:{color:'#fff',fontSize:24},attachment:{backgroundColor:'#fff',borderRadius:10,padding:11,marginBottom:8,flexDirection:'row',alignItems:'center'},attachmentMain:{flex:1},attachmentName:{fontSize:14,fontWeight:'600'},secondaryButton:{borderWidth:1,borderColor:'#d1d5db',borderRadius:10,padding:12,alignItems:'center',backgroundColor:'#fff'},secondaryButtonText:{fontWeight:'700'},comment:{backgroundColor:'#fff',borderRadius:10,padding:11,marginBottom:8},commentMeta:{fontSize:11,color:'#6b7280',marginBottom:5},commentBody:{fontSize:14,lineHeight:20},commentComposer:{gap:8},commentInput:{minHeight:70,textAlignVertical:'top'},primary:{backgroundColor:'#111827',borderRadius:10,padding:12,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'700'},muted:{color:'#6b7280',fontSize:13,marginBottom:8} });
