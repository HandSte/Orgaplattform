import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="app-error" role="status">
      <div className="app-error-card">
        <p className="app-error-kicker">Essentia</p>
        <h1>Seite nicht gefunden.</h1>
        <p>Die angeforderte Seite existiert nicht oder wurde verschoben.</p>
        <Link className="primary" href="/">Zur Übersicht</Link>
      </div>
    </main>
  );
}
