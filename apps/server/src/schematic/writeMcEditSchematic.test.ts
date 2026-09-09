import { describe, expect, it } from 'vitest';
import nbt from 'prismarine-nbt';
import { BlockVolume } from '@minecraft-schematic-lab/block-compiler';
import { writeMcEditSchematic } from './writeMcEditSchematic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parse(buffer: Buffer): Promise<any> {
  const { parsed } = await nbt.parse(buffer);
  return nbt.simplify(parsed);
}

describe('writeMcEditSchematic', () => {
  it('exports the 1.12 texture-preview quartz and glazed terracotta without substitution', async () => {
    const volume = new BlockVolume(3, 1, 1);
    volume.setBlock(0, 0, 0, 'minecraft:quartz_pillar[axis=x]');
    volume.setBlock(1, 0, 0, 'minecraft:red_glazed_terracotta[facing=north]');
    volume.setBlock(2, 0, 0, 'minecraft:red_glazed_terracotta[facing=east]');
    const data = await parse(await writeMcEditSchematic(volume));
    expect(data.Blocks.map((n: number) => n & 255)).toEqual([155, 249, 249]);
    expect(data.Data).toEqual([3, 2, 3]);
  });
  it('writes the legacy MCEdit structure and preserves YZX block order', async () => {
    const volume = new BlockVolume(2, 2, 2);
    volume.setBlock(0, 0, 0, 'minecraft:stone');
    volume.setBlock(1, 0, 0, 'minecraft:spruce_planks');
    volume.setBlock(0, 0, 1, 'minecraft:glass_pane');

    const data = await parse(await writeMcEditSchematic(volume));
    expect(data.Materials).toBe('Alpha');
    expect(data.Width).toBe(2);
    expect(data.Height).toBe(2);
    expect(data.Length).toBe(2);
    expect(data.Blocks).toHaveLength(8);
    expect(data.Data).toHaveLength(8);
    expect(data.Blocks[0]).toBe(1);
    expect(data.Blocks[1]).toBe(5);
    expect(data.Data[1]).toBe(1);
    expect(data.Blocks[2]).toBe(102);
    expect(data.Entities).toEqual([]);
    expect(data.TileEntities).toEqual([]);
  });

  it('maps the current cottage palette to Minecraft 1.12 block ids', async () => {
    const volume = new BlockVolume(5, 1, 1);
    volume.setBlock(0, 0, 0, 'minecraft:cobblestone');
    volume.setBlock(1, 0, 0, 'minecraft:spruce_planks');
    volume.setBlock(2, 0, 0, 'minecraft:dark_oak_stairs');
    volume.setBlock(3, 0, 0, 'minecraft:glass_pane');
    volume.setBlock(4, 0, 0, 'minecraft:spruce_log');

    const data = await parse(await writeMcEditSchematic(volume));
    expect(data.Blocks).toEqual([4, 5, -92, 102, 17]);
    expect(data.Data).toEqual([0, 1, 0, 0, 1]);
  });

  it('converts stair facing states to legacy stair metadata', async () => {
    const volume = new BlockVolume(4, 1, 1);
    volume.setBlock(0, 0, 0, 'minecraft:dark_oak_stairs[facing=north]');
    volume.setBlock(1, 0, 0, 'minecraft:dark_oak_stairs[facing=south]');
    volume.setBlock(2, 0, 0, 'minecraft:dark_oak_stairs[facing=west]');
    volume.setBlock(3, 0, 0, 'minecraft:dark_oak_stairs[facing=east]');

    const data = await parse(await writeMcEditSchematic(volume));
    expect(data.Blocks).toEqual([-92, -92, -92, -92]);
    expect(data.Data).toEqual([3, 2, 1, 0]);
  });

  it('rejects blocks introduced after Minecraft 1.12', async () => {
    const volume = new BlockVolume(1, 1, 1);
    for (const name of ['deepslate_bricks', 'stripped_spruce_log', 'barrel', 'lantern']) {
      volume.setBlock(0, 0, 0, `minecraft:${name}`);
      await expect(writeMcEditSchematic(volume)).rejects.toThrow(name);
    }
  });

  it('preserves castle slab heights, glass colors, ladder directions and water in 1.12.2', async () => {
    const states = [
      'polished_andesite',
      'mossy_stone_bricks',
      'cracked_stone_bricks',
      'light_blue_stained_glass',
      'red_carpet',
      'stone_brick_slab[type=top]',
      'spruce_slab[type=top]',
      'spruce_slab[type=double]',
      'ladder[facing=north]',
      'water[level=0]',
      'torch',
      'fern',
      'poppy',
      'dark_oak_log[axis=z]',
    ];
    const volume = new BlockVolume(states.length, 1, 1);
    states.forEach((state, x) => volume.setBlock(x, 0, 0, `minecraft:${state}`));
    const data = await parse(await writeMcEditSchematic(volume));
    expect(data.Blocks.map((n: number) => n & 255)).toEqual([
      1, 98, 98, 95, 171, 44, 126, 125, 65, 9, 50, 31, 38, 162,
    ]);
    expect(data.Data).toEqual([6, 1, 2, 3, 14, 13, 9, 1, 2, 0, 5, 2, 0, 9]);
  });
});
