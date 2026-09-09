import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SessionManager } from '../../session/SessionManager';
import { MAX_IMPORT_BYTES } from '../../schematic/readSchematic';
import { HttpError } from '../../httpError';

export function registerSessionRoutes(app: FastifyInstance, sm: SessionManager): void {
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: MAX_IMPORT_BYTES },
    (_request, body, done) => done(null, body),
  );

  app.post('/api/session/import', { bodyLimit: MAX_IMPORT_BYTES }, async (request) => {
    if (!Buffer.isBuffer(request.body))
      throw new HttpError(400, '请以 application/octet-stream 上传原理图文件。');
    const query = request.query as { filename?: string };
    return sm.importSchematic(request.body, query.filename || 'Imported.schematic');
  });

  app.get('/api/session/build-spec.json', async (_request, reply) => {
    const spec = sm.current().spec;
    if (!spec) throw new HttpError(409, '暂无可保存的建筑。');
    return reply
      .type('application/json')
      .header('Content-Disposition', 'attachment; filename="buildSpec.json"')
      .send(JSON.stringify(spec, null, 2));
  });

  app.post('/api/session/create', async () => {
    const session = sm.createSession();
    return { sessionId: session.id };
  });

  app.get('/api/session/current', async () => sm.current());
  app.get('/api/session/summary', async () => {
    const { spec, ...summary } = sm.current();
    return { ...summary, importedFrom: spec?.base?.source.filename };
  });

  app.post(
    '/api/session/build',
    { bodyLimit: 128 * 1024 * 1024 },
    async (request: FastifyRequest) => sm.build(request.body),
  );

  app.post('/api/session/validate', async (request: FastifyRequest) => sm.validate(request.body));

  app.post('/api/session/apply-patch', async (request: FastifyRequest) => {
    const body = request.body as { patch?: unknown } | unknown[];
    const patch = Array.isArray(body) ? body : body?.patch;
    return sm.applyPatch(patch);
  });

  app.get('/api/session/preview-data', async () => sm.getPreviewData());

  app.get('/api/session/preview.png', async (_request: FastifyRequest, reply: FastifyReply) => {
    const png = await sm.renderImage();
    return reply.type('image/png').send(png);
  });

  app.get('/api/session/list', async () => sm.list());

  app.post('/api/session/select', async (request: FastifyRequest) => {
    const { sessionId } = (request.body ?? {}) as { sessionId?: string };
    sm.select(String(sessionId ?? ''));
    return { ok: true };
  });

  app.post('/api/session/delete', async (request: FastifyRequest) => {
    const { sessionId } = (request.body ?? {}) as { sessionId?: string };
    sm.deleteSession(String(sessionId ?? ''));
    return { ok: true };
  });
}
