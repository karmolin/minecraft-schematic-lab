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
    volume.setBlock(4, 0, 0, 'minecraft:stripped_spruce_log');

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
    volume.setBlock(0, 0, 0, 'minecraft:deepslate_bricks');
    await expect(writeMcEditSchematic(volume)).rejects.toThrow('deepslate_bricks');
  });
});
