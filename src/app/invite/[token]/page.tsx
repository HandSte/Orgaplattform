'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

export default function InvitePage({ params }: { params: { token: string } }) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function accept(){if(!supabase)return;setBusy(true);const {data:s}=await supabase.auth.getSession();let user=s.session?.user;
    if(!user){if(!email||!password){setMessage('Bitte E-Mail und Passwort eingeben.');setBusy(false);return}const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error){const signup=await supabase.auth.signUp({email,password,options:{data:{full_name:name}}});if(signup.error){setMessage(signup.error.message);setBusy(false);return}setMessage('Konto angelegt. Bitte bestätige ggf. deine E-Mail und melde dich danach hier erneut an.');setBusy(false);return}user=error?undefined:error?undefined:(await supabase.auth.getUser()).data.user;}
    if(!user){setMessage('Anmeldung erforderlich.');setBusy(false);return}const {data,error}=await supabase.functions.invoke('board-invites',{body:{action:'accept',token:params.token}});if(error||data?.error)setMessage(error?.message??data?.error??'Einladung konnte nicht angenommen werden.');else window.location.href='/';setBusy(false);
  }
  useEffect(()=>{supabase?.auth.getSession().then(({data})=>{if(data.session?.user)accept()})},[]);
  return <main className="auth-shell"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">O</span><span>Orgaplattform</span></div><p className="eyebrow">Einladung</p><h1>Dem Board beitreten</h1><p className="auth-copy">Melde dich mit der E-Mail-Adresse an, an die die Einladung gesendet wurde.</p><form className="auth-form" onSubmit={e=>{e.preventDefault();accept()}}><label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Max Mustermann"/></label><label>E-Mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@firma.de" required/></label><label>Passwort<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required/></label><button className="primary auth-submit" disabled={busy}>{busy?'Bitte warten …':'Einladung annehmen'}</button></form>{message&&<p className="auth-message">{message}</p>}</section></main>;
}
