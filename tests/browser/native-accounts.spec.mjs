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
  await page.getByRole('button', { name: 'Sign in manually', exact: true }).click();
  await expect.poll(() => queued.length, { timeout: 6000 }).toBe(1);
  expect(connections).toEqual([{ platform: 'x', expectedHandle: '@one' }]);
  expect(queued[0]).toMatchObject({ targets: ['x'], xAccount: '@one', mode: 'quick' });
  await expect(page.locator('#modal')).not.toBeVisible();
  state.job = null;
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await expect(page.locator('.native-account-settings')).toContainText('@one');
  await expect(page.locator('.native-account-settings h3')).toHaveText('Accounts · 1 connected');
  await expect(page.getByRole('button', { name: 'Add Instagram account', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Instagram account', exact: true })).toHaveText('Add Instagram');
  const row = page.locator('.native-connect-actions'), pills = await row.locator('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
  expect(new Set(pills).size, 'the pills stay on one row').toBe(1);
  await expect(row).toHaveCSS('overflow-x', 'auto');
  await page.screenshot({ path: 'test-results/native-account-settings.png' });
});

async function desktopLibrary(page, accounts, posts, instagramCollections = []) {
  const state = { browser: { online: true, ready: true, bookmarksReady: true }, nativeSocial: { enabled: true, online: true, accounts }, chromeBrowser: null, job: null }, queued = [], connections = [];
  await page.exposeFunction('nativeAccounts', () => state.nativeSocial.accounts);
  await page.exposeFunction('nativeConnect', options => { connections.push(options); return state.nativeSocial.accounts; });
  await page.addInitScript(() => { window.saveXDesktop = { socialAccounts: () => window.nativeAccounts(), connectSocial: options => window.nativeConnect(options), disconnectSocial: async () => [], connect: async () => null, helperInfo: async () => ({ version: '1.9.0' }), chromeBookmarksFound: async () => true, wakeSocial: async () => true, browseSocial: async id => { (window.browsed ||= []).push(id); return true; } }; });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts, runs: [], instagramCollections } }));
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
  await page.getByRole('button', { name: 'Sign in manually', exact: true }).click();
  await expect.poll(() => connections.length).toBe(1);
  expect(connections).toEqual([{ platform: 'instagram' }]);
  await expect(panel.getByRole('status')).toContainText('Finish signing in');
  state.nativeSocial.accounts.push({ id: 's2', platform: 'instagram', handle: '@me', status: 'connected' });
  await expect.poll(() => queued.length, { timeout: 6000 }).toBe(1);
  expect(queued[0]).toMatchObject({ targets: ['instagram'], instagramAccount: 'current', mode: 'quick' });
  await expect(page.getByRole('region', { name: 'No Instagram saves yet', exact: true }).getByRole('button', { name: 'Syncing…' })).toBeDisabled();
});

test('Pinterest appears in the desktop sidebar with boards as sub-rows that filter and refresh', async ({ page }) => {
  const pin = { id: 7, platform: 'pinterest', accounts: ['@maker'], url: 'https://www.pinterest.com/pin/555/', text: 'A pin', thumbnail: '', notes: '', topics: [], tags: [], media: [], folders: [], archived: false, savedAt: '2026-10-31T00:00:00Z', collections: [{ id: 40, platform: 'pinterest', account: '@maker', externalId: 'game-assets', name: 'Game Assets', url: 'https://www.pinterest.com/maker/game-assets/' }] };
  const other = { ...pin, id: 8, url: 'https://www.pinterest.com/pin/556/', text: 'Another pin', collections: [] };
  const { queued } = await desktopLibrary(page, [{ id: 's1', platform: 'pinterest', handle: '@maker', status: 'connected' }], [pin, other], [{ id: 40, platform: 'pinterest', account: '@maker', externalId: 'game-assets', name: 'Game Assets', url: 'https://www.pinterest.com/maker/game-assets/', count: 1 }]);
  const account = page.locator('[data-nav-account="pinterest:@maker"]');
  await expect(account.locator('.nav-count')).toHaveText('2');
  await expect(page.locator('#pinterest-navigation .source-icon-pinterest')).toBeVisible();
  await account.click();
  await expect(page.locator('.save-card')).toHaveCount(2);
  await expect(page.locator('.save-card.pinterest .unsave-button')).toHaveCount(0);
  // Like Instagram, clicking the account row also folds its list; unfold it to reach a board.
  await page.getByRole('button', { name: 'Toggle Pinterest boards for @maker', exact: true }).click();
  const board = page.locator('[data-instagram-collection="40"]');
  await expect(board).toContainText('Game Assets');
  await board.click();
  await expect(page.locator('.save-card')).toHaveCount(1);
  await expect(page.locator('#active-filters')).toContainText('Game Assets');
  await page.getByRole('button', { name: 'Refresh Pinterest @maker · Game Assets', exact: true }).click();
  await expect.poll(() => queued.length).toBe(1);
  expect(queued[0]).toMatchObject({ targets: ['pinterest'], pinterestAccount: '@maker', pinterestCollectionId: 40, mode: 'quick' });
});

test('a refused action says what is blocked and why, stays above dialogs, and offers Stop scan', async ({ page }) => {
  const { state } = await desktopLibrary(page, [], [xPost]), stops = [];
  await page.route('**/api/sync/stop', route => { stops.push(true); state.job = null; return route.fulfill({ json: { job: null } }); });
  state.job = { id: 'running', status: 'running', targets: ['x'], xAccount: 'current', mode: 'quick', results: [] };
  await page.reload();
  await page.evaluate(() => { window.saveXDesktop.connectSocial = async () => { throw new Error("Error invoking remote method 'savex-desktop': Error: Can’t connect an account during a scan or unsave"); }; });
  await page.locator('[data-nav-account="pinterest:*"]').click();
  await page.getByRole('region', { name: 'Connect Pinterest', exact: true }).getByRole('button', { name: 'Sign in to Pinterest', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in manually', exact: true }).click();
  const notice = page.locator('#toast');
  await expect(notice).toBeVisible(); await expect(notice).toHaveClass(/error/);
  await expect(notice).toContainText('Can’t connect an account during a scan or unsave');
  await expect(notice).toContainText('Scans and unsaves use your signed-in accounts');
  await expect(notice).not.toContainText('Error invoking');
  await notice.getByRole('button', { name: 'Stop scan', exact: true }).click();
  await expect.poll(() => stops.length).toBe(1);
  await expect(notice).toBeHidden();
});

test('without a Pinterest account its empty page offers sign-in', async ({ page }) => {
  const { connections } = await desktopLibrary(page, [], [xPost]);
  await page.locator('[data-nav-account="pinterest:*"]').click();
  await page.getByRole('region', { name: 'Connect Pinterest', exact: true }).getByRole('button', { name: 'Sign in to Pinterest', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in manually', exact: true }).click();
  await expect.poll(() => connections.length).toBe(1);
  expect(connections).toEqual([{ platform: 'pinterest' }]);
});

test('an empty source page shows the extension as one line, with the steps on their own page', async ({ page }) => {
  const { state } = await desktopLibrary(page, [], [xPost]);
  await page.locator('[data-nav-account="pinterest:*"]').click();
  const panel = page.getByRole('region', { name: 'Connect Pinterest', exact: true });
  await expect(panel.locator('.chrome-helper-row')).toContainText('Not connected');
  await expect(panel.locator('.chrome-setup-steps')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect the Chrome extension', exact: true })).toBeVisible();
  await expect(page.locator('#chrome-helper-page .chrome-setup-steps > li')).toHaveCount(4);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('#sheet')).not.toBeVisible();
  state.chromeBrowser = { online: true, chromeSession: true, chromeSessionSites: ['pinterest', 'x', 'instagram'] };
  await expect(panel.locator('.chrome-helper-row')).toContainText('Connected', { timeout: 5000 });
  await expect(panel.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(0);
});

test('Settings shows the extension’s state in one line and opens setup as its own page with a way back', async ({ page }) => {
  await page.addInitScript(() => { window.helperCalls = []; });
  const { state } = await desktopLibrary(page, [{ id: 's1', platform: 'x', handle: '@one', status: 'connected' }], [xPost]);
  await page.evaluate(() => { window.saveXDesktop.saveHelper = async () => { window.helperCalls.push('save'); return { path: '/Users/me/Downloads/saveXtension Chrome helper' }; }; });
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  const row = page.locator('#chrome-helper-settings'), about = page.locator('#chrome-helper-about');
  await expect(row, 'the status shows while closed').toHaveText('Not connected');
  await expect(about).toBeHidden();
  await page.getByRole('button', { name: 'Chrome extension', exact: true }).click();
  await expect(about).toContainText('Add accounts in one click using your Chrome logins, with no passwords.');
  await expect(page.locator('#modal .chrome-setup-steps'), 'no steps inline').toHaveCount(0);
  await about.getByRole('button', { name: 'Connect extension', exact: true }).click();
  const setup = page.locator('#chrome-helper-page');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true }), 'Settings stays open underneath').toBeAttached();
  await expect(page.locator('#modal')).toHaveClass(/is-behind/);
  await expect(setup.locator('.chrome-setup-steps > li')).toHaveCount(4);
  await expect(setup.getByRole('status')).toContainText('Waiting for Chrome');
  await setup.getByRole('button', { name: 'Download', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.helperCalls)).toEqual(['save']);
  await expect(setup).toContainText('Downloads › saveXtension Chrome helper');
  await expect(page.locator('.chrome-setup'), 'the library behind isn’t replaced').toHaveCount(0);
  state.chromeBrowser = { online: true, chromeSession: true, chromeSessionSites: ['pinterest'] };
  await expect(setup).toContainText('needs updating', { timeout: 5000 });
  state.chromeBrowser = { online: true, chromeSession: true, chromeSessionSites: ['pinterest', 'x', 'instagram'] };
  await expect(setup.getByRole('status')).toContainText('Connected to Chrome', { timeout: 5000 });
  await expect(setup.locator('.chrome-setup-steps')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to settings', exact: true }).click();
  await expect(page.locator('#sheet')).not.toBeVisible();
  await expect(page.locator('#modal')).not.toHaveClass(/is-behind/);
  await expect(row).toContainText('Connected');
  await expect(row.getByRole('button')).toHaveCount(0);
  await expect(page.locator('.native-account-settings')).toContainText('@one');
  // A connected account opens its own window rather than offering another sign-in.
  await expect(page.locator('.native-account-settings').getByRole('button', { name: 'Reconnect' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Browse @one on X', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.browsed)).toEqual(['s1']);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true }), 'Settings stays open').toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  state.nativeSocial.accounts[0].status = 'needs-login';
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await expect(page.locator('.native-account-settings').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('.native-account-settings').getByRole('button', { name: /^Browse/ })).toHaveCount(0);
});
