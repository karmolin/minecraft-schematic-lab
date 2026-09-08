import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import AdmZip from 'adm-zip';
import { createCanvas } from '@napi-rs/canvas';
import { ResourcePackManager } from './ResourcePackManager';
import { resolveAppearance } from './resolveAppearance';
import { resourcePath } from './PackSource';
import { createHttpServer } from '../http/createHttpServer';
import { SessionManager } from '../session/SessionManager';
import { GitProjectService } from '../git/GitProjectService';
import type { AppConfig } from '../config';

const faces = Object.fromEntries(
  ['east', 'west', 'up', 'down', 'south', 'north'].map((face) => [face, { texture: '#all' }]),
);
const cube = {
  textures: { all: 'blocks/stone' },
  elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces }],
};
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
function png(color: string): Buffer {
  const canvas = createCanvas(16, 16);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, 16, 16);
  return canvas.toBuffer('image/png');
}
const stone = png('#aaaaaa'),
  custom = png('#aa4422');
let root: string, directory: string, base: string;

function archive(path: string, files: Record<string, Buffer>): void {
  const zip = new AdmZip();
  for (const [name, bytes] of Object.entries(files)) zip.addFile(name, bytes);
  zip.writeZip(path);
}
function packFiles(extra: Record<string, Buffer> = {}): Record<string, Buffer> {
  return { 'pack.mcmeta': json({ pack: { pack_format: 3, description: '测试材质包' } }), ...extra };
}
function packInfo(manager: ResourcePackManager) {
  return manager.list().packs.find((p) => p.kind === 'zip' || p.kind === 'folder')!;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'msl-resource-packs-'));
  directory = join(root, 'resourcepacks');
  mkdirSync(directory);
  base = join(root, 'minecraft-1.12.2.jar');
  archive(base, {
    'assets/minecraft/blockstates/stone.json': json({ variants: { normal: { model: 'stone' } } }),
    'assets/minecraft/blockstates/oak_planks.json': json({
      variants: { normal: { model: 'oak_planks' } },
    }),
    'assets/minecraft/blockstates/stonebrick.json': json({
      variants: { normal: { model: 'stone' } },
    }),
    'assets/minecraft/models/block/stone.json': json(cube),
    'assets/minecraft/models/block/oak_planks.json': json({
      parent: 'block/stone',
      textures: { all: 'blocks/planks_oak' },
    }),
    'assets/minecraft/textures/blocks/stone.png': stone,
    'assets/minecraft/textures/blocks/planks_oak.png': png('#ccaa55'),
  });
});
afterEach(() => {
  const target = resolve(root);
  if (
    !target.startsWith(resolve(tmpdir()) + '\\msl-resource-packs-') &&
    !target.startsWith(resolve(tmpdir()) + '/msl-resource-packs-')
  )
    throw new Error('Unexpected test directory');
  rmSync(target, { recursive: true, force: true });
});

describe('Java 1.12.2 resource packs', () => {
  it('loads a Chinese ZIP filename, BOM metadata, a wrapper folder and partial vanilla fallback', () => {
    const files = packFiles({ 'assets/minecraft/textures/blocks/stone.png': custom });
    files['pack.mcmeta'] = Buffer.concat([Buffer.from([239, 187, 191]), files['pack.mcmeta']!]);
    archive(
      join(directory, '§a§l材质包.zip'),
      Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`材质包/${path}`, bytes])),
    );
    const manager = new ResourcePackManager(directory, base);
    const info = packInfo(manager);
    expect(info).toMatchObject({ name: '材质包', status: 'ready' });
    const appearance = resolveAppearance(manager.resources(info.id, info.revision), [
      'minecraft:stone',
      'minecraft:oak_planks',
      'minecraft:stone_bricks',
    ]);
    expect(appearance.blocks['minecraft:stone']?.source).toBe('pack');
    expect(appearance.blocks['minecraft:oak_planks']?.source).toBe('vanilla');
    expect(appearance.blocks['minecraft:stone_bricks']?.source).toBe('pack');
    expect(appearance.textures['assets/minecraft/textures/blocks/stone.png']?.url).toContain(
      info.revision,
    );
  });

  it('does not substitute unknown or modern-only block IDs and ignores unused invalid models', () => {
    archive(
      join(directory, 'pack.zip'),
      packFiles({ 'assets/minecraft/models/block/unused.json': Buffer.from('') }),
    );
    const manager = new ResourcePackManager(directory, base),
      info = packInfo(manager);
    const states = ['minecraft:stone', 'minecraft:deepslate', 'minecraft:stripped_oak_log'];
    const before = [...states];
    const appearance = resolveAppearance(manager.resources(info.id, info.revision), states);
    expect(appearance.blocks['minecraft:stone']?.source).toBe('vanilla');
    expect(appearance.blocks['minecraft:deepslate']?.source).toBe('missing');
    expect(appearance.blocks['minecraft:stripped_oak_log']?.warning).toContain('ID');
    expect(states).toEqual(before);
  });

  it('invalidates URLs after replacing a ZIP with the same filename', () => {
    const file = join(directory, 'pack.zip');
    archive(file, packFiles());
    const manager = new ResourcePackManager(directory, base),
      old = packInfo(manager);
    archive(file, packFiles({ 'assets/minecraft/textures/blocks/stone.png': custom }));
    manager.list(true);
    const current = packInfo(manager);
    expect(current.id).toBe(old.id);
    expect(current.revision).not.toBe(old.revision);
    expect(() => manager.resources(old.id, old.revision)).toThrow('已更新');
    expect(
      manager
        .resources(current.id, current.revision)
        .read('assets/minecraft/textures/blocks/stone.png')?.bytes,
    ).toEqual(custom);
  });

  it('detects files changed within an unpacked resource pack', () => {
    const dir = join(directory, 'folder');
    mkdirSync(dir);
    writeFileSync(join(dir, 'pack.mcmeta'), packFiles()['pack.mcmeta']!);
    const manager = new ResourcePackManager(directory, base),
      old = packInfo(manager);
    mkdirSync(join(dir, 'assets/minecraft/textures/blocks'), { recursive: true });
    writeFileSync(join(dir, 'assets/minecraft/textures/blocks/stone.png'), custom);
    const current = packInfo(manager);
    expect(current.revision).not.toBe(old.revision);
    expect(
      resolveAppearance(manager.resources(current.id, current.revision), ['stone']).blocks.stone
        ?.source,
    ).toBe('pack');
  });

  it('isolates corrupt ZIPs and rejects other versions without hiding a good pack', () => {
    archive(join(directory, 'good.zip'), packFiles());
    archive(join(directory, 'modern.zip'), { 'pack.mcmeta': json({ pack: { pack_format: 15 } }) });
    writeFileSync(join(directory, 'broken.zip'), 'not a zip');
    const list = new ResourcePackManager(directory, base).list();
    expect(list.packs.find((p) => p.name === 'good')?.status).toBe('ready');
    expect(list.packs.filter((p) => p.status === 'error')).toHaveLength(2);
    expect(list.packs.find((p) => p.name === 'modern.zip')?.error).toContain('1.12.2');
  });

  it('reports missing vanilla resources instead of mixing another texture pack in', () => {
    archive(join(directory, 'pack.zip'), packFiles());
    const manager = new ResourcePackManager(directory, join(root, 'absent.jar'));
    const info = packInfo(manager);
    expect(manager.list().baseReady).toBe(false);
    expect(() => manager.resources(info.id, info.revision)).toThrow('原版');
  });

  it('contains model cycles to the affected block', () => {
    archive(
      join(directory, 'pack.zip'),
      packFiles({
        'assets/minecraft/models/block/stone.json': json({ parent: 'block/loop' }),
        'assets/minecraft/models/block/loop.json': json({ parent: 'block/stone' }),
      }),
    );
    const manager = new ResourcePackManager(directory, base),
      info = packInfo(manager);
    const appearance = resolveAppearance(manager.resources(info.id, info.revision), ['stone']);
    expect(appearance.blocks.stone?.source).toBe('missing');
    expect(appearance.blocks.stone?.warning).toContain('循环');
    expect(Object.keys(appearance.textures)).toHaveLength(0);
  });

  it('reads the declared first frame of an animation strip', () => {
    const canvas = createCanvas(16, 32);
    archive(
      join(directory, 'pack.zip'),
      packFiles({
        'assets/minecraft/textures/blocks/stone.png': canvas.toBuffer('image/png'),
        'assets/minecraft/textures/blocks/stone.png.mcmeta': json({
          animation: { frames: [1, 0] },
        }),
      }),
    );
    const manager = new ResourcePackManager(directory, base),
      info = packInfo(manager);
    const appearance = resolveAppearance(manager.resources(info.id, info.revision), ['stone']);
    expect(appearance.textures['assets/minecraft/textures/blocks/stone.png']?.frame).toEqual({
      x: 0,
      y: 16,
      width: 16,
      height: 16,
    });
  });

  it('rejects resource paths outside a pack', () => {
    for (const path of [
      '../secret',
      'assets/../../secret',
      'C:/secret',
      '/secret',
      'assets\\secret',
      'assets//stone.png',
    ]) {
      expect(() => resourcePath(path)).toThrow();
    }
  });

  it('serves revisioned textures over HTTP and leaves build/export data unchanged', async () => {
    archive(
      join(directory, 'pack.zip'),
      packFiles({ 'assets/minecraft/textures/blocks/stone.png': custom }),
    );
    const config: AppConfig = {
      host: '127.0.0.1',
      port: 0,
      baseUrl: '',
      mcpMode: true,
      webDist: join(root, 'no-web'),
      resourcePacksDir: directory,
      vanillaJar: base,
    };
    const sm = new SessionManager(config, new GitProjectService());
    sm.build({
      id: 'test',
      name: 'test',
      minecraftVersion: '1.12.2',
      size: { x: 1, y: 1, z: 1 },
      palette: { a: 'minecraft:stone' },
      operations: [{ type: 'box', from: [0, 0, 0], to: [0, 0, 0], block: 'a' }],
    });
    const before = await sm.exportSchematic('mcedit');
    const buildId = sm.current().buildId;
    const app = await createHttpServer(sm, config);
    try {
      const listing = await app.inject({ method: 'GET', url: '/api/resource-packs' });
      const pack = listing.json().packs.find((p: { kind: string }) => p.kind === 'zip');
      const response = await app.inject({
        method: 'POST',
        url: '/api/resource-packs/resolve',
        payload: { packId: pack.id, revision: pack.revision, states: ['minecraft:stone'] },
      });
      expect(response.statusCode).toBe(200);
      const image = await app.inject({
        method: 'GET',
        url: response.json().textures['assets/minecraft/textures/blocks/stone.png'].url,
      });
      expect(image.headers['content-type']).toContain('image/png');
      expect(image.rawPayload).toEqual(custom);
      expect(image.headers['cache-control']).toContain('immutable');
      expect(sm.current().buildId).toBe(buildId);
      expect((await sm.exportSchematic('mcedit')).buffer).toEqual(before.buffer);
      const invalid = await app.inject({
        method: 'POST',
        url: '/api/resource-packs/resolve',
        payload: { states: [null] },
      });
      expect(invalid.statusCode).toBe(400);
      expect(readFileSync(join(directory, 'pack.zip')).length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
