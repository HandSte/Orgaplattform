import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

type Attachment = { id: string; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null; created_at: string };
type Props = { supabase: SupabaseClient; cardId: string; boardId: string; userId: string };

function sizeLabel(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function CardExtras({ supabase, cardId, boardId, userId }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase.from('card_attachments').select('id,storage_path,file_name,mime_type,size_bytes,created_at').eq('card_id', cardId).order('created_at', { ascending: true });
    if (error) Alert.alert('Anhänge', error.message);
    else setAttachments((data ?? []) as Attachment[]);
  }

  useEffect(() => {
    void load();
    const channel = supabase.channel(`mobile-card-attachments-${cardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_attachments', filter: `card_id=eq.${cardId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [cardId]);

  async function addAttachment() {
    if (busy) return;
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];
    if (file.size && file.size > 50 * 1024 * 1024) return Alert.alert('Anhang', 'Datei ist zu groß. Maximal 50 MB.');
    setBusy(true);
    try {
      const response = await fetch(file.uri);
      const body = await response.arrayBuffer();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${boardId}/${cardId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('card-attachments').upload(path, body, { contentType: file.mimeType || 'application/octet-stream', upsert: false });
      if (uploadError) throw uploadError;
      const { error: rowError } = await supabase.from('card_attachments').insert({ card_id: cardId, uploader_id: userId, storage_path: path, file_name: file.name, mime_type: file.mimeType || null, size_bytes: file.size || null });
      if (rowError) { await supabase.storage.from('card-attachments').remove([path]); throw rowError; }
      await load();
    } catch (error: unknown) {
      Alert.alert('Anhang', error instanceof Error ? error.message : 'Datei konnte nicht hochgeladen werden.');
    } finally { setBusy(false); }
  }

  async function openAttachment(item: Attachment) {
    const { data, error } = await supabase.storage.from('card-attachments').createSignedUrl(item.storage_path, 120);
    if (error || !data?.signedUrl) return Alert.alert('Anhang', error?.message ?? 'Datei konnte nicht geöffnet werden.');
    await Linking.openURL(data.signedUrl);
  }

  function removeAttachment(item: Attachment) {
    Alert.alert('Anhang löschen', `„${item.file_name}“ wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        const { error: storageError } = await supabase.storage.from('card-attachments').remove([item.storage_path]);
        if (storageError) return Alert.alert('Anhang', storageError.message);
        const { error } = await supabase.from('card_attachments').delete().eq('id', item.id);
        if (error) return Alert.alert('Anhang', error.message);
        setAttachments(current => current.filter(value => value.id !== item.id));
      } },
    ]);
  }

  return <View style={styles.container}>
    <View style={styles.head}><Text style={styles.title}>Anhänge</Text><Pressable style={styles.button} onPress={() => void addAttachment()} disabled={busy}><Text style={styles.buttonText}>{busy ? 'Hochladen …' : '+ Datei'}</Text></Pressable></View>
    {!attachments.length ? <Text style={styles.muted}>Noch keine Anhänge.</Text> : attachments.map(item => <View key={item.id} style={styles.row}><Pressable style={styles.file} onPress={() => void openAttachment(item)}><Text style={styles.name} numberOfLines={1}>{item.file_name}</Text><Text style={styles.meta}>{item.mime_type || 'Datei'}{item.size_bytes ? ` · ${sizeLabel(item.size_bytes)}` : ''}</Text></Pressable><Pressable onPress={() => removeAttachment(item)}><Text style={styles.remove}>×</Text></Pressable></View>)}
  </View>;
}

const styles = StyleSheet.create({ container:{marginTop:18,paddingTop:16,borderTopWidth:1,borderTopColor:'#e5e7eb'},head:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10},title:{fontSize:17,fontWeight:'800'},button:{backgroundColor:'#111827',borderRadius:9,paddingHorizontal:12,paddingVertical:9},buttonText:{color:'#fff',fontWeight:'700'},muted:{color:'#6b7280',fontSize:13},row:{flexDirection:'row',alignItems:'center',backgroundColor:'#fff',borderRadius:10,padding:10,marginBottom:7},file:{flex:1},name:{fontSize:14,fontWeight:'600'},meta:{fontSize:11,color:'#6b7280',marginTop:3},remove:{fontSize:24,color:'#9ca3af',paddingHorizontal:8} });
