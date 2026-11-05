import { test, expect } from '@playwright/test';

const running = (selector, property) => selector.evaluate((el, property) => el.getAnimations().filter(animation => animation.playState === 'running').some(animation => animation.effect.getKeyframes().some(frame => frame[property] !== undefined)), property);
async function library(page, status) {
  await page.addInitScript(() => { const known = { helperInfo: async () => ({ version: '1.0.0', path: '/helper' }), socialAccounts: async () => [] }; window.saveXDesktop = new Proxy(known, { get: (target, key) => target[key] || (async () => null) }); });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [], runs: [], topics: [], instagramCollections: [] } }));
  await page.route('**/api/sync', route => route.fulfill({ json: status }));
  await page.goto('/');
}
const job = (status, extra = {}) => ({ id: 'job-1', status, targets: ['x'], results: [], message: 'Checking X', xAccount: 'current', ...extra });
const nativeStatus = { job: null, browser: { online: true, ready: true, bookmarksReady: true }, nativeSocial: { enabled: true, online: true, accounts: [] }, chromeBrowser: null };

test('the dialog glides to its new height when its content changes, and settles at the natural size', async ({ page }) => {
  await library(page, nativeStatus);
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  const modal = page.locator('#modal'), row = page.locator('#chrome-helper-settings');
  await expect(row.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
  await expect.poll(() => running(modal, 'height')).toBe(false);
  const before = (await modal.boundingBox()).height;
  await row.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect.poll(() => running(modal, 'height'), { intervals: [10], timeout: 1000 }).toBe(true);
  expect(await modal.evaluate(el => el.style.overflow)).toBe('hidden');
  await expect.poll(() => running(modal, 'height')).toBe(false);
  await expect(modal.locator('.chrome-setup-steps > li')).toHaveCount(4);
  expect((await modal.boundingBox()).height).not.toBe(before);
  expect(await modal.evaluate(el => el.style.overflow)).toBe('');
  await page.getByRole('button', { name: 'Back to settings', exact: true }).click();
  await expect.poll(() => running(modal, 'height'), { intervals: [10], timeout: 1000 }).toBe(true);
});

test('the sync toast slides in, glides between compact and expanded, and slides out', async ({ page }) => {
  const status = { ...nativeStatus, job: job('running', { message: 'Checking your X bookmarks. A longer message that only shows when this is expanded.' }) };
  await page.setViewportSize({ width: 1280, height: 800 });
  await library(page, status);
  const toast = page.locator('#sync-status');
  await expect(toast).toBeVisible();
  await expect.poll(() => toast.evaluate(el => el.getAnimations().some(animation => animation.animationName === 'sync-toast-in')), { intervals: [10], timeout: 2000 }).toBe(false);
  const compact = await toast.boundingBox();
  await toast.hover();
  await expect.poll(() => running(toast, 'width'), { intervals: [10], timeout: 1000 }).toBe(true);
  await expect.poll(() => running(toast, 'width')).toBe(false);
  const expanded = await toast.boundingBox();
  expect(expanded.width).toBeGreaterThan(compact.width);
  expect(Math.abs(expanded.x + expanded.width - compact.x - compact.width), 'stays anchored to the right').toBeLessThan(2);
  await page.mouse.move(10, 10);
  await expect.poll(() => running(toast, 'width'), { intervals: [10], timeout: 1000 }).toBe(true);
  await expect.poll(() => running(toast, 'width')).toBe(false);
  expect(Math.round((await toast.boundingBox()).width)).toBe(Math.round(compact.width));
  status.job = null;
  await expect.poll(() => running(toast, 'transform'), { intervals: [20], timeout: 5000 }).toBe(true);
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden();
  expect(await toast.evaluate(el => el.children.length)).toBe(0);
  // It comes back cleanly if a sync starts again.
  status.job = job('running');
  await expect(toast).toBeVisible({ timeout: 5000 });
  await expect(toast).toHaveCSS('opacity', '1');
});
