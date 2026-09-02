import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { messageOf } from '../../httpError';
import { errorResult, textResult, type McpDeps } from '../toolHelpers';

export function registerExportSchematicTool(server: McpServer, deps: McpDeps): void {
  server.registerTool(
    'export_schematic',
    {
      title: 'Export schematic',
      description:
        'Export the current build for WorldEdit. Use format mcedit for the legacy .schematic format used by WorldEdit 6 / old FAWE on Minecraft 1.12.2. Use sponge-v2 (default) or sponge-v3 for modern .schem files.',
      inputSchema: {
        format: z.enum(['mcedit', 'sponge-v2', 'sponge-v3']).optional(),
        version: z.union([z.literal(2), z.literal(3)]).optional(),
      },
    },
    async (args) => {
      try {
        const format = args.format ?? (args.version === 3 ? 'sponge-v3' : 'sponge-v2');
        const { buffer, filename } = await deps.sessionManager.exportSchematic(format);
        return textResult({
          filename,
          format,
          size: buffer.length,
          downloadUrl: `${deps.config.baseUrl}/api/session/export.schem?format=${format}`,
        });
      } catch (error) {
        return errorResult(messageOf(error));
      }
    },
  );
}
