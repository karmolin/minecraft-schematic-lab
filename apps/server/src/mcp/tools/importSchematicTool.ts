import { open } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MAX_IMPORT_BYTES } from '../../schematic/readSchematic';
import { openViewerOnce } from '../../openBrowser';
import { messageOf } from '../../httpError';
import { errorResult, textResult, type McpDeps } from '../toolHelpers';

export function registerImportSchematicTool(server: McpServer, deps: McpDeps): void {
  server.registerTool(
    'import_schematic',
    {
      title: 'Import schematic',
      description:
        'Import a local MCEdit/WorldEdit 6 .schematic into a new session and preview it. Existing sessions are kept. The resulting BuildSpec has a compact base layer; use get_current_build and append operations with apply_patch to modify it. Export as mcedit to preserve original ID/data and NBT.',
      inputSchema: { path: z.string().describe('Absolute local path to the .schematic file') },
    },
    async ({ path }) => {
      try {
        if (!isAbsolute(path)) throw new Error('Please provide an absolute schematic path.');
        const file = await open(path, 'r');
        let buffer: Buffer;
        try {
          const stat = await file.stat();
          if (!stat.isFile() || stat.size > MAX_IMPORT_BYTES)
            throw new Error('Expected a schematic file up to 32 MiB.');
          buffer = await file.readFile();
        } finally {
          await file.close();
        }
        const result = deps.sessionManager.importSchematic(buffer, basename(path));
        openViewerOnce(`${deps.config.baseUrl}/`);
        return textResult({
          sessionId: result.sessionId,
          buildId: result.buildId,
          valid: result.valid,
          blockCount: result.blockCount,
          palette: result.palette,
          warnings: result.warnings,
          previewUrl: `${deps.config.baseUrl}/`,
          buildSpecUrl: `${deps.config.baseUrl}/api/session/build-spec.json`,
        });
      } catch (error) {
        return errorResult(messageOf(error));
      }
    },
  );
}
