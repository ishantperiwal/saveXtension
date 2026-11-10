import { test, expect } from '@playwright/test';

const post = (id, code, notes = '') => ({ id, platform: 'instagram', accounts: ['@one'], url: `https://www.instagram.com/reel/${code}/`, text: `post ${id}`, notes, topics: [], media: [], collections: [], folders: [] });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.saveXDesktop = { onPost: (open, close, moved) => { window.panel = { open, close, moved }; }, postBounds: async () => {}, hidePost: async () => {}, closePost: async () => {}, capturePost: async () => null, onLibraryChanged() {}, socialAccounts: async () => [], helperInfo: async () => ({}), browsingAccounts: async () => {} }; });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [post(1, 'ONE', 'first note'), post(2, 'TWO', 'second note')], runs: [], instagramCollections: [] } }));
  await page.goto('/');
  await page.waitForFunction(() => window.panel);
});
const open = (page, code) => page.evaluate(address => window.panel.open({ url: address, layout: 'instagram-reel' }), `https://www.instagram.com/reel/${code}/`);

test('the note is its own box on the left of the panel, centred, and grows with its text', async ({ page }) => {
  await open(page, 'ONE');
  const panel = page.locator('#post-panel'), field = panel.locator('#post-note-input'), note = panel.locator('.post-note');
  await expect(field).toHaveValue('first note');
  await page.evaluate(() => Promise.all(document.querySelector('#post-panel').getAnimations({ subtree: true }).filter(animation => animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished)));
  if (process.env.PANEL_SHOT) await page.screenshot({ path: process.env.PANEL_SHOT });
  const box = await note.boundingBox(), side = await panel.boundingBox(), view = await panel.locator('.post-panel-view').boundingBox(), height = page.viewportSize().height;
  expect(box.x + box.width).toBeLessThan(side.x);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(Math.abs(box.y + box.height / 2 - height / 2)).toBeLessThan(2);
  expect(box.height).toBeGreaterThanOrEqual(180);
  expect(view.width).toBeGreaterThan(side.width - 20);
  await expect(panel.getByRole('button', { name: 'Note', exact: true })).toHaveCount(0);
  await expect(panel.locator('.note-ai-button')).toBeVisible();
  await field.fill(Array.from({ length: 30 }, (_, line) => `line ${line}`).join('\n'));
  await expect.poll(async () => (await note.boundingBox()).height).toBeGreaterThan(box.height + 100);
  const grown = await note.boundingBox();
  expect(Math.abs(grown.y + grown.height / 2 - height / 2)).toBeLessThan(2);
});
test('what you write saves to that post', async ({ page }) => {
  const saved = []; await page.route('**/api/posts/*', route => { if (route.request().method() === 'PATCH') { saved.push([route.request().url().split('/').pop(), route.request().postDataJSON().notes]); return route.fulfill({ json: { ...post(1, 'ONE'), notes: route.request().postDataJSON().notes, updatedAt: new Date().toISOString() } }); } return route.fallback(); });
  await open(page, 'ONE');
  await page.locator('#post-note-input').fill('first note, and more');
  await expect.poll(() => saved).toEqual([['1', 'first note, and more']]);
});
test('swiping to another post moves the note with it, and a post not in the library has none', async ({ page }) => {
  await open(page, 'ONE');
  const panel = page.locator('#post-panel');
  await page.evaluate(() => window.panel.moved('https://www.instagram.com/reels/TWO/?igsh=abc'));
  await expect(panel.locator('#post-note-input')).toHaveValue('second note');
  await page.evaluate(() => window.panel.moved('https://www.instagram.com/p/TWO/'));
  await expect(panel.locator('#post-note-input')).toHaveValue('second note');
  await page.evaluate(() => window.panel.moved('https://www.instagram.com/reels/ELSE/'));
  await expect(panel.locator('#post-note-input')).toHaveCount(0);
  await expect(panel.locator('.post-note-none')).toContainText('no note');
  await page.evaluate(() => window.panel.moved('https://www.instagram.com/reel/ONE/'));
  await expect(panel.locator('#post-note-input')).toHaveValue('first note');
});
test('a post that is not in the library says it has no note', async ({ page }) => {
  await open(page, 'NOTSAVED');
  await expect(page.locator('#post-panel .post-panel-view')).toBeVisible();
  await expect(page.locator('#post-panel .post-note-none')).toContainText('no note');
  await expect(page.locator('#post-panel #post-note-input')).toHaveCount(0);
  await page.evaluate(() => window.panel.moved('https://www.instagram.com/reels/TWO/'));
  await expect(page.locator('#post-panel #post-note-input')).toHaveValue('second note');
});

test('the page behind is blurred and doesn\'t scroll while the panel is open', async ({ page }) => {
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: Array.from({ length: 40 }, (_, index) => post(index + 1, `P${index + 1}`)), runs: [], instagramCollections: [] } }));
  await page.goto('/');
  await page.waitForFunction(() => window.panel && document.documentElement.scrollHeight > innerHeight + 200);
  await page.evaluate(() => scrollTo(0, 150));
  await open(page, 'P1');
  const panel = page.locator('#post-panel'); await expect(panel).toBeVisible();
  expect(await panel.evaluate(element => getComputedStyle(element, '::backdrop').backdropFilter)).toContain('blur');
  await page.mouse.move(100, 400); await page.mouse.wheel(0, 400); await page.waitForTimeout(150);
  expect(await page.evaluate(() => scrollY)).toBe(150);
  await page.evaluate(() => { const field = document.querySelector('#post-note-input'); field.value = Array.from({ length: 80 }, (_, line) => `line ${line}`).join('\\n'); });
  const box = await panel.locator('.post-note').boundingBox();
  await page.mouse.move(box.x + 40, box.y + 40); await page.mouse.wheel(0, 3000); await page.waitForTimeout(150);
  expect(await page.evaluate(() => scrollY)).toBe(150);
  await panel.getByRole('button', { name: 'Close post' }).click(); await expect(panel).toBeHidden();
  expect(await page.evaluate(() => scrollY)).toBe(150);
  await page.mouse.move(700, 400); await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(150);
});

test.describe('in the grid', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test('the description icon shows the description and never opens the post', async ({ page }) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#345"/></svg>';
    await page.route('**/api/posts/5/image', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }));
    await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [{ ...post(5, 'FIVE'), kind: 'image', localImage: '/api/posts/5/image', imageDescription: 'gold diamonds', imageDescriptionModel: 'Haiku 5.5' }], runs: [], instagramCollections: [] } }));
    await page.addInitScript(() => { localStorage.setItem('savex-live-previews', 'false'); window.opened = []; window.open = url => { window.opened.push(url); return null; }; });
    await page.goto('/');
    const card = page.locator('.save-card[data-post-id="5"]'), seen = card.locator('.ai-seen');
    await expect(page.locator('.cards')).toHaveAttribute('data-view', 'grid');
    await seen.locator('summary').click();
    await expect(seen.locator('.ai-seen-panel')).toContainText('gold diamonds');
    await seen.locator('.ai-seen-panel p').click();
    await expect(seen).toHaveAttribute('open', '');
    // Dismissing by clicking elsewhere on the card closes it, without opening the post either.
    await card.locator('.embed-capture-header').click();
    await expect(seen).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => window.opened)).toEqual([]);
    // With nothing open, the card still opens its post as usual.
    await card.locator('.embed-capture-header').click();
    expect(await page.evaluate(() => window.opened)).toEqual(['https://www.instagram.com/reel/FIVE/']);
  });
});
