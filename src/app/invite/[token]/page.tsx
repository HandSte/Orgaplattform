'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

type Mode = 'login' | 'signup';

export default function InvitePage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const token = typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean).pop() || '' : '';

  async function accept(event?: FormEvent) {
    event?.preventDefault();
    if (!supabase || !token) return;
    setMessage('');
    setBusy(true);

    let user = (await supabase.auth.getSession()).data.session?.user ?? null;
    if (!user) {
      if (!email || !password || (mode === 'signup' && !name.trim())) {
        setMessage(mode === 'signup' ? 'Bitte Name, E-Mail und Passwort eingeben.' : 'Bitte E-Mail und Passwort eingeben.');
        setBusy(false);
        return;
      }
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setMessage('Anmeldung fehlgeschlagen. Wenn du noch kein Konto hast, wähle „Konto erstellen“.');
          setBusy(false);
          return;
        }
        user = data.user;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
        if (error) {
          setMessage(error.message);
          setBusy(false);
          return;
        }
        if (!data.session) {
          setMessage('Konto angelegt. Bitte bestätige deine E-Mail-Adresse und melde dich danach hier an.');
          setMode('login');
          setBusy(false);
          return;
        }
        user = data.user;
      }
    }

    if (!user) {
      setMessage('Anmeldung erforderlich.');
      setBusy(false);
      return;
    }

    const { data, error } = await supabase.functions.invoke('board-invites', { body: { action: 'accept', token } });
    setBusy(false);
    if (error || data?.error) {
      setMessage(error?.message ?? data?.error ?? 'Einladung konnte nicht angenommen werden.');
      return;
    }
    window.location.href = '/';
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) accept();
    });
  }, []);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand"><span className="brand-mark">O</span><span>Orgaplattform</span></div>
        <p className="eyebrow">Einladung</p>
        <h1>Dem Board beitreten</h1>
        <p className="auth-copy">Melde dich mit der eingeladenen E-Mail-Adresse an oder erstelle damit ein neues Konto.</p>
        <form className="auth-form" onSubmit={accept}>
          {mode === 'signup' && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" required /></label>}
          <label>E-Mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" required /></label>
          <label>Passwort<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></label>
          <button className="primary auth-submit" disabled={busy}>{busy ? 'Bitte warten …' : mode === 'login' ? 'Anmelden und beitreten' : 'Konto erstellen und beitreten'}</button>
        </form>
        {message && <p className="auth-message">{message}</p>}
        <button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>
          {mode === 'login' ? 'Noch kein Konto? Konto erstellen' : 'Bereits registriert? Anmelden'}
        </button>
      </section>
    </main>
  );
}
