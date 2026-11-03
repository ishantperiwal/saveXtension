import { test, expect } from '@playwright/test';

test('archive and restore work across search, accounts, notes, sync refreshes and reloads', async ({ page, baseURL }) => {
  await page.route('https://platform.twitter.com/**', route => route.abort());
  await page.route('https://www.instagram.com/embed.js', route => route.abort());
  const origin = { Origin: baseURL };
  const fixture = { platform: 'chrome', url: 'https://archive-fixture.example/reference', bookmarkTitle: 'Archive fixture reference', folders: ['Bookmarks bar / Design'], notes: 'Knowledge context', savedAt: '2025-05-01T00:00:00Z' };
  await page.request.post('/api/posts/import', { headers: origin, data: { posts: [fixture] } });
  const all = async () => (await (await page.request.get('/api/posts?scope=all')).json()).posts;
  const post = (await all()).find(p => p.url === fixture.url);
  try {
    await page.goto('/');
    const card = page.locator(`.save-card[data-post-id="${post.id}"]`);
    await card.getByRole('button', { name: 'Edit note', exact: true }).click();
    await card.getByLabel('Note', { exact: true }).fill('Latest context before archiving');
    await card.getByRole('button', { name: 'Archive save', exact: true }).click();
    await expect(page.locator('#modal')).not.toBeVisible(); await expect(card).toHaveCount(0);
    expect((await (await page.request.get('/api/posts')).json()).posts.some(p => p.id === post.id)).toBe(false);
    await page.getByRole('searchbox').fill('Archive fixture reference'); await expect(card).toHaveCount(0);
    await page.locator('.archive-nav').click();
    await expect(page.getByRole('heading', { name: 'Archived', exact: true })).toBeVisible();
    await expect(card).toBeVisible(); await expect(card.getByLabel('Note',{exact:true})).toHaveValue('Latest context before archiving');
    await page.getByRole('searchbox').fill('Latest context'); await expect(card).toBeVisible();
    await page.request.post('/api/posts/import', { headers: origin, data: { posts: [{ ...fixture, archived: false }] } });
    expect((await all()).find(p => p.id === post.id).archived).toBe(true);
    await page.reload(); await expect(card).toHaveCount(0);
    await page.locator('.archive-nav').click(); await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Restore save', exact: true }).click(); await expect(card).toHaveCount(0);
    const restored = (await all()).find(p => p.id === post.id);
    expect(restored.archived).toBe(false); expect(restored.savedAt).toBe(post.savedAt); expect(restored.notes).toBe('Latest context before archiving'); expect(restored.folders).toEqual(post.folders);
    await page.getByRole('button', { name: /^All saves \d+$/ }).click(); await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Archive save', exact: true }).click(); await expect(card).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.archive-nav').click(); await expect(card).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: 'test-results/archive-mobile.png' });
    await card.getByRole('button', { name: 'Edit note', exact: true }).click();
    await card.getByRole('button', { name: 'Restore save', exact: true }).click();
    await expect(page.locator('#modal')).not.toBeVisible(); await expect(card).toHaveCount(0);
  } finally { await page.request.delete(`/api/posts/${post.id}`, { headers: origin }); }
});

test.describe('without the archive setting', () => {
  test.use({ storageState: { cookies: [], origins: [{ origin: 'http://localhost:3211', localStorage: [{ name: 'savex-card-view', value: 'grid' }] }] } });
  test('archive controls stay hidden while unsave replaces them', async ({ page, baseURL }) => {
    await page.route('https://platform.twitter.com/**', route => route.abort());
    const fixture = { platform: 'chrome', url: 'https://archive-hidden.example/reference', bookmarkTitle: 'Hidden archive reference', savedAt: '2025-05-01T00:00:00Z' };
    await page.request.post('/api/posts/import', { headers: { Origin: baseURL }, data: { posts: [fixture] } });
    const post = (await (await page.request.get('/api/posts?scope=all')).json()).posts.find(p => p.url === fixture.url);
    try {
      await page.goto('/');
      const card = page.locator(`.save-card[data-post-id="${post.id}"]`);
      await expect(card).toBeVisible();
      await expect(card.getByRole('button', { name: 'Archive save', exact: true })).toBeHidden();
      await expect(page.locator('.archive-nav')).toHaveCount(0);
    } finally { await page.request.delete(`/api/posts/${post.id}`, { headers: { Origin: baseURL } }); }
  });
});
