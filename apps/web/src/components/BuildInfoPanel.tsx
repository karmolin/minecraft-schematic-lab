import { colorFor, friendlyBlockName } from '@minecraft-schematic-lab/shared';
import { useI18n } from '../i18n/I18nContext';
import { useBuildStore } from '../state/useBuildStore';

export function BuildInfoPanel() {
  const build = useBuildStore((s) => s.build);
  const { t } = useI18n();

  if (!build || !build.buildId) {
    return (
      <section className="panel">
        <h2 className="panel-title">{t.build.title}</h2>
        <p className="muted">{t.build.empty}</p>
      </section>
    );
  }

  const { x, y, z } = build.previewData.size;
  return (
    <section className="panel">
      <h2 className="panel-title">{t.build.title}</h2>
      <dl className="info-grid">
        <dt>{t.build.blocks}</dt>
        <dd>{build.blockCount.toLocaleString()}</dd>
        <dt>{t.build.size}</dt>
        <dd>
          {x} × {y} × {z}
        </dd>
      </dl>
      <div className="palette-list">
        {build.palette.map((state) => (
          <span className="palette-chip" key={state}>
            <span className="swatch" style={{ background: colorFor(state) }} />
            {friendlyBlockName(state)}
          </span>
        ))}
      </div>
      {build.warnings.length > 0 ? (
        <ul className="warnings">
          {build.warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
