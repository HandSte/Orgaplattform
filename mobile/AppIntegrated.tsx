import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import App from './App';
import MobileIntegrationHub from './MobileIntegrationHub';

type Board = { id: string; name: string };

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }) : null;

export default function AppIntegrated() {
  const [userId, setUserId] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) setUserId(data.session?.user.id ?? null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !userId) { setBoards([]); return; }
    let alive = true;
    const loadBoards = async () => {
      const { data } = await supabase.from('boards').select('id,name').order('updated_at', { ascending: false });
      if (alive) setBoards((data ?? []) as Board[]);
    };
    void loadBoards();
    const channel = supabase.channel(`mobile-integrated-boards-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, () => void loadBoards())
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [userId]);

  return <View style={styles.root}>
    <App />
    {supabase && userId ? (
      <View pointerEvents="box-none" style={styles.overlay}>
        <MobileIntegrationHub supabase={supabase} userId={userId} selectedBoard={boards[0]?.id ?? null} boards={boards} />
      </View>
    ) : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 8, backgroundColor: 'rgba(248,250,252,0.96)', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
});
