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
  await expect.poll(() => page.locator('.sidebar nav .nav-item:not(.instagram-collection)').evaluateAll(items => items.map(item => item.dataset.navAccount || item.dataset.filter || item.dataset.action))).toEqual(['all', 'x:@beta', 'x:@same', 'x:@zero', 'chrome', 'instagram:@other', 'instagram:@same']);
  await expect(page.locator('.sidebar nav')).toHaveCSS('scrollbar-width', 'none');
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
  await page.setViewportSize({width:1280,height:560});
  const archived=page.getByRole('button',{name:'Archived 1',exact:true});
  await expect(archived).toBeVisible();
  const before=await archived.boundingBox(),sidebar=await page.locator('.sidebar').boundingBox();
  expect(Math.abs(before.y+before.height-(sidebar.y+sidebar.height-17))).toBeLessThan(2);
  await page.locator('.sidebar nav').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  expect(Math.abs((await archived.boundingBox()).y-before.y)).toBeLessThan(1);
  expect(await page.locator('.sidebar-footer').evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).toContain('linear-gradient');
  await page.getByRole('tab',{name:'Topics',exact:true}).click();await expect(archived).toBeVisible();
  await archived.click();await expect(page.getByRole('heading',{name:'Archived',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/archived-sidebar-footer.png'});
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

test('Instagram chevrons toggle each owner independently and remember the choice', async ({ page }) => {
  const toggle = page.getByRole('button', { name: 'Toggle Instagram collections for @same', exact: true });
  const folders = page.getByRole('list', { name: 'Instagram collections for @same', exact: true });
  const otherFolders = page.getByRole('list', { name: 'Instagram collections for @other', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.locator('[data-instagram-collection="11"]').click();
  expect(await visibleIds(page)).toEqual([501]);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(folders).toBeHidden(); await expect(otherFolders).toBeVisible();
  expect(await visibleIds(page)).toEqual([501]);
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await expect(folders).toBeHidden();
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(folders).toBeVisible(); await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toBeFocused();
  const account = row(page, 'instagram:@same');
  await account.locator('.nav-label-text').click();
  await expect(folders).toBeHidden(); await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(account).toHaveAttribute('aria-expanded', 'false');
  await expect(otherFolders).toBeVisible();
  expect(await visibleIds(page)).toEqual([503, 501]);
  await account.focus(); await page.keyboard.press('Space');
  await expect(folders).toBeVisible(); await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(account).toHaveAttribute('aria-expanded', 'true'); await expect(account).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await toggle.click(); await expect(folders).toBeHidden();
  await toggle.click(); await expect(folders).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('long handles truncate and collection chevrons sit after the handle and before the count', async ({ page }) => {
  const handle = '@this_is_a_very_long_instagram_handle';
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: {
    posts: [{ ...common, id: 601, platform: 'instagram', accounts: [handle], url: 'https://www.instagram.com/p/LongHandle/' }], runs: [],
    instagramCollections: [{ id: 21, account: handle, name: 'Design references' }]
  } }));
  await page.reload();
  const account = row(page, `instagram:${handle}`), label = account.locator('.nav-label-text');
  const toggle = page.getByRole('button', { name: `Toggle Instagram collections for ${handle}`, exact: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(label).toBeVisible(); await expect(toggle).toBeVisible(); await expect(account.locator('.nav-count')).toBeVisible();
    const l = await label.boundingBox(), t = await toggle.boundingBox(), c = await account.locator('.nav-count').boundingBox();
    expect(t.x).toBeGreaterThanOrEqual(l.x + l.width - 1); expect(t.x - l.x - l.width).toBeLessThan(8);
    expect(t.x + t.width).toBeLessThanOrEqual(c.x);
    expect(await label.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(account).toHaveAttribute('title', `Instagram ${handle}`);
    await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
  await page.screenshot({ path: 'test-results/sidebar-handle-chevron-mobile.png', animations: 'disabled' });
});
