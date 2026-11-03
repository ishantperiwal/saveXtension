import { test, expect } from '@playwright/test';
async function setup(page) {
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [], runs: [] } }));
  await page.route('**/api/sync', route => route.fulfill({ json: { browser: null, job: null } }));
  await page.goto('/');
}

test('light mode overrides a previous dark preference and hides the theme switch', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('savex-theme', 'dark'));
  await setup(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('[data-action="toggle-theme"], .theme-switch')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('savex-theme'))).toBe('light');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.sidebar .archive-nav')).toHaveCount(1);
});

test('system appearance and older tabs cannot switch the library back to dark', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'light' }); await setup(page);
  const other = await context.newPage(); await setup(other);
  await other.evaluate(() => localStorage.setItem('savex-theme', 'dark'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await other.close();
});
