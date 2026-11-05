import { test, expect } from '@playwright/test';

test('the enlarged grid post shows its note beside it, saves edits, and closes from beside the note', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => localStorage.setItem('savex-card-view', 'grid'));
  const post = { id: 1, platform: 'x', url: 'https://x.com/writer/status/1001', text: 'A post', notes: 'First thought', tags: [], topics: [], folders: [], collections: [], accounts: ['@one'], archived: false, savedAt: '2026-10-31T00:00:00Z' };
  let saved = null;
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [post], topics: [], runs: [], instagramCollections: [] } }));
  await page.route('**/api/sync', route => route.fulfill({ json: { job: null, browser: null } }));
  await page.route('**/api/posts/1', async route => { saved = route.request().postDataJSON(); await route.fulfill({ json: { ...post, notes: saved.notes } }); });
  await page.goto('/');
  const card = page.locator('.save-card[data-post-id="1"]');
  await card.locator('.card-header').click({ position: { x: 300, y: 10 } });
  const dialog = page.locator('dialog.post-preview-dialog');
  await expect(dialog).toBeVisible();
  const note = dialog.getByRole('textbox', { name: 'Note' });
  await expect(note).toHaveValue('First thought');
  const preview = await dialog.locator('.post-preview').boundingBox(), panel = await dialog.locator('.post-preview-note').boundingBox(), close = await dialog.getByRole('button', { name: 'Close dialog' }).boundingBox();
  expect(panel.x).toBeGreaterThan(preview.x + preview.width); expect(Math.abs(panel.y - preview.y)).toBeLessThan(2);
  expect(close.x).toBeGreaterThan(panel.x + panel.width); expect(close.x - panel.x - panel.width).toBeLessThan(24);
  await note.fill('First thought, then a second');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(() => saved?.notes).toBe('First thought, then a second');
});
