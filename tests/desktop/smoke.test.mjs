import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron, chromium } from 'playwright';
import { expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, cp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile), require = createRequire(import.meta.url);

test('desktop launches, syncs with its Chrome helper, preserves notes, and quick-syncs on reopening', { timeout: 240000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-electron-'));
  const appPath = join(dir, 'application'), dataDir = join(dir, 'library'), browserCalls = join(dir, 'browser-calls.txt');
  await mkdir(appPath);
  for (const name of ['desktop', 'server', 'public', 'extension']) await cp(resolve(name), join(appPath, name), { recursive: true });
  await cp(resolve('package.json'), join(appPath, 'package.json'));
  // The copied source fixture now has runtime dependencies (the MCP SDK).
  await symlink(resolve('node_modules'), join(appPath, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  // Keep all app code intact; replace only the OS browser launcher with a controllable adapter.
  await writeFile(join(appPath, 'desktop/browser.mjs'), `import {appendFile} from 'node:fs/promises';export async function openSyncBrowser(url){await appendFile(${JSON.stringify(browserCalls)},url+String.fromCharCode(10));}`);
  const env = { ...process.env, SAVEX_DESKTOP_DATA_DIR: dataDir, SAVEX_DESKTOP_LEGACY_ORIGIN: 'http://localhost:1' }; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = require('electron');
  let desktop, chrome, pumping = false, pump;
  try {
    desktop = await _electron.launch({ executablePath, args: [appPath], env });
    let page = await desktop.firstWindow(); await page.waitForSelector('[data-action="sync"]');
    const origin = new URL(page.url()).origin;
    const security = await desktop.evaluate(({ BrowserWindow }) => { const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { nodeIntegration: prefs.nodeIntegration, contextIsolation: prefs.contextIsolation, sandbox: prefs.sandbox }; });
    assert.deepEqual(security, { nodeIntegration: false, contextIsolation: true, sandbox: true });
    await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'App updates', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check for updates', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    const helper = join(dataDir, 'browser-helper', 'extension');
    const manifestPath = join(helper, 'manifest.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.host_permissions.push('https://x.com/*', 'https://www.instagram.com/*'); await writeFile(manifestPath, JSON.stringify(manifest));
    chrome = await chromium.launchPersistentContext(join(dir, 'chrome'), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${helper}`, `--load-extension=${helper}`] });
    const fixture = `<!doctype html><meta charset="utf-8"><a data-testid="AppTabBar_Profile_Link" href="/desktop_user">Profile</a><main>${['981000001', '981000002'].map(id => `<article data-testid="tweet"><div data-testid="User-Name"><a href="/writer"><span>Writer</span></a><a href="/writer/status/${id}"><time>Today</time></a></div><div data-testid="tweetText">A desktop sync reference ${id}</div></article>`).join('')}</main>`;
    await chrome.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture }));
    let offset = 0; pumping = true;
    pump = (async () => {
      while (pumping) {
        let calls = []; try { calls = (await readFile(browserCalls, 'utf8')).split('\n').filter(Boolean); } catch { /* No browser request yet. */ }
        for (const url of calls.slice(offset)) { offset++; if (!url.startsWith(origin)) continue; const tab = await chrome.newPage(); await tab.goto(url).catch(() => {}); }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    })();
    await page.route('https://platform.twitter.com/**', route => route.abort());
    await page.getByRole('button', { name: 'Sync', exact: true }).click();
    const status = () => page.evaluate(async () => (await (await fetch('/api/sync')).json()).job);
    await expect.poll(async () => (await status())?.status, { timeout: 75000 }).toBe('partial');
    const firstJob = await status(); assert.equal(firstJob.mode, 'quick');
    await expect.poll(async () => page.evaluate(async () => (await (await fetch('/api/posts')).json()).posts.length)).toBe(2);
    // Browser setup can move focus away; the library refreshes when foregrounded.
    await page.bringToFront();
    await expect(page.locator('.save-card')).toHaveCount(2, { timeout: 7000 });
    await page.locator('.save-card').first().getByRole('button', { name: 'Edit note', exact: true }).click();
    await page.getByLabel('Note', { exact: true }).fill('Saved in the desktop app');
    await expect(page.locator('#note-status')).toHaveText('Saved');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await mkdir(resolve('test-results'), { recursive: true });
    await page.screenshot({ path: resolve('test-results/desktop-library.png') });
    await desktop.close();
    desktop = await _electron.launch({ executablePath, args: [appPath], env });
    page = await desktop.firstWindow(); await page.waitForSelector('[data-action="sync"]');
    assert.equal(new URL(page.url()).origin, origin);
    await page.route('https://platform.twitter.com/**', route => route.abort());
    const saved = await page.evaluate(async () => (await (await fetch('/api/posts')).json()).posts);
    assert.equal(saved.length, 2); assert(saved.some(post => post.notes === 'Saved in the desktop app'));
    await expect.poll(async () => (await status())?.id, { timeout: 15000 }).not.toBe(firstJob.id);
    await expect.poll(async () => (await status())?.status, { timeout: 60000 }).toBe('partial');
    assert.equal((await status()).mode, 'quick');
    const jobId = (await status()).id;
    await execute(executablePath, [appPath], { env, timeout: 10000 });
    assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.equal((await status()).id, jobId);
  } finally {
    pumping = false; await pump?.catch(() => {}); await chrome?.close(); await desktop?.close(); await rm(dir, { recursive: true, force: true });
  }
});
