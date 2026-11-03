import { chooseSelect, startQuickSync, openSyncOptions } from './select-helper.mjs';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function mockHelper(page, browser = null) {
  await page.context().route('https://platform.twitter.com/**', route => route.abort());
  await page.context().route('https://www.instagram.com/embed.js', route => route.abort());
  const state = { browser, queued: [], setupRequests: 0, downloads: 0 };
  page.on('download', () => state.downloads++);
  await page.route('**/api/sync', async route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON(); state.queued.push(input);
      return route.fulfill({ json: { job: { id: 'test-job', targets: input.targets, status: 'queued' } } });
    }
    return route.fulfill({ json: { browser: state.browser, job: null } });
  });
  await page.route('**/api/sync/setup', route => { state.setupRequests++; return route.fulfill({ json: { ok: true } }); });
  await page.goto('/');
  return state;
}

test('missing helper downloads once, shows installation steps, and resumes the original source automatically', async ({ page }) => {
  const state = await mockHelper(page);
  await chooseSelect(page, 'Sync source', 'instagram');
  const [download] = await Promise.all([page.waitForEvent('download'), startQuickSync(page)]);
  expect(download.suggestedFilename()).toBe('savextension.zip');
  expect((await readFile(await download.path())).subarray(0, 2).toString()).toBe('PK');
  await expect(page.getByRole('heading', { name: 'Install once. Then just Sync.' })).toBeVisible();
  await expect(page.locator('#modal')).toContainText('Load unpacked');
  await expect(page.locator('#modal')).toContainText('chrome://extensions');
  expect(state.queued).toHaveLength(0);
  await page.getByRole('button', { name: 'Check installation' }).click();
  expect(state.downloads).toBe(1);
  await page.screenshot({ path: 'test-results/sync-installation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/sync-installation-mobile.png', fullPage: true });
  state.browser = { online: true, ready: true, name: 'Chrome' };
  await expect(page.locator('#modal')).not.toBeVisible({ timeout: 8000 });
  await expect.poll(() => state.queued.length).toBe(1);
  expect(state.queued[0].targets).toEqual(['instagram']); expect(state.downloads).toBe(1);
});

test('disconnected Chrome never triggers a download and closing setup cancels pending sync', async ({ page }) => {
  const state = await mockHelper(page, { online: false, ready: true, name: 'Chrome' });
  await startQuickSync(page);
  await expect(page.getByRole('heading', { name: 'Open Chrome to sync.' })).toBeVisible();
  await page.getByRole('button', { name: 'Check connection' }).click();
  expect(state.downloads).toBe(0); expect(state.queued).toHaveLength(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  state.browser = { online: true, ready: true, name: 'Chrome' };
  await expect(page.locator('#sync-status')).toBeHidden();
  await openSyncOptions(page);
  await startQuickSync(page);
  await expect.poll(() => state.queued.length).toBe(1);
  expect(state.downloads).toBe(0); await expect(page.locator('#modal')).not.toBeVisible();
});

test('permission setup opens through Chrome and approval resumes sync without another Sync click', async ({ page }) => {
  const state = await mockHelper(page, { online: true, ready: false, name: 'Chrome' });
  await startQuickSync(page);
  await expect(page.getByRole('heading', { name: 'Allow background access once.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open setup in Chrome' }).click();
  await expect.poll(() => state.setupRequests).toBe(1);
  expect(state.downloads).toBe(0); expect(state.queued).toHaveLength(0);
  state.browser = { online: true, ready: true, name: 'Chrome' };
  await expect.poll(() => state.queued.length, { timeout: 8000 }).toBe(1);
  await expect(page.locator('#modal')).not.toBeVisible();
});

test('Chrome bookmark permission is separate from social access and resumes the requested import', async ({ page }) => {
  const state = await mockHelper(page, { online: true, ready: true, bookmarksSupported: true, bookmarksReady: false });
  await chooseSelect(page, 'Sync source', 'chrome');
  await startQuickSync(page);
  await expect(page.getByRole('heading', { name: 'Allow Chrome bookmarks once.' })).toBeVisible();
  await expect(page.locator('#modal')).toContainText('bookmark titles, links and folders');
  expect(state.downloads).toBe(0); expect(state.queued).toHaveLength(0);
  await page.getByRole('button', { name: 'Open setup in Chrome' }).click();
  await expect.poll(() => state.setupRequests).toBe(1);
  state.browser = { online: true, ready: false, bookmarksSupported: true, bookmarksReady: true };
  await expect.poll(() => state.queued.length, { timeout: 8000 }).toBe(1);
  expect(state.queued[0].targets).toEqual(['chrome']); await expect(page.locator('#modal')).not.toBeVisible();
});
