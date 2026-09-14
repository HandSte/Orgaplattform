import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type Board = { id: string; name: string };
type List = { id: string; board_id: string; name: string; position: number };
type Card = { id: string; list_id: string; title: string; position: number; priority: string | null };

type SessionUser = { id: string; email?: string | null };

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [boards, setBoards] = useState<Board[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !user) {
      setBoards([]); setSelectedBoard(null); return;
    }
    void (async () => {
      const { data, error } = await supabase.from('boards').select('id,name').order('updated_at', { ascending: false });
      if (error) { setMessage(error.message); return; }
      setBoards((data ?? []) as Board[]);
      setSelectedBoard(current => current && data?.some(b => b.id === current) ? current : data?.[0]?.id ?? null);
    })();
  }, [user]);

  useEffect(() => {
    if (!supabase || !selectedBoard || !user) return;
    let alive = true;
    setLoadingBoard(true);
    void (async () => {
      const { data, error } = await supabase.rpc('get_board_snapshot', { p_board_id: selectedBoard });
      if (!alive) return;
      if (error) setMessage(error.message);
      const snapshot = data as { lists?: List[]; cards?: Card[] } | null;
      setLists(snapshot?.lists ?? []);
      setCards(snapshot?.cards ?? []);
      setLoadingBoard(false);
    })();

    const channel = supabase.channel(`mobile-board-${selectedBoard}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter: `board_id=eq.${selectedBoard}` }, (payload) => {
        if (payload.eventType === 'INSERT') setLists(v => v.some(x => x.id === payload.new.id) ? v : [...v, payload.new as List]);
        if (payload.eventType === 'UPDATE') setLists(v => v.map(x => x.id === payload.new.id ? payload.new as List : x));
        if (payload.eventType === 'DELETE') setLists(v => v.filter(x => x.id !== payload.old.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, (payload) => {
        if (payload.eventType === 'INSERT') setCards(v => v.some(x => x.id === payload.new.id) ? v : [...v, payload.new as Card]);
        if (payload.eventType === 'UPDATE') setCards(v => v.map(x => x.id === payload.new.id ? payload.new as Card : x));
        if (payload.eventType === 'DELETE') setCards(v => v.filter(x => x.id !== payload.old.id));
      })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [selectedBoard, user]);

  async function submitAuth() {
    if (!supabase || !email.trim() || !password) return;
    setAuthBusy(true); setMessage('');
    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setAuthBusy(false);
    if (result.error) { setMessage(result.error.message); return; }
    setMessage(authMode === 'login' ? '' : 'Konto angelegt. Bitte bestätige ggf. deine E-Mail-Adresse.');
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Abmelden', error.message);
  }

  const activeLists = useMemo(() => [...lists].filter(x => x.board_id === selectedBoard).sort((a,b) => a.position - b.position), [lists, selectedBoard]);
  const cardsByList = (listId: string) => [...cards].filter(x => x.list_id === listId).sort((a,b) => a.position - b.position);

  if (!supabase) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.brand}>Orgaplattform</Text><Text>Mobile Supabase-Konfiguration fehlt.</Text></View></SafeAreaView>;

  if (!user) return <SafeAreaView style={styles.safe}><StatusBar style="auto" /><View style={styles.auth}><Text style={styles.brand}>Orgaplattform</Text><Text style={styles.heading}>{authMode === 'login' ? 'Anmelden' : 'Konto erstellen'}</Text><TextInput style={styles.input} placeholder="E-Mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" /><TextInput style={styles.input} placeholder="Passwort" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" /><Pressable style={styles.primary} onPress={() => void submitAuth()} disabled={authBusy}><Text style={styles.primaryText}>{authBusy ? 'Bitte warten …' : authMode === 'login' ? 'Anmelden' : 'Registrieren'}</Text></Pressable>{message ? <Text style={styles.message}>{message}</Text> : null}<Pressable onPress={() => { setAuthMode(v => v === 'login' ? 'signup' : 'login'); setMessage(''); }}><Text style={styles.link}>{authMode === 'login' ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Anmelden'}</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><StatusBar style="auto" /><View style={styles.header}><View><Text style={styles.brandSmall}>Orgaplattform</Text><Text style={styles.subtitle}>{user.email ?? 'Angemeldet'}</Text></View><Pressable onPress={() => void signOut()} style={styles.secondary}><Text>Abmelden</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boards}>{boards.map(board => <Pressable key={board.id} onPress={() => setSelectedBoard(board.id)} style={[styles.boardChip, board.id === selectedBoard && styles.boardChipActive]}><Text style={board.id === selectedBoard ? styles.boardChipTextActive : undefined}>{board.name}</Text></Pressable>)}</ScrollView>{loadingBoard ? <View style={styles.center}><Text>Board wird geladen …</Text></View> : <ScrollView horizontal contentContainerStyle={styles.board} showsHorizontalScrollIndicator={false}>{activeLists.map(list => <View key={list.id} style={styles.column}><Text style={styles.columnTitle}>{list.name}</Text>{cardsByList(list.id).map(card => <View key={card.id} style={styles.card}><Text style={styles.cardTitle}>{card.title}</Text><Text style={styles.meta}>{card.priority ?? 'normal'}</Text></View>)}</View>)}{!activeLists.length && <View style={styles.empty}><Text style={styles.title}>{boards.length ? 'Keine Listen vorhanden' : 'Keine Boards vorhanden'}</Text></View>}</ScrollView>}</SafeAreaView>;
}

const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:'#f8fafc'},auth:{padding:24,marginTop:60},center:{flex:1,justifyContent:'center',alignItems:'center',padding:24},brand:{fontSize:30,fontWeight:'800',marginBottom:24},heading:{fontSize:24,fontWeight:'700',marginBottom:18},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',borderRadius:12,padding:14,marginBottom:12,fontSize:16},primary:{backgroundColor:'#111827',borderRadius:12,padding:15,alignItems:'center',marginTop:4},primaryText:{color:'#fff',fontWeight:'700',fontSize:16},message:{marginTop:14,color:'#b91c1c'},link:{textAlign:'center',marginTop:18,color:'#2563eb'},header:{padding:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brandSmall:{fontSize:22,fontWeight:'800'},subtitle:{fontSize:12,color:'#6b7280',marginTop:2},secondary:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d1d5db',paddingHorizontal:12,paddingVertical:9,borderRadius:10},boards:{paddingHorizontal:16,paddingBottom:10,gap:8},boardChip:{paddingHorizontal:14,paddingVertical:10,borderRadius:20,backgroundColor:'#e5e7eb'},boardChipActive:{backgroundColor:'#111827'},boardChipTextActive:{color:'#fff',fontWeight:'700'},board:{padding:16,gap:14},column:{width:300,backgroundColor:'#e5e7eb',borderRadius:14,padding:12,minHeight:180},columnTitle:{fontSize:17,fontWeight:'700',marginBottom:10},card:{backgroundColor:'#fff',borderRadius:12,padding:13,marginBottom:9},cardTitle:{fontSize:15,fontWeight:'600'},meta:{fontSize:12,color:'#6b7280',marginTop:6},title:{fontSize:22,fontWeight:'800',marginBottom:8},empty:{padding:20}}
);
