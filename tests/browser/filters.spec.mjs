import { test, expect } from '@playwright/test';
test.use({ timezoneId: 'Asia/Kolkata' });

const base = { title: '', author: '', authorName: '', text: '', thumbnail: '', media: [], kind: 'text', tags: [], topics: ['Design'], accounts: [], folders: [], notes: '', favorite: false, archived: false };
const fixtures = [
  { ...base, id: 701, platform: 'chrome', url: 'https://filters.example/today', bookmarkTitle: 'Today reference', savedAt: '2026-11-01T10:00:00+05:30', publishedAt: '2026-10-15T10:00:00+05:30', notes: 'Try this' },
  { ...base, id: 702, platform: 'x', url: 'https://x.com/i/status/700000002', savedAt: '2026-10-31T23:59:00+05:30', kind: 'video', accounts: ['@one', '@two'] },
  { ...base, id: 703, platform: 'instagram', url: 'https://www.instagram.com/p/FiltersExample/', savedAt: '2026-10-28T12:00:00+05:30', kind: 'image', notes: 'A thought', accounts: ['@ig'] },
  { ...base, id: 704, platform: 'x', url: 'https://x.com/i/status/700000004', savedAt: '2026-10-01T12:00:00+05:30', topics: ['Coding'], accounts: ['@two'] },
  { ...base, id: 705, platform: 'chrome', url: 'https://filters.example/september', bookmarkTitle: 'September reference', savedAt: '2026-09-30T12:00:00+05:30', folders: ['Bookmarks bar / Reading'] }
];
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T12:00:00+05:30'));
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: fixtures, runs: [] } }));
  await page.route('https://platform.twitter.com/**', route => route.abort());
  await page.route('https://www.instagram.com/embed.js', route => route.abort());
  await page.goto('/');
});
const open = page => page.getByRole('button', { name: 'Filters', exact: true }).click();
const apply = page => page.getByRole('button', { name: /^Show \d+ saves?$/ }).click();
const visibleIds = page => page.locator('.save-card').evaluateAll(els => els.map(el => Number(el.dataset.postId)));

test('two date handles bracket saves, support all-time and now, and cannot cross', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Grid view|List view/ })).toHaveCount(0);
  await open(page);
  await expect(page.getByRole('radio')).toHaveCount(0);
  const from = page.getByRole('slider', { name: 'Saved since', exact: true }), until = page.getByRole('slider', { name: 'Saved until', exact: true });
  await expect(from).toHaveValue('0'); await expect(until).toHaveValue('6');
  await from.press('ArrowLeft'); await from.press('ArrowLeft'); await from.press('ArrowLeft');
  await expect(page.locator('.date-range-caption')).toHaveCount(0);
  await expect(page.locator('.time-tick-full').first()).toHaveText('Now');
  await expect(page.locator('.time-tick-full').last()).toHaveText('All Time');
  await expect(page.locator('.time-ticks > .is-selected .time-tick-full')).toHaveText(['Now', '1 week ago']);
  await expect(page.locator('.time-ticks > .is-selected').first()).toHaveCSS('font-weight', '600');
  await expect(page.locator('#show-filtered-saves')).toHaveText('Show 3 saves');
  await apply(page); expect(await visibleIds(page)).toEqual([701, 702, 703]);
  await page.getByRole('button', { name: 'Remove date filter', exact: true }).click(); await expect(page.locator('.save-card')).toHaveCount(5);
  await open(page); await from.press('ArrowLeft'); await until.press('ArrowRight'); await apply(page);
  expect(await visibleIds(page)).toEqual([702, 703, 704]);
  await open(page); await from.press('Home'); await until.press('Home');
  await expect(from).toHaveValue('0'); await expect(until).toHaveValue('1');
  await apply(page); expect(await visibleIds(page)).toEqual([705]);
  await open(page); await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await from.press('End'); await expect(from).toHaveValue('5');
  await expect(page.locator('#show-filtered-saves')).toHaveText('Show 1 save');
  await from.press('ArrowRight'); await until.press('ArrowRight');
  await from.press('End'); await until.press('Home');
  await expect(from).toHaveValue('4'); await expect(until).toHaveValue('5');
  await expect(page.locator('.time-ticks > .is-selected .time-tick-full')).toHaveText(['Today', 'Yesterday']);
  await apply(page); expect(await visibleIds(page)).toEqual([702]);
  await open(page); await from.press('Home'); await page.keyboard.press('Escape'); expect(await visibleIds(page)).toEqual([702]);
  await open(page); await expect(from).toHaveValue('4'); await expect(until).toHaveValue('5');
  await page.getByRole('button', { name: 'Reset', exact: true }).click(); await apply(page);
  await expect(page.locator('.save-card')).toHaveCount(5);
});

test('timeline thumbs drag and resize without overflowing a narrow screen', async ({ page }) => {
  await open(page);
  const from = page.getByRole('slider', { name: 'Saved since', exact: true }), until = page.getByRole('slider', { name: 'Saved until', exact: true });
  async function drag(index, target) {
    const box = await page.locator('.time-slider').boundingBox(), x = i => box.x + 12 + (1 - i / 6) * (box.width - 24);
    await page.mouse.move(x(index), box.y + 24); await page.mouse.down(); await page.mouse.move(x(target), box.y + 24, { steps: 8 }); await page.mouse.up();
  }
  await drag(0, 3); await expect(from).toHaveValue('3');
  await drag(6, 5); await expect(until).toHaveValue('5');
  await expect(page.locator('#show-filtered-saves')).toHaveText('Show 2 saves');
  await page.screenshot({ path: 'test-results/date-timeline-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await drag(3, 1); await expect(from).toHaveValue('1');
  await expect(page.locator('#show-filtered-saves')).toHaveText('Show 3 saves');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(page.locator('.time-tick-short').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/date-timeline-mobile.png' });
});

test('account chips combine without duplicates, respect topics and can be cancelled or reset', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('combobox', { name: /Content|Notes|Source account|Date used/ })).toHaveCount(0);
  const accounts = page.getByRole('group', { name: 'Accounts', exact: true });
  await accounts.getByRole('checkbox', { name: 'X @one', exact: true }).check();
  await apply(page); expect(await visibleIds(page)).toEqual([702]);
  await open(page); await accounts.getByRole('checkbox', { name: 'X @two', exact: true }).check();
  await apply(page); expect(await visibleIds(page)).toEqual([702, 704]);
  await open(page); await accounts.getByRole('checkbox', { name: 'Instagram @ig', exact: true }).check();
  await apply(page); expect(await visibleIds(page)).toEqual([702, 703, 704]);
  await open(page);
  await page.getByRole('group', { name: 'Topics', exact: true }).getByRole('checkbox', { name: 'Coding', exact: true }).check();
  await apply(page); expect(await visibleIds(page)).toEqual([704]);
  await open(page); await page.getByRole('button', { name: 'Reset', exact: true }).click(); await page.keyboard.press('Escape');
  expect(await visibleIds(page)).toEqual([704]);
  await page.getByRole('button', { name: 'Remove topics filter', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Instagram @ig filter', exact: true }).click(); expect(await visibleIds(page)).toEqual([702, 704]);
  await page.getByRole('button', { name: 'Remove X @two filter', exact: true }).click(); expect(await visibleIds(page)).toEqual([702]);
  await open(page); await page.getByRole('button', { name: 'Reset', exact: true }).click(); await apply(page);
  await expect(page.locator('.save-card')).toHaveCount(5);
  await page.setViewportSize({ width: 1280, height: 720 }); await open(page);
  const footerInside = () => page.evaluate(() => document.querySelector('.filter-footer').getBoundingClientRect().bottom <= document.querySelector('#modal').getBoundingClientRect().bottom);
  const reset = await page.getByRole('button', { name: 'Reset', exact: true }).boundingBox(), show = await page.locator('#show-filtered-saves').boundingBox();
  expect(reset.x + reset.width).toBeLessThan(show.x); expect(Math.abs(reset.y - show.y)).toBeLessThan(2);
  expect(show.x - reset.x - reset.width).toBeLessThanOrEqual(20);
  expect(await footerInside()).toBeTruthy();
  await page.screenshot({ path: 'test-results/filters-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(await footerInside()).toBeTruthy();
  await page.screenshot({ path: 'test-results/filters-mobile.png', fullPage: true });
});

test('local grotesque and mono fonts load for the interface and account handles', async ({ page }) => {
  await open(page); await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('14px "Space Grotesk"'))).toBeTruthy();
  expect(await page.evaluate(() => document.fonts.check('12px "IBM Plex Mono"'))).toBeTruthy();
  await expect(page.locator('body')).toHaveCSS('font-family', /Space Grotesk/);
  await expect(page.locator('.account-handle').first()).toHaveCSS('font-family', /IBM Plex Mono/);
});

test.describe('touch timeline', () => {
  test.use({ hasTouch: true });
  test('tapping the track moves the nearer endpoint on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await open(page);
    const box = await page.locator('.time-slider').boundingBox(), x = i => box.x + 12 + (1 - i / 6) * (box.width - 24);
    await page.touchscreen.tap(x(3), box.y + 24);
    await expect(page.getByRole('slider', { name: 'Saved since', exact: true })).toHaveValue('3');
    await page.touchscreen.tap(x(5), box.y + 24);
    await expect(page.getByRole('slider', { name: 'Saved until', exact: true })).toHaveValue('5');
    await expect(page.locator('#show-filtered-saves')).toHaveText('Show 2 saves');
    await apply(page); expect(await visibleIds(page)).toEqual([702, 703]);
  });
});
