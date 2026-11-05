import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, cp, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// A stand-in for Instagram in the app's own sessions. Image downloads don't use these sessions.
function fixtureSetup(ses) {
  if (ses.__fixtureInstalled) return;
  ses.__fixtureInstalled = true;
  ses.protocol.handle('https', async request => {
    const { hostname, pathname } = new URL(request.url);
    if (hostname !== 'www.instagram.com') return new Response('', { status: 404 });
    if (pathname.startsWith('/p/Gated')) return new Response('', { status: 302, headers: { Location: 'https://www.instagram.com/accounts/login/' } });
    const post = pathname.match(/^\/p\/(\w+)/)?.[1];
    const head = post ? `<meta property="og:image" content="https://scontent.cdninstagram.com/${post}-fresh.jpg">` : '';
    return new Response(`<!doctype html><meta charset="utf-8">${head}<body><nav><a href="/iguser/saved/">Saved</a><a href="/explore/">Explore</a></nav><main><article><h1>Caption read from ${post || 'home'}</h1></article></main>`, { headers: { 'Content-Type': 'text/html' } });
  });
}

test('recovery reads a fresh link from a post in a hidden window, and backs off from a login page', { timeout: 90000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-recovery-')), appPath = join(dir, 'application'), dataDir = join(dir, 'library');
  await mkdir(appPath);
  for (const name of ['desktop', 'server', 'public', 'extension']) await cp(resolve(name), join(appPath, name), { recursive: true });
  await cp(resolve('package.json'), join(appPath, 'package.json')); await symlink(resolve('node_modules'), join(appPath, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const manager = join(appPath, 'desktop/social.mjs');
  await writeFile(manager, (await readFile(manager, 'utf8')).replace('const ses = session.fromPartition(partition);', `const ses = session.fromPartition(partition); (${fixtureSetup})(ses);`));
  const env = { ...process.env, SAVEX_DESKTOP_DATA_DIR: dataDir, SAVEX_DESKTOP_LEGACY_ORIGIN: 'http://localhost:1', SAVEX_DESKTOP_DISABLE_AUTO_SYNC: '1', SAVEX_DESKTOP_RECOVERY_DELAY_MS: '200' }; delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await _electron.launch({ executablePath: require('electron'), args: [appPath], env });
  try {
    const page = await desktop.firstWindow(); await page.waitForSelector('[data-action="settings"]');
    const origin = new URL(page.url()).origin;
    await page.evaluate(() => window.saveXDesktop.connectSocial({ platform: 'instagram' }));
    await expect.poll(() => page.evaluate(() => window.saveXDesktop.socialAccounts()), { timeout: 20000 }).toContainEqual(expect.objectContaining({ platform: 'instagram', handle: '@iguser', status: 'connected' }));
    const add = name => page.request.post(`${origin}/api/posts/import`, { headers: { Origin: origin }, data: { posts: [{ url: `https://www.instagram.com/p/${name}/`, thumbnail: `https://scontent.cdninstagram.com/${name}-expired.jpg`, sourceAccount: '@iguser' }] } });
    const read = async name => (await (await page.request.get(`${origin}/api/posts?scope=all`)).json()).posts.find(post => post.url.includes(`/${name}/`));
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(win => win.isVisible()).length), { timeout: 10000 }).toBe(1);
    // Windows open and close quickly here, so note any that appears from now on.
    await desktop.evaluate(({ app }) => { globalThis.shownWindows = 0; app.on('browser-window-created', (_event, win) => { if (win.isVisible()) globalThis.shownWindows++; win.once('show', () => { globalThis.shownWindows++; }); }); });

    assert.equal((await add('Fresh')).status(), 200);
    await expect.poll(() => read('Fresh').then(post => post.thumbnail), { timeout: 30000 }).toBe('https://scontent.cdninstagram.com/Fresh-fresh.jpg');
    assert.match((await read('Fresh')).text, /Caption read from Fresh/);
    assert.deepEqual((await read('Fresh')).accounts, ['@iguser']);
    assert.equal(await desktop.evaluate(() => globalThis.shownWindows), 0, 'recovery windows stay hidden');
    assert.equal((await (await page.request.get(`${origin}/api/sync`)).json()).job, null, 'recovery creates no sync job');

    assert.equal((await add('Gated')).status(), 200);
    const settings = () => { const db = new DatabaseSync(join(dataDir, 'savextension.sqlite'), { readOnly: true }); try { return { paused: Number(db.prepare("SELECT value FROM settings WHERE key='image_recovery_paused:instagram'").get()?.value || 0), attempts: db.prepare("SELECT i.recovery_attempts AS n FROM post_images i JOIN posts p ON p.id=i.post_id WHERE p.url LIKE '%/Gated/%'").get()?.n }; } finally { db.close(); } };
    await expect.poll(() => settings().paused, { timeout: 30000 }).toBeGreaterThan(Date.now() + 23 * 3600000);
    assert.equal(settings().attempts, 0, 'a login page does not count against the save');
    assert.equal((await read('Gated')).thumbnail, 'https://scontent.cdninstagram.com/Gated-expired.jpg');
  } finally { await desktop.close(); await rm(dir, { recursive: true, force: true }); }
});
