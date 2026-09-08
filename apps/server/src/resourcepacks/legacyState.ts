/** Map existing BuildSpec names to the blockstate resource names shipped in Java 1.12.2.
 * This is preview-only: imported/exported block IDs are not changed here.
 */
const ALIASES: Record<string, string> = {
  grass_block: 'grass',
  short_grass: 'tall_grass',
  grass: 'grass',
  bricks: 'brick_block',
  stone_bricks: 'stonebrick',
  mossy_stone_bricks: 'mossy_stonebrick',
  cracked_stone_bricks: 'cracked_stonebrick',
  chiseled_stone_bricks: 'chiseled_stonebrick',
  nether_bricks: 'nether_brick',
  red_nether_bricks: 'red_nether_brick',
  end_stone_bricks: 'end_bricks',
  terracotta: 'hardened_clay',
  snow: 'snow_layer',
  snow_block: 'snow',
  smooth_stone: 'stone_double_slab',
  smooth_sandstone: 'smooth_sandstone',
  smooth_red_sandstone: 'smooth_red_sandstone',
  cut_sandstone: 'sandstone',
  cut_red_sandstone: 'red_sandstone',
  chiseled_quartz_block: 'chiseled_quartz_block',
  quartz_pillar: 'quartz_column',
  polished_granite: 'smooth_granite',
  polished_diorite: 'smooth_diorite',
  polished_andesite: 'smooth_andesite',
  cobweb: 'web',
  lily_pad: 'waterlily',
  spawner: 'mob_spawner',
  oak_fence: 'fence',
  oak_fence_gate: 'fence_gate',
  oak_door: 'wooden_door',
  oak_trapdoor: 'trapdoor',
  oak_button: 'wooden_button',
  oak_pressure_plate: 'wooden_pressure_plate',
  redstone_torch: 'redstone_torch',
  wall_torch: 'torch',
  redstone_wall_torch: 'redstone_torch',
  dandelion: 'dandelion',
  poppy: 'poppy',
  sugar_cane: 'reeds',
};

export function legacyState(state: string): { name: string; properties: Record<string, string> } {
  const match = /^(?:minecraft:)?([a-z0-9_]+)(?:\[([^\]]*)\])?$/.exec(state);
  if (!match) throw new Error('首版仅支持 Minecraft 1.12.2 的原版方块。');
  const original = match[1]!;
  const properties: Record<string, string> = {
    facing: 'north',
    half: 'bottom',
    shape: 'straight',
    axis: 'y',
    snowy: 'false',
    north: 'false',
    east: 'false',
    south: 'false',
    west: 'false',
    up: 'true',
    open: 'false',
    powered: 'false',
    in_wall: 'false',
    hinge: 'left',
    layers: '1',
  };
  for (const part of (match[2] ?? '').split(',')) {
    const [key, value] = part.split('=');
    if (key && value && key !== '__proto__') properties[key] = value;
  }
  let name = ALIASES[original] ?? original;
  name = name.replace(/^light_gray_/, 'silver_');
  if (!name.endsWith('_glazed_terracotta'))
    name = name.replace(/_terracotta$/, '_stained_hardened_clay');
  // blockstates are named oak_log/oak_leaves, despite textures being log_oak/leaves_oak.
  if (original.endsWith('_slab')) {
    const material = original.slice(0, -5);
    const slabs: Record<string, string> = {
      stone: 'stone',
      smooth_stone: 'stone',
      stone_brick: 'stone_brick',
      brick: 'brick',
      quartz: 'quartz',
      nether_brick: 'nether_brick',
      sandstone: 'sandstone',
      red_sandstone: 'red_sandstone',
      cobblestone: 'cobblestone',
      purpur: 'purpur',
      oak: 'oak',
      spruce: 'spruce',
      birch: 'birch',
      jungle: 'jungle',
      acacia: 'acacia',
      dark_oak: 'dark_oak',
    };
    if (slabs[material])
      name = `${slabs[material]}_${properties.type === 'double' ? 'double_' : ''}slab`;
    if (properties.type === 'top') properties.half = 'top';
  }
  if (original === 'furnace' && properties.lit === 'true') name = 'lit_furnace';
  if (original === 'redstone_lamp' && properties.lit === 'true') name = 'lit_redstone_lamp';
  return { name, properties };
}
