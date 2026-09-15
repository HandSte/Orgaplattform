'use client';

import { useEffect } from 'react';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('Essentia runtime error:', error);
  }, [error]);

  return (
    <main className="app-error" role="alert">
      <div className="app-error-card">
        <p className="app-error-kicker">Essentia</p>
        <h1>Etwas ist schiefgelaufen.</h1>
        <p>Die Seite konnte gerade nicht vollständig geladen werden. Du kannst den Vorgang direkt erneut versuchen.</p>
        <button type="button" onClick={reset}>Erneut versuchen</button>
      </div>
    </main>
  );
}
