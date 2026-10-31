import { test, expect } from '@playwright/test';
import { openSyncOptions, closeSyncOptions } from './select-helper.mjs';

const post = (id, platform, accounts, archived = false) => ({ id, platform, accounts, archived, url: platform === 'x' ? `https://x.com/writer/status/${900000000 + id}` : platform === 'instagram' ? 'https://www.instagram.com/p/Test/' : 'https://example.com', topics: [], notes: '', folders: [], savedAt: '2026-11-01T10:00:00Z' });
async function setup(page) {
  const queued = []; let job = null;
  await page.clock.setFixedTime(new Date('2026-11-01T12:00:00Z'));
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [post(1, 'x', ['@one', '@two']), post(2, 'x', ['@two']), post(3, 'x', ['@one'], true), post(4, 'instagram', ['@ig']), post(5, 'chrome', [])], runs: [] } }));
  await page.route('**/api/sync', route => {
    if (route.request().method() === 'POST') { const input = route.request().postDataJSON(); queued.push(input); job = { ...input, id: 'sync-options-job', status: 'queued' }; }
    return route.fulfill({ json: { lastSyncedAt: '2026-11-01T11:37:00Z', browser: { online: true, ready: true, syncModes: true, accountSwitching: true, selectedAccounts: true, bookmarksReady: true, bookmarksSupported: true }, job, xAccounts: { active: '@one', accounts: [{ handle: '@one' }, { handle: '@two' }, { handle: '@three' }] } } });
  });
  await page.goto('/'); return queued;
}
const chip = (page, value) => page.locator(`#sync-account-choices input[value="${value}"]`);

test('Sync shows its age, account chips and per-account active counts without dropdowns', async ({ page }) => {
  const queued = await setup(page); await expect(page.locator('.sidebar-sync')).toContainText('Synced 23m ago');
  await expect(page.locator('.collection-tools .search')).toHaveCount(1);
  await openSyncOptions(page);
  await expect(page.getByRole('heading', { name: 'Last synced 23 minutes ago', exact: true })).toBeVisible();
  await expect(page.locator('#modal select, #modal [role="combobox"]')).toHaveCount(0);
  await expect(chip(page, 'x:@one').locator('..').locator('.sync-account-count')).toHaveText('1');
  await expect(chip(page, 'x:@two').locator('..').locator('.sync-account-count')).toHaveText('2');
  await expect(chip(page, 'x:@three').locator('..').locator('.sync-account-count')).toHaveText('0');
  await expect(page.getByRole('checkbox', { name: 'Instagram @ig', exact: true })).toBeVisible();
  await chip(page, 'all').check(); await chip(page, 'x:@three').uncheck();
  await closeSyncOptions(page); await page.reload(); await openSyncOptions(page);
  await expect(chip(page, 'x:@three')).not.toBeChecked();
  await closeSyncOptions(page); await page.locator('.sidebar [data-filter="chrome"]').click(); await openSyncOptions(page);
  await expect(chip(page, 'x:@one')).toBeChecked(); await expect(chip(page, 'x:@two')).toBeChecked();
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect.poll(() => queued.length).toBe(1);
  expect(queued[0]).toEqual({ targets: ['chrome', 'x', 'instagram'], xAccount: ['@one', '@two'], mode: 'quick' });
  await expect(page.locator('#modal')).not.toBeVisible();
});

test('All and individual chips support one account, all accounts and empty selections', async ({ page }) => {
  const queued = await setup(page); await openSyncOptions(page);
  await chip(page, 'all').check(); await chip(page, 'all').uncheck();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Deep scan', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'About deep scans', exact: true })).toBeHidden();
  await chip(page, 'x:@two').check();
  const info = page.getByRole('button', { name: 'About deep scans', exact: true });
  const tooltip = page.getByRole('tooltip');
  await info.hover(); await expect(tooltip).toBeVisible(); await expect(tooltip).toContainText('can take a while');
  await page.locator('#sync-options-heading').hover(); await info.focus(); await expect(tooltip).toBeVisible();
  await info.press('Escape'); await expect(tooltip).toBeHidden(); await expect(page.locator('#modal')).toBeVisible();
  await page.getByRole('button', { name: 'Deep scan', exact: true }).click();
  await expect.poll(() => queued.length).toBe(1);
  expect(queued[0]).toEqual({ targets: ['x'], xAccount: '@two', mode: 'deep' });
});

test('closing during readiness cancels sync, and chips fit on mobile', async ({ page }) => {
  const queued = await setup(page); await page.setViewportSize({ width: 390, height: 844 });
  await openSyncOptions(page); await chip(page, 'all').check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/sync-account-chips-mobile.png' });
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(page.locator('.sidebar-sync')).toContainText('Checking…');
  await closeSyncOptions(page); await expect(page.locator('.sidebar-sync')).toBeEnabled(); expect(queued).toHaveLength(0);
});
