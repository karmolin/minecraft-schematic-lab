import { gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import nbt from 'prismarine-nbt';
import type { BuildSpec } from '@minecraft-schematic-lab/build-spec';
import { HttpError } from '../httpError';
import { legacyBlockState } from './legacyBlocks';

export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
const MAX_NBT_BYTES = 128 * 1024 * 1024;
type Tag = { type: string; value: unknown };
type Compound = Record<string, Tag>;

function field(root: Compound, name: string, type: string, optional = false): unknown {
  const tag = root[name];
  if (!tag && optional) return undefined;
  if (!tag || tag.type !== type) throw new Error(`字段 ${name} 应为 ${type}。`);
  return tag.value;
}

function compounds(root: Compound, name: string): Compound[] {
  const list = field(root, name, 'list', true) as { type: string; value: Compound[] } | undefined;
  if (!list) return [];
  if (!Array.isArray(list.value) || (list.value.length && list.type !== 'compound')) {
    throw new Error(`字段 ${name} 不是 compound 列表。`);
  }
  return list.value;
}

/** Read gzip or uncompressed Java MCEdit/WorldEdit 6 NBT into a self-contained BuildSpec. */
export function readSchematic(buffer: Buffer, filename = 'Imported.schematic'): BuildSpec {
  if (!buffer.length) throw new HttpError(400, '原理图文件为空。');
  if (buffer.length > MAX_IMPORT_BYTES) throw new HttpError(413, '原理图文件不能超过 32 MiB。');
  try {
    const raw =
      buffer[0] === 0x1f && buffer[1] === 0x8b
        ? gunzipSync(buffer, { maxOutputLength: MAX_NBT_BYTES })
        : buffer;
    if (raw[0] !== 10) throw new Error('文件不是 Java NBT 原理图。');
    const parsed = nbt.parseUncompressed(raw, 'big');
    const root = parsed.value as unknown as Compound;
    if (root.Version || root.Schematic) {
      throw new Error(
        '目前导入支持 MCEdit / WorldEdit 6 的 .schematic；Sponge .schem 请先转换为旧版格式。',
      );
    }
    if (field(root, 'Materials', 'string') !== 'Alpha')
      throw new Error('仅支持 Materials=Alpha 的原理图。');
    const size = {
      x: Number(field(root, 'Width', 'short')),
      y: Number(field(root, 'Height', 'short')),
      z: Number(field(root, 'Length', 'short')),
    };
    const count = size.x * size.y * size.z;
    if (Object.values(size).some((n) => !Number.isInteger(n) || n <= 0) || count > 2_000_000) {
      throw new Error('原理图尺寸无效或体积超过 2,000,000 方块，请缩小选区后导入。');
    }
    const blocks = field(root, 'Blocks', 'byteArray') as number[];
    const data = field(root, 'Data', 'byteArray') as number[];
    const add = field(root, 'AddBlocks', 'byteArray', true) as number[] | undefined;
    if (
      blocks.length !== count ||
      data.length !== count ||
      (add && add.length !== Math.ceil(count / 2))
    ) {
      throw new Error('方块数组长度与原理图尺寸不一致，文件可能已损坏。');
    }
    if (data.some((n) => n < 0 || n > 15)) throw new Error('方块 Data 必须在 0–15 范围内。');
    const basename = filename.split(/[\\/]/).pop()!.slice(0, 200);
    const spec: BuildSpec = {
      id: `import-${randomUUID()}`,
      name: basename.replace(/\.[^.]+$/, '') || 'Imported schematic',
      minecraftVersion: '1.12.2',
      size,
      origin: {
        x: Number(field(root, 'WEOffsetX', 'int', true) ?? 0),
        y: Number(field(root, 'WEOffsetY', 'int', true) ?? 0),
        z: Number(field(root, 'WEOffsetZ', 'int', true) ?? 0),
      },
      palette: {},
      operations: [],
      base: {
        size: { ...size },
        palette: [],
        runs: [],
        blockEntities: [],
        entities: compounds(root, 'Entities'),
        source: {
          filename: basename,
          format: 'mcedit',
          warnings: [],
          extraNbt: Object.fromEntries(
            Object.entries(root).filter(
              ([key]) =>
                ![
                  'Materials',
                  'Width',
                  'Height',
                  'Length',
                  'Blocks',
                  'Data',
                  'AddBlocks',
                  'TileEntities',
                  'Entities',
                  'WEOriginX',
                  'WEOriginY',
                  'WEOriginZ',
                  'WEOffsetX',
                  'WEOffsetY',
                  'WEOffsetZ',
                ].includes(key),
            ),
          ),
          worldOrigin: ['WEOriginX', 'WEOriginY', 'WEOriginZ'].map((key) =>
            Number(field(root, key, 'int', true) ?? 0),
          ) as [number, number, number],
        },
      },
    };
    const base = spec.base!;
    const palette = new Map<number, number>();
    const indices = new Uint16Array(count);
    const unknown = new Set<string>();
    for (let i = 0; i < count; i++) {
      const high = ((add?.[i >> 1] ?? 0) >> ((i & 1) * 4)) & 15;
      const id = (blocks[i]! & 255) | (high << 8);
      const meta = data[i]!;
      const encoded = (id << 4) | meta;
      let index = palette.get(encoded);
      if (index === undefined) {
        index = base.palette.length;
        if (index >= 65535) throw new Error('原理图方块状态种类过多。');
        palette.set(encoded, index);
        let state = legacyBlockState(id, meta);
        if (!state) {
          unknown.add(`${id}:${meta}`);
          state = id === 0 ? 'minecraft:air' : `legacy:block_${id}[data=${meta}]`;
        }
        const key = `b${index}`;
        spec.palette[key] = state;
        base.palette.push({ block: key, legacy: { id, data: meta, state } });
      }
      indices[i] = index;
      const last = base.runs.at(-1);
      if (last?.[0] === index) last[1]++;
      else base.runs.push([index, 1]);
    }
    for (const tile of compounds(root, 'TileEntities')) {
      const pos = ['x', 'y', 'z'].map((key) => Number(field(tile, key, 'int'))) as [
        number,
        number,
        number,
      ];
      if (pos.some((n, axis) => n < 0 || n >= [size.x, size.y, size.z][axis]!)) {
        throw new Error(`方块实体坐标超出范围：[${pos.join(', ')}]。`);
      }
      const index = pos[0] + size.x * (pos[2] + size.z * pos[1]);
      const state = spec.palette[base.palette[indices[index]!]!.block]!;
      base.blockEntities.push({
        pos,
        id: String(field(tile, 'id', 'string')),
        block: state,
        nbt: tile,
      });
    }
    if (unknown.size)
      base.source.warnings.push(
        `无法识别的旧版 ID/data（原值已保留，预览使用占位方块）：${[...unknown].slice(0, 40).join(', ')}${unknown.size > 40 ? '…' : ''}`,
      );
    if (base.entities.length)
      base.source.warnings.push(
        `已保留 ${base.entities.length} 个实体的 NBT；Three.js 暂不显示生物、盔甲架等实体。`,
      );
    if (root.SchematicaMapping)
      base.source.warnings.push(
        '此文件包含模组方块映射；预览按原版 1.12.2 解释数字 ID，请在相同模组环境中使用导出文件。',
      );
    return spec;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      `无法导入原理图：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
