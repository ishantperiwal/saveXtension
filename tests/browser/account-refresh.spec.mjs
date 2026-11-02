import { test, expect } from '@playwright/test';
const savedSelection = ['x:@one', 'x:@two', 'instagram:current', 'chrome:*'];
const basePost = { text: '', notes: '', topics: [], tags: [], folders: [], collections: [], archived: false, savedAt: '2026-11-02T00:00:00Z' };
async function setup(page, browser = { online: true, ready: true, accountSwitching: true, selectedAccounts: true, bookmarksReady: false }) {
  const state = { browser, job: null, queued: [] };
  await page.addInitScript(value => localStorage.setItem('savex-sync-accounts', JSON.stringify(value)), savedSelection);
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [
    { ...basePost, id: 1, platform: 'x', accounts: ['@one'], url: 'https://x.com/a/status/100' },
    { ...basePost, id: 2, platform: 'x', accounts: ['@two'], url: 'https://x.com/a/status/200' },
    { ...basePost, id: 3, platform: 'instagram', accounts: ['@ig'], url: 'https://www.instagram.com/p/RefreshTest/' }
  ], runs: [] } }));
  await page.route('**/api/sync', route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON(); state.queued.push(input); state.job = { ...input, id: 'targeted-refresh', status: 'queued' };
      return route.fulfill({ json: { job: state.job } });
    }
    return route.fulfill({ json: { browser: state.browser, job: state.job, xAccounts: { active: '@one', accounts: [{ handle: '@one' }, { handle: '@two' }] } } });
  });
  await page.goto('/'); return state;
}
test('edge refresh button grows on hover and refreshes exactly one X account without changing browsing or normal Sync choices', async ({ page }) => {
  const state = await setup(page);
  await page.locator('[data-nav-account="x:@two"]').click();
  const refresh = page.getByRole('button', { name: 'Refresh X @two', exact: true });
  await expect(refresh).toBeVisible(); await expect(page.locator('.sidebar-selection-marks > span')).toHaveCount(0);
  const row = await page.locator('[data-nav-account="x:@two"]').boundingBox(), circle = await refresh.boundingBox(), sidebar = await page.locator('.sidebar').boundingBox();
  expect(Math.abs(circle.y + circle.height / 2 - row.y - row.height / 2)).toBeLessThan(1);
  expect(Math.abs(circle.x + circle.width / 2 - sidebar.x)).toBeLessThan(2);
  await refresh.hover(); await expect(refresh).toHaveCSS('transform', 'matrix(1.2, 0, 0, 1.2, 0, 0)');
  await page.screenshot({ path: 'test-results/account-refresh-desktop.png' });
  await refresh.click();
  await expect.poll(() => state.queued).toEqual([{ targets: ['x'], xAccount: '@two', mode: 'quick' }]);
  await expect(page.locator('[data-nav-account="x:@two"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('savex-sync-accounts')))).toEqual(savedSelection);
  await expect(refresh).toBeDisabled(); await expect(refresh).toHaveAttribute('aria-busy', 'true');
  state.job = { ...state.job, status: 'completed' };
  await expect(refresh).toBeEnabled({ timeout: 6000 });
  await refresh.focus(); await page.waitForTimeout(2200); await expect(refresh).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(refresh).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/account-refresh-mobile.png' });
});
test('account refresh retains its exact target when Chrome reconnects, and closing setup cancels it', async ({ page }) => {
  const state = await setup(page, { online: false, ready: true, accountSwitching: true });
  await page.locator('[data-nav-account="x:@one"]').click();
  await page.getByRole('button', { name: 'Refresh X @one', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Open Chrome to sync.' })).toBeVisible();
  state.browser = { online: true, ready: true, accountSwitching: true, bookmarksReady: false };
  await expect.poll(() => state.queued, { timeout: 8000 }).toEqual([{ targets: ['x'], xAccount: '@one', mode: 'quick' }]);
  await expect(page.locator('#modal')).not.toBeVisible();
  state.job = null; state.browser = { online: false, ready: true };
  await expect(page.getByRole('button', { name: 'Refresh X @one', exact: true })).toBeEnabled({ timeout: 6000 });
  await page.getByRole('button', { name: 'Refresh X @one', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Open Chrome to sync.' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  state.browser = { online: true, ready: true, accountSwitching: true };
  await page.waitForTimeout(2400); expect(state.queued).toHaveLength(1);
});
