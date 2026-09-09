import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import { useBuildStore } from '../state/useBuildStore';

export function ImportPanel() {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const build = useBuildStore((s) => s.build);
  const queryClient = useQueryClient();

  async function importFile(file: File | undefined) {
    if (!file || busyRef.current) return;
    setError('');
    if (!/\.schematic$/i.test(file.name)) {
      setError(t.import.invalidType);
      return;
    }
    if (!file.size || file.size > 32 * 1024 * 1024) {
      setError(t.import.invalidSize);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await queryClient.cancelQueries({ queryKey: ['live-build'] });
      const result = await api.importSchematic(file);
      if (!result.valid) throw new Error(result.errors.join('; '));
      useBuildStore.getState().setBuild(result);
      useBuildStore.getState().setCameraPreset('isometric');
      await queryClient.invalidateQueries({ queryKey: ['live-build'] });
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? t.import.restartRequired
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <section className="panel" aria-busy={busy}>
      <h2 className="panel-title">{t.import.title}</h2>
      <p className="muted">{t.import.description}</p>
      <input
        ref={input}
        type="file"
        accept=".schematic"
        hidden
        aria-label={t.import.button}
        onChange={(event) => void importFile(event.target.files?.[0])}
      />
      <button
        type="button"
        className="btn import-btn"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? t.import.busy : t.import.button}
      </button>
      <p className="muted">{t.import.hint}</p>
      {build?.importedFrom && (
        <p className="import-status" role="status">
          {t.import.success(build.importedFrom)}
        </p>
      )}
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
