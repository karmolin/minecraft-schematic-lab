import { useState } from 'react';
import { api } from '../api/client';
import { useBuildStore } from '../state/useBuildStore';

export function ExportPanel() {
  const build = useBuildStore((s) => s.build);
  const [format, setFormat] = useState<'mcedit' | 'sponge-v2' | 'sponge-v3'>('mcedit');
  const ready = Boolean(build?.buildId && build.valid);
  const extension = format === 'mcedit' ? '.schematic' : '.schem';

  return (
    <section className="panel">
      <h2 className="panel-title">Export</h2>
      <label className="field">
        <span>Format</span>
        <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
          <option value="mcedit">Legacy MCEdit .schematic (WorldEdit 6 / 1.12)</option>
          <option value="sponge-v2">Sponge v2 .schem (most compatible)</option>
          <option value="sponge-v3">Sponge v3 .schem</option>
        </select>
      </label>
      <a
        className={ready ? 'btn export-btn' : 'btn export-btn disabled'}
        href={ready ? api.exportUrl(format) : undefined}
        aria-disabled={!ready}
        download
      >
        Export {extension}
      </a>
      <details className="help">
        <summary>How to use the {extension} in Minecraft</summary>
        <ol>
          <li>
            Put the file in your world&apos;s <code>schematics</code> folder (WorldEdit / FAWE).
          </li>
          <li>
            In-game run <code>//schem load &lt;name&gt;</code>.
          </li>
          <li>
            Stand where you want it and run <code>//paste</code>.
          </li>
        </ol>
      </details>
    </section>
  );
}
