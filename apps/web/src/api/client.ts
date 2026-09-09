import type {
  CurrentBuildResponse,
  CurrentBuildSummary,
  PreviewData,
  ResourcePackList,
  PackAppearance,
  BuildResult,
} from '@minecraft-schematic-lab/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // response had no JSON body
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

const EXPORT_URL = '/api/session/export.schem';

export const api = {
  summary: async (signal?: AbortSignal): Promise<CurrentBuildSummary> => {
    try {
      return await request<CurrentBuildSummary>('/api/session/summary', { signal });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      // The built viewer can update before the running Node process is restarted.
      const { spec, ...summary } = await request<CurrentBuildResponse>('/api/session/current', {
        signal,
      });
      return { ...summary, importedFrom: spec?.base?.source.filename };
    }
  },
  importSchematic: (file: File) =>
    request<BuildResult>(`/api/session/import?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    }),
  buildSpecUrl: '/api/session/build-spec.json',
  resourcePacks: () => request<ResourcePackList>('/api/resource-packs'),
  refreshResourcePacks: () =>
    request<ResourcePackList>('/api/resource-packs/refresh', { method: 'POST' }),
  selectResourcePack: (packId: string) =>
    request<{ selectedPackId: string }>('/api/resource-packs/selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId }),
    }),
  resolvePack: (packId: string, revision: string, states: string[], signal?: AbortSignal) =>
    request<PackAppearance>('/api/resource-packs/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId, revision, states }),
      signal,
    }),
  current: (signal?: AbortSignal) =>
    request<CurrentBuildResponse>('/api/session/current', { signal }),
  previewData: (signal?: AbortSignal) =>
    request<PreviewData>('/api/session/preview-data', { signal }),
  exportUrl: (format: 'mcedit' | 'sponge-v2' | 'sponge-v3' = 'sponge-v2') =>
    format === 'sponge-v2' ? EXPORT_URL : `${EXPORT_URL}?format=${format}`,
};
