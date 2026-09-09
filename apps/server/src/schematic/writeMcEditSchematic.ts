import { gzipSync } from 'node:zlib';
import nbt from 'prismarine-nbt';
import type { BlockEntity, BlockVolume } from '@minecraft-schematic-lab/block-compiler';

interface NbtNode {
  type: string;
  name?: string;
  value: unknown;
}

type NbtCompoundValue = Record<string, NbtNode>;

const shortNode = (value: number): NbtNode => ({ type: 'short', value });
const byteNode = (value: number): NbtNode => ({ type: 'byte', value });
const intNode = (value: number): NbtNode => ({ type: 'int', value });
const stringNode = (value: string): NbtNode => ({ type: 'string', value });
const byteArrayNode = (value: number[]): NbtNode => ({ type: 'byteArray', value });

function listNode(value: NbtCompoundValue[]): NbtNode {
  return { type: 'list', value: { type: 'compound', value } };
}

function signedByte(value: number): number {
  return value > 127 ? value - 256 : value;
}

const DYE_DATA: Record<string, number> = {
  white: 0,
  orange: 1,
  magenta: 2,
  light_blue: 3,
  yellow: 4,
  lime: 5,
  pink: 6,
  gray: 7,
  light_gray: 8,
  cyan: 9,
  purple: 10,
  blue: 11,
  brown: 12,
  green: 13,
  red: 14,
  black: 15,
};

interface LegacyBlock {
  id: number;
  data: number;
}

const SIMPLE_BLOCKS: Record<string, LegacyBlock> = {
  air: { id: 0, data: 0 },
  cave_air: { id: 0, data: 0 },
  void_air: { id: 0, data: 0 },
  stone: { id: 1, data: 0 },
  andesite: { id: 1, data: 5 },
  polished_andesite: { id: 1, data: 6 },
  grass_block: { id: 2, data: 0 },
  dirt: { id: 3, data: 0 },
  coarse_dirt: { id: 3, data: 1 },
  podzol: { id: 3, data: 2 },
  cobblestone: { id: 4, data: 0 },
  sand: { id: 12, data: 0 },
  red_sand: { id: 12, data: 1 },
  gravel: { id: 13, data: 0 },
  gold_block: { id: 41, data: 0 },
  iron_block: { id: 42, data: 0 },
  bricks: { id: 45, data: 0 },
  bookshelf: { id: 47, data: 0 },
  obsidian: { id: 49, data: 0 },
  torch: { id: 50, data: 5 },
  diamond_block: { id: 57, data: 0 },
  crafting_table: { id: 58, data: 0 },
  furnace: { id: 61, data: 0 },
  glass: { id: 20, data: 0 },
  lapis_block: { id: 22, data: 0 },
  snow: { id: 78, data: 0 },
  ice: { id: 79, data: 0 },
  netherrack: { id: 87, data: 0 },
  soul_sand: { id: 88, data: 0 },
  glowstone: { id: 89, data: 0 },
  iron_bars: { id: 101, data: 0 },
  glass_pane: { id: 102, data: 0 },
  nether_brick: { id: 112, data: 0 },
  nether_bricks: { id: 112, data: 0 },
  mossy_stone_bricks: { id: 98, data: 1 },
  cracked_stone_bricks: { id: 98, data: 2 },
  chiseled_stone_bricks: { id: 98, data: 3 },
  fern: { id: 31, data: 2 },
  poppy: { id: 38, data: 0 },
  quartz_block: { id: 155, data: 0 },
  packed_ice: { id: 174, data: 0 },
};

const WOOD_DATA: Record<string, number> = {
  oak: 0,
  spruce: 1,
  birch: 2,
  jungle: 3,
  acacia: 0,
  dark_oak: 1,
};

const PLANKS_DATA: Record<string, number> = {
  oak: 0,
  spruce: 1,
  birch: 2,
  jungle: 3,
  acacia: 4,
  dark_oak: 5,
};

const STAIR_IDS: Record<string, number> = {
  oak: 53,
  stone_brick: 109,
  brick: 108,
  spruce: 134,
  birch: 135,
  jungle: 136,
  nether_brick: 114,
  quartz: 156,
  acacia: 163,
  dark_oak: 164,
};

const FENCE_IDS: Record<string, number> = {
  oak: 85,
  spruce: 188,
  birch: 189,
  jungle: 190,
  dark_oak: 191,
  acacia: 192,
};

function parseState(state: string): { name: string; properties: Record<string, string> } {
  const [rawName, rawProperties] = state.split('[', 2);
  const properties: Record<string, string> = {};
  for (const entry of (rawProperties?.replace(/]$/, '') ?? '').split(',')) {
    if (!entry) continue;
    const [key, value] = entry.split('=', 2);
    if (key && value) properties[key] = value;
  }
  return { name: (rawName ?? state).replace(/^minecraft:/, ''), properties };
}

function stairData(properties: Record<string, string>): number {
  const facing = { east: 0, west: 1, south: 2, north: 3 }[properties.facing ?? 'east'] ?? 0;
  return facing + (properties.half === 'top' ? 4 : 0);
}

function legacyBlock(state: string): LegacyBlock | null {
  const { name, properties } = parseState(state);
  if (SIMPLE_BLOCKS[name]) return SIMPLE_BLOCKS[name];

  if (name === 'quartz_pillar')
    return { id: 155, data: properties.axis === 'x' ? 3 : properties.axis === 'z' ? 4 : 2 };
  const glazed = name.match(
    /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_glazed_terracotta$/,
  );
  if (glazed)
    return {
      id: 235 + DYE_DATA[glazed[1]!]!,
      data: { south: 0, west: 1, north: 2, east: 3 }[properties.facing ?? 'north'] ?? 2,
    };

  const plank = name.match(/^(oak|spruce|birch|jungle|acacia|dark_oak)_planks$/);
  if (plank) return { id: 5, data: PLANKS_DATA[plank[1] as string] ?? 0 };

  const log = name.match(/^(oak|spruce|birch|jungle|acacia|dark_oak)_(log|wood)$/);
  if (log) {
    const wood = log[1] as string;
    const axis =
      log[2] === 'wood' ? 12 : properties.axis === 'x' ? 4 : properties.axis === 'z' ? 8 : 0;
    const woodData = WOOD_DATA[wood] ?? 0;
    if (wood === 'acacia' || wood === 'dark_oak') return { id: 162, data: woodData + axis };
    return { id: 17, data: woodData + axis };
  }

  const stairs = name.match(
    /^(oak|stone_brick|brick|spruce|birch|jungle|nether_brick|quartz|acacia|dark_oak)_stairs$/,
  );
  if (stairs) return { id: STAIR_IDS[stairs[1] as string] as number, data: stairData(properties) };

  const fence = name.match(/^(oak|spruce|birch|jungle|dark_oak|acacia)_fence$/);
  if (fence) return { id: FENCE_IDS[fence[1] as string] as number, data: 0 };

  if (name === 'stone_bricks') {
    return { id: 98, data: { mossy: 1, cracked: 2, chiseled: 3 }[properties.variant ?? ''] ?? 0 };
  }

  const wool = name.match(
    /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_wool$/,
  );
  if (wool) return { id: 35, data: DYE_DATA[wool[1] as string] ?? 0 };

  const colored = name.match(
    /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(stained_glass|stained_glass_pane|carpet)$/,
  );
  if (colored)
    return {
      id: { stained_glass: 95, stained_glass_pane: 160, carpet: 171 }[colored[2]!]!,
      data: DYE_DATA[colored[1]!]!,
    };

  if (name === 'ladder' || name === 'chest')
    return {
      id: name === 'ladder' ? 65 : 54,
      data: { north: 2, south: 3, west: 4, east: 5 }[properties.facing ?? 'north'] ?? 2,
    };
  if (name === 'water' || name === 'flowing_water')
    return {
      id: name === 'water' ? 9 : 8,
      data: Number.parseInt(properties.level ?? '0', 10) & 15,
    };

  const concrete = name.match(
    /^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(concrete|concrete_powder)$/,
  );
  if (concrete)
    return {
      id: concrete[2] === 'concrete' ? 251 : 252,
      data: DYE_DATA[concrete[1] as string] ?? 0,
    };

  const stoneSlabs: Record<string, number> = {
    stone: 0,
    smooth_stone: 0,
    sandstone: 1,
    cobblestone: 3,
    brick: 4,
    stone_brick: 5,
    nether_brick: 6,
    quartz: 7,
  };
  const slab = name.match(/^(.*)_slab$/);
  if (slab) {
    const material = slab[1]!;
    const wood = PLANKS_DATA[material];
    const variant = wood ?? stoneSlabs[material];
    if (variant !== undefined) {
      const doubled = properties.type === 'double';
      return {
        id: wood !== undefined ? (doubled ? 125 : 126) : doubled ? 43 : 44,
        data:
          variant + (!doubled && (properties.type === 'top' || properties.half === 'top') ? 8 : 0),
      };
    }
  }

  return null;
}

/** Refuse unsupported palette entries before changing a 1.12.2 session. */
export function unsupportedLegacyBlocks(volume: BlockVolume): string[] {
  return volume.getPalette().filter((state) => legacyBlock(state) === null);
}

function tileEntity(be: BlockEntity): NbtCompoundValue {
  const value: NbtCompoundValue = {
    id: stringNode(be.id.replace(/^minecraft:/, '')),
    x: intNode(be.pos[0]),
    y: intNode(be.pos[1]),
    z: intNode(be.pos[2]),
  };
  for (const [key, raw] of Object.entries(be.data)) {
    if (typeof raw === 'string') value[key] = stringNode(raw);
    else if (typeof raw === 'boolean') value[key] = byteNode(raw ? 1 : 0);
    else if (typeof raw === 'number' && Number.isInteger(raw)) value[key] = intNode(raw);
  }
  return value;
}

/** Write the legacy MCEdit/Schematic format used by WorldEdit 6 and old FAWE. */
export async function writeMcEditSchematic(
  volume: BlockVolume,
  blockEntities: BlockEntity[] = [],
): Promise<Buffer> {
  const blocks: number[] = [];
  const data: number[] = [];
  const addBlocks: number[] = [];
  const unsupported = new Set<string>();

  volume.forEachYZX((_x, _y, _z, state) => {
    const block = legacyBlock(state);
    if (!block) {
      unsupported.add(state);
      blocks.push(0);
      data.push(0);
      addBlocks.push(0);
      return;
    }
    blocks.push(block.id & 0xff);
    data.push(block.data & 0x0f);
    addBlocks.push((block.id >> 8) & 0x0f);
  });

  if (unsupported.size > 0) {
    throw new Error(
      `Legacy .schematic cannot represent these blocks for Minecraft 1.12.2: ${[...unsupported].sort().join(', ')}`,
    );
  }

  const value: NbtCompoundValue = {
    Materials: stringNode('Alpha'),
    Width: shortNode(volume.x),
    Height: shortNode(volume.y),
    Length: shortNode(volume.z),
    WEOriginX: intNode(0),
    WEOriginY: intNode(0),
    WEOriginZ: intNode(0),
    WEOffsetX: intNode(0),
    WEOffsetY: intNode(0),
    WEOffsetZ: intNode(0),
    Blocks: byteArrayNode(blocks.map(signedByte)),
    Data: byteArrayNode(data.map(signedByte)),
    Entities: listNode([]),
    TileEntities: listNode(blockEntities.map(tileEntity)),
  };

  if (addBlocks.some((high) => high !== 0)) {
    const packed: number[] = [];
    for (let i = 0; i < addBlocks.length; i += 2) {
      packed.push(signedByte((addBlocks[i] ?? 0) | ((addBlocks[i + 1] ?? 0) << 4)));
    }
    value.AddBlocks = byteArrayNode(packed);
  }

  const root: NbtNode = { type: 'compound', name: 'Schematic', value };
  return gzipSync(
    nbt.writeUncompressed(root as unknown as Parameters<typeof nbt.writeUncompressed>[0], 'big'),
  );
}
