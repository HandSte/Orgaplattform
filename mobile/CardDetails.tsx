import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

type ChecklistItem = { id: string; card_id: string; title: string; completed: boolean; position: number };
type Comment = { id: string; card_id: string; author_id: string; body: string; created_at: string };

type Props = { client: SupabaseClient; cardId: string; userId: string };

export default function CardDetails({ client, cardId, userId }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newItem, setNewItem] = useState('');
  const [newComment, setNewComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: checklist, error: checklistError }, { data: commentRows, error: commentError }] = await Promise.all([
      client.from('card_checklist_items').select('id,card_id,title,completed,position').eq('card_id', cardId).order('position'),
      client.from('card_comments').select('id,card_id,author_id,body,created_at').eq('card_id', cardId).order('created_at', { ascending: true }),
    ]);
    if (checklistError) Alert.alert('Checkliste', checklistError.message);
    if (commentError) Alert.alert('Kommentare', commentError.message);
    setItems((checklist ?? []) as ChecklistItem[]);
    setComments((commentRows ?? []) as Comment[]);
  }

  useEffect(() => {
    void load();
    const channel = client.channel(`mobile-card-${cardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_checklist_items', filter: `card_id=eq.${cardId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_comments', filter: `card_id=eq.${cardId}` }, () => { void load(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [client, cardId]);

  async function addChecklistItem() {
    const title = newItem.trim();
    if (!title || busy) return;
    setBusy(true);
    const position = items.length ? Math.max(...items.map((item) => Number(item.position) || 0)) + 1 : 0;
    const { data, error } = await client.from('card_checklist_items').insert({ card_id: cardId, title, completed: false, position, created_by: userId }).select('id,card_id,title,completed,position').single();
    if (error) Alert.alert('Checkliste', error.message); else if (data) { setItems((current) => [...current, data as ChecklistItem]); setNewItem(''); }
    setBusy(false);
  }

  async function toggleItem(item: ChecklistItem) {
    const { data, error } = await client.from('card_checklist_items').update({ completed: !item.completed }).eq('id', item.id).select('id,card_id,title,completed,position').single();
    if (error) Alert.alert('Checkliste', error.message); else if (data) setItems((current) => current.map((entry) => entry.id === item.id ? data as ChecklistItem : entry));
  }

  async function deleteItem(item: ChecklistItem) {
    const { error } = await client.from('card_checklist_items').delete().eq('id', item.id);
    if (error) Alert.alert('Checkliste', error.message); else setItems((current) => current.filter((entry) => entry.id !== item.id));
  }

  async function addComment() {
    const body = newComment.trim();
    if (!body || busy) return;
    setBusy(true);
    const { data, error } = await client.from('card_comments').insert({ card_id: cardId, author_id: userId, body }).select('id,card_id,author_id,body,created_at').single();
    if (error) Alert.alert('Kommentar', error.message); else if (data) { setComments((current) => [...current, data as Comment]); setNewComment(''); }
    setBusy(false);
  }

  return <ScrollView style={styles.container} nestedScrollEnabled>
    <Text style={styles.section}>Checkliste</Text>
    {items.map((item) => <View key={item.id} style={styles.row}><Pressable onPress={() => void toggleItem(item)} style={[styles.checkbox, item.completed && styles.checkboxDone]}><Text style={styles.check}>{item.completed ? '✓' : ''}</Text></Pressable><Text style={[styles.itemText, item.completed && styles.done]}>{item.title}</Text><Pressable onPress={() => void deleteItem(item)}><Text style={styles.delete}>×</Text></Pressable></View>)}
    <View style={styles.addRow}><TextInput style={styles.input} placeholder="Punkt hinzufügen …" value={newItem} onChangeText={setNewItem} onSubmitEditing={() => void addChecklistItem()} returnKeyType="done"/><Pressable style={styles.button} onPress={() => void addChecklistItem()} disabled={busy}><Text style={styles.buttonText}>＋</Text></Pressable></View>
    <Text style={styles.section}>Kommentare</Text>
    {comments.map((comment) => <View key={comment.id} style={styles.comment}><Text style={styles.commentMeta}>{comment.author_id === userId ? 'Du' : 'Teammitglied'} · {new Date(comment.created_at).toLocaleString('de-DE')}</Text><Text style={styles.commentBody}>{comment.body}</Text></View>)}
    <TextInput style={[styles.input, styles.commentInput]} placeholder="Kommentar schreiben …" value={newComment} onChangeText={setNewComment} multiline textAlignVertical="top"/>
    <Pressable style={styles.primary} onPress={() => void addComment()} disabled={busy}><Text style={styles.primaryText}>{busy ? 'Speichern …' : 'Kommentar hinzufügen'}</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({ container:{marginTop:8},section:{fontSize:18,fontWeight:'800',marginTop:14,marginBottom:10},row:{flexDirection:'row',alignItems:'center',backgroundColor:'#fff',borderRadius:10,padding:10,marginBottom:7},checkbox:{width:26,height:26,borderWidth:1,borderColor:'#9ca3af',borderRadius:7,alignItems:'center',justifyContent:'center',marginRight:10},checkboxDone:{backgroundColor:'#111827',borderColor:'#111827'},check:{color:'#fff',fontWeight:'800'},itemText:{flex:1,fontSize:15},done:{textDecorationLine:'line-through',color:'#6b7280'},delete:{fontSize:24,color:'#dc2626',paddingHorizontal:7},addRow:{flexDirection:'row',alignItems:'center',gap:8},input:{flex:1,backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:10,padding:12,fontSize:15},button:{width:46,height:46,borderRadius:10,backgroundColor:'#111827',alignItems:'center',justifyContent:'center'},buttonText:{color:'#fff',fontSize:22},comment:{backgroundColor:'#fff',borderRadius:10,padding:12,marginBottom:8},commentMeta:{fontSize:11,color:'#6b7280',marginBottom:5},commentBody:{fontSize:15,lineHeight:21},commentInput:{height:90,marginTop:4},primary:{backgroundColor:'#111827',borderRadius:10,padding:13,alignItems:'center',marginTop:8,marginBottom:24},primaryText:{color:'#fff',fontWeight:'700'} });