import { test, expect, chromium } from '@playwright/test';
import { readFile, mkdtemp, rm, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chooseSelect, openSyncOptions, startQuickSync, startDeepSync } from './select-helper.mjs';

test('the collection tree keeps mobile controls in place and filters shared posts', async ({ page }, testInfo) => {
  const collections = [{ id: 101, account: '@me', name: 'Design notes' }, { id: 102, account: '@me', name: '❤️' }];
  const post = { id: 901, platform: 'instagram', externalId: 'CollectionPreview', url: 'https://www.instagram.com/p/CollectionPreview/', collections, accounts: ['@me'], topics: [], tags: [], folders: [], notes: '', text: '', title: '', savedAt: new Date().toISOString(), archived: false };
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [post], instagramCollections: collections, runs: [] } }));
  await page.route('**/api/sync', route => route.fulfill({ json: { job: null, browser: null } }));
  await page.route('https://www.instagram.com/embed.js', route => route.abort());
  await page.goto('/');
  await expect(page.locator('[data-instagram-collection]')).toHaveCount(2);
  await page.locator('[data-instagram-collection="101"]').click();
  await expect(page.locator('.save-card')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('compact-collection-toolbar-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  const sidebar = await page.locator('.sidebar').boundingBox(), settings = await page.getByRole('button', { name: 'Settings & backups', exact: true }).boundingBox();
  expect(settings.width).toBeLessThanOrEqual(40); expect(settings.x).toBeGreaterThan(sidebar.x + sidebar.width - 80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.locator('.sidebar').screenshot({ path: testInfo.outputPath('instagram-collection-tree-mobile.png') });
});

for (const [mode, limited] of [['quick',false], ['deep',false], ['quick',true], ['deep',true]]) test(`Instagram ${mode}${limited ? ' selected-list' : ''} sync discovers creator-prefixed collection posts and links existing saves`, async ({ baseURL }, testInfo) => {
  test.setTimeout(120000);
  const profile = await mkdtemp(resolve(tmpdir(), 'savex-ig-collections-'));
  const extension = resolve(profile, 'extension'); await cp(resolve('extension'), extension, { recursive: true });
  const backgroundPath = resolve(extension, 'background.js');
  await writeFile(backgroundPath, (await readFile(backgroundPath, 'utf8')).replace("const DEFAULT_ORIGIN = 'http://localhost:3210'", `const DEFAULT_ORIGIN = ${JSON.stringify(baseURL)}`));
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push('https://x.com/*', 'https://www.instagram.com/*');
  await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const shell = body => `<html><head><meta charset="utf-8"></head><body><a href="/collection_user/" aria-label="Profile"><img alt="collection_user profile picture"></a><main>${body}</main></body></html>`;
  const post = (id, collection = false) => `<a href="${collection ? '/reference.creator' : ''}/p/${id}/"><img alt="Saved reference ${id}"></a>`;
  const catalog = '<a href="/collection_user/saved/all-posts/" aria-label="All Posts">All Posts</a><a href="/collection_user/saved/design/1001/" aria-label="Design notes">Design notes</a><a href="/collection_user/saved/_/1002/" aria-label="❤️">❤️</a>';
  const detailVisits = [], savedVisits = []; let page;
  try {
    await context.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: '<a data-testid="AppTabBar_Profile_Link" href="/test_account">Profile</a>' }));
    await context.route('https://www.instagram.com/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.includes('/saved/') && path !== '/collection_user/saved/') savedVisits.push(path);
      if (path === '/embed.js') return route.abort();
      let body;
      if (path === '/') body = shell('<a href="/collection_user/saved/">Saved</a>');
      else if (path === '/collection_user/saved/') body = shell(catalog);
      else if (path.includes('/1001/')) body = shell(['Shared', 'DesignOnly'].map(id => post(id, true)).join(''));
      else if (path.includes('/1002/')) body = shell(['Shared', 'HeartOnly'].map(id => post(id, true)).join(''));
      else if (path.includes('/all-posts/')) body = shell(['Shared', 'DesignOnly', 'HeartOnly'].map(id => post(id)).join(''));
      else { detailVisits.push(path); body = shell('Unavailable'); }
      return route.fulfill({ contentType: 'text/html', body });
    });
    let [worker] = context.serviceWorkers(); if (!worker) worker = await context.waitForEvent('serviceworker');
    page = await context.newPage(); await page.goto(`${baseURL}/`);
    // These posts predate collection support. Their global presence must not skip membership discovery.
    await page.evaluate(async limited => {
      const headers = { 'Content-Type': 'application/json' };
      const previous = (await (await fetch('/api/posts?scope=all')).json()).posts;
      for (const post of previous.filter(post => post.platform === 'instagram' && (post.accounts||[]).includes('@collection_user'))) {
        await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
      }
      const { runId } = await (await fetch('/api/extension/runs', { method: 'POST', headers, body: JSON.stringify({ platform: 'instagram', account: '@collection_user' }) })).json();
      await fetch(`/api/extension/runs/${runId}`, { method: 'POST', headers, body: JSON.stringify({ details: true, posts: (limited ? ['Shared'] : ['Shared', 'DesignOnly', 'HeartOnly']).map(id => ({ url: `https://www.instagram.com/p/${id}/`, text: 'Already saved', author: 'creator' })) }) });
      await fetch(`/api/extension/runs/${runId}/finish`, { method: 'POST', headers, body: JSON.stringify({ status: 'completed' }) });
      const catalog = (await (await fetch('/api/extension/instagram-collections', {method:'POST', headers, body:JSON.stringify({account:'@collection_user',collections:[{externalId:'1001',name:'Design notes',url:'https://www.instagram.com/collection_user/saved/design/1001/'},{externalId:'1002',name:'❤️',url:'https://www.instagram.com/collection_user/saved/_/1002/'}]})})).json()).collections;
      await fetch('/api/instagram-save-list',{method:'POST',headers,body:JSON.stringify({account:'@collection_user',collectionIds:limited?[catalog.find(c=>c.externalId==='1001').id]:null})});
    }, limited);
    await page.reload();
    const job = () => page.evaluate(async () => (await (await fetch('/api/sync')).json()).job);
    const previousJobId = (await job())?.id;
    await chooseSelect(page, 'Sync source', 'instagram');
    if (mode === 'deep') {
      await startDeepSync(page);
    } else await startQuickSync(page);
    await expect(page.getByRole('list', { name: /^Instagram collections for/ })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-instagram-collection]')).toHaveCount(limited?1:2);
    await expect.poll(async () => (await job())?.id, { timeout: 10000 }).not.toBe(previousJobId);
    await expect.poll(async () => (await job())?.status, { timeout: 75000 }).toBe('partial');
    expect((await job()).mode).toBe(mode);
    await expect(page.locator('[data-instagram-collection]').filter({ hasText: 'Design notes' })).toContainText('2', { timeout: 7000 });
    await page.locator('[data-instagram-collection]').filter({ hasText: 'Design notes' }).click();
    await expect(page.locator('.save-card')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Design notes', exact: true })).toHaveClass('sr-only');
    if (!limited) await expect(page.locator('[data-instagram-collection]').filter({ hasText: '❤️' })).toBeVisible({ timeout: 7000 });
    if (!limited) { await page.locator('[data-instagram-collection]').filter({ hasText: '❤️' }).click(); await expect(page.locator('.save-card')).toHaveCount(2); }
    const saved = await page.evaluate(async () => (await (await fetch('/api/posts?scope=all')).json()).posts.filter(p => p.platform === 'instagram'));
    expect(saved).toHaveLength(limited?2:3); expect(saved.find(p => p.externalId === 'Shared').collections).toHaveLength(limited?1:2);
    if(limited){expect(savedVisits.some(path=>path.includes('/all-posts/')||path.includes('/1002/'))).toBe(false);expect(savedVisits.some(path=>path.includes('/1001/'))).toBe(true);}
    expect(detailVisits).toHaveLength(0);
    const branch = await page.locator('.instagram-collections > li').first().evaluate(el => getComputedStyle(el, '::after').borderLeftWidth);
    expect(branch).toBe('1px');
    await page.screenshot({ path: testInfo.outputPath('instagram-collections-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath('instagram-collections-mobile.png') });
    const foreground = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].url);
    expect(foreground).toBe(`${baseURL}/`);
    await page.reload(); await expect(page.locator('[data-instagram-collection]')).toHaveCount(limited?1:2);
  } finally {
    if (page && !page.isClosed()) await page.evaluate(() => fetch('/api/sync/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).catch(() => {});
    await context.close(); await rm(profile, { recursive: true, force: true });
  }
});
