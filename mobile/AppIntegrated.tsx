import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import App from './App';
import AppErrorBoundary from './AppErrorBoundary';
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
      const stored = await AsyncStorage.getItem(`essentia.activeBoard.${userId}`);
      setSelectedBoard(current => current && next.some(board => board.id === current) ? current : stored && next.some(board => board.id === stored) ? stored : next[0]?.id ?? null);
      setLoadingBoards(false);
    };
    void loadBoards();
    const channel = supabase.channel(`mobile-integrated-data-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, () => void loadBoards())
      .subscribe();
    return () => { alive = false; ++boardLoadSeq.current; void supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => { setOpenCardId(null); if (userId && selectedBoard) void AsyncStorage.setItem(`essentia.activeBoard.${userId}`, selectedBoard); }, [selectedBoard, userId]);

  return <AppErrorBoundary><View style={styles.root}>
    <View style={styles.brandHeader}>
      <View style={styles.brandMark}><Text style={styles.brandMarkText}>{BRANDING.monogram}</Text></View>
      <View style={styles.brandCopy}>
        <View style={styles.brandNameRow}>
          <Text style={styles.brandName}>{BRANDING.appName}</Text>
          <View style={styles.versionPill}><Text style={styles.versionText}>v0.2.0</Text></View>
        </View>
        <Text style={styles.brandTagline}>{BRANDING.tagline}</Text>
      </View>
      <View style={styles.headerGlow} />
    </View>
    <View style={styles.appArea}>
      <App selectedBoard={selectedBoard} onSelectedBoardChange={setSelectedBoard} openCardId={openCardId} onOpenCardHandled={() => setOpenCardId(null)} onNavigate={setView} />
    </View>
    <View style={styles.bottomNav}>
      <NavButton label="Boards" icon="▦" active={view === null} onPress={() => setView(null)} />
      <NavButton label="Aufgaben" icon="☑" active={view === 'tasks'} onPress={() => setView('tasks')} />
      <NavButton label="Kalender" icon="□" active={view === 'calendar'} onPress={() => setView('calendar')} />
      <NavButton label="Dokumente" icon="▤" active={view === 'documents'} onPress={() => setView('documents')} />
      <NavButton label="Team" icon="♙" active={view === 'team'} onPress={() => setView('team')} />
    </View>
    {loadingBoards ? <View pointerEvents="none" style={styles.loading}><View style={styles.statusDot} /><Text style={styles.loadingText}>Arbeitsbereiche werden synchronisiert …</Text></View> : null}
    {boardError ? <View pointerEvents="none" style={styles.error}><Text style={styles.errorText}>Board-Synchronisierung: {boardError}</Text></View> : null}
    {supabase && userId && view ? <View pointerEvents="box-none" style={styles.overlay}>
      <MobileIntegrationHub supabase={supabase} userId={userId} selectedBoard={selectedBoard} boards={boards} onSelectedBoardChange={setSelectedBoard} onOpenCard={(card: Card) => setOpenCardId(card.id)} view={view} onViewChange={setView} showTabs={false} />
    </View> : null}
  </View></AppErrorBoundary>;
}

function NavButton({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.navButton, active && styles.navButtonActive]} onPress={onPress}><Text style={[styles.navIcon, active && styles.navIconActive]}>{icon}</Text><Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9' },
  appArea: { flex: 1, minHeight: 0 },
  bottomNav: { height: 72, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 7, flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e2e8f0', elevation: 12, shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: -3 } },
  navButton: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  navButtonActive: { backgroundColor: '#eef2f7' },
  navIcon: { fontSize: 18, lineHeight: 22, color: '#64748b', fontWeight: '800' },
  navIconActive: { color: '#0f172a' },
  navLabel: { marginTop: 2, fontSize: 9, color: '#64748b', fontWeight: '700' },
  navLabelActive: { color: '#0f172a' },
  brandHeader: { height: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b', overflow: 'hidden' },
  brandMark: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  brandMarkText: { color: '#0f172a', fontSize: 22, fontWeight: '900' },
  brandCopy: { marginLeft: 11, flex: 1 },
  brandNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandName: { color: '#f8fafc', fontSize: 18, fontWeight: '900', letterSpacing: 0.2 },
  versionPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  versionText: { color: '#cbd5e1', fontSize: 9, fontWeight: '800' },
  brandTagline: { marginTop: 2, color: '#94a3b8', fontSize: 10, fontWeight: '600' },
  headerGlow: { position: 'absolute', width: 130, height: 130, borderRadius: 65, right: -48, top: -62, backgroundColor: '#1e293b', opacity: 0.8 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  loading: { position: 'absolute', top: 86, left: 16, right: 16, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: '#0f172a', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, shadowColor: '#000000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#94a3b8' },
  loadingText: { color: '#f8fafc', fontSize: 12, fontWeight: '700' },
  error: { position: 'absolute', top: 86, left: 16, right: 16, padding: 11, borderRadius: 14, backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' },
  errorText: { color: '#9f1239', fontSize: 12, fontWeight: '600' },
});
