import { startQuickSync, chooseSelect } from '../browser/select-helper.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, cp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile), require = createRequire(import.meta.url);

test('desktop imports Chrome bookmarks from Chrome\'s own file without opening a browser, preserves notes, and quick-syncs on reopening', { timeout: 240000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-electron-'));
  const appPath = join(dir, 'application'), dataDir = join(dir, 'library'), browserCalls = join(dir, 'browser-calls.txt'), chromeData = join(dir, 'chrome-data');
  await mkdir(appPath);
  for (const name of ['desktop', 'server', 'public', 'extension']) await cp(resolve(name), join(appPath, name), { recursive: true });
  await cp(resolve('package.json'), join(appPath, 'package.json'));
  // The copied source fixture now has runtime dependencies (the MCP SDK).
  await symlink(resolve('node_modules'), join(appPath, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  // Keep all app code intact; replace only the OS browser launcher with a controllable adapter.
  await writeFile(join(appPath, 'desktop/browser.mjs'), `import {appendFile} from 'node:fs/promises';export async function openSyncBrowser(url){await appendFile(${JSON.stringify(browserCalls)},url+String.fromCharCode(10));}export async function focusSyncBrowser(){}`);
  await mkdir(join(chromeData, 'Default'), { recursive: true });
  const bookmark = (name, url) => ({ type: 'url', name, url, date_added: String((Date.UTC(2024, 0, 1) + 11644473600000) * 1000) });
  await writeFile(join(chromeData, 'Default', 'Bookmarks'), JSON.stringify({ roots: { bookmark_bar: { type: 'folder', name: 'Bookmarks bar', children: [bookmark('Reference one', 'https://example.com/one'), bookmark('Reference two', 'https://example.com/two')] } } }));
  const env = { ...process.env, SAVEX_DESKTOP_DATA_DIR: dataDir, SAVEX_DESKTOP_LEGACY_ORIGIN: 'http://localhost:1', SAVEX_CHROME_DATA_DIR: chromeData }; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = require('electron');
  let desktop;
  try {
    desktop = await _electron.launch({ executablePath, args: [appPath], env });
    let page = await desktop.firstWindow(); await page.waitForSelector('[data-action="settings"]');
    const origin = new URL(page.url()).origin;
    const security = await desktop.evaluate(({ BrowserWindow }) => { const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { nodeIntegration: prefs.nodeIntegration, contextIsolation: prefs.contextIsolation, sandbox: prefs.sandbox }; });
    assert.deepEqual(security, { nodeIntegration: false, contextIsolation: true, sandbox: true });
    await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'App version', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check for updates', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.route('**/api/posts/*/website-preview',route=>route.fulfill({json:{available:false}}));
    await expect.poll(async()=>(await(await page.request.get(origin+'/api/sync')).json()).browser?.bookmarksReady,{timeout:10000}).toBe(true);
    await chooseSelect(page,'Sync source','chrome');
    await startQuickSync(page);
    const status = () => page.evaluate(async () => (await (await fetch('/api/sync')).json()).job);
    await expect.poll(async () => (await status())?.status, { timeout: 75000 }).toBe('completed');
    const firstJob = await status(); assert.equal(firstJob.mode, 'quick');
    await assert.rejects(readFile(browserCalls, 'utf8'), { code: 'ENOENT' });
    await expect.poll(async () => page.evaluate(async () => (await (await fetch('/api/posts')).json()).posts.length)).toBe(2);
    await expect(page.locator('.save-card')).toHaveCount(2, { timeout: 7000 });
    await expect(page.locator('.save-card').first().getByLabel('Note',{exact:true})).toBeVisible();
    await page.locator('.save-card').first().getByLabel('Note', { exact: true }).fill('Saved in the desktop app');
    await expect(page.locator('.save-card').first().locator('.note-status')).toHaveAttribute('data-state','saved');
    await page.getByRole('searchbox').focus();
    await mkdir(resolve('test-results'), { recursive: true });
    await page.screenshot({ path: resolve('test-results/desktop-library.png') });
    await desktop.close();
    desktop = await _electron.launch({ executablePath, args: [appPath], env });
    page = await desktop.firstWindow(); await page.waitForSelector('[data-action="settings"]');
    assert.equal(new URL(page.url()).origin, origin);
    await page.route('**/api/posts/*/website-preview',route=>route.fulfill({json:{available:false}}));
    const saved = await page.evaluate(async () => (await (await fetch('/api/posts')).json()).posts);
    assert.equal(saved.length, 2); assert(saved.some(post => post.notes === 'Saved in the desktop app'));
    await expect.poll(async () => (await status())?.id, { timeout: 15000 }).not.toBe(firstJob.id);
    await expect.poll(async () => (await status())?.status, { timeout: 60000 }).toBe('completed');
    assert.equal((await status()).mode, 'quick');
    const jobId = (await status()).id;
    await execute(executablePath, [appPath], { env, timeout: 10000 });
    assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.equal((await status()).id, jobId);
  } finally {
    await desktop?.close(); await rm(dir, { recursive: true, force: true });
  }
});
