import { test, expect } from '@playwright/test';
const common = { text: '', author: 'post_creator', notes: '', tags: [], topics: [], folders: [], archived: false, savedAt: '2026-11-01T00:00:00Z' };
const posts = [
  { ...common, id: 501, platform: 'instagram', accounts: ['@same'], url: 'https://www.instagram.com/p/AccountOne/', collections: [{ id: 11 }] },
  { ...common, id: 502, platform: 'instagram', accounts: ['@other'], url: 'https://www.instagram.com/p/AccountTwo/', collections: [{ id: 12 }] },
  { ...common, id: 503, platform: 'instagram', accounts: ['@same', '@other'], url: 'https://www.instagram.com/p/SharedAccount/' },
  { ...common, id: 504, platform: 'x', accounts: ['@same'], url: 'https://x.com/creator/status/199900001' },
  { ...common, id: 505, platform: 'x', accounts: ['@beta'], url: 'https://x.com/creator/status/199900002' },
  { ...common, id: 506, platform: 'instagram', accounts: ['@same'], archived: true, url: 'https://www.instagram.com/p/ArchivedAccount/' }
];
const collections = [{ id: 11, account: '@same', name: 'Design', externalId: '11' }, { id: 12, account: '@other', name: 'Reading', externalId: '12' }];
const row = (page, value) => page.locator(`[data-nav-account="${value}"]`);
const visibleIds = page => page.locator('.save-card').evaluateAll(cards => cards.map(card => Number(card.dataset.postId)));
test.beforeEach(async ({ page }) => {
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts, runs: [], instagramCollections: collections } }));
  await page.route('**/api/sync', route => route.fulfill({ json: { browser: null, job: null, xAccounts: { accounts: [{ handle: '@same' }, { handle: '@beta' }, { handle: '@zero' }] } } }));
  await page.route('https://platform.twitter.com/**', route => route.abort()); await page.route('https://www.instagram.com/embed.js', route => route.abort());
  await page.goto('/');
});

test('handles replace platform groupings and each row filters only that owner on that platform', async ({ page }) => {
  await expect(page.locator('[data-filter="instagram"],[data-filter="x"]')).toHaveCount(0);
  await expect(row(page, 'instagram:@same').locator('.nav-label-text')).toHaveText('@same');
  await expect(row(page, 'instagram:@same').locator('.nav-count')).toHaveText('2');
  await expect(row(page, 'instagram:@other').locator('.nav-count')).toHaveText('2');
  await expect(row(page, 'x:@same').locator('.nav-count')).toHaveText('1');
  await expect(row(page, 'x:@zero').locator('.nav-count')).toHaveText('0');
  await expect(page.locator('.sidebar')).not.toContainText('post_creator');
  await row(page, 'instagram:@same').click(); expect(await visibleIds(page)).toEqual([503, 501]); await expect(row(page, 'instagram:@same')).toHaveAttribute('aria-pressed', 'true');
  await row(page, 'x:@same').click(); expect(await visibleIds(page)).toEqual([504]); await expect(row(page, 'instagram:@same')).toHaveAttribute('aria-pressed', 'false');
  await row(page, 'x:@zero').click(); await expect(page.locator('.save-card')).toHaveCount(0);
  await page.locator('[data-filter="all"]').click(); await expect(page.locator('.save-card')).toHaveCount(5);
});

test('Instagram folders stay beneath their owner, and handles stay visible on mobile', async ({ page }) => {
  await expect(row(page, 'instagram:@same').locator('..').getByRole('list')).toContainText('Design');
  await expect(row(page, 'instagram:@same').locator('..')).not.toContainText('Reading');
  await page.locator('[data-instagram-collection="12"]').click(); expect(await visibleIds(page)).toEqual([502]);
  await expect(row(page, 'instagram:@other')).toHaveAttribute('aria-pressed', 'true');
  await row(page, 'instagram:@same').click(); expect(await visibleIds(page)).toEqual([503, 501]);
  await expect(page.locator('[data-instagram-collection="12"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.archive-nav').click(); await expect(page.locator('.save-card')).toHaveCount(1);
  await row(page, 'instagram:@other').click(); expect(await visibleIds(page)).toEqual([503, 502]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row(page, 'instagram:@same').locator('.nav-label-text')).toBeVisible(); await expect(row(page, 'x:@same').locator('.nav-label-text')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/account-sidebar-mobile.png' });
});
