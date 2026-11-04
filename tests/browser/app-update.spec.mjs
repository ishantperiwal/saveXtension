import { test, expect } from '@playwright/test';

test('a downloaded update shows a round install button beside the name', async ({ page }) => {
  await page.addInitScript(() => {
    window.updateCalls = 0;
    let phase = 'downloading';
    window.readyUpdate = () => { phase = 'ready'; dispatchEvent(new Event('focus')); };
    const known = { updateStatus: async () => ({ phase, currentVersion: '1.3.1', availableVersion: '1.3.2' }), installUpdate: async () => { window.updateCalls++; return true; } };
    window.saveXDesktop = new Proxy(known, { get: (target, key) => target[key] || (async () => null) });
  });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [], topics: [], runs: [], instagramCollections: [] } }));
  await page.route('**/api/sync', route => route.fulfill({ json: { job: null, browser: null } }));
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Install saveXtension 1.3.2', exact: true });
  await expect(page.locator('.update-button')).toBeHidden();
  await page.evaluate(() => window.readyUpdate());
  await expect(button).toBeVisible();
  const brand = await page.locator('.sidebar-header .brand').boundingBox(), round = await button.boundingBox();
  expect(round.x).toBeGreaterThan(brand.x + brand.width); expect(round.x - brand.x - brand.width).toBeLessThan(16);
  expect(Math.abs(round.width - round.height)).toBeLessThan(1);
  await button.click(); await expect.poll(() => page.evaluate(() => window.updateCalls)).toBe(1);
});
