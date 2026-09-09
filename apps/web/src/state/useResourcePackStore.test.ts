// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { PACK_STORAGE_KEY, useResourcePackStore } from './useResourcePackStore';

beforeEach(() => {
  localStorage.clear();
  useResourcePackStore.setState({
    hydrated: false,
    selectedId: 'builtin',
    activeId: null,
    persistedId: null,
    loaded: null,
    error: '',
    loading: false,
  });
});

describe('preferred resource pack', () => {
  it('uses the saved installation choice instead of stale browser storage', () => {
    localStorage.setItem(PACK_STORAGE_KEY, 'builtin');
    useResourcePackStore.getState().initialize('server-pack');
    expect(useResourcePackStore.getState()).toMatchObject({
      selectedId: 'server-pack',
      persistedId: 'server-pack',
      activeId: null,
      hydrated: true,
    });
  });
  it('migrates legacy storage only when no installation preference exists', () => {
    localStorage.setItem(PACK_STORAGE_KEY, 'legacy-pack');
    useResourcePackStore.getState().initialize(null);
    expect(useResourcePackStore.getState()).toMatchObject({
      selectedId: 'legacy-pack',
      persistedId: null,
    });
  });
  it('does not reset an explicit choice on polling and does not claim it is displayed before loading', () => {
    useResourcePackStore.getState().initialize('first-pack');
    useResourcePackStore.getState().select('second-pack');
    useResourcePackStore.getState().initialize('first-pack');
    expect(useResourcePackStore.getState()).toMatchObject({
      selectedId: 'second-pack',
      activeId: null,
    });
  });
});
