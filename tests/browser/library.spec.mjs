import { chooseSelect, startQuickSync } from './select-helper.mjs';
import { test, expect, chromium } from '@playwright/test';
import { readFile, mkdtemp, rm, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

test.beforeEach(async ({ context }) => {
  await context.route('https://platform.twitter.com/**', route => route.abort());
  await context.route('https://www.instagram.com/embed.js', route => route.abort());
});

test('local library: sync-first navigation, autosaved notes, search and backup', async ({ page, baseURL }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Settings & backups', exact: true })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings & backups' }).click();
  await page.getByLabel('Library name').fill('My inspiration');
  await page.getByRole('button', { name: 'Save name' }).click();
  expect(await page.evaluate(async () => (await (await fetch('/api/session')).json()).name)).toBe('My inspiration');
  await expect(page.locator('.library-name')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Favorites/ })).toHaveCount(0);
  await expect(page.locator('.archive-nav')).toBeVisible();
  await expect(page.locator('.results-meta,.page-heading,.extension-prompt')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a save', exact: true })).toHaveCount(0);
  const before = (await (await page.request.get('/api/posts')).json()).posts;
  // This browsing fixture tests the full library, independently of source-list
  // preferences left by the collection integration tests on the shared server.
  for(const account of new Set(before.filter(post=>post.platform==='instagram').flatMap(post=>post.accounts||[]))) {
    await page.request.post('/api/instagram-save-list',{headers:{Origin:baseURL},data:{account,all:true,collectionIds:[]}});
  }
  const fixtureUrl = 'https://x.com/i/status/111111111';
  const expectedCount = before.length + (before.some(post => post.url === fixtureUrl) ? 0 : 1);
  await page.request.post('/api/posts/import', { headers: { Origin: baseURL }, data: { posts: [{ url: fixtureUrl, title: 'Legacy title', tags: ['old label'], text: 'A design reference' }] } });
  const fixture = (await (await page.request.get('/api/posts')).json()).posts.find(post => post.url === fixtureUrl);
  await page.reload();
  await expect(page.locator('.save-card')).toHaveCount(expectedCount);
  await page.locator(`.save-card[data-post-id="${fixture.id}"]`).getByRole('button', { name: 'Edit note', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Tags', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  await page.locator(`.save-card[data-post-id="${fixture.id}"]`).getByLabel('Note', { exact: true }).fill('Try on Sunday');
  await page.getByRole('searchbox').focus();
  await expect.poll(async () => (await (await page.request.get('/api/posts')).json()).posts.find(post => post.id === fixture.id).notes).toBe('Try on Sunday');
  await page.getByRole('searchbox').fill('Sunday'); await expect(page.locator('.save-card')).toHaveCount(1);
  await page.getByRole('searchbox').fill('missing'); await expect(page.locator('.save-card')).toHaveCount(0);
  await page.getByRole('searchbox').fill(''); await expect(page.locator('.save-card')).toHaveCount(expectedCount);
  await page.screenshot({ path: 'test-results/local-library-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/local-library-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Settings & backups' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export library' }).click()]);
  const backup = JSON.parse(await readFile(await download.path(), 'utf8')); expect(backup.posts.find(post => post.id === fixture.id).notes).toBe('Try on Sunday');
  expect(errors).toEqual([]);
});

test('one click in library collects and enriches in an inactive tab, then closes only its own tab', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'savex-local-extension-'));
  const extension = resolve(profile, 'extension'); await cp(resolve('extension'), extension, { recursive: true });
  // The worker starts before a library tab opens. Keep that first heartbeat on
  // the test server too, rather than contacting a user's running local library.
  const workerPath = resolve(extension, 'background.js');
  await writeFile(workerPath, (await readFile(workerPath, 'utf8')).replace("const DEFAULT_ORIGIN = 'http://localhost:3210'", "const DEFAULT_ORIGIN = 'http://localhost:3211'"));
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push('https://x.com/*', 'https://www.instagram.com/*');
  await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    let [worker] = context.serviceWorkers(); if (!worker) worker = await context.waitForEvent('serviceworker');
    const errors = []; worker.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    let xFixture = await readFile('tests/fixtures/x.html', 'utf8');
    xFixture = '<div role="tab" aria-selected="true">Bookmarks</div>' + xFixture;
    // Simulate X's History route after client-side navigation, and richer detail pages.
    await context.route('https://x.com/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/i/bookmarks') return route.fulfill({ contentType: 'text/html', body: xFixture + '<script>history.replaceState({}, "", "/i/history")</script>' });
      return route.fulfill({ contentType: 'text/html', body: /\/status\//.test(path) ? xFixture.replace('An AI coding workflow you can try today.', 'An AI coding workflow you can try today. Extra detail captured from the post.') : xFixture });
    });
    await context.route('https://pbs.twimg.com/**', route => route.abort());
    const igFixture = await readFile('tests/fixtures/instagram.html', 'utf8');
    await context.route('https://www.instagram.com/**', route => route.fulfill({ contentType: 'text/html', body: new URL(route.request().url()).pathname === '/' ? '<a href="/collection_user/saved/">Saved</a>' : new URL(route.request().url()).pathname === '/collection_user/saved/' ? '<main><a href="/collection_user/saved/all-posts/">All posts</a></main>' : /\/saved\//.test(route.request().url()) ? igFixture : '<meta property="og:description" content="A full Instagram caption from the post, with complete context, creator details and useful design information that the saved grid did not expose."><main><h1>A full Instagram caption from the post, with complete context, creator details and useful design information that the saved grid did not expose.</h1></main>' }));
    await context.route('https://platform.twitter.com/**', route => route.abort());
    await context.route('https://www.instagram.com/embed.js', route => route.abort());
    const library = await context.newPage(); await library.goto('http://localhost:3211'); await library.bringToFront();
    // Account discovery owns a temporary tab too; wait until it has closed before taking the user-tab baseline.
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get('xAccountCatalog')).xAccountCatalog))?.busy, { timeout: 20000 }).toBe(false);
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get('accountScanTabId')).accountScanTabId))).toBeUndefined();
    const initialTabs = await worker.evaluate(async () => (await chrome.tabs.query({})).map(t => t.id));
    const libraryId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
    await startQuickSync(library);
    await expect(library.locator('#sync-status')).toContainText('background', { timeout: 10000 });
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get('syncState')).syncState))?.imported, { timeout: 25000 }).toBe(2);
    expect(await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id)).toBe(libraryId);
    await expect.poll(async () => (await library.evaluate(async () => (await (await fetch('/api/sync')).json()).job))?.status, { timeout: 45000 }).toBe('partial');
    const tabs = await worker.evaluate(async () => (await chrome.tabs.query({})).map(t => t.id)); expect(tabs).toEqual(initialTabs);
    // The X list fixture already has text and authors, so detail visits are skipped.
    const xRun = await worker.evaluate(async () => (await chrome.storage.local.get('syncState')).syncState); expect(xRun.enriched).toBe(0);
    await chooseSelect(library, 'Sync source', 'instagram');
    await startQuickSync(library);
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get('syncState')).syncState))?.platform, { timeout: 15000 }).toBe('instagram');
    await expect.poll(async () => (await library.evaluate(async () => (await (await fetch('/api/sync')).json()).job))?.status, { timeout: 45000 }).toBe('partial');
    const igRun = await worker.evaluate(async () => (await chrome.storage.local.get('syncState')).syncState); expect(igRun.imported).toBe(2); expect(igRun.enriched).toBe(2);
    expect(await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id)).toBe(libraryId);
    const stored = await library.evaluate(async () => (await (await fetch('/api/posts')).json()).posts);
    expect(stored.find(p => p.externalId === 'AbC123_-').text).toContain('full Instagram caption');
    await chooseSelect(library, 'Sync source', 'x');
    await startQuickSync(library);
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get('syncState')).syncState))?.stage).toBe('collecting');
    await library.locator('#sync-status .sync-toast-summary').hover();
    await library.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get('job')).job)), { timeout: 15000 }).toBeUndefined();
    expect(await worker.evaluate(async () => (await chrome.tabs.query({})).map(t => t.id))).toEqual(initialTabs);
    expect((await library.evaluate(async () => (await (await fetch('/api/posts')).json()).posts)).length).toBe(stored.length);
    expect(errors).toEqual([]);
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});
