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

test('packaged desktop runs from its own runtime and resources and persists its database outside the app', { skip: !executablePath, timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-packaged-'));
  const env = { ...process.env, SAVEX_DESKTOP_DATA_DIR: dir, SAVEX_DESKTOP_LEGACY_ORIGIN: 'http://localhost:1', SAVEX_DESKTOP_DISABLE_AUTO_SYNC: '1', SAVEX_DESKTOP_DISABLE_UPDATES: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let desktop;
  try {
    desktop = await _electron.launch({ executablePath, env });
    let page = await desktop.firstWindow(); await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeVisible();
    const info = await desktop.evaluate(({ app }) => ({ packaged: app.isPackaged, data: app.getPath('userData'), version: app.getVersion() }));
    assert.equal(info.packaged, true); assert.equal(info.data, dir);
    await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
    await expect(page.getByText(`Installed version ${info.version}`, { exact: true })).toBeVisible();
    await page.getByRole('switch', { name: 'Enable MCP server' }).check();
    const mcpUrl = await page.getByRole('textbox', { name: 'MCP server URL' }).inputValue();
    const mcpClient = new Client({ name: 'packaged-verification', version: '1' });
    try {
      await mcpClient.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
      assert((await mcpClient.listTools()).tools.some(t => t.name === 'set_save_topics'));
      const overview = await mcpClient.callTool({ name: 'library_overview', arguments: {} });
      assert.equal(overview.isError, undefined);
    } finally { await mcpClient.close(); }
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    const origin = new URL(page.url()).origin;
    const helper = await page.evaluate(() => window.saveXDesktop.helperInfo());
    await access(join(helper.path, 'manifest.json')); assert(helper.path.startsWith(dir));
    await page.route('https://platform.twitter.com/**', route => route.abort());
    await page.evaluate(async () => {
      const response = await fetch('/api/posts/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: [{ url: 'https://x.com/writer/status/981000099', notes: 'A note saved by the packaged app' }] }) });
      if (!response.ok) throw new Error('Packaged API import failed.');
    });
    await page.reload(); await expect(page.locator('.save-card')).toHaveCount(1);
    await mkdir(resolve('test-results'), { recursive: true }); await page.screenshot({ path: resolve('test-results/desktop-packaged.png') });
    await desktop.close();
    desktop = await _electron.launch({ executablePath, env });
    page = await desktop.firstWindow(); await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).origin, origin);
    assert.equal((await fetch(`${origin}/api/mcp`).then(r => r.json())).enabled, true);
    const posts = await page.evaluate(async () => (await (await fetch('/api/posts')).json()).posts);
    assert.equal(posts[0].notes, 'A note saved by the packaged app');
    await promisify(execFile)(executablePath, [], { env, timeout: 10000 });
    assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  } finally { await desktop?.close(); await rm(dir, { recursive: true, force: true }); }
});
