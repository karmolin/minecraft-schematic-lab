import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useBuildStore } from '../state/useBuildStore';
import { useResourcePackStore } from '../state/useResourcePackStore';
import { disposePack, loadPackTextures } from '../renderer/packTextures';
import { useI18n } from '../i18n/I18nContext';

export function ResourcePackPanel() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['resource-packs'],
    queryFn: api.resourcePacks,
    refetchInterval: 5000,
    retry: false,
  });
  const build = useBuildStore((s) => s.build);
  const { selectedId, activeId, loaded, loading, error, select, publish } = useResourcePackStore();
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pack = query.data?.packs.find((p) => p.id === selectedId);
  const states = useMemo(
    () => Object.keys(build?.previewData.instances ?? {}).sort(),
    [build?.previewData.instances],
  );
  const stateKey = states.join('\n');
  const revision = pack?.revision;
  const status = pack?.status;
  const packError = pack?.error;
  const listReady = !!query.data;
  const baseReady = query.data?.baseReady;
  const baseError = query.data?.baseError;

  useEffect(() => {
    if (!listReady) return;
    const controller = new AbortController();
    const store = useResourcePackStore;
    if (selectedId === 'builtin') {
      publish('builtin', null);
      return;
    }
    if (!revision || status !== 'ready' || !baseReady) {
      store.setState({ loading: false, error: packError || baseError || t.packs.unavailable });
      return;
    }
    store.setState({ loading: true, error: '' });
    void api
      .resolvePack(selectedId, revision, stateKey ? stateKey.split('\n') : [], controller.signal)
      .then((appearance) => loadPackTextures(appearance, controller.signal))
      .then((ready) => {
        if (controller.signal.aborted) disposePack(ready);
        else publish(selectedId, ready);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          store.setState({
            loading: false,
            error: reason instanceof Error ? reason.message : String(reason),
          });
      });
    return () => controller.abort();
  }, [
    selectedId,
    revision,
    status,
    packError,
    stateKey,
    listReady,
    baseReady,
    baseError,
    attempt,
    publish,
    t.packs.unavailable,
  ]);

  // Runs after the new meshes commit; never dispose images still used by the old preview.
  useEffect(() => () => disposePack(loaded), [loaded]);

  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      queryClient.setQueryData(['resource-packs'], await api.refreshResourcePacks());
      setAttempt((n) => n + 1);
    } catch (reason) {
      useResourcePackStore.setState({
        error: reason instanceof Error ? reason.message : String(reason),
      });
    } finally {
      setRefreshing(false);
    }
  }

  const blocks = Object.entries(loaded?.appearance.blocks ?? {});
  const missing = blocks.filter(([, block]) => block.source === 'missing');
  const customCount = blocks.filter(([, block]) => block.source === 'pack').length;
  const vanillaCount = blocks.filter(([, block]) => block.source === 'vanilla').length;

  return (
    <section className="panel resource-pack-panel">
      <div className="pack-heading">
        <h2 className="panel-title">{t.packs.title}</h2>
        <span>Java 1.12.2</span>
      </div>
      <label className="field">
        <span>{t.packs.select}</span>
        <select
          aria-label={t.packs.select}
          value={selectedId}
          onChange={(event) => select(event.target.value)}
          disabled={!query.data}
        >
          {!query.data?.packs.some((p) => p.id === selectedId) && (
            <option value={selectedId}>
              {selectedId === 'builtin' ? t.packs.builtin : t.packs.unavailable}
            </option>
          )}
          {query.data?.packs.map((p) => (
            <option
              key={p.id}
              value={p.id}
              disabled={p.status !== 'ready' || (p.kind !== 'builtin' && !baseReady)}
            >
              {p.kind === 'builtin'
                ? t.packs.builtin
                : p.kind === 'vanilla'
                  ? t.packs.vanilla
                  : p.name}
              {p.status === 'error' ? ` — ${t.packs.unavailable}` : ''}
            </option>
          ))}
        </select>
      </label>
      {pack?.iconUrl && (
        <img
          className="pack-icon"
          src={pack.iconUrl}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
      {pack?.description && <p className="muted pack-description">{pack.description}</p>}
      <div className="pack-actions">
        <button className="chip" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? t.packs.refreshing : t.packs.refresh}
        </button>
        <span className="muted" role="status">
          {loading ? t.packs.loading : error ? t.packs.keptPrevious : t.packs.ready}
        </span>
      </div>
      <p className="muted pack-instructions">{t.packs.instructions}</p>
      {query.data && (
        <input
          className="pack-directory"
          aria-label={t.packs.directory}
          value={query.data.directory}
          readOnly
          onClick={(e) => e.currentTarget.select()}
        />
      )}
      {(error || query.error) && (
        <p className="pack-error" role="alert">
          {error || query.error?.message}
        </p>
      )}
      {query.data?.baseError && <p className="pack-error">{query.data.baseError}</p>}
      {query.data?.packs
        .filter((p) => p.kind !== 'vanilla' && p.status === 'error')
        .map((p) => (
          <p className="pack-error" key={p.id}>
            {p.name}：{p.error}
          </p>
        ))}
      {activeId !== 'builtin' && loaded && (
        <>
          <p className="muted" data-testid="pack-coverage">
            {t.packs.coverage(customCount, vanillaCount, missing.length)}
          </p>
          {missing.length > 0 && (
            <details className="pack-missing">
              <summary>{t.packs.missing}</summary>
              <ul>
                {missing.map(([state, block]) => (
                  <li key={state}>
                    <code>{state}</code>
                    <br />
                    {block.warning}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="muted pack-limitations">{t.packs.limitations}</p>
        </>
      )}
    </section>
  );
}
