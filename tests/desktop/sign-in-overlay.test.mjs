import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import { mkdtemp, mkdir, cp, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function pinterestFixture(ses) {
  if (ses.__pinFixtureInstalled) return;
  ses.__pinFixtureInstalled = true;
  ses.protocol.handle('https', async request => {
    const url = new URL(request.url);
    if (!url.hostname.endsWith('pinterest.com')) return new Response('', { status: 404 });
    const cookies = await ses.cookies.get({ url: request.url });
    const authed = cookies.some(cookie => cookie.name === '_auth' && cookie.value === '1');
    const html = authed
      ? `<!doctype html><meta charset="utf-8"><script id="__PWS_DATA__" type="application/json">{"context":{"user":{"username":"pinuser","full_name":"Pin User"}}}</script><body><h1>Pinterest home</h1></body>`
      : `<!doctype html><meta charset="utf-8"><body><h1>Pinterest login</h1><button onclick="document.cookie='_auth=1; Path=/; Max-Age=86400; Secure; SameSite=Lax'; location.reload()">Log in as @pinuser</button></body>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  });
}

test('sign-in window guides users while checking Chrome and clears cleanly when skipped or not signed in', { timeout: 90000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-overlay-')), appPath = join(dir, 'application');
  await mkdir(appPath);
  for (const name of ['desktop', 'server', 'public', 'extension']) await cp(resolve(name), join(appPath, name), { recursive: true });
  await cp(resolve('package.json'), join(appPath, 'package.json'));
  await symlink(resolve('node_modules'), join(appPath, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const manager = join(appPath, 'desktop/social.mjs');
  await writeFile(manager, (await readFile(manager, 'utf8')).replace('const ses = session.fromPartition(partition);', `const ses = session.fromPartition(partition); (${pinterestFixture})(ses);`));
  const env = { ...process.env, SAVEX_DESKTOP_DATA_DIR: join(dir, 'library'), SAVEX_DESKTOP_LEGACY_ORIGIN: 'http://localhost:1', SAVEX_DESKTOP_DISABLE_AUTO_SYNC: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await _electron.launch({ executablePath: require('electron'), args: [appPath], env });
  try {
    const page = await desktop.firstWindow();
    await page.route('**/api/meaning', route => route.fulfill({ json: { available: false } }));
    await page.waitForSelector('[data-action="settings"]');
    const origin = new URL(page.url()).origin;
    const extHeaders = { Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Content-Type': 'application/json' };
    const heartbeat = async () => {
      const response = await page.request.post(origin + '/api/extension/jobs', {
        headers: extHeaders,
        data: { instance: 'chrome-test', name: 'Chrome', chromeSession: true, chromeSessionSites: ['pinterest'], ready: true, claim: false }
      });
      return response.json();
    };
    const sendSession = (id, cookies) => page.request.post(origin + '/api/extension/chrome-session', {
      headers: extHeaders,
      data: { id, instance: 'chrome-test', cookies }
    });
    const overlayText = () => desktop.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(item => !item.webContents.getURL().startsWith('http://127.0.0.1') && !item.webContents.getURL().startsWith('http://localhost') && item.contentView.children.some(view => view.webContents));
      const view = win?.contentView.children.find(child => child.webContents);
      if (!view) return null;
      return view.webContents.executeJavaScript('document.body.innerText');
    });
    const overlayCount = () => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(item => !item.webContents.getURL().startsWith('http://127.0.0.1') && !item.webContents.getURL().startsWith('http://localhost')).reduce((sum, win) => sum + win.contentView.children.length, 0));

    await heartbeat();
    await expect.poll(async () => (await (await page.request.get(origin + '/api/sync')).json()).chromeBrowser?.online).toBe(true);

    // 1. User clicks "Sign in manually" directly on the overlay: overlay disappears immediately so they can sign in below.
    const nextSocialWindow = async trigger => {
      const before = new Set(desktop.windows());
      await trigger();
      await expect.poll(() => desktop.windows().some(w => !before.has(w) && w.url().startsWith('https://')), { timeout: 10000 }).toBe(true);
      return desktop.windows().find(w => !before.has(w) && w.url().startsWith('https://'));
    };
    const win1 = await nextSocialWindow(() => page.evaluate(() => window.saveXDesktop.connectSocial({ platform: 'pinterest' })));
    await expect.poll(overlayCount).toBe(1);
    await expect.poll(overlayText).toContain('Checking Chrome for Pinterest…');
    await expect.poll(overlayText).toContain('Hold on — we’ll bring you right back.');
    await desktop.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(item => !item.webContents.getURL().startsWith('http://127.0.0.1') && !item.webContents.getURL().startsWith('http://localhost') && item.contentView.children.length > 0);
      return win.contentView.children[0].webContents.executeJavaScript("document.getElementById('manual').click()");
    });
    await expect.poll(overlayCount).toBe(0);
    await win1.getByRole('button', { name: 'Log in as @pinuser' }).click();
    await expect.poll(() => page.evaluate(() => window.saveXDesktop.socialAccounts())).toContainEqual(expect.objectContaining({ platform: 'pinterest', handle: '@pinuser', status: 'connected' }));
    await expect.poll(() => win1.isClosed()).toBe(true);
    const connected = await page.evaluate(() => window.saveXDesktop.socialAccounts());
    await page.evaluate(id => window.saveXDesktop.disconnectSocial(id), connected[0].id);

    // 2. Chrome isn't signed in: overlay gets removed automatically once Chrome responds without a session cookie.
    const win2 = await nextSocialWindow(() => page.evaluate(() => window.saveXDesktop.connectSocial({ platform: 'pinterest' })));
    await expect.poll(overlayCount).toBe(1);
    const job2 = await heartbeat();
    assert.equal(job2.chromeSessionRequest?.platform, 'pinterest');
    await sendSession(job2.chromeSessionRequest.id, []);
    await expect.poll(overlayCount, { timeout: 5000 }).toBe(0);
    await win2.close();

    // 3. Chrome IS signed in: overlay transitions to connecting state and closes the window automatically.
    const win3 = await nextSocialWindow(() => page.evaluate(() => window.saveXDesktop.connectSocial({ platform: 'pinterest' })));
    await expect.poll(overlayCount).toBe(1);
    const job3 = await heartbeat();
    assert.equal(job3.chromeSessionRequest?.platform, 'pinterest');
    await sendSession(job3.chromeSessionRequest.id, [{
      name: '_auth', value: '1', domain: '.pinterest.com', hostOnly: false, path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction'
    }]);
    await expect.poll(() => page.evaluate(() => window.saveXDesktop.socialAccounts()), { timeout: 15000 }).toContainEqual(expect.objectContaining({ platform: 'pinterest', handle: '@pinuser', status: 'connected' }));
    await expect.poll(() => win3.isClosed()).toBe(true);
    assert.equal(await overlayCount(), 0);
  } finally {
    await desktop.close();
    await rm(dir, { recursive: true, force: true });
  }
});
