import type {
  CurrentBuildResponse,
  PreviewData,
  ResourcePackList,
  PackAppearance,
} from '@minecraft-schematic-lab/shared';

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
    throw new Error(message);
  }
  return (await res.json()) as T;
}

const EXPORT_URL = '/api/session/export.schem';

export const api = {
  resourcePacks: () => request<ResourcePackList>('/api/resource-packs'),
  refreshResourcePacks: () =>
    request<ResourcePackList>('/api/resource-packs/refresh', { method: 'POST' }),
  resolvePack: (packId: string, revision: string, states: string[], signal?: AbortSignal) =>
    request<PackAppearance>('/api/resource-packs/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId, revision, states }),
      signal,
    }),
  current: () => request<CurrentBuildResponse>('/api/session/current'),
  previewData: () => request<PreviewData>('/api/session/preview-data'),
  exportUrl: (format: 'mcedit' | 'sponge-v2' | 'sponge-v3' = 'sponge-v2') =>
    format === 'sponge-v2' ? EXPORT_URL : `${EXPORT_URL}?format=${format}`,
};
