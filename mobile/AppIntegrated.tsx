import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import App from './App';
import MobileIntegrationHub from './MobileIntegrationHub';
import { BRANDING } from './branding';

type Board = { id: string; name: string };
type Card = { id: string; list_id: string; title: string; description?: string | null; due_at?: string | null; assignee_id?: string | null; priority?: string | null };
type AppView = 'tasks' | 'calendar' | 'documents' | 'team';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }) : null;

export default function AppIntegrated() {
  const [userId, setUserId] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [view, setView] = useState<AppView | null>(null);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [boardError, setBoardError] = useState('');
  const boardLoadSeq = useRef(0);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) setUserId(data.session?.user.id ?? null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !userId) {
      ++boardLoadSeq.current;
      setBoards([]); setSelectedBoard(null); setOpenCardId(null); setView(null); setLoadingBoards(false); setBoardError('');
      return;
    }
    let alive = true;
    const loadBoards = async () => {
      const requestId = ++boardLoadSeq.current;
      setLoadingBoards(true); setBoardError('');
      const { data, error } = await supabase.from('boards').select('id,name').order('updated_at', { ascending: false });
      if (!alive || requestId !== boardLoadSeq.current) return;
      if (error) { setBoardError(error.message); setLoadingBoards(false); return; }
      const next = (data ?? []) as Board[];
      setBoards(next);
      setSelectedBoard(current => current && next.some(board => board.id === current) ? current : next[0]?.id ?? null);
      setLoadingBoards(false);
    };
    void loadBoards();
    const channel = supabase.channel(`mobile-integrated-data-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, () => void loadBoards())
      .subscribe();
    return () => { alive = false; ++boardLoadSeq.current; void supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => { setOpenCardId(null); }, [selectedBoard]);

  return <View style={styles.root}>
    <View style={styles.brandHeader}>
      <View style={styles.brandMark}><Text style={styles.brandMarkText}>{BRANDING.monogram}</Text></View>
      <View style={styles.brandCopy}>
        <Text style={styles.brandName}>{BRANDING.appName}</Text>
        <Text style={styles.brandTagline}>{BRANDING.tagline}</Text>
      </View>
    </View>
    <View style={styles.appArea}>
      <App selectedBoard={selectedBoard} onSelectedBoardChange={setSelectedBoard} openCardId={openCardId} onOpenCardHandled={() => setOpenCardId(null)} onNavigate={setView} />
    </View>
    {loadingBoards ? <View pointerEvents="none" style={styles.loading}><Text style={styles.loadingText}>Arbeitsbereiche werden synchronisiert …</Text></View> : null}
    {boardError ? <View pointerEvents="none" style={styles.error}><Text style={styles.errorText}>Board-Synchronisierung: {boardError}</Text></View> : null}
    {supabase && userId ? <View pointerEvents="box-none" style={styles.overlay}>
      <MobileIntegrationHub supabase={supabase} userId={userId} selectedBoard={selectedBoard} boards={boards} onSelectedBoardChange={setSelectedBoard} onOpenCard={(card: Card) => setOpenCardId(card.id)} view={view} onViewChange={setView} />
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  appArea: { flex: 1 },
  brandHeader: { height: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  brandMark: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  brandCopy: { marginLeft: 10 },
  brandName: { color: '#111827', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  brandTagline: { marginTop: 1, color: '#64748b', fontSize: 11, fontWeight: '500' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 8, backgroundColor: 'rgba(248,250,252,0.96)', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  loading: { position: 'absolute', top: 72, left: 16, right: 16, padding: 9, borderRadius: 10, backgroundColor: '#111827', alignItems: 'center' },
  loadingText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  error: { position: 'absolute', top: 106, left: 16, right: 16, padding: 9, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { color: '#991b1b', fontSize: 12 },
});
