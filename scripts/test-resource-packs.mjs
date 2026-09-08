// Isolated browser regression test. Does not replace any running MCP session/build.
// Run after building apps/web. --actual also checks the locally installed user's pack.
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { chromium, expect } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import { createHttpServer } from '../apps/server/src/http/createHttpServer.ts';
import { SessionManager } from '../apps/server/src/session/SessionManager.ts';
import { GitProjectService } from '../apps/server/src/git/GitProjectService.ts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'msl-pack-browser-'));
const packDir = join(temp, 'resourcepacks');
mkdirSync(packDir);
const base = join(temp, 'minecraft-1.12.2.jar');
const packPath = join(packDir, '§a§l材质包.zip');
const actual = process.argv.includes('--actual');
const json = (v) => Buffer.from(JSON.stringify(v));
const screenshot = join(repo, 'test-results', 'resource-pack-112.png');

function png(color) {
  const canvas = createCanvas(16, 16);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#fff4';
  ctx.fillRect(0, 0, 16, 2);
  return canvas.toBuffer('image/png');
}
function fixture() {
  const zip = new AdmZip();
  const faces = Object.fromEntries(
    ['east', 'west', 'up', 'down', 'south', 'north'].map((face) => [face, { texture: '#all' }]),
  );
  zip.addFile(
    'assets/minecraft/blockstates/stone.json',
    json({ variants: { normal: { model: 'stone' } } }),
  );
  zip.addFile(
    'assets/minecraft/models/block/stone.json',
    json({
      textures: { all: 'blocks/stone' },
      elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces }],
    }),
  );
  zip.addFile('assets/minecraft/textures/blocks/stone.png', png('#bbbbbb'));
  zip.writeZip(base);
  const pack = new AdmZip();
  pack.addFile('pack.mcmeta', json({ pack: { pack_format: 3, description: 'Browser test' } }));
  pack.addFile('assets/minecraft/textures/blocks/stone.png', png('#8b4930'));
  pack.writeZip(packPath);
}

let app, browser;
try {
  if (actual) {
    copyFileSync(join(repo, 'resourcepacks/.base/minecraft-1.12.2.jar'), base);
    copyFileSync(join(repo, 'resourcepacks/§a§l材质包.zip'), packPath);
  } else fixture();
  const config = {
    host: '127.0.0.1',
    port: 0,
    baseUrl: '',
    mcpMode: true,
    webDist: join(repo, 'apps/web/dist'),
    resourcePacksDir: packDir,
    vanillaJar: base,
  };
  if (!existsSync(join(config.webDist, 'index.html')))
    throw new Error('Build apps/web before the browser test.');
  const sm = new SessionManager(config, new GitProjectService());
  const states = actual
    ? [
        'minecraft:stone',
        'minecraft:stone_bricks',
        'minecraft:cobblestone',
        'minecraft:oak_planks',
        'minecraft:oak_log[axis=y]',
        'minecraft:oak_log[axis=x]',
        'minecraft:oak_stairs[facing=east]',
        'minecraft:oak_stairs[facing=west,half=top]',
        'minecraft:oak_slab[type=bottom]',
        'minecraft:oak_slab[type=top]',
        'minecraft:grass_block',
        'minecraft:glass',
        'minecraft:white_wool',
        'minecraft:polished_andesite',
        'minecraft:quartz_pillar',
        'minecraft:red_glazed_terracotta',
      ]
    : ['minecraft:stone'];
  const spec = {
    id: 'pack-browser-test',
    name: '1.12.2 材质对照',
    minecraftVersion: '1.12.2',
    size: { x: 16, y: 3, z: 8 },
    palette: {},
    operations: states.map((block, i) => ({
      type: 'box',
      from: [(i % 8) * 2, 0, Math.floor(i / 8) * 3],
      to: [(i % 8) * 2, 0, Math.floor(i / 8) * 3],
      block,
    })),
  };
  const built = sm.build(spec);
  if (!built.valid) throw new Error(built.errors.join(';'));
  const before = await sm.exportSchematic('sponge-v2');
  app = await createHttpServer(sm, config);
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
  });
  await context.addInitScript(() => localStorage.setItem('msl-lang', 'en'));
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const response = await fetch(`${url}/api/resource-packs`);
  const list = await response.json();
  const pack = list.packs.find((p) => p.kind === 'zip');
  expect(pack.status).toBe('ready');
  const choose = page.getByLabel('Preview resource pack');
  const status = page.locator('.resource-pack-panel [role="status"]');
  async function select(id) {
    await choose.selectOption(id);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('msl-resource-pack-112')), {
        timeout: 20_000,
      })
      .toBe(id);
    await expect(status).toHaveText('Ready');
    if (id !== 'builtin')
      await expect(page.getByTestId('pack-coverage')).toContainText('unsupported 0');
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
  }
  await page.goto(url);
  await expect(choose.locator('option')).toHaveCount(3);
  await select(pack.id);
  const customFrame = await page
    .locator('canvas')
    .first()
    .evaluate((c) => c.toDataURL());
  mkdirSync(dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot });
  await select('vanilla');
  const vanillaFrame = await page
    .locator('canvas')
    .first()
    .evaluate((c) => c.toDataURL());
  expect(customFrame).not.toBe(vanillaFrame);
  await select(pack.id);
  await page.reload();
  await expect(choose).toHaveValue(pack.id);
  await expect(page.getByTestId('pack-coverage')).toContainText('unsupported 0', {
    timeout: 20_000,
  });
  for (let i = 0; i < 3; i++) {
    await select('builtin');
    await select('vanilla');
    await select(pack.id);
  }
  console.log('PASS: real rendering, default fallback, repeated switching, saved selection');

  // A failed image load must retain the previous successfully loaded pack.
  const pattern = '**/api/resource-packs/vanilla/**/assets/**';
  await page.route(pattern, (route) =>
    route.fulfill({ status: 503, body: 'simulated texture error' }),
  );
  await choose.selectOption('vanilla');
  await expect(page.getByRole('alert')).toContainText('贴图加载失败', { timeout: 20_000 });
  expect(await page.evaluate(() => localStorage.getItem('msl-resource-pack-112'))).toBe(pack.id);
  await page.unroute(pattern);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('msl-resource-pack-112')), {
      timeout: 20_000,
    })
    .toBe('vanilla');
  await expect(status).toHaveText('Ready');
  console.log('PASS: failed-load rollback and retry');

  // Cancel an in-flight selection: late responses must never switch the pack back.
  await page.route('**/api/resource-packs/resolve', async (route) => {
    await new Promise((done) => setTimeout(done, 300));
    await route.continue().catch(() => {});
  });
  await choose.selectOption(pack.id);
  await choose.selectOption('builtin');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('msl-resource-pack-112')))
    .toBe('builtin');
  await new Promise((done) => setTimeout(done, 700));
  expect(await page.evaluate(() => localStorage.getItem('msl-resource-pack-112'))).toBe('builtin');
  await page.unroute('**/api/resource-packs/resolve');
  await select(pack.id);

  const updateResponse = page.waitForResponse(
    (res) =>
      res.url().endsWith('/api/resource-packs/resolve') &&
      res.request().postDataJSON()?.packId === pack.id,
    { timeout: 20_000 },
  );
  const updated = new AdmZip(packPath);
  updated.addFile('assets/minecraft/textures/blocks/stone.png', png('#22bbcc'));
  updated.writeZip(packPath);
  const update = await updateResponse;
  const appearance = await update.json();
  expect(appearance.revision).not.toBe(pack.revision);
  await expect(status).toHaveText('Ready', { timeout: 20_000 });
  writeFileSync(join(packDir, 'broken.zip'), 'incomplete zip');
  await expect(choose.locator('option').filter({ hasText: 'broken.zip' })).toHaveAttribute('disabled', '', { timeout: 15_000 });
  expect((await sm.exportSchematic('sponge-v2')).buffer).toEqual(before.buffer);
  expect(sm.current().buildId).toBe(built.buildId);
  expect(pageErrors).toEqual([]);
  console.log(
    'PASS: cancellation, same-name replacement, corrupt-pack isolation, unchanged export, no page errors',
  );
  console.log(`Screenshot: ${screenshot}`);
} finally {
  await browser?.close();
  await app?.close();
  const target = resolve(temp);
  if (!target.startsWith(resolve(tmpdir()) + sep + 'msl-pack-browser-'))
    throw new Error('Unexpected test directory');
  rmSync(target, { recursive: true, force: true });
}
