// End-to-end persistence regression: real server process restart, different port,
// fresh browser storage, legacy migration and save failure. Isolated test files only.
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { createCanvas } from '@napi-rs/canvas';
import { chromium, expect } from '@playwright/test';
import { createHttpServer } from '../apps/server/src/http/createHttpServer.ts';
import { SessionManager } from '../apps/server/src/session/SessionManager.ts';
import { GitProjectService } from '../apps/server/src/git/GitProjectService.ts';

const repo = resolve('.');
if (process.argv[2] === '--serve') {
  const directory = process.argv[3];
  const config = {
    host: '127.0.0.1',
    port: 0,
    baseUrl: '',
    mcpMode: true,
    webDist: join(repo, 'apps/web/dist'),
    resourcePacksDir: directory,
    vanillaJar: join(directory, '.base/minecraft-1.12.2.jar'),
  };
  const sm = new SessionManager(config, new GitProjectService());
  sm.build({
    id: 'preference-test',
    name: 'Preference test',
    minecraftVersion: '1.12.2',
    size: { x: 1, y: 1, z: 1 },
    palette: {},
    operations: [{ type: 'box', from: [0, 0, 0], to: [0, 0, 0], block: 'minecraft:stone' }],
  });
  const app = await createHttpServer(sm, config);
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  process.send({ url });
  process.on('message', async (message) => {
    if (message === 'stop') {
      await app.close();
      process.exit(0);
    }
  });
} else {
  const dir = mkdtempSync(join(tmpdir(), 'msl-preference-'));
  let child, browser;
  const json = (value) => Buffer.from(JSON.stringify(value));
  function png(color) {
    const c = createCanvas(16, 16),
      ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 16, 16);
    return c.toBuffer('image/png');
  }
  const original = new AdmZip();
  original.addFile(
    'assets/minecraft/blockstates/stone.json',
    json({ variants: { normal: { model: 'stone' } } }),
  );
  original.addFile(
    'assets/minecraft/models/block/stone.json',
    json({
      textures: { all: 'blocks/stone' },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: Object.fromEntries(
            ['east', 'west', 'up', 'down', 'south', 'north'].map((f) => [f, { texture: '#all' }]),
          ),
        },
      ],
    }),
  );
  original.addFile('assets/minecraft/textures/blocks/stone.png', png('#bbbbbb'));
  mkdirSync(join(dir, '.base'));
  original.writeZip(join(dir, '.base/minecraft-1.12.2.jar'));
  const zip = new AdmZip();
  zip.addFile(
    'pack.mcmeta',
    json({ pack: { pack_format: 3, description: 'Persistent test pack' } }),
  );
  zip.addFile('assets/minecraft/textures/blocks/stone.png', png('#44aa77'));
  zip.writeZip(join(dir, 'pack.zip'));
  const preference = () =>
    JSON.parse(readFileSync(join(dir, '.preview-settings.json'), 'utf8')).selectedPackId;
  async function start() {
    child = fork(fileURLToPath(import.meta.url), ['--serve', dir], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    const [message] = await once(child, 'message');
    return message.url;
  }
  async function stop() {
    const exit = once(child, 'exit');
    child.send('stop');
    await exit;
    child = null;
  }
  try {
    let url = await start();
    const list = await (await fetch(url + '/api/resource-packs')).json();
    const pack = list.packs.find((p) => p.kind === 'zip');
    browser = await chromium.launch({
      headless: true,
      args: ['--enable-webgl', '--use-angle=swiftshader'],
    });
    let context = await browser.newContext();
    await context.addInitScript((id) => localStorage.setItem('msl-resource-pack-112', id), pack.id);
    let page = await context.newPage();
    await page.goto(url);
    await expect(page.getByTestId('pack-coverage')).toContainText(/(?:unsupported|不支持) 0/, {
      timeout: 20000,
    });
    await expect.poll(preference).toBe(pack.id);
    await context.close();
    const previousUrl = url;
    await stop();
    url = await start();
    expect(url).not.toBe(previousUrl);
    // Brand-new browser context: no localStorage for either port.
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto(url);
    const select = page.locator('.resource-pack-panel select');
    await expect(select).toHaveValue(pack.id);
    await expect(page.getByTestId('pack-coverage')).toContainText(/(?:unsupported|不支持) 0/, {
      timeout: 20000,
    });
    expect(preference()).toBe(pack.id);
    // Unavailable storage must not claim the choice is saved or replace the last good preview.
    await page.route('**/api/resource-packs/selection', (r) =>
      r.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'test save failure' }),
      }),
    );
    await select.selectOption('builtin');
    await expect(page.getByRole('alert')).toContainText('test save failure');
    expect(preference()).toBe(pack.id);
    expect(await page.evaluate(() => localStorage.getItem('msl-resource-pack-112'))).toBe(pack.id);
    await page.unroute('**/api/resource-packs/selection');
    await page.locator('.pack-actions button').click();
    await expect.poll(preference).toBe('builtin');
    await select.selectOption(pack.id);
    await expect.poll(preference).toBe(pack.id);
    await page.reload();
    await expect(select).toHaveValue(pack.id);
    await expect(page.getByTestId('pack-coverage')).toContainText(/(?:unsupported|不支持) 0/, {
      timeout: 20000,
    });
    mkdirSync(join(repo, 'test-results'), { recursive: true });
    await page.screenshot({ path: join(repo, 'test-results/pack-preference.png') });
    console.log(
      'PASS: legacy preference migration, process restart, different port, fresh browser context, failed-save rollback, retry and reload.',
    );
  } finally {
    await browser?.close();
    if (child) await stop();
    const target = resolve(dir);
    if (!target.startsWith(resolve(tmpdir()) + sep + 'msl-preference-'))
      throw new Error('Unexpected test directory');
    rmSync(target, { recursive: true, force: true });
  }
}
