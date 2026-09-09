import rawMapping from './data/legacy-blocks.json';

// PrismarineJS minecraft-data (MIT), data/pc/common/legacy.json. See data/README.md.
const mapping = rawMapping as Record<string, string>;

export function legacyBlockState(id: number, data: number): string | undefined {
  const state = mapping[`${id}:${data}`];
  // Shape/connections depend on adjacent blocks, not legacy metadata. The upstream
  // flattening table contains arbitrary representatives of those derived states.
  return state?.replace(/shape=[a-z_]+/, 'shape=straight');
}

function canonical(state: string): string {
  const [name, props] = state.replace(/\]$/, '').split('[');
  return `${name}[${(props ?? '').split(',').filter(Boolean).sort().join(',')}]`;
}

const reverse = new Map<string, { id: number; data: number }>();
for (const key of Object.keys(mapping)) {
  const [id, data] = key.split(':').map(Number) as [number, number];
  const state = legacyBlockState(id, data)!;
  // Prefer the first stable mapping; imported cells retain their exact original IDs.
  if (!reverse.has(canonical(state)) || id === 9 || id === 11)
    reverse.set(canonical(state), { id, data });
}

export function mappedLegacyBlock(state: string): { id: number; data: number } | undefined {
  return reverse.get(canonical(state));
}
