const columns = [
  { title: 'Backlog', count: 3, cards: ['Grundstruktur planen', 'Benutzerrollen definieren', 'Dateianhänge vorbereiten'] },
  { title: 'In Arbeit', count: 2, cards: ['Supabase anbinden', 'Dashboard entwickeln'] },
  { title: 'Erledigt', count: 2, cards: ['GitHub verbinden', 'Projekt anlegen'] },
];

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">O</span><span>Orgaplattform</span></div>
        <nav>
          <a className="active" href="#dashboard">Übersicht</a>
          <a href="#boards">Meine Boards</a>
          <a href="#team">Team</a>
          <a href="#settings">Einstellungen</a>
        </nav>
        <div className="sidebar-footer">Professionelle Zusammenarbeit</div>
      </aside>

      <section className="content" id="dashboard">
        <header className="topbar">
          <div><div className="eyebrow">Arbeitsbereich</div><h1>Mein Dashboard</h1></div>
          <button className="primary">+ Neues Board</button>
        </header>

        <section className="hero">
          <div><p className="eyebrow">Orgaplattform</p><h2>Alles im Blick. Gemeinsam arbeiten.</h2><p>Ein zentraler Ort für Boards, Aufgaben und Teams – mit Echtzeit-Zusammenarbeit.</p></div>
          <div className="hero-stat"><strong>3</strong><span>aktive Boards</span></div>
        </section>

        <section className="board-section" id="boards">
          <div className="section-heading"><div><p className="eyebrow">Aktuelles Board</p><h2>Projektübersicht</h2></div><button className="ghost">Board öffnen →</button></div>
          <div className="kanban">
            {columns.map((column) => (
              <div className="column" key={column.title}>
                <div className="column-head"><span>{column.title}</span><span className="count">{column.count}</span></div>
                {column.cards.map((card, index) => <article className="card" key={card}><div className="card-title">{card}</div><div className="card-meta"><span>Aufgabe</span><span>⋯</span></div>{index === 0 && <div className="progress"><i /></div>}</article>)}
                <button className="add-card">+ Aufgabe hinzufügen</button>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
