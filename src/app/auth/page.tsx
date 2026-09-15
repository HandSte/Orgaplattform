'use client';

import { FormEvent, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

function getSafeNextPath() {
  if (typeof window === 'undefined') return '/';
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('://')) return '/';
  return next;
}

function getAuthCallbackUrl(next: string) {
  if (typeof window === 'undefined') return `/auth/callback?next=${encodeURIComponent(next)}`;
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    if (!supabase) {
      setMessage('Supabase ist noch nicht mit dieser Deployment-Umgebung verbunden.');
      return;
    }
    setBusy(true);
    const next = getSafeNextPath();
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: getAuthCallbackUrl(next),
          },
        });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    setMessage(mode === 'login' ? 'Anmeldung erfolgreich. Du wirst weitergeleitet.' : 'Konto angelegt. Bitte bestätige deine E-Mail-Adresse. Danach wirst du automatisch zurück zur Anwendung geleitet.');
    if (mode === 'login') window.location.href = next;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand"><span className="brand-mark">O</span><span>Orgaplattform</span></div>
        <p className="eyebrow">Sicherer Zugang</p>
        <h1>{mode === 'login' ? 'Willkommen zurück' : 'Konto erstellen'}</h1>
        <p className="auth-copy">Boards, Aufgaben und Zusammenarbeit an einem Ort.</p>
        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Max Mustermann" required /></label>}
          <label>E-Mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" required /></label>
          <label>Passwort<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></label>
          <button className="primary auth-submit" disabled={busy}>{busy ? 'Bitte warten …' : mode === 'login' ? 'Anmelden' : 'Registrieren'}</button>
        </form>
        {message && <p className="auth-message">{message}</p>}
        <button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>
          {mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Anmelden'}
        </button>
      </section>
    </main>
  );
}
