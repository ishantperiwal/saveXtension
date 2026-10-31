import { test, expect } from '@playwright/test';

async function seed(page) {
  const imported = await page.request.post('/api/posts/import', { headers: { Origin: 'http://localhost:3211' }, data: { posts: [
    { platform: 'chrome', url: 'https://notes-fixture.example/first', bookmarkTitle: 'First reference', title: 'Legacy custom title', tags: ['legacy tag'], notes: 'Original note' },
    { platform: 'chrome', url: 'https://notes-fixture.example/second', bookmarkTitle: 'Second reference', notes: '' }
  ] } });
  await expect(imported).toBeOK();
  expect((await imported.json()).rejected).toBe(0);
  const { posts } = await (await page.request.get('/api/posts')).json();
  return posts.filter(p => p.url.startsWith('https://notes-fixture.example/'));
}
async function saved(page, id) { return (await (await page.request.get('/api/posts')).json()).posts.find(p => p.id === id); }
async function open(page, id) { await page.locator(`[data-post-id="${id}"]`).getByRole('button', { name: 'Edit note', exact: true }).click(); }
test.afterEach(async ({ page }) => {
  const { posts } = await (await page.request.get('/api/posts')).json();
  for (const p of posts.filter(p => p.url.startsWith('https://notes-fixture.example/'))) await page.request.delete('/api/posts/' + p.id, { headers: { Origin: 'http://localhost:3211' } });
});

test('notes autosave without a submit button, retain the latest edit and flush when switching saves', async ({ page }) => {
  const posts = await seed(page), first = posts.find(p => p.bookmarkTitle === 'First reference'), second = posts.find(p => p.bookmarkTitle === 'Second reference');
  let release; const gate = new Promise(resolve => { release = resolve; }); const requests = [];
  await page.route(`**/api/posts/${first.id}`, async route => {
    if (route.request().method() === 'PATCH') { requests.push(route.request().postDataJSON()); if (requests.length === 1) await gate; }
    await route.continue();
  });
  await page.goto('/'); await open(page, first.id);
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Tags', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a save', exact: true })).toHaveCount(0);
  await page.getByLabel('Note', { exact: true }).fill('First draft');
  await expect.poll(() => requests.length).toBe(1);
  await page.getByLabel('Note', { exact: true }).fill('Latest draft');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await open(page, second.id); await page.getByLabel('Note', { exact: true }).fill('Independent second note');
  await page.getByRole('button', { name: 'Close dialog' }).click(); release();
  await expect.poll(async () => (await saved(page, first.id)).notes).toBe('Latest draft');
  await expect.poll(async () => (await saved(page, second.id)).notes).toBe('Independent second note');
  await page.reload(); await open(page, first.id);
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Latest draft');
  expect((await saved(page, first.id)).title).toBe('Legacy custom title'); expect((await saved(page, first.id)).tags).toEqual(['legacy tag']);
  await page.getByLabel('Note', { exact: true }).fill('Save before searching');
  const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || ''));
  await page.keyboard.press(mac ? 'Meta+f' : 'Control+f');
  await expect(page.locator('#modal')).not.toBeVisible();
  await expect(page.getByRole('searchbox')).toBeFocused();
  await expect.poll(async () => (await saved(page, first.id)).notes).toBe('Save before searching');
  await open(page, first.id);
  await page.getByLabel('Note', { exact: true }).fill(''); await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect.poll(async () => (await saved(page, first.id)).notes).toBe('');
});

test('an offline draft survives reload and is saved automatically after reconnection', async ({ page }) => {
  const first = (await seed(page)).find(p => p.bookmarkTitle === 'First reference'); let online = false;
  await page.route(`**/api/posts/${first.id}`, route => online ? route.continue() : route.abort('internetdisconnected'));
  await page.goto('/'); await open(page, first.id);
  await page.getByLabel('Note', { exact: true }).fill('Offline draft to recover');
  await expect(page.locator('#note-status')).toContainText('Not saved yet');
  expect((await saved(page, first.id)).notes).toBe('Original note');
  await page.reload(); await open(page, first.id);
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Offline draft to recover');
  online = true; await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#note-status')).toHaveText('Saved');
  await expect.poll(async () => (await saved(page, first.id)).notes).toBe('Offline draft to recover');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('savex-note-drafts'))).toBe('[]');
  await page.screenshot({ path: 'test-results/note-autosave.png', fullPage: true });
});
