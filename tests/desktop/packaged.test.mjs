import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import { mkdtemp, rm, access, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
const executablePath = process.env.SAVEX_DESKTOP_EXECUTABLE;

test('packaged desktop runs from its own runtime and resources and persists its database outside the app', { skip: !executablePath, timeout: 150000 }, async () => {
  const began = Date.now(), mark = number => console.log(`packaged test step ${number} at ${Math.round((Date.now() - began) / 1000)}s`);
  const dir = await mkdtemp(join(tmpdir(), 'savex-packaged-'));
  const env = { ...process.env, SAVEX_DESKTOP_DATA_DIR: dir, SAVEX_DESKTOP_LEGACY_ORIGIN: 'http://localhost:1', SAVEX_DESKTOP_DISABLE_AUTO_SYNC: '1', SAVEX_DESKTOP_DISABLE_UPDATES: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let desktop;
  try {
    mark(1); desktop = await _electron.launch({ executablePath, env });
    mark(2); let page = await desktop.firstWindow(); await expect(page.getByRole('button', { name: 'Settings & backups', exact: true })).toBeVisible();
    mark(3); const info = await desktop.evaluate(({ app }) => ({ packaged: app.isPackaged, data: app.getPath('userData'), version: app.getVersion() }));
    mark(4); assert.equal(info.packaged, true); assert.equal(info.data, dir);
    mark(5); await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
    mark(6); await expect(page.getByText(`· ${info.version}`, { exact: true })).toBeVisible();
    mark(7); await page.getByRole('switch', { name: 'Enable MCP server' }).check();
    mark(8); const mcpUrl = new URL('/mcp',page.url()).href;
    mark(9); await expect(page.getByRole('group', { name: 'Copy a connection prompt' }).getByRole('button', { name: 'Copy connection prompt', exact: true })).toHaveCount(1);
    mark(10); const mcpClient = new Client({ name: 'packaged-verification', version: '1' });
    try {
      mark(11); await mcpClient.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
      mark(12); assert((await mcpClient.listTools()).tools.some(t => t.name === 'set_save_topics'));
      mark(13); const overview = await mcpClient.callTool({ name: 'library_overview', arguments: {} });
      mark(14); assert.equal(overview.isError, undefined);
    } finally { await mcpClient.close(); }
    mark(15); await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    mark(16); const origin = new URL(page.url()).origin;
    mark(17); const helper = await page.evaluate(() => window.saveXDesktop.helperInfo());
    mark(18); await access(join(helper.path, 'manifest.json')); assert(helper.path.startsWith(dir));
    mark(19); await page.route('https://platform.twitter.com/**', route => route.abort());
    mark(20); await page.evaluate(async () => {
      const response = await fetch('/api/posts/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: [{ url: 'https://x.com/writer/status/981000099', text: 'Captured caption available while X loads', author: 'writer', authorName: 'Example writer', notes: 'A note saved by the packaged app' }] }) });
      if (!response.ok) throw new Error('Packaged API import failed.');
    });
    mark(22); await page.reload(); await expect(page.locator('.save-card')).toHaveCount(1);
    mark(23); await expect(page.locator('.save-card .embed-capture-text')).toHaveText('Captured caption available while X loads');
    mark(24); await expect(page.locator('.save-card .embed-capture-author')).toContainText('Example writer');
    mark(25); await expect(page.getByText('Loading post…', { exact: true })).toHaveCount(0);
    mark(26); await mkdir(resolve('test-results'), { recursive: true }); await page.screenshot({ path: resolve('test-results/desktop-packaged.png') });
    mark(27); await desktop.close();
    mark(28); desktop = await _electron.launch({ executablePath, env });
    mark(29); page = await desktop.firstWindow(); await expect(page.getByRole('button', { name: 'Settings & backups', exact: true })).toBeVisible();
    mark(30); assert.equal(new URL(page.url()).origin, origin);
    mark(31); assert.equal((await fetch(`${origin}/api/mcp`).then(r => r.json())).enabled, true);
    mark(32); const posts = await page.evaluate(async () => (await (await fetch('/api/posts')).json()).posts);
    mark(33); assert.equal(posts[0].notes, 'A note saved by the packaged app');
    mark(34); await promisify(execFile)(executablePath, [], { env, timeout: 10000 });
    mark(35); assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  } finally { await desktop?.close(); await rm(dir, { recursive: true, force: true }); }
});
