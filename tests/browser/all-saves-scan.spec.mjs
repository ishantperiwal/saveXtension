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

// All saves sits below the tabs with its count on the right; its left refresh button
// runs a quick scan like every account row, and right-clicking opens both modes.
test('All saves defaults its refresh button to quick scan and offers both modes on right-click without changing saved account choices', async ({ page }) => {
  const model = await setup(page);
  const all = page.getByRole('button', { name: 'All saves 4', exact: true });
  await expect(all).toBeVisible(); await expect(all.locator('.nav-count')).toHaveText('4');
  await all.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Quick scan and refresh', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Deep scan and refresh', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const refresh = page.getByRole('button', { name: 'Refresh all sources', exact: true });
  await refresh.click();
  await expect.poll(() => model.queued).toEqual([{ targets: ['chrome', 'x', 'instagram'], xAccount: 'all', mode: 'quick' }]);
  await expect(page.locator('#modal')).not.toBeVisible(); await expect(refresh).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('savex-sync-accounts')))).toEqual(['x:@one']);
  model.job = { ...model.job, status: 'completed' }; await expect(refresh).toBeEnabled({ timeout: 6000 });
  await page.locator('[data-nav-account="x:@two"]').click(); await expect(page.locator('.save-card')).toHaveCount(1);
  await expect(refresh).toHaveCount(0);
  await all.click(); await expect(page.locator('.save-card')).toHaveCount(4); await expect(refresh).toBeVisible();
});

test('deep scan via right-click targets all sources even with an empty settings selection, retains its scope through reconnecting, and cancels if closed during readiness', async ({ page }) => {
  const model = await setup(page, { offline: true, selection: [] });
  const all = page.getByRole('button', { name: 'All saves 4', exact: true });
  const refresh = page.getByRole('button', { name: 'Refresh all sources', exact: true });
  await all.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Deep scan and refresh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Open Chrome to sync.', exact: true })).toBeVisible();
  model.browser.online = true;
  await expect.poll(() => model.queued, { timeout: 8000 }).toEqual([{ targets: ['chrome', 'x', 'instagram'], xAccount: 'all', mode: 'deep' }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('savex-sync-accounts')))).toEqual([]);
  model.job = { ...model.job, status: 'completed' }; await expect(refresh).toBeEnabled({ timeout: 6000 });
  model.browser.online = false;
  await refresh.click();
  await expect(page.getByRole('heading', { name: 'Open Chrome to sync.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  model.browser.online = true;
  await expect(refresh).toBeEnabled({ timeout: 6000 }); expect(model.queued).toHaveLength(1);
});

test('All saves count updates for active records, handles singular and zero, and the context menu fits a phone', async ({ page }) => {
  const model = await setup(page);
  model.posts = [model.posts[0], model.posts[4]];
  await expect(page.getByRole('button', { name: 'All saves 1', exact: true })).toBeVisible({ timeout: 8000 });
  model.posts = [model.posts[1]];
  await expect(page.getByRole('button', { name: 'All saves 0', exact: true })).toBeVisible({ timeout: 8000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-filter="all"]').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Quick scan and refresh', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Deep scan and refresh', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
