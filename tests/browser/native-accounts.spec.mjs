import { test, expect } from '@playwright/test';

test('desktop connects a selected social account in-app and resumes its exact scan without a Chrome installation flow', async ({ page }) => {
  const state = { browser: { online: true, ready: false, bookmarksReady: false }, nativeSocial: { enabled: true, online: true, accounts: [] }, chromeBrowser: null, job: null };
  const connections = [], queued = [];
  await page.exposeFunction('nativeAccounts', () => state.nativeSocial.accounts);
  await page.exposeFunction('nativeProbe', () => state.browser);
  await page.exposeFunction('nativeConnect', options => {
    connections.push(options);
    state.nativeSocial.accounts.push({ id: 'session-one', platform: options.platform, handle: options.expectedHandle || '@one', status: 'connected' });
    state.browser.ready = true; return state.nativeSocial.accounts;
  });
  await page.addInitScript(() => { window.saveXDesktop = { socialAccounts: () => window.nativeAccounts(), connectSocial: options => window.nativeConnect(options), disconnectSocial: async () => [], connect: () => window.nativeProbe(), helperInfo: async () => ({ version: '1.9.0' }) }; });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [{ id: 1, platform: 'x', accounts: ['@one'], url: 'https://x.com/creator/status/42', text: '', notes: '', topics: [], media: [], collections: [], folders: [] }], runs: [] } }));
  await page.route('**/api/sync', route => {
    if (route.request().method() === 'POST') { queued.push(route.request().postDataJSON()); state.job = { id: 'native-job', status: 'queued', targets: ['x'] }; return route.fulfill({ json: { job: state.job } }); }
    return route.fulfill({ json: state });
  });
  await page.goto('/'); await page.locator('[data-nav-account="x:@one"]').click();
  await page.getByRole('button', { name: 'Refresh X @one', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect accounts', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect @one', exact: true })).toBeVisible();
  await expect(page.getByText('Install once. Then just Sync.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect @one', exact: true }).click();
  await expect.poll(() => queued.length, { timeout: 6000 }).toBe(1);
  expect(connections).toEqual([{ platform: 'x', expectedHandle: '@one' }]);
  expect(queued[0]).toMatchObject({ targets: ['x'], xAccount: '@one', mode: 'quick' });
  await expect(page.locator('#modal')).not.toBeVisible();
  state.job = null;
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await expect(page.locator('.native-account-settings')).toContainText('@one');
  await expect(page.locator('.native-account-settings h3')).toHaveText('Accounts · 1');
  await expect(page.getByRole('button', { name: 'Add Instagram account', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/native-account-settings.png' });
});
