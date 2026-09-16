import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import App from './App';
import MobileIntegrationHub from './MobileIntegrationHub';

type Board = { id: string; name: string };
type Card = { id: string; list_id: string; title: string; description?: string | null; due_at?: string | null; assignee_id?: string | null; priority?: string | null };
type View = 'tasks' | 'calendar' | 'documents' | 'team';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }) : null;

export default function AppIntegrated() {
  const [userId, setUserId] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) setUserId(data.session?.user.id ?? null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !userId) {
      setBoards([]);
      setSelectedBoard(null);
      setOpenCardId(null);
      setView(null);
      setBoardError(null);
      return;
    }
    let alive = true;
    const loadBoards = async () => {
      const { data, error } = await supabase.from('boards').select('id,name').order('updated_at', { ascending: false });
      if (!alive) return;
      if (error) {
        setBoardError(error.message);
        return;
      }
      setBoardError(null);
      const next = (data ?? []) as Board[];
      setBoards(next);
      setSelectedBoard(current => {
        const nextId = current && next.some(board => board.id === current) ? current : next[0]?.id ?? null;
        if (nextId !== current) {
          setOpenCardId(null);
          setView(null);
        }
        return nextId;
      });
    };
    void loadBoards();
    const channel = supabase.channel(`mobile-integrated-boards-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, () => void loadBoards())
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    if (!selectedBoard) {
      setOpenCardId(null);
      setView(null);
    }
  }, [selectedBoard]);

  const changeBoard = (boardId: string) => {
    if (boardId === selectedBoard) return;
    setOpenCardId(null);
    setView(null);
    setSelectedBoard(boardId);
  };

  return <View style={styles.root}>
    <App selectedBoard={selectedBoard} onSelectedBoardChange={changeBoard} openCardId={openCardId} onOpenCardHandled={() => setOpenCardId(null)} onNavigate={setView} />
    {supabase && userId ? <View pointerEvents="box-none" style={styles.overlay}>
      <MobileIntegrationHub supabase={supabase} userId={userId} selectedBoard={selectedBoard} boards={boards} onSelectedBoardChange={changeBoard} onOpenCard={(card: Card) => setOpenCardId(card.id)} view={view} onViewChange={setView} />
    </View> : null}
    {boardError ? <View pointerEvents="none" style={styles.errorBanner}><Text style={styles.errorText}>{boardError}</Text></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  root:{flex:1},
  overlay:{position:'absolute',left:0,right:0,bottom:0,paddingBottom:8,backgroundColor:'rgba(248,250,252,0.96)',borderTopWidth:1,borderTopColor:'#e5e7eb'},
  errorBanner:{position:'absolute',left:12,right:12,top:52,paddingHorizontal:12,paddingVertical:9,borderRadius:10,backgroundColor:'#fee2e2',borderWidth:1,borderColor:'#fecaca'},
  errorText:{fontSize:12,fontWeight:'600',color:'#991b1b'}
});
