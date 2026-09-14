import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

type ChecklistItem = { id: string; card_id: string; title: string; completed: boolean; position: number };
type Comment = { id: string; card_id: string; author_id: string; body: string; created_at: string };

type Props = { supabase: SupabaseClient; cardId: string; userId: string };

export default function CardCollaboration({ supabase, cardId, userId }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newItem, setNewItem] = useState('');
  const [newComment, setNewComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [checklist, commentRows] = await Promise.all([
      supabase.from('card_checklist_items').select('id,card_id,title,completed,position').eq('card_id', cardId).order('position'),
      supabase.from('card_comments').select('id,card_id,author_id,body,created_at').eq('card_id', cardId).order('created_at'),
    ]);
    if (checklist.error) Alert.alert('Checkliste', checklist.error.message);
    else setItems((checklist.data ?? []) as ChecklistItem[]);
    if (commentRows.error) Alert.alert('Kommentare', commentRows.error.message);
    else setComments((commentRows.data ?? []) as Comment[]);
  }

  useEffect(() => {
    void load();
    const channel = supabase.channel(`mobile-card-collaboration-${cardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_checklist_items', filter: `card_id=eq.${cardId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_comments', filter: `card_id=eq.${cardId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [cardId]);

  async function addChecklistItem() {
    const title = newItem.trim(); if (!title || busy) return;
    setBusy(true);
    const position = items.length ? Math.max(...items.map(item => Number(item.position) || 0)) + 1 : 0;
    const { data, error } = await supabase.from('card_checklist_items').insert({ card_id: cardId, title, completed: false, position, created_by: userId }).select('id,card_id,title,completed,position').single();
    setBusy(false);
    if (error) Alert.alert('Punkt hinzufügen', error.message);
    else { setItems(current => [...current, data as ChecklistItem]); setNewItem(''); }
  }

  async function toggleItem(item: ChecklistItem) {
    const { data, error } = await supabase.from('card_checklist_items').update({ completed: !item.completed }).eq('id', item.id).select('id,card_id,title,completed,position').single();
    if (error) Alert.alert('Checkliste', error.message);
    else if (data) setItems(current => current.map(value => value.id === item.id ? data as ChecklistItem : value));
  }

  function removeItem(item: ChecklistItem) {
    Alert.alert('Punkt löschen', `„${item.title}“ wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('card_checklist_items').delete().eq('id', item.id);
        if (error) Alert.alert('Punkt löschen', error.message); else setItems(current => current.filter(value => value.id !== item.id));
      } },
    ]);
  }

  async function addComment() {
    const body = newComment.trim(); if (!body || busy) return;
    setBusy(true);
    const { data, error } = await supabase.from('card_comments').insert({ card_id: cardId, author_id: userId, body }).select('id,card_id,author_id,body,created_at').single();
    setBusy(false);
    if (error) Alert.alert('Kommentar', error.message);
    else { setComments(current => [...current, data as Comment]); setNewComment(''); }
  }

  return <View style={styles.container}>
    <Text style={styles.sectionTitle}>Checkliste</Text>
    {items.map(item => <View key={item.id} style={styles.itemRow}>
      <Pressable style={[styles.checkbox, item.completed && styles.checkboxDone]} onPress={() => void toggleItem(item)}><Text style={styles.check}>{item.completed ? '✓' : ''}</Text></Pressable>
      <Text style={[styles.itemText, item.completed && styles.itemDone]}>{item.title}</Text>
      <Pressable onPress={() => removeItem(item)}><Text style={styles.remove}>×</Text></Pressable>
    </View>)}
    <View style={styles.addRow}><TextInput style={styles.smallInput} placeholder="Neuer Checklistenpunkt" value={newItem} onChangeText={setNewItem} onSubmitEditing={() => void addChecklistItem()} returnKeyType="done" /><Pressable style={styles.smallButton} onPress={() => void addChecklistItem()} disabled={busy}><Text style={styles.smallButtonText}>+</Text></Pressable></View>

    <Text style={[styles.sectionTitle, styles.commentsTitle]}>Kommentare</Text>
    {comments.map(comment => <View key={comment.id} style={styles.comment}>
      <Text style={styles.commentMeta}>{comment.author_id === userId ? 'Du' : 'Teammitglied'} · {new Date(comment.created_at).toLocaleString('de-DE')}</Text>
      <Text style={styles.commentBody}>{comment.body}</Text>
    </View>)}
    <View style={styles.commentComposer}><TextInput style={[styles.smallInput, styles.commentInput]} placeholder="Kommentar schreiben …" value={newComment} onChangeText={setNewComment} multiline /><Pressable style={styles.primary} onPress={() => void addComment()} disabled={busy}><Text style={styles.primaryText}>Senden</Text></Pressable></View>
  </View>;
}

const styles = StyleSheet.create({ container:{marginTop:18,paddingTop:16,borderTopWidth:1,borderTopColor:'#e5e7eb'}, sectionTitle:{fontSize:17,fontWeight:'800',marginBottom:10}, commentsTitle:{marginTop:20}, itemRow:{flexDirection:'row',alignItems:'center',paddingVertical:7}, checkbox:{width:26,height:26,borderWidth:1,borderColor:'#9ca3af',borderRadius:7,alignItems:'center',justifyContent:'center',marginRight:10},checkboxDone:{backgroundColor:'#111827',borderColor:'#111827'},check:{color:'#fff',fontWeight:'800'},itemText:{flex:1,fontSize:15},itemDone:{textDecorationLine:'line-through',color:'#6b7280'},remove:{fontSize:24,color:'#9ca3af',paddingHorizontal:8},addRow:{flexDirection:'row',alignItems:'center',gap:8},smallInput:{flex:1,backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:10,padding:11,fontSize:14},smallButton:{width:44,height:44,borderRadius:10,backgroundColor:'#111827',alignItems:'center',justifyContent:'center'},smallButtonText:{color:'#fff',fontSize:24},comment:{backgroundColor:'#fff',borderRadius:10,padding:11,marginBottom:8},commentMeta:{fontSize:11,color:'#6b7280',marginBottom:5},commentBody:{fontSize:14,lineHeight:20},commentComposer:{gap:8},commentInput:{minHeight:70,textAlignVertical:'top'},primary:{backgroundColor:'#111827',borderRadius:10,padding:12,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'700'} });
