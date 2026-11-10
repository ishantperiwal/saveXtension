import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, cp, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function fixtureSetup(ses) {
  if (ses.__fixtureInstalled) return;
  ses.__fixtureInstalled = true;
  ses.protocol.handle('https', async request => {
    const { hostname, pathname } = new URL(request.url);
    if (hostname !== 'www.instagram.com') return new Response('', { status: 404 });
    const label = { NowGone: 'Save', StillHere: 'Saved' }[pathname.match(/^\/p\/(\w+)/)?.[1]];
    if (label) return new Response(`<!doctype html><meta charset="utf-8"><body><nav><a href="/iguser/" aria-label="Profile">Profile</a></nav><main><article><a href="${pathname}"><time>Today</time></a><section><button>L<svg aria-label="Like"></svg></button><button>C<svg aria-label="Comment"></svg></button><button>S<svg aria-label="${label}"></svg></button></section></article></main>`, { headers: { 'Content-Type': 'text/html' } });
    return new Response(`<!doctype html><meta charset="utf-8"><body><nav><a href="/iguser/saved/">Saved</a><a href="/explore/">Explore</a></nav><main><article><h1>Post at ${pathname}</h1></article></main>`, { headers: { 'Content-Type': 'text/html' } });
  });
}

test('a save in the panel starts a quiet check, and an unsave, or opening a post that shows as unsaved, starts a check of that post', { timeout: 180000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-post-save-')), appPath = join(dir, 'application'), dataDir = join(dir, 'library');
  await mkdir(appPath);
  for (const name of ['desktop', 'server', 'public', 'extension']) await cp(resolve(name), join(appPath, name), { recursive: true });
  await cp(resolve('package.json'), join(appPath, 'package.json')); await symlink(resolve('node_modules'), join(appPath, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const manager = join(appPath, 'desktop/social.mjs');
  await writeFile(manager, (await readFile(manager, 'utf8')).replace('const ses = session.fromPartition(partition);', `const ses = session.fromPartition(partition); (${fixtureSetup})(ses);`));
  const env = { ...process.env, SAVEX_DESKTOP_DATA_DIR: dataDir, SAVEX_DESKTOP_LEGACY_ORIGIN: 'http://localhost:1', SAVEX_DESKTOP_DISABLE_AUTO_SYNC: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  // The fake Instagram above answers without using the network, which the save detection can't see, so the site's requests go to a real server.
  const site = createServer((_request, response) => { response.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); response.end('{}'); });
  site.listen(0, '127.0.0.1'); await once(site, 'listening');
  const siteUrl = `http://127.0.0.1:${site.address().port}`;
  let watcher;
  const desktop = await _electron.launch({ executablePath: require('electron'), args: [appPath], env });
  try {
    const page = await desktop.firstWindow(); await page.waitForSelector('[data-action="settings"]');
    const origin = new URL(page.url()).origin, panel = page.locator('#post-panel');
    await page.evaluate(() => window.saveXDesktop.connectSocial({ platform: 'instagram' }));
    await expect.poll(() => page.evaluate(() => window.saveXDesktop.socialAccounts()), { timeout: 20000 }).toContainEqual(expect.objectContaining({ platform: 'instagram', status: 'connected' }));
    const jobs = () => { const db = new DatabaseSync(join(dataDir, 'savextension.sqlite'), { readOnly: true }); try { return db.prepare('SELECT targets,quiet,mode FROM sync_jobs').all().map(row => ({ ...row })); } finally { db.close(); } };
    const open = async link => {
      await page.evaluate(href => { const a = Object.assign(document.createElement('a'), { href, target: '_blank', rel: 'noopener noreferrer' }); document.body.append(a); a.click(); a.remove(); }, link);
      await expect(panel).toBeVisible();
      await expect.poll(() => desktop.evaluate(({ webContents }, link) => webContents.getAllWebContents().find(contents => contents.getURL() === link && !contents.isLoading())?.id, link), { timeout: 15000 }).toBeTruthy();
    };
    const post = (link, path) => desktop.evaluate(({ webContents }, { link, path }) => webContents.getAllWebContents().find(contents => contents.getURL() === link).executeJavaScript(`fetch(${JSON.stringify(path)}, { method: 'POST' }).then(response => response.status)`), { link, path });
    const close = async () => { await panel.locator('.post-panel-close').click(); await expect(panel).toBeHidden(); };

    // Just looking, or liking, starts nothing.
    await open('https://www.instagram.com/p/Looked/');
    assert.equal(await post('https://www.instagram.com/p/Looked/', `${siteUrl}/api/v1/web/likes/1/like/`), 200);
    await close();
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.deepEqual(jobs(), []);

    await open('https://www.instagram.com/p/Saved/');
    assert.equal(await post('https://www.instagram.com/p/Saved/', `${siteUrl}/api/v1/web/save/123/save/`), 200);
    await expect.poll(jobs, { timeout: 10000, message: 'it starts with the post still open' }).toEqual([{ targets: '["instagram"]', quiet: 1, mode: 'quick' }]);
    await expect(panel).toBeVisible();
    await close();
    // The library behind it shows nothing about a background check that found nothing.
    assert.equal((await (await page.request.get(`${origin}/api/sync`)).json()).job, null);
    await expect(page.locator('#sync-status')).toBeHidden();

    // A finished check's record is cleared once the library has shown it, so note each one that appears.
    const checked = new Set(); watcher = setInterval(() => { const db = new DatabaseSync(join(dataDir, 'savextension.sqlite'), { readOnly: true }); try { for (const row of db.prepare('SELECT external_id FROM unsave_requests WHERE verify_only=1').all()) checked.add(row.external_id); } finally { db.close(); } }, 50);
    const unsaves = () => [...checked].sort();
    const add = name => page.request.post(`${origin}/api/posts/import`, { headers: { Origin: origin }, data: { posts: [{ url: `https://www.instagram.com/p/${name}/`, sourceAccount: '@iguser' }] } });

    // Opening a post that still shows as saved, or one the library doesn't have, starts nothing.
    assert.equal((await add('StillHere')).status(), 200);
    await open('https://www.instagram.com/p/StillHere/');
    await new Promise(resolve => setTimeout(resolve, 2500));
    await close();
    await open('https://www.instagram.com/p/NotInLibrary/');
    await close();
    assert.deepEqual(unsaves(), []);

    // Opening one that shows as not saved starts a check of it, with no unsave made in the panel.
    assert.equal((await add('NowGone')).status(), 200);
    await page.evaluate(() => { const a = Object.assign(document.createElement('a'), { href: 'https://www.instagram.com/p/NowGone/', target: '_blank', rel: 'noopener noreferrer' }); document.body.append(a); a.click(); a.remove(); });
    await expect(panel).toBeVisible();
    await expect.poll(unsaves, { timeout: 15000 }).toEqual(['NowGone']);
    await close();
    assert.equal((await add('DA5')).status(), 200);
    await open('https://www.instagram.com/p/DA5/');
    assert.equal(await post('https://www.instagram.com/p/DA5/', `${siteUrl}/api/v1/web/save/12345/unsave/`), 200);
    await expect.poll(unsaves, { timeout: 120000, message: 'it waits its turn behind the check before it' }).toEqual(['DA5', 'NowGone']);
  } finally { clearInterval(watcher); await desktop.close(); site.close(); await rm(dir, { recursive: true, force: true }); }
});
