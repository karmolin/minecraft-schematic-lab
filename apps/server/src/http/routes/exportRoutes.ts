import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SchematicFormat } from '../../schematic/schematicTypes';
import type { SessionManager } from '../../session/SessionManager';

export function registerExportRoutes(app: FastifyInstance, sm: SessionManager): void {
  app.get('/api/session/export.schem', async (request: FastifyRequest, reply: FastifyReply) => {
    const { version, format } = request.query as { version?: string; format?: string };
    const schematicFormat: SchematicFormat =
      format === 'mcedit' ? 'mcedit' : version === '3' ? 'sponge-v3' : 'sponge-v2';
    const { buffer, filename } = await sm.exportSchematic(schematicFormat);
    return reply
      .type('application/octet-stream')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(buffer);
  });
}
