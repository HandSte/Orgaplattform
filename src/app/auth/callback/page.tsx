'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-browser';

function getSafeNextPath() {
  if (typeof window === 'undefined') return '/';
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('://')) return '/';
  return next;
}

export default function AuthCallbackPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      if (!supabase) {
        if (!cancelled) setError('Supabase ist nicht konfiguriert.');
        return;
      }

      const next = getSafeNextPath();
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (!cancelled) setError(exchangeError.message);
          return;
        }
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const authError = hash.get('error_description') || hash.get('error');
      if (authError) {
        if (!cancelled) setError(authError);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.location.replace(next);
        return;
      }

      if (!cancelled) setError('Die E-Mail-Bestätigung konnte nicht abgeschlossen werden. Bitte versuche es über den Link aus der E-Mail erneut.');
    }

    void finish();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand"><span className="brand-mark">O</span><span>Orgaplattform</span></div>
        <p className="eyebrow">E-Mail bestätigen</p>
        <h1>{error ? 'Bestätigung nicht abgeschlossen' : 'Bestätigung wird verarbeitet …'}</h1>
        <p className="auth-copy">{error || 'Einen Moment bitte. Dein Zugang wird nach der Bestätigung direkt aktiviert.'}</p>
        {error && <a className="primary button-link auth-submit" href="/auth">Zur Anmeldung</a>}
      </section>
    </main>
  );
}
