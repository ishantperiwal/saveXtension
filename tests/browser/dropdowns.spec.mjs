import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [], runs: [] } }));
  await page.route('**/api/sync', route => route.fulfill({ json: { browser: null, job: null } }));
  await page.goto('/');
});

test('folder menus in Filters keep Escape local and reset their selected values', async ({ page }) => {
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('group', { name: 'Accounts', exact: true }).getByRole('checkbox', { name: 'Chrome bookmarks', exact: true }).check();
  const folder = page.getByRole('combobox', { name: 'Bookmark folder', exact: true });
  await folder.click();
  await expect(page.getByRole('listbox', { name: 'Bookmark folder' })).toBeVisible();
  const menu = await page.getByRole('listbox', { name: 'Bookmark folder' }).boundingBox();
  const dialog = await page.locator('#modal').boundingBox();
  expect(menu.y).toBeGreaterThanOrEqual(dialog.y);
  expect(menu.y + menu.height).toBeLessThanOrEqual(dialog.y + dialog.height);
  await folder.press('Escape'); await expect(page.locator('#modal')).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(folder).toBeHidden();
  await page.getByRole('button', { name: 'Show 0 saves', exact: true }).click();
  await expect(page.locator('.filter-count')).toBeHidden();
});
