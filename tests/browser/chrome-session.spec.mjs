import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../../server/app.mjs';
import { prepareHelper } from '../../desktop/runtime.mjs';

test('the real Chrome helper hands over one site’s cookies once, and no other site’s', async () => {
  test.setTimeout(120000);
  const origin = 'http://localhost:3291', dir = await mkdtemp(join(tmpdir(), 'savex-session-'));
  const app = createApp({ origin, nativeTransport: { instance: 'native-test', token: 'test-only-native-capability' } });
  app.server.listen(3291, '127.0.0.1'); await once(app.server, 'listening');
  const helper = await prepareHelper(resolve('extension'), join(dir, 'helper'), origin);
  const context = await chromium.launchPersistentContext(join(dir, 'profile'), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${helper}`, `--load-extension=${helper}`] });
  try {
    const later = Math.floor(Date.now() / 1000) + 86400;
    await context.addCookies([
      { name: '_auth', value: '1', domain: '.pinterest.com', path: '/', secure: true, httpOnly: true, sameSite: 'None', expires: later },
      { name: '_pinterest_sess', value: 'signed-in-session', domain: '.pinterest.com', path: '/', secure: true, httpOnly: true, sameSite: 'None', expires: later },
      { name: 'csrftoken', value: 'regional', domain: 'in.pinterest.com', path: '/', secure: true, sameSite: 'Lax', expires: later },
      { name: 'uk_cookie', value: 'regional-uk', domain: '.pinterest.co.uk', path: '/', secure: true, sameSite: 'Lax', expires: later },
      { name: 'SID', value: 'google-session', domain: '.google.com', path: '/', secure: true, httpOnly: true, sameSite: 'None', expires: later },
      { name: 'auth_token', value: 'x-session', domain: '.x.com', path: '/', secure: true, httpOnly: true, sameSite: 'None', expires: later },
      { name: 'lookalike', value: 'nope', domain: '.pinterest.evil.com', path: '/', secure: true, sameSite: 'None', expires: later }
    ]);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await expect.poll(() => app.sync.status().chromeBrowser?.chromeSession, { timeout: 30000 }).toBe(true);
    // Nothing is sent until a sign-in asks, and an extension's check-in alone reveals no request.
    expect(app.sync.takeChromeSession('anything')).toBe(null);
    const id = app.sync.requestChromeSession('pinterest');
    await worker.evaluate(() => chrome.alarms.create('savex-sync', { when: Date.now() + 200 }));
    let cookies = null;
    await expect.poll(() => cookies ||= app.sync.takeChromeSession(id), { timeout: 40000, intervals: [300] }).toBeTruthy();
    expect(cookies.map(cookie => cookie.name).sort()).toEqual(['_auth', '_pinterest_sess', 'csrftoken', 'uk_cookie']);
    expect(cookies.find(cookie => cookie.name === '_pinterest_sess')).toMatchObject({ value: 'signed-in-session', domain: '.pinterest.com', httpOnly: true, secure: true, hostOnly: false });
    expect(cookies.find(cookie => cookie.name === 'csrftoken')).toMatchObject({ domain: 'in.pinterest.com', hostOnly: true });
    expect(app.sync.takeChromeSession(id), 'one handoff only').toBe(null);
    // X and Instagram work the same way, each receiving only its own cookies.
    expect(app.sync.status().chromeBrowser.chromeSessionSites.sort()).toEqual(['instagram', 'pinterest', 'x']);
    await context.addCookies([{ name: 'sessionid', value: 'instagram-session', domain: '.instagram.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax', expires: later }, { name: 'twitter_old', value: 'old', domain: '.twitter.com', path: '/', secure: true, sameSite: 'None', expires: later }]);
    for (const [site, names] of [['x', ['auth_token', 'twitter_old']], ['instagram', ['sessionid']]]) {
      const siteId = app.sync.requestChromeSession(site);
      await worker.evaluate(() => chrome.alarms.create('savex-sync', { when: Date.now() + 200 }));
      let received = null;
      await expect.poll(() => received ||= app.sync.takeChromeSession(siteId), { timeout: 40000, intervals: [300] }).toBeTruthy();
      expect(received.map(cookie => cookie.name).sort()).toEqual(names);
    }
  } finally { await context.close(); await app.mcp.close(); app.server.closeAllConnections(); await new Promise(done => app.server.close(done)); app.store.close(); await rm(dir, { recursive: true, force: true }); }
});
