import { test, expect } from '@playwright/test';

const common = { text: 'Saved reference', topics: [], notes: '', folders: [], tags: [], accounts: [], archived: false, savedAt: '2026-10-31T12:00:00Z' };
async function setup(page, { offline = false, selection = ['x:@one'] } = {}) {
  const model = { queued: [], job: null, browser: { online: !offline, ready: true, bookmarksReady: true, bookmarksSupported: true, syncModes: true, accountSwitching: true, selectedAccounts: true, instagramCollections: true }, posts: [
    { ...common, id: 1, platform: 'x', accounts: ['@one'], url: 'https://x.com/writer/status/1111' },
    { ...common, id: 2, platform: 'x', accounts: ['@two'], url: 'https://x.com/writer/status/2222' },
    { ...common, id: 3, platform: 'instagram', accounts: ['@ig'], url: 'https://www.instagram.com/p/AllSources/' },
    { ...common, id: 4, platform: 'chrome', url: 'https://example.org/reference' },
    { ...common, id: 5, platform: 'instagram', archived: true, url: 'https://www.instagram.com/p/ArchivedSource/' }
  ] };
  await page.addInitScript(value => localStorage.setItem('savex-sync-accounts', JSON.stringify(value)), selection);
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: model.posts, runs: [] } }));
  await page.route('**/api/sync', route => {
    if (route.request().method() === 'POST') { const request = route.request().postDataJSON(); model.queued.push(request); model.job = { ...request, id: 'all-sources-scan', status: 'queued' }; }
    return route.fulfill({ json: { browser: model.browser, job: model.job, xAccounts: { active: '@one', accounts: [{ handle: '@one' }, { handle: '@two' }] } } });
  });
  await page.goto('/'); return model;
}

test('save count replaces All saves and its refresh offers both modes for every source without changing saved account choices', async ({ page }) => {
  const model = await setup(page);
  await expect(page.getByRole('button', { name: '4 saves', exact: true })).toBeVisible();
  await expect(page.locator('.saves-nav-row .nav-count')).toHaveCount(0);
  await page.locator('[data-nav-account="x:@two"]').click(); await expect(page.locator('.save-card')).toHaveCount(1);
  const refresh = page.getByRole('button', { name: 'Refresh all sources', exact: true });
  await refresh.click(); await expect(page.getByRole('heading', { name: 'Refresh all sources', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quick scan', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deep scan', exact: true })).toBeVisible();
  await expect(page.locator('.scan-choice').filter({ hasText: 'Deep scan' })).toContainText('takes longer');
  await page.screenshot({ path: 'test-results/all-sources-scan-desktop.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Quick scan', exact: true }).click();
  await expect.poll(() => model.queued).toEqual([{ targets: ['chrome', 'x', 'instagram'], xAccount: 'all', mode: 'quick' }]);
  await expect(page.locator('#modal')).not.toBeVisible(); await expect(refresh).toBeDisabled();
  await expect(page.locator('[data-nav-account="x:@two"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('savex-sync-accounts')))).toEqual(['x:@one']);
  model.job = { ...model.job, status: 'completed' }; await expect(refresh).toBeEnabled({ timeout: 6000 });
  await page.getByRole('button', { name: '4 saves', exact: true }).click(); await expect(page.locator('.save-card')).toHaveCount(4);
});

test('deep scan targets all sources even with an empty settings selection, retains its scope through reconnecting, and cancels if closed during readiness', async ({ page }) => {
  const model = await setup(page, { offline: true, selection: [] });
  const refresh = page.getByRole('button', { name: 'Refresh all sources', exact: true });
  await refresh.click(); await page.getByRole('button', { name: 'Deep scan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Open Chrome to sync.', exact: true })).toBeVisible();
  model.browser.online = true;
  await expect.poll(() => model.queued, { timeout: 8000 }).toEqual([{ targets: ['chrome', 'x', 'instagram'], xAccount: 'all', mode: 'deep' }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('savex-sync-accounts')))).toEqual([]);
  model.job = { ...model.job, status: 'completed' }; await expect(refresh).toBeEnabled({ timeout: 6000 });
  await refresh.click(); await page.getByRole('button', { name: 'Quick scan', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(refresh).toBeEnabled({ timeout: 6000 }); expect(model.queued).toHaveLength(1);
});

test('save count updates for active records, handles singular and zero, and the scan options fit a phone', async ({ page }) => {
  const model = await setup(page);
  model.posts = [model.posts[0], model.posts[4]];
  await expect(page.getByRole('button', { name: '1 save', exact: true })).toBeVisible({ timeout: 8000 });
  model.posts = [model.posts[1]];
  await expect(page.getByRole('button', { name: '0 saves', exact: true })).toBeVisible({ timeout: 8000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Refresh all sources', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Quick scan', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/all-sources-scan-mobile.png', animations: 'disabled' });
});
