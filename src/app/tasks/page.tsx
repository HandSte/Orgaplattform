import WorkspaceModulePage from '@/components/WorkspaceModulePage';

export default function TasksPage() {
  return <WorkspaceModulePage title="Aufgaben" eyebrow="Arbeitsbereich" active="Aufgaben" description="Alle Aufgaben zentral durchsuchen, filtern und nach Fälligkeit oder Priorität bearbeiten."><section className="module-grid"><article className="module-card"><p className="eyebrow">Aufgabenübersicht</p><h2>Meine Aufgaben</h2><p>Hier entsteht die zentrale Aufgabenansicht über alle Boards hinweg.</p><a className="primary button-link" href="/">Board öffnen</a></article><article className="module-card"><p className="eyebrow">Filter</p><h2>Fälligkeit & Priorität</h2><p>Überfällige, heute fällige und wichtige Aufgaben werden hier gebündelt.</p></article></section></WorkspaceModulePage>;
}
