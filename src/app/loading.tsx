export default function Loading() {
  return (
    <main className="app-loading" aria-live="polite" aria-busy="true">
      <div className="app-loading-card">
        <span className="app-loading-spinner" aria-hidden="true" />
        <span>Essentia wird geladen …</span>
      </div>
    </main>
  );
}
