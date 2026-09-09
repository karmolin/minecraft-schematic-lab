import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import nbt from 'prismarine-nbt';
import { compileBuildSpec } from '@minecraft-schematic-lab/block-compiler';
import { readSchematic } from './readSchematic';
import { writeMcEditSchematic } from './writeMcEditSchematic';
import { importedPreview } from './importPreview';

type Node = { type: string; value: unknown };
const tag = (type: string, value: unknown): Node => ({ type, value });

export function fixture(extra: Record<string, Node> = {}, compressed = true): Buffer {
  const root = {
    type: 'compound',
    name: 'Schematic',
    value: {
      Materials: tag('string', 'Alpha'),
      Width: tag('short', 3),
      Height: tag('short', 2),
      Length: tag('short', 2),
      Blocks: tag('byteArray', [1, 53, 44, 54, 8, 9, 0, 0, 0, 0, 0, 1]),
      Data: tag('byteArray', [0, 5, 8, 2, 0, 0, 0, 0, 0, 0, 0, 7]),
      AddBlocks: tag('byteArray', [0, 0, 0, 0, 0, 16]),
      WEOriginX: tag('int', 123),
      WEOffsetX: tag('int', -8),
      WEOffsetY: tag('int', 2),
      WEOffsetZ: tag('int', 9),
      TileEntities: tag('list', {
        type: 'compound',
        value: [
          {
            id: tag('string', 'minecraft:chest'),
            x: tag('int', 0),
            y: tag('int', 0),
            z: tag('int', 1),
            Items: tag('list', {
              type: 'compound',
              value: [
                {
                  Slot: tag('byte', 2),
                  Count: tag('byte', 4),
                  id: tag('string', 'minecraft:diamond'),
                  Damage: tag('short', 0),
                },
              ],
            }),
            CustomName: tag('string', '宝箱'),
            Seed: tag('long', [123, 456]),
          },
        ],
      }),
      Entities: tag('list', {
        type: 'compound',
        value: [
          {
            id: tag('string', 'minecraft:armor_stand'),
            Pos: tag('list', { type: 'double', value: [1.5, 0, 1.5] }),
          },
        ],
      }),
      ...extra,
    },
  };
  const raw = nbt.writeUncompressed(root as Parameters<typeof nbt.writeUncompressed>[0], 'big');
  return compressed ? gzipSync(raw) : raw;
}

describe('legacy schematic import', () => {
  it('preserves every block ID/data, AddBlocks, offsets, typed tile NBT and entities after JSON save/reload', async () => {
    const original = fixture({ CustomMetadata: tag('string', 'keep me') });
    const spec = JSON.parse(JSON.stringify(readSchematic(original, '中文房屋.schematic')));
    const compiled = compileBuildSpec(spec);
    expect(compiled.volume.getBlock(1, 0, 0)).toContain('facing=west');
    expect(compiled.volume.getBlock(1, 0, 0)).toContain('half=top');
    expect(compiled.volume.getBlock(2, 0, 0)).toContain('type=top');
    expect(compiled.volume.getBlock(2, 1, 1)).toBe('legacy:block_257[data=7]');
    const output = await writeMcEditSchematic(
      compiled.volume,
      compiled.blockEntities,
      compiled.spec,
    );
    const before = nbt.parseUncompressed(
      fixture({ CustomMetadata: tag('string', 'keep me') }, false),
      'big',
    ).value;
    const after = (await nbt.parse(output)).parsed.value;
    for (const key of [
      'Blocks',
      'Data',
      'AddBlocks',
      'WEOriginX',
      'WEOffsetX',
      'WEOffsetY',
      'WEOffsetZ',
      'TileEntities',
      'Entities',
      'CustomMetadata',
    ] as const) {
      expect(after[key], key).toEqual(before[key]);
    }
  });

  it('edits palette materials and places/removes blocks on top without restoring old numeric data', async () => {
    const spec = readSchematic(fixture());
    const stoneKey = Object.keys(spec.palette).find(
      (key) => spec.palette[key] === 'minecraft:stone',
    )!;
    spec.palette[stoneKey] = 'minecraft:bricks';
    spec.operations.push({ type: 'box', from: [0, 0, 1], to: [0, 0, 1], block: 'minecraft:air' });
    spec.operations.push({ type: 'box', from: [0, 1, 0], to: [0, 1, 0], block: 'minecraft:glass' });
    const compiled = compileBuildSpec(spec);
    expect(compiled.blockEntities).toEqual([]);
    const output = nbt.simplify(
      (await nbt.parse(await writeMcEditSchematic(compiled.volume, compiled.blockEntities, spec)))
        .parsed,
    ) as { Blocks: number[]; Data: number[] };
    expect(output.Blocks[0]).toBe(45);
    expect(output.Blocks[3]).toBe(0);
    expect(output.Blocks[6]).toBe(20);
    expect(output.Blocks.slice(4, 6)).toEqual([8, 9]);
    expect(output.Data[1]).toBe(5);
  });

  it('can enlarge imported bounds without moving the original voxels', () => {
    const spec = readSchematic(fixture());
    spec.size = { x: 6, y: 4, z: 5 };
    const { volume } = compileBuildSpec(spec);
    expect(volume.getLegacyBlock(2, 1, 1)).toEqual({ id: 257, data: 7 });
    expect(volume.getBlock(5, 3, 4)).toBe('minecraft:air');
  });

  it('rejects corrupt, truncated, modern and oversized dimensions with useful errors', () => {
    expect(() => readSchematic(Buffer.alloc(0))).toThrow('为空');
    expect(() => readSchematic(Buffer.from('garbage'))).toThrow('NBT');
    expect(() => readSchematic(fixture().subarray(0, 20))).toThrow('无法导入');
    expect(() => readSchematic(fixture({ Width: tag('short', 0) }))).toThrow('尺寸');
    expect(() =>
      readSchematic(fixture({ Width: tag('short', 32767), Height: tag('short', 32767) })),
    ).toThrow('2,000,000');
    expect(() => readSchematic(fixture({ Data: tag('byteArray', [0]) }))).toThrow('长度');
    expect(() => readSchematic(fixture({ Version: tag('int', 2) }))).toThrow('Sponge');
    expect(() => readSchematic(fixture({ AddBlocks: tag('byteArray', [0]) }))).toThrow('长度');
  });

  it('rejects invalid base runs instead of silently drawing corrupt geometry', () => {
    const spec = readSchematic(fixture());
    spec.base!.runs[0]![1]++;
    expect(() => compileBuildSpec(spec)).toThrow('run lengths');
  });

  it('imports the repository cottage and round-trips every voxel', async () => {
    const buffer = readFileSync(
      new URL('../../../../Cozy-Spruce-Cottage.schematic', import.meta.url),
    );
    const spec = readSchematic(buffer, 'Cozy-Spruce-Cottage.schematic');
    expect(spec.size).toEqual({ x: 21, y: 16, z: 19 });
    const result = compileBuildSpec(spec);
    const out = await writeMcEditSchematic(result.volume, result.blockEntities, spec);
    const before = nbt.simplify((await nbt.parse(buffer)).parsed) as {
      Blocks: number[];
      Data: number[];
    };
    const after = nbt.simplify((await nbt.parse(out)).parsed) as typeof before;
    expect(after.Blocks).toEqual(before.Blocks);
    expect(after.Data).toEqual(before.Data);
    const preview = importedPreview(result.volume);
    expect(
      Object.keys(preview.instances).some((s) => s.includes('glass_pane') && s.includes('true')),
    ).toBe(true);
  });
});
