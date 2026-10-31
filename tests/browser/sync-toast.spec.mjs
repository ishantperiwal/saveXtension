import { test, expect } from '@playwright/test';

async function setup(page) {
  const state = { browser: { online: true, ready: true, bookmarksReady: true }, job: null };
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [], runs: [] } }));
  await page.route('**/api/sync', route => route.fulfill({ json: state }));
  await page.goto('/'); return state;
}

test('sync progress floats at the bottom right without moving the collection, and can be stopped or dismissed', async ({ page }) => {
  const state = await setup(page), toast = page.locator('#sync-status');
  const before = await page.locator('#results').boundingBox();
  let stops = 0;
  await page.route('**/api/sync/stop', async route => { stops++; state.job = { ...state.job, status: 'cancelled' }; await route.fulfill({ json: {} }); });
  state.job = { id: 'toast-active', status: 'running', mode: 'deep', targets: ['x', 'instagram'], message: 'Instagram · scanning older saved posts' };
  await expect(toast).toBeVisible({ timeout: 6000 });
  await expect(toast).toHaveCSS('opacity', '1');
  await expect(toast).toContainText('Deep scanning Instagram');
  await expect(toast.locator('.source-icon-instagram')).toHaveCount(1);
  await expect(toast.locator('.source-icon-x')).toHaveCount(0);
  expect((await page.locator('#results').boundingBox()).y).toBe(before.y);
  expect(await toast.evaluate(element => !element.closest('main'))).toBeTruthy();
  const box = await toast.boundingBox(), viewport = page.viewportSize();
  expect(viewport.width - box.x - box.width).toBe(24); expect(viewport.height - box.y - box.height).toBe(24);
  await page.getByRole('button', { name: 'Stop', exact: true }).click(); await expect.poll(() => stops).toBe(1); await expect(toast).toBeHidden();
  state.job = { id: 'toast-failed', status: 'failed', targets: ['instagram'], message: 'Instagram: No tab with id: 2128255104.' };
  await expect(toast).toContainText('The background Instagram tab closed', { timeout: 6000 });
  await expect(toast).not.toContainText('2128255104'); await expect(toast).toHaveAttribute('data-tone', 'warning');
  await page.getByRole('button', { name: 'Dismiss sync status' }).click(); await expect(toast).toBeHidden();
  await page.reload(); await expect(toast).toBeHidden();
});

test('finished notices fade away, later jobs still appear, and the notification fits on a phone', async ({ page }) => {
  const state = await setup(page), toast = page.locator('#sync-status');
  state.job = { id: 'toast-finishes', status: 'running', targets: ['chrome'], message: 'Chrome · reading bookmarks' };
  await expect(toast).toBeVisible({ timeout: 6000 });
  state.job = { ...state.job, status: 'completed', message: '23 bookmarks synced' };
  await expect(toast).toContainText('Sync complete', { timeout: 6000 });
  await expect(toast).toBeHidden({ timeout: 10000 });
  state.job = { id: 'toast-next', status: 'running', targets: ['chrome', 'x', 'instagram'], message: 'Syncing your saves in the background' };
  await expect(toast).toBeVisible({ timeout: 6000 }); await expect(toast.locator('.source-icon')).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toast).toHaveCSS('opacity', '1');
  const box = await toast.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(16); expect(box.x + box.width).toBeLessThanOrEqual(374); expect(box.y + box.height).toBeLessThanOrEqual(828);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/sync-toast-mobile.png' });
});
