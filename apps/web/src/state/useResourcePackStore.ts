import { create } from 'zustand';
import type { LoadedPack } from '../renderer/packTextures';

export const PACK_STORAGE_KEY = 'msl-resource-pack-112';
function savedPack(): string {
  try {
    return localStorage.getItem(PACK_STORAGE_KEY) || 'builtin';
  } catch {
    return 'builtin';
  }
}

interface ResourcePackState {
  selectedId: string;
  activeId: string | null;
  hydrated: boolean;
  persistedId: string | null;
  loaded: LoadedPack | null;
  loading: boolean;
  error: string;
  initialize: (preferredId: string | null) => void;
  select: (id: string) => void;
  publish: (id: string, loaded: LoadedPack | null) => void;
}

export const useResourcePackStore = create<ResourcePackState>((set, get) => ({
  selectedId: 'builtin',
  activeId: null,
  hydrated: false,
  persistedId: null,
  loaded: null,
  loading: false,
  error: '',
  initialize: (preferredId) => {
    if (get().hydrated) return;
    set({ selectedId: preferredId ?? savedPack(), persistedId: preferredId, hydrated: true });
  },
  select: (selectedId) => set({ selectedId, error: '' }),
  publish: (id, loaded) => {
    try {
      localStorage.setItem(PACK_STORAGE_KEY, id);
    } catch {
      /* Preview still works with storage disabled. */
    }
    set({ activeId: id, loaded, loading: false, error: '' });
  },
}));
