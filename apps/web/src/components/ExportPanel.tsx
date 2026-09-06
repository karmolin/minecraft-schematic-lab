import { useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import { useBuildStore } from '../state/useBuildStore';

export function ExportPanel() {
  const build = useBuildStore((s) => s.build);
  const { t } = useI18n();
  const [format, setFormat] = useState<'mcedit' | 'sponge-v2' | 'sponge-v3'>('mcedit');
  const ready = Boolean(build?.buildId && build.valid);
  const extension = format === 'mcedit' ? '.schematic' : '.schem';

  return (
    <section className="panel">
      <h2 className="panel-title">{t.export.title}</h2>
      <label className="field">
        <span>{t.export.formatLabel}</span>
        <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
          <option value="mcedit">{t.export.formatMcedit}</option>
          <option value="sponge-v2">{t.export.formatSpongeV2}</option>
          <option value="sponge-v3">{t.export.formatSpongeV3}</option>
        </select>
      </label>
      <a
        className={ready ? 'btn export-btn' : 'btn export-btn disabled'}
        href={ready ? api.exportUrl(format) : undefined}
        aria-disabled={!ready}
        download
      >
        {t.export.exportBtn(extension)}
      </a>
      <details className="help">
        <summary>{t.export.helpSummary(extension)}</summary>
        <ol>
          <li>
            {t.export.helpStep1Pre} <code>schematics</code> {t.export.helpStep1Post}
          </li>
          <li>
            {t.export.helpStep2Pre} <code>//schem load &lt;name&gt;</code>{t.export.helpStep2Post}
          </li>
          <li>
            {t.export.helpStep3Pre} <code>//paste</code>{t.export.helpStep3Post}
          </li>
        </ol>
      </details>
    </section>
  );
}
