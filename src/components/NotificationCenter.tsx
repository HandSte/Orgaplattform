'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

type Notification = { id:string; type:string; title:string; body:string|null; card_id:string|null; read_at:string|null; created_at:string };
export default function NotificationCenter({ onOpenCard }:{onOpenCard:(id:string)=>void}){
 const [items,setItems]=useState<Notification[]>([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(false);
 const unread=useMemo(()=>items.filter(x=>!x.read_at).length,[items]);
 async function load(){if(!supabase)return;const {data:{session}}=await supabase.auth.getSession();if(!session?.user)return;const {data}=await supabase.from('notifications').select('id,type,title,body,card_id,read_at,created_at').order('created_at',{ascending:false}).limit(30);setItems(data??[]);}
 useEffect(()=>{load();if(!supabase)return;const client=supabase;let channel:any;client.auth.getSession().then(({data:{session}})=>{if(!session?.user)return;channel=client.channel(`notifications-${session.user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`user_id=eq.${session.user.id}`},load).subscribe()});return()=>{if(channel)client.removeChannel(channel)}},[]);
 async function markRead(id:string){if(!supabase)return;await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id);setItems(v=>v.map(x=>x.id===id?{...x,read_at:new Date().toISOString()}:x));}
 async function markAll(){if(!supabase||!unread)return;setLoading(true);await supabase.rpc('mark_notifications_read');setItems(v=>v.map(x=>({...x,read_at:x.read_at??new Date().toISOString()})));setLoading(false)}
 return <div className="notification-wrap"><button className="notification-button" aria-label="Benachrichtigungen" onClick={()=>setOpen(v=>!v)}>🔔{unread>0&&<span className="notification-badge">{unread>99?'99+':unread}</span>}</button>{open&&<div className="notification-panel"><div className="notification-head"><strong>Benachrichtigungen</strong><button onClick={markAll} disabled={!unread||loading}>Alle gelesen</button></div>{!items.length?<div className="notification-empty">Keine Benachrichtigungen</div>:<div className="notification-list">{items.map(n=><button key={n.id} className={`notification-item ${!n.read_at?'unread':''}`} onClick={()=>{if(!n.read_at)markRead(n.id);if(n.card_id)onOpenCard(n.card_id);}}><strong>{n.title}</strong>{n.body&&<span>{n.body}</span>}<small>{new Date(n.created_at).toLocaleString('de-DE')}</small></button>)}</div>}</div>}</div>;
}
