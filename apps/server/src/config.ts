import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export interface AppConfig {
  host: string;
  port: number;
  baseUrl: string;
  mcpMode: boolean;
  /** Absolute path to the built web viewer (apps/web/dist). */
  webDist: string;
  resourcePacksDir?: string;
  vanillaJar?: string;
}

/**
 * Resolve the built web viewer directory across both layouts:
 *   - dev / tsx:     this module is apps/server/src/config.ts  -> ../../web/dist (apps/web/dist)
 *   - bundled (npx): this module is bundle/server.mjs          -> ./web/dist    (bundle/web/dist)
 * An explicit WEB_DIST_PATH env var overrides everything. The first candidate
 * that contains index.html wins; if none exist we fall back to the dev path so
 * the (existing) existsSync check in createHttpServer.ts can warn cleanly.
 */
function resolveWebDist(): string {
  const candidates: string[] = [];
  if (process.env.WEB_DIST_PATH) {
    candidates.push(process.env.WEB_DIST_PATH);
  }
  // Bundled layout: bundle/server.mjs -> bundle/web/dist
  candidates.push(fileURLToPath(new URL('./web/dist', import.meta.url)));
  // Dev / tsx layout: apps/server/src/config.ts -> apps/web/dist
  candidates.push(fileURLToPath(new URL('../../web/dist', import.meta.url)));

  for (const dir of candidates) {
    if (existsSync(`${dir}/index.html`)) {
      return dir;
    }
  }
  // Nothing built yet — return the dev path; createHttpServer skips static
  // serving (and index.ts prints the "run pnpm build" hint) when it's absent.
  return candidates[candidates.length - 1] as string;
}

export function loadConfig(argv: string[] = process.argv.slice(2)): AppConfig {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number.parseInt(process.env.PORT ?? '', 10) || 8765;
  const mcpMode = argv.includes('--mcp') || process.env.MCP === '1';
  const baseUrl = `http://${host}:${port}`;
  const webDist = resolveWebDist();
  // Resolve from the installation, not the launcher/MCP process working directory.
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const installRoot = existsSync(join(moduleDir, 'config.ts'))
    ? resolve(moduleDir, '../../..')
    : resolve(moduleDir, '..');
  const resourcePacksDir = resolve(
    process.env.RESOURCE_PACKS_DIR || join(installRoot, 'resourcepacks'),
  );
  const vanillaJar = resolve(
    process.env.MINECRAFT_112_JAR || join(resourcePacksDir, '.base', 'minecraft-1.12.2.jar'),
  );
  return { host, port, baseUrl, mcpMode, webDist, resourcePacksDir, vanillaJar };
}
