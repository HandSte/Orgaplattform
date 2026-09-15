'use client';

import { useEffect } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Essentia global runtime error:', error);
  }, [error]);

  return (
    <html lang="de">
      <body>
        <main className="app-error" role="alert">
          <div className="app-error-card">
            <p className="app-error-kicker">Essentia</p>
            <h1>Ein unerwarteter Fehler ist aufgetreten.</h1>
            <p>Die Anwendung konnte diesen Vorgang nicht abschließen. Du kannst sie direkt neu laden.</p>
            <button type="button" onClick={reset}>Erneut versuchen</button>
          </div>
        </main>
      </body>
    </html>
  );
}
