import { describe, expect, it } from 'vitest';
import type { PackBlockAppearance, PackElement } from '@minecraft-schematic-lab/shared';
import { createPackGeometry, defaultFaceUV } from './packGeometry';
import type { LoadedPack } from './packTextures';

const pack: LoadedPack = {
  appearance: { packId: 'test', revision: '1', blocks: {}, textures: {} },
  textures: {},
};
const slab: PackElement = {
  from: [0, 8, 0],
  to: [16, 16, 16],
  faces: {
    up: { texture: 'top' },
    down: { texture: 'bottom' },
    north: { texture: 'side' },
    south: { texture: 'side' },
    east: { texture: 'side' },
    west: { texture: 'side' },
  },
};

describe('resource pack geometry', () => {
  it('keeps a top slab in the top half and preserves distinct top, bottom and side materials', () => {
    const block: PackBlockAppearance = {
      source: 'pack',
      parts: [{ elements: [slab], x: 0, y: 0, uvlock: false }],
    };
    const result = createPackGeometry(block, pack, 'oak_slab[type=top]');
    result.geometry.computeBoundingBox();
    expect(result.geometry.boundingBox?.min.y).toBe(0);
    expect(result.geometry.boundingBox?.max.y).toBe(0.5);
    expect(result.materials).toHaveLength(3);
    expect(result.geometry.groups).toHaveLength(3);
    expect(result.geometry.index?.count).toBe(36);
    result.geometry.dispose();
    result.materials.forEach((m) => m.dispose());
  });

  it('rotates an east-facing part south with the Minecraft clockwise Y convention', () => {
    const element: PackElement = { ...slab, from: [8, 0, 0], to: [16, 16, 16] };
    const result = createPackGeometry(
      { source: 'pack', parts: [{ elements: [element], x: 0, y: 90, uvlock: true }] },
      pack,
      'oak_stairs',
    );
    result.geometry.computeBoundingBox();
    expect(result.geometry.boundingBox?.min.z).toBeCloseTo(0);
    expect(result.geometry.boundingBox?.max.z).toBeCloseTo(0.5);
    expect([...result.geometry.getAttribute('uv').array].every(Number.isFinite)).toBe(true);
    result.geometry.dispose();
    result.materials.forEach((m) => m.dispose());
  });

  it('crops side UVs to the slab height rather than stretching the whole block texture', () => {
    expect(defaultFaceUV(slab, 'south')).toEqual([0, 0, 16, 8]);
    expect(defaultFaceUV(slab, 'up')).toEqual([0, 0, 16, 16]);
  });
});
