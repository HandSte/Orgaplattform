import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

type Notification = { id: string; user_id: string; board_id: string | null; card_id: string | null; type: string; title: string; body: string | null; read_at: string | null; created_at: string };

type Props = { supabase: SupabaseClient; userId: string };

export default function NotificationCenter({ supabase, userId }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);

  async function load() {
    const { data } = await supabase.from('notifications').select('id,user_id,board_id,card_id,type,title,body,read_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    setItems((data ?? []) as Notification[]);
  }

  useEffect(() => {
    void load();
    const channel = supabase.channel(`mobile-notifications-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const unread = items.filter(item => !item.read_at).length;

  async function markAllRead() {
    if (!unread) return;
    const { error } = await supabase.rpc('mark_notifications_read', { p_notification_ids: null });
    if (!error) setItems(current => current.map(item => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
  }

  return <>
    <Pressable style={styles.bell} onPress={() => { setOpen(true); void load(); }}><Text style={styles.bellText}>🔔</Text>{unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View> : null}</Pressable>
    <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}><View style={styles.modal}><View style={styles.head}><Text style={styles.title}>Benachrichtigungen</Text><Pressable onPress={() => setOpen(false)}><Text style={styles.close}>×</Text></Pressable></View>
        {unread > 0 ? <Pressable style={styles.readAll} onPress={() => void markAllRead()}><Text style={styles.readAllText}>Alle als gelesen markieren</Text></Pressable> : null}
        <ScrollView contentContainerStyle={styles.list}>{items.length ? items.map(item => <View key={item.id} style={[styles.item, !item.read_at && styles.unread]}><Text style={styles.itemTitle}>{item.title}</Text>{item.body ? <Text style={styles.body}>{item.body}</Text> : null}<Text style={styles.date}>{new Date(item.created_at).toLocaleString('de-DE')}</Text></View>) : <Text style={styles.empty}>Keine Benachrichtigungen</Text>}</ScrollView>
      </View></View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({ bell:{width:44,height:44,borderRadius:12,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#d1d5db'},bellText:{fontSize:20},badge:{position:'absolute',right:-3,top:-4,minWidth:19,height:19,borderRadius:10,backgroundColor:'#dc2626',alignItems:'center',justifyContent:'center',paddingHorizontal:4},badgeText:{color:'#fff',fontSize:10,fontWeight:'800'},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.35)',justifyContent:'flex-end'},modal:{backgroundColor:'#f8fafc',borderTopLeftRadius:22,borderTopRightRadius:22,maxHeight:'88%',padding:20,paddingBottom:30},head:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},title:{fontSize:23,fontWeight:'800'},close:{fontSize:32,color:'#6b7280'},readAll:{alignSelf:'flex-start',marginTop:10,marginBottom:8},readAllText:{color:'#2563eb',fontWeight:'700'},list:{paddingBottom:20},item:{backgroundColor:'#fff',borderRadius:12,padding:13,marginBottom:8,borderWidth:1,borderColor:'#e5e7eb'},unread:{borderColor:'#9ca3af'},itemTitle:{fontSize:15,fontWeight:'700'},body:{fontSize:14,color:'#374151',marginTop:4,lineHeight:20},date:{fontSize:11,color:'#6b7280',marginTop:7},empty:{textAlign:'center',color:'#6b7280',padding:30} });
