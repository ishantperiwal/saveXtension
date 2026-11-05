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

async function desktopLibrary(page, accounts, posts) {
  const state = { browser: { online: true, ready: true, bookmarksReady: true }, nativeSocial: { enabled: true, online: true, accounts }, chromeBrowser: null, job: null }, queued = [], connections = [];
  await page.exposeFunction('nativeAccounts', () => state.nativeSocial.accounts);
  await page.exposeFunction('nativeConnect', options => { connections.push(options); return state.nativeSocial.accounts; });
  await page.addInitScript(() => { window.saveXDesktop = { socialAccounts: () => window.nativeAccounts(), connectSocial: options => window.nativeConnect(options), disconnectSocial: async () => [], connect: async () => null, helperInfo: async () => ({ version: '1.9.0' }), chromeBookmarksFound: async () => true, wakeSocial: async () => true }; });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts, runs: [] } }));
  await page.route('**/api/sync', route => {
    if (route.request().method() === 'POST') { const input = route.request().postDataJSON(); queued.push(input); state.job = { id: `job-${queued.length}`, status: 'queued', targets: input.targets }; return route.fulfill({ json: { job: state.job } }); }
    return route.fulfill({ json: state });
  });
  await page.goto('/'); return { state, queued, connections };
}
const xPost = { id: 1, platform: 'x', accounts: ['@one'], url: 'https://x.com/creator/status/42', text: '', notes: '', topics: [], media: [], collections: [], folders: [] };

test('refreshing all saves syncs only what is connected instead of asking to connect more', async ({ page }) => {
  const { queued } = await desktopLibrary(page, [{ id: 's1', platform: 'x', handle: '@one', status: 'connected' }], [xPost]);
  await page.getByRole('button', { name: 'Refresh all sources', exact: true }).click();
  await page.getByRole('button', { name: 'Quick scan', exact: true }).click();
  await expect.poll(() => queued.length).toBe(1);
  expect(queued[0]).toMatchObject({ targets: ['chrome', 'x'], mode: 'quick' });
  await expect(page.getByRole('heading', { name: 'Connect accounts', exact: true })).toHaveCount(0);
});

test('an empty Instagram page offers sign-in, then syncs as soon as the account connects', async ({ page }) => {
  const { state, queued, connections } = await desktopLibrary(page, [{ id: 's1', platform: 'x', handle: '@one', status: 'connected' }], [xPost]);
  await page.locator('[data-nav-account="instagram:*"]').click();
  const panel = page.getByRole('region', { name: 'Connect Instagram', exact: true });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Sign in to Instagram', exact: true }).click();
  expect(connections).toEqual([{ platform: 'instagram' }]);
  await expect(panel.getByRole('status')).toContainText('Finish signing in');
  state.nativeSocial.accounts.push({ id: 's2', platform: 'instagram', handle: '@me', status: 'connected' });
  await expect.poll(() => queued.length, { timeout: 6000 }).toBe(1);
  expect(queued[0]).toMatchObject({ targets: ['instagram'], instagramAccount: 'current', mode: 'quick' });
  await expect(page.getByRole('region', { name: 'No Instagram saves yet', exact: true }).getByRole('button', { name: 'Syncing…' })).toBeDisabled();
});
