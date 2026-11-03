import { test, expect } from '@playwright/test';

const base = { text: 'Saved reference', notes: '', tags: [], folders: [], collections: [], archived: false, savedAt: '2026-10-31T00:00:00Z' };
async function setup(page) {
  const model = { posts: [
    { ...base, id: 1, platform: 'x', accounts: ['@one', '@two'], topics: ['AI & models', 'Tools'], url: 'https://x.com/writer/status/1001' },
    { ...base, id: 2, platform: 'instagram', accounts: ['@ig'], topics: ['AI & models'], collections: [{ id: 10 }], url: 'https://www.instagram.com/p/CollectionOne/' },
    { ...base, id: 3, platform: 'chrome', accounts: [], topics: ['AI & models'], bookmarkTitle: 'A useful tool', url: 'https://example.org/tool' },
    { ...base, id: 4, platform: 'x', accounts: ['@one'], topics: ['Coding'], url: 'https://x.com/writer/status/1002' },
    { ...base, id: 5, platform: 'instagram', accounts: ['@ig'], topics: ['AI & models'], archived: true, url: 'https://www.instagram.com/p/ArchivedOne/' }
  ], topics: [{ id: 'ai', name: 'AI & models' }, { id: 'empty', name: 'Future ideas', description: 'An empty local collection' }] };
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { ...model, runs: [], instagramCollections: [{ id: 10, account: '@ig', name: 'Instagram folder' }] } }));
  await page.route('**/api/sync', route => route.fulfill({ json: { job: null, browser: null } }));
  await page.goto('/'); return model;
}
const ids = page => page.locator('.save-card').evaluateAll(cards => cards.map(card => Number(card.dataset.postId)));
const collection = (page, name) => page.locator('[data-nav-topic]').filter({ has: page.locator('.nav-label-text', { hasText: new RegExp(`^${name}$`) }) });

test('Accounts and Collections browse the same library with cross-source counts and exclusive navigation', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('tab', { name: 'Accounts', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Accounts', exact: true })).toBeVisible();
  await page.locator('[data-nav-account="x:@one"]').click(); expect(await ids(page)).toEqual([4, 1]);
  const player = await page.locator('.save-card[data-post-id="1"]').elementHandle();
  await page.getByRole('tab', { name: 'Collections', exact: true }).click();
  expect(await player.evaluate(el => el.isConnected)).toBe(true);
  await expect(page.getByRole('tabpanel', { name: 'Accounts', exact: true })).toBeHidden();
  await expect(page.locator('.sidebar-account-refresh')).toHaveCount(0);
  await expect(collection(page, 'AI & models').locator('.nav-count')).toHaveText('3');
  await expect(collection(page, 'Future ideas').locator('.nav-count')).toHaveText('0');
  await expect(page.locator('#topic-navigation')).not.toContainText('Instagram folder');
  await collection(page, 'AI & models').click(); expect(await ids(page)).toEqual([3, 2, 1]);
  await expect(collection(page, 'AI & models')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await page.screenshot({ path: 'test-results/sidebar-collections-desktop.png', animations: 'disabled' });
  const all = page.locator('[data-filter="all"]');
  await expect(all).toBeVisible();
  const count = await all.boundingBox(), tabs = await page.getByRole('tablist').boundingBox();
  expect(count.y + count.height).toBeLessThan(tabs.y);
  await all.click(); expect(await ids(page)).toEqual([4, 3, 2, 1]);
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('tab', { name: 'Collections', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Refresh all sources', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Refresh all sources', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('tab', { name: 'Accounts', exact: true }).click();
  await page.locator('.archive-nav').click(); expect(await ids(page)).toEqual([5]);
  await page.getByRole('tab', { name: 'Collections', exact: true }).click();
  await collection(page, 'Tools').click(); expect(await ids(page)).toEqual([1]);
  await page.getByRole('tab', { name: 'Accounts', exact: true }).click();
  await page.locator('[data-nav-account="instagram:@ig"]').click(); expect(await ids(page)).toEqual([2]);
  await page.locator('[data-filter="all"]').click(); expect(await ids(page)).toEqual([4, 3, 2, 1]);
});

test('collections update from MCP catalogs and changed memberships without losing tab or focus', async ({ page }) => {
  const model = await setup(page);
  await page.getByRole('tab', { name: 'Collections', exact: true }).click();
  await collection(page, 'AI & models').click();
  model.topics.push({ id: 'new', name: 'New MCP collection' });
  await expect(collection(page, 'New MCP collection')).toBeVisible({ timeout: 8000 });
  await expect(collection(page, 'AI & models')).toBeFocused();
  model.posts[2] = { ...model.posts[2], archived: true };
  await expect(collection(page, 'AI & models').locator('.nav-count')).toHaveText('2', { timeout: 8000 });
  expect(await ids(page)).toEqual([2, 1]);
  await collection(page, 'Future ideas').click(); await expect(page.locator('.save-card')).toHaveCount(0);
  await expect(page.getByText('No saves here yet', { exact: true })).toBeVisible();
});

test('sidebar tabs support keyboard navigation, persist their view and fit a phone', async ({ page }) => {
  await setup(page);
  const accounts = page.getByRole('tab', { name: 'Accounts', exact: true }), collections = page.getByRole('tab', { name: 'Collections', exact: true });
  await accounts.focus(); await page.keyboard.press('ArrowRight');
  await expect(collections).toBeFocused(); await expect(collections).toHaveAttribute('tabindex', '0'); await expect(accounts).toHaveAttribute('tabindex', '-1');
  await page.reload(); await expect(collections).toHaveAttribute('aria-selected', 'true');
  await collections.focus(); await page.keyboard.press('Home'); await expect(accounts).toBeFocused();
  await page.keyboard.press('End'); await expect(collections).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await collection(page, 'AI & models').click(); await expect(page.locator('.save-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/sidebar-collections-mobile.png', animations: 'disabled' });
});
