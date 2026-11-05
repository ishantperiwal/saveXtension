import { test, expect } from '@playwright/test';

test('the Chrome page guides loading the helper when Chrome’s bookmarks aren’t found, then imports', async ({ page }) => {
  await page.addInitScript(() => {
    window.calls = [];
    const known = {
      chromeBookmarksFound: async () => false, helperInfo: async () => ({ version: '1.0.0', path: '/helper' }),
      saveHelper: async () => { window.calls.push('save'); return { path: '/Users/me/Downloads/saveXtension Chrome helper' }; },
      openExtensions: async () => { window.calls.push('open'); return true; }, openDownloads: async () => { window.calls.push('downloads'); return true; }, copyText: async text => { window.calls.push(`copy:${text}`); return true; },
      wakeSocial: async () => { window.calls.push('wake'); return true; }
    };
    window.saveXDesktop = new Proxy(known, { get: (target, key) => target[key] || (async () => null) });
  });
  const status = { job: null, browser: { online: true, ready: true, bookmarksReady: true, bookmarksSupported: true, name: 'saveXtension' }, nativeSocial: { enabled: true, online: true, accounts: [] }, chromeBrowser: null, chromeBookmarkTreeAt: null };
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [{ id: 1, platform: 'x', url: 'https://x.com/a/status/1', text: 'A post', notes: '', tags: [], topics: [], folders: [], collections: [], accounts: ['@a'], archived: false, savedAt: '2026-10-31T00:00:00Z' }], topics: [], runs: [], instagramCollections: [] } }));
  await page.route('**/api/sync', route => route.fulfill({ json: status }));
  await page.goto('/');
  await page.locator('[data-filter="chrome"]').click();
  const panel = page.getByRole('region', { name: 'Connect Chrome to bring in your bookmarks' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.chrome-helper-row')).toContainText('Not connected');
  await expect(panel.locator('.chrome-setup-steps'), 'the steps have their own page').toHaveCount(0);
  await panel.getByRole('button', { name: 'Connect', exact: true }).click();
  const setup = page.locator('#sheet');
  await expect(setup.locator('.chrome-setup-steps > li')).toHaveCount(4);
  await expect(setup.locator('.chrome-setup-warning')).toHaveCount(0);
  const stepOne = setup.locator('.chrome-setup-step').first(), text = await stepOne.locator('p').boundingBox(), button = await stepOne.getByRole('button', { name: 'Download', exact: true }).boundingBox();
  expect(button.y, 'the button sits below its step’s text').toBeGreaterThanOrEqual(text.y + text.height);
  await expect(setup.getByRole('status')).toContainText('Waiting for Chrome');
  await expect(setup.locator('.chrome-setup-lead'), 'only the steps and the status').toHaveCount(0);
  await expect(setup.getByRole('button', { name: 'Copy address' })).toHaveCount(0);
  await setup.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(setup.locator('.chrome-setup-steps > li').first()).toContainText('Downloads › saveXtension Chrome helper');
  await expect(setup.locator('.chrome-setup-steps > li').first()).toHaveClass(/is-done/);
  await setup.getByRole('button', { name: 'Open in Chrome' }).click();
  await setup.getByRole('button', { name: 'Open Downloads folder' }).click();
  await expect.poll(() => page.evaluate(() => window.calls)).toEqual(['save', 'open', 'downloads']);
  // Chrome loads the extension: the setup page closes by itself and the import takes over.
  status.chromeBrowser = { online: true, bookmarksReady: true };
  await expect(setup).not.toBeVisible({ timeout: 5000 });
  await expect(panel.getByRole('status')).toContainText('Reading your bookmarks', { timeout: 5000 });
  Object.assign(status, { chromeBookmarkTreeAt: '2026-11-05T00:00:00Z', job: { id: 'j', status: 'queued', targets: ['chrome'], results: [] } });
  const imported = page.getByRole('region', { name: 'Import your Chrome bookmarks' });
  await expect(imported.getByRole('button', { name: 'Importing…' })).toBeDisabled({ timeout: 5000 });
  await expect.poll(() => page.evaluate(() => window.calls.includes('wake'))).toBe(true);
});
