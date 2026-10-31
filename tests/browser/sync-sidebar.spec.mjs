import { test, expect } from '@playwright/test';

const now = new Date('2026-11-01T12:00:00Z');
async function setup(page, timestamp) {
  await page.clock.setFixedTime(now);
  const state = { browser: { online: true, ready: true }, lastSyncedAt: timestamp, job: null, requests: 0 };
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [], runs: [] } }));
  await page.route('**/api/sync', route => {
    if (route.request().method() === 'POST') { state.requests++; state.job = { id: 'sidebar-job', status: 'queued', targets: ['x'] }; }
    return route.fulfill({ json: state });
  });
  await page.goto('/'); return state;
}

test('Sync sits below the logo, displays its age and still starts the selected sync', async ({ page }) => {
  const state = await setup(page, new Date(+now - 90 * 60000).toISOString());
  const button = page.getByRole('button', { name: 'Sync', exact: true });
  await expect(button).toContainText('Synced 1h ago');
  await expect(page.locator('.collection-tools [data-action="sync"]')).toHaveCount(0);
  const logo = await page.locator('.sidebar-header > .brand').boundingBox(), sync = await button.boundingBox(), nav = await page.getByRole('navigation', { name: 'Library' }).boundingBox();
  expect(sync.y).toBeGreaterThan(logo.y + logo.height); expect(sync.y + sync.height).toBeLessThanOrEqual(nav.y);
  await button.click(); await expect.poll(() => state.requests).toBe(1);
  await expect(button).toBeDisabled(); await expect(button).toContainText('Sync queued…');
  state.job = { ...state.job, status: 'completed', updated_at: now.toISOString() }; state.lastSyncedAt = now.toISOString();
  await expect(button).toBeEnabled({ timeout: 6000 }); await expect(button).toContainText('Synced just now');
  await page.reload(); await expect(button).toContainText('Synced just now');
});

test('older sync times survive failed attempts and fit the mobile sidebar', async ({ page }) => {
  const timestamp = new Date(+now - 9 * 86400000).toISOString();
  const state = await setup(page, timestamp), button = page.getByRole('button', { name: 'Sync', exact: true });
  await expect(button).toContainText('Synced 1w ago');
  state.job = { id: 'failed-job', status: 'failed', updated_at: now.toISOString(), message: 'Try again' };
  await expect(page.locator('#sync-status')).toContainText('Try again', { timeout: 6000 });
  await expect(button).toContainText('Synced 1w ago'); await expect(button).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/sidebar-sync-mobile.png' });
});

test('a new library offers Sync saves instead of inventing a last-sync date', async ({ page }) => {
  await setup(page, null);
  await expect(page.getByRole('button', { name: 'Sync', exact: true })).toContainText('Sync saves');
});
