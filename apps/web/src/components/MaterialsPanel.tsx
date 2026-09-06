import { colorFor, friendlyBlockName } from '@minecraft-schematic-lab/shared';
import { useI18n } from '../i18n/I18nContext';
import { useBuildStore } from '../state/useBuildStore';

export function MaterialsPanel() {
  const build = useBuildStore((s) => s.build);
  const { t } = useI18n();
  const instances = build?.previewData.instances ?? {};
  const rows = Object.entries(instances)
    .map(([state, positions]) => ({ state, count: positions.length }))
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <section className="panel">
      <h2 className="panel-title">{t.materials.title}</h2>
      {rows.length === 0 ? (
        <p className="muted">{t.materials.empty}</p>
      ) : (
        <>
          <ul className="materials-list">
            {rows.map((row) => (
              <li key={row.state}>
                <span className="swatch" style={{ background: colorFor(row.state) }} />
                <span className="material-name">{friendlyBlockName(row.state)}</span>
                <span className="material-count">×{row.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="materials-total">{t.materials.total(total.toLocaleString())}</p>
        </>
      )}
    </section>
  );
}
