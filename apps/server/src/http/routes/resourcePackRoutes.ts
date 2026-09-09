import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../config';
import { ResourcePackManager } from '../../resourcepacks/ResourcePackManager';
import { resolveAppearance } from '../../resourcepacks/resolveAppearance';
import { HttpError } from '../../httpError';
import { join } from 'node:path';

export function registerResourcePackRoutes(app: FastifyInstance, config: AppConfig): void {
  const directory = config.resourcePacksDir ?? join(process.cwd(), 'resourcepacks');
  const manager = new ResourcePackManager(
    directory,
    config.vanillaJar ?? join(directory, '.base', 'minecraft-1.12.2.jar'),
  );
  manager.list();

  app.get('/api/resource-packs', async (_request, reply) =>
    reply.header('Cache-Control', 'no-store').send(manager.list()),
  );
  app.post('/api/resource-packs/refresh', async (_request, reply) =>
    reply.header('Cache-Control', 'no-store').send(manager.list(true)),
  );
  app.post('/api/resource-packs/selection', async (request, reply) => {
    const body = request.body as { packId?: unknown } | null;
    if (!body || typeof body.packId !== 'string' || !body.packId || body.packId.length > 128)
      throw new HttpError(400, '无效的材质包选择。');
    return reply.header('Cache-Control', 'no-store').send(manager.select(body.packId));
  });
  app.post('/api/resource-packs/resolve', async (request, reply) => {
    const body = request.body as { packId?: unknown; revision?: unknown; states?: unknown } | null;
    if (
      !body ||
      typeof body.packId !== 'string' ||
      typeof body.revision !== 'string' ||
      !Array.isArray(body.states) ||
      body.states.length > 2048 ||
      !body.states.every(
        (state) => typeof state === 'string' && state.length <= 512 && state !== '__proto__',
      )
    ) {
      throw new HttpError(400, '无效的材质请求（最多 2048 种方块状态）。');
    }
    return reply
      .header('Cache-Control', 'no-store')
      .send(
        resolveAppearance(manager.resources(body.packId, body.revision), body.states as string[]),
      );
  });
  app.get<{ Params: { id: string; revision: string; '*': string } }>(
    '/api/resource-packs/:id/:revision/assets/*',
    async (request, reply) => {
      const { id, revision } = request.params;
      const path = request.params['*'];
      // Serve only images from a known pack, never arbitrary local files or executable content.
      if (path !== 'pack.png' && (!path.startsWith('assets/') || !path.endsWith('.png')))
        throw new HttpError(404, '资源不存在。');
      const bytes =
        path === 'pack.png'
          ? manager.icon(id, revision)
          : manager.resources(id, revision).read(path)?.bytes;
      if (!bytes) throw new HttpError(404, '贴图不存在。');
      return reply
        .type('image/png')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .send(bytes);
    },
  );
}
