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
  await page.addInitScript(() => { window.saveXDesktop = { socialAccounts: () => window.nativeAccounts(), connectSocial: options => window.nativeConnect(options), disconnectSocial: async () => [], connect: async () => null, helperInfo: async () => ({ version: '1.9.0' }), chromeBookmarksFound: async () => true, wakeSocial: async () => true }; });
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

test('without a Pinterest account its empty page offers sign-in', async ({ page }) => {
  const { connections } = await desktopLibrary(page, [], [xPost]);
  await page.locator('[data-nav-account="pinterest:*"]').click();
  await page.getByRole('region', { name: 'Connect Pinterest', exact: true }).getByRole('button', { name: 'Sign in to Pinterest', exact: true }).click();
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
  await expect(page.locator('#modal')).not.toBeVisible();
  state.chromeBrowser = { online: true, chromeSession: true, chromeSessionSites: ['pinterest', 'x', 'instagram'] };
  await expect(panel.locator('.chrome-helper-row')).toContainText('Connected', { timeout: 5000 });
  await expect(panel.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(0);
});

test('Settings shows the extension’s state in one line and opens setup as its own page with a way back', async ({ page }) => {
  await page.addInitScript(() => { window.helperCalls = []; });
  const { state } = await desktopLibrary(page, [{ id: 's1', platform: 'x', handle: '@one', status: 'connected' }], [xPost]);
  await page.evaluate(() => { window.saveXDesktop.saveHelper = async () => { window.helperCalls.push('save'); return { path: '/Users/me/Downloads/saveXtension Chrome helper' }; }; });
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  const row = page.locator('#chrome-helper-settings');
  await expect(row).toContainText('Chrome extension'); await expect(row).toContainText('Not connected');
  const heading = await page.locator('.native-account-settings h3').boundingBox(), line = await row.boundingBox();
  expect(line.x, 'to the right of the Accounts heading').toBeGreaterThan(heading.x + heading.width);
  expect(Math.abs((line.y + line.height / 2) - (heading.y + heading.height / 2))).toBeLessThan(4);
  await expect(page.locator('#modal .chrome-setup-steps'), 'no steps inline').toHaveCount(0);
  await row.getByRole('button', { name: 'Connect', exact: true }).click();
  const setup = page.locator('#chrome-helper-page');
  await expect(setup.locator('.chrome-setup-steps > li')).toHaveCount(4);
  await expect(setup.getByRole('status')).toContainText('Waiting for Chrome');
  await setup.getByRole('button', { name: 'Download', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.helperCalls)).toEqual(['save']);
  await expect(setup).toContainText('Downloads › saveXtension Chrome helper');
  await expect(page.locator('.chrome-setup'), 'the library behind isn’t replaced').toHaveCount(0);
  state.chromeBrowser = { online: true, chromeSession: true, chromeSessionSites: ['pinterest'] };
  await expect(setup).toContainText('needs updating', { timeout: 5000 });
  state.chromeBrowser = { online: true, chromeSession: true, chromeSessionSites: ['pinterest', 'x', 'instagram'] };
  await expect(setup.getByRole('status')).toContainText('Connected', { timeout: 5000 });
  await expect(setup.locator('.chrome-setup-steps')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(row).toContainText('Connected');
  await expect(row.getByRole('button')).toHaveCount(0);
  await expect(page.locator('.native-account-settings')).toContainText('@one');
  // A connected account offers its saves, not another sign-in.
  await expect(page.locator('.native-account-settings').getByRole('button', { name: 'Reconnect' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Browse saves from @one', exact: true }).click();
  await expect(page.locator('#modal')).not.toBeVisible();
  await expect(page.locator('[data-nav-account="x:@one"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#active-filters')).toContainText('@one');
  await expect(page.locator('.save-card')).toHaveCount(1);
  state.nativeSocial.accounts[0].status = 'needs-login';
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await expect(page.locator('.native-account-settings').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('.native-account-settings').getByRole('button', { name: /^Browse/ })).toHaveCount(0);
});
