// Browser regression with an isolated API instance; existing sessions are untouched.
// Uses the selected local 1.12.2 resource pack. Run after pnpm build.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import nbt from 'prismarine-nbt';
import { createHttpServer } from '../apps/server/src/http/createHttpServer.ts';
import { SessionManager } from '../apps/server/src/session/SessionManager.ts';
import { GitProjectService } from '../apps/server/src/git/GitProjectService.ts';

const repo = resolve(import.meta.dirname, '..');
const config = {
  host: '127.0.0.1',
  port: 0,
  baseUrl: '',
  mcpMode: true,
  webDist: resolve(repo, 'apps/web/dist'),
  resourcePacksDir: resolve(repo, 'resourcepacks'),
  vanillaJar: resolve(repo, 'resourcepacks/.base/minecraft-1.12.2.jar'),
};
const sm = new SessionManager(config, new GitProjectService());
const app = await createHttpServer(sm, config);
let browser;
try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  config.baseUrl = url;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('msl-lang', 'zh'));
  await page.goto(url);
  await expect(page.getByRole('button', { name: '导入 .schematic', exact: true })).toBeVisible();
  const original = readFileSync(resolve(repo, 'Cozy-Spruce-Cottage.schematic'));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入 .schematic', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'Cozy-Spruce-Cottage.schematic',
    mimeType: 'application/octet-stream',
    buffer: original,
  });
  await expect(page.getByRole('status').filter({ hasText: '已导入' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('已就绪', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('21 × 16 × 19')).toBeVisible();
  const packs = await (await page.request.get(`${url}/api/resource-packs`)).json();
  await expect(page.getByLabel('预览材质包')).toHaveValue(packs.selectedPackId);
  const exportEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: '导出 .schematic', exact: true }).click();
  const exported = readFileSync(await (await exportEvent).path());
  const before = nbt.simplify((await nbt.parse(original)).parsed);
  const after = nbt.simplify((await nbt.parse(exported)).parsed);
  expect(after.Blocks).toEqual(before.Blocks);
  expect(after.Data).toEqual(before.Data);
  const current = await (await page.request.get(`${url}/api/session/current`)).json();
  const downloadSpec = page.waitForEvent('download');
  await page.getByRole('link', { name: '保存可编辑 BuildSpec JSON' }).click();
  const spec = JSON.parse(readFileSync(await (await downloadSpec).path(), 'utf8'));
  expect(spec.base.source.filename).toBe('Cozy-Spruce-Cottage.schematic');
  mkdirSync(resolve(repo, 'test-results'), { recursive: true });
  await page.locator('.app-col-left').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: resolve(repo, 'test-results/schematic-import.png') });
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await page.screenshot({ path: resolve(repo, 'test-results/schematic-import-front.png') });
  const patch = await page.request.post(`${url}/api/session/apply-patch`, {
    data: {
      patch: [
        {
          op: 'add',
          path: '/operations/-',
          value: { type: 'box', from: [0, 0, 0], to: [20, 0, 18], block: 'minecraft:stone' },
        },
      ],
    },
  });
  expect(patch.ok()).toBe(true);
  await expect
    .poll(async () => (await (await page.request.get(`${url}/api/session/current`)).json()).buildId)
    .not.toBe(current.buildId);
  // An invalid file must retain the modified build and show the server's error.
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.schematic',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not nbt'),
  });
  await expect(page.getByRole('alert')).toContainText('无法导入');
  expect(sm.list()).toHaveLength(2);
  expect(sm.current().spec.operations).toHaveLength(1);
  // A newly bundled viewer must still show builds on a not-yet-restarted server.
  await page.route('**/api/session/summary', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }),
  );
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '已导入' })).toBeVisible();
  await page.route('**/api/session/import?*', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not found' }),
    }),
  );
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'Cozy-Spruce-Cottage.schematic',
      mimeType: 'application/octet-stream',
      buffer: original,
    });
  await expect(page.getByRole('alert')).toContainText('重启 start.bat');
  await expect(page.getByText('已就绪', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  const report = {
    ok: true,
    size: current.stats.size,
    blockCount: current.stats.blockCount,
    packId: packs.selectedPackId,
    coverage: await page.getByTestId('pack-coverage').allTextContents(),
    checks: [
      'file picker upload',
      'selected resource pack',
      'Three.js canvas',
      'unchanged ID/data round-trip',
      'editable JSON download',
      'append modification',
      'failed import retains build',
    ],
  };
  writeFileSync(
    resolve(repo, 'test-results/schematic-import-report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await app.close();
}
