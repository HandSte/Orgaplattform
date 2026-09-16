import WorkspaceModulePage from '@/components/WorkspaceModulePage';

export default function CalendarPage() {
  return <WorkspaceModulePage title="Kalender" eyebrow="Planung" active="Kalender" description="Termine, Fälligkeiten und Projektplanung in einer gemeinsamen Kalenderansicht."><section className="module-grid"><article className="module-card module-card-wide"><div className="module-toolbar"><strong>September 2026</strong><button className="ghost">Heute</button><div><button className="ghost">‹</button><button className="ghost">›</button></div></div><div className="calendar-placeholder"><div>Mo</div><div>Di</div><div>Mi</div><div>Do</div><div>Fr</div><div>Sa</div><div>So</div><span>14</span><span className="today">15</span><span>16</span><span>17</span><span>18</span><span>19</span><span>20</span></div></article></section></WorkspaceModulePage>;
}
