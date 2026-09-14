import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type Board = { id: string; name: string };
type List = { id: string; board_id: string; name: string; position: number };
type Card = { id: string; list_id: string; title: string; position: number; priority: string | null };

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export default function App() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) return;
      const { data } = await supabase.from('boards').select('id,name').order('updated_at', { ascending: false });
      setBoards((data ?? []) as Board[]);
      setSelectedBoard(data?.[0]?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!supabase || !selectedBoard) return;
    void (async () => {
      const { data } = await supabase.rpc('get_board_snapshot', { p_board_id: selectedBoard });
      if (!data) return;
      setLists((data.lists ?? []) as List[]);
      setCards((data.cards ?? []) as Card[]);
    })();
    const channel = supabase.channel(`mobile-board-${selectedBoard}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter: `board_id=eq.${selectedBoard}` }, (payload) => {
        if (payload.eventType === 'INSERT') setLists(v => [...v, payload.new as List]);
        if (payload.eventType === 'UPDATE') setLists(v => v.map(x => x.id === payload.new.id ? payload.new as List : x));
        if (payload.eventType === 'DELETE') setLists(v => v.filter(x => x.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, (payload) => {
        if (payload.eventType === 'INSERT') setCards(v => v.some(x => x.id === payload.new.id) ? v : [...v, payload.new as Card]);
        if (payload.eventType === 'UPDATE') setCards(v => v.map(x => x.id === payload.new.id ? payload.new as Card : x));
        if (payload.eventType === 'DELETE') setCards(v => v.filter(x => x.id !== payload.old.id));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedBoard]);

  const activeLists = useMemo(() => lists.filter(x => x.board_id === selectedBoard).sort((a,b) => a.position - b.position), [lists, selectedBoard]);
  const cardsByList = (listId: string) => cards.filter(x => x.list_id === listId).sort((a,b) => a.position - b.position);

  if (!supabase) return <SafeAreaView style={styles.safe}><Text style={styles.title}>Orgaplattform</Text><Text>Mobile Supabase-Konfiguration fehlt.</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><StatusBar style="auto" /><ScrollView horizontal contentContainerStyle={styles.board} showsHorizontalScrollIndicator={false}>
    {activeLists.map(list => <View key={list.id} style={styles.column}><Text style={styles.columnTitle}>{list.name}</Text>{cardsByList(list.id).map(card => <View key={card.id} style={styles.card}><Text style={styles.cardTitle}>{card.title}</Text><Text style={styles.meta}>{card.priority ?? 'normal'}</Text></View>)}</View>)}
    {!activeLists.length && <View style={styles.empty}><Text style={styles.title}>{boards.length ? 'Board wird geladen …' : 'Keine Boards vorhanden'}</Text></View>}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:'#f8fafc'}, board:{padding:16,gap:14}, column:{width:300,backgroundColor:'#e5e7eb',borderRadius:14,padding:12,minHeight:180},columnTitle:{fontSize:17,fontWeight:'700',marginBottom:10},card:{backgroundColor:'#fff',borderRadius:12,padding:13,marginBottom:9},cardTitle:{fontSize:15,fontWeight:'600'},meta:{fontSize:12,color:'#6b7280',marginTop:6},title:{fontSize:22,fontWeight:'800',marginBottom:8},empty:{padding:20}}
);
