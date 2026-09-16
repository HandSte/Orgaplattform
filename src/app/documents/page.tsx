import WorkspaceModulePage from '@/components/WorkspaceModulePage';

export default function DocumentsPage() {
  return <WorkspaceModulePage title="Dokumente" eyebrow="Arbeitsbereich" active="Dokumente" description="Projektunterlagen und Dateien zentral verwalten und direkt mit Aufgaben und Boards verknüpfen."><section className="module-grid"><article className="module-card"><p className="eyebrow">Dokumente</p><h2>Projektdateien</h2><p>Die zentrale Dokumentenablage wird mit den bereits vorhandenen privaten Kartenanhängen verbunden.</p><a className="primary button-link" href="/">Zu den Boards</a></article><article className="module-card"><p className="eyebrow">Sicherheit</p><h2>Private Dateien</h2><p>Dateien bleiben geschützt und werden nur über autorisierte Zugriffe bereitgestellt.</p></article></section></WorkspaceModulePage>;
}
