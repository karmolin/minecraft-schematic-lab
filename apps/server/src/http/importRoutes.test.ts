import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { compileBuildSpec } from '@minecraft-schematic-lab/block-compiler';
import { createHttpServer } from './createHttpServer';
import { SessionManager } from '../session/SessionManager';
import { GitProjectService } from '../git/GitProjectService';
import { writeMcEditSchematic } from '../schematic/writeMcEditSchematic';

let app: FastifyInstance;
let sm: SessionManager;
let payload: Buffer;
beforeAll(async () => {
  const config = {
    host: '127.0.0.1',
    port: 0,
    baseUrl: '',
    mcpMode: true,
    webDist: '/nonexistent',
  };
  sm = new SessionManager(config, new GitProjectService());
  app = await createHttpServer(sm, config);
  const { volume } = compileBuildSpec({
    id: 'fixture',
    name: 'Fixture',
    minecraftVersion: '1.12.2',
    size: { x: 2, y: 2, z: 2 },
    palette: {},
    operations: [{ type: 'box', from: [0, 0, 0], to: [1, 1, 1], block: 'minecraft:stone' }],
  });
  payload = await writeMcEditSchematic(volume);
});
afterAll(async () => {
  await app.close();
});

describe('import routes', () => {
  it('imports into a new session, exposes editable JSON and supports patches and exports', async () => {
    const old = sm.current().sessionId;
    const res = await app.inject({
      method: 'POST',
      url: '/api/session/import?filename=House.schematic',
      headers: { 'content-type': 'application/octet-stream' },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      valid: true,
      blockCount: 8,
      importedFrom: 'House.schematic',
    });
    expect(sm.list().some((s) => s.sessionId === old)).toBe(true);
    expect(sm.current().sessionId).not.toBe(old);
    const saved = await app.inject({ method: 'GET', url: '/api/session/build-spec.json' });
    expect(saved.headers['content-disposition']).toContain('buildSpec.json');
    expect(saved.json().base.runs).toEqual([[0, 8]]);
    const summary = await app.inject({ method: 'GET', url: '/api/session/summary' });
    expect(summary.json().spec).toBeUndefined();
    expect(summary.json().importedFrom).toBe('House.schematic');
    const patch = await app.inject({
      method: 'POST',
      url: '/api/session/apply-patch',
      payload: {
        patch: [
          {
            op: 'add',
            path: '/operations/-',
            value: { type: 'box', from: [0, 0, 0], to: [0, 0, 0], block: 'minecraft:air' },
          },
        ],
      },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().stats.blockCount).toBe(7);
    expect(
      (await app.inject({ method: 'GET', url: '/api/session/export.schem?format=mcedit' }))
        .statusCode,
    ).toBe(200);
  });
  it('keeps the current build and session on invalid uploads', async () => {
    const before = sm.current();
    const sessions = sm.list().length;
    const res = await app.inject({
      method: 'POST',
      url: '/api/session/import',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('bad file'),
    });
    expect(res.statusCode).toBe(400);
    expect(sm.current()).toEqual(before);
    expect(sm.list()).toHaveLength(sessions);
  });
});
