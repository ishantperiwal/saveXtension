import { test, expect } from '@playwright/test';

const base = { text: 'Saved caption about gradients', notes: '', tags: [], folders: [], collections: [], topics: [], media: [], archived: false, kind: 'image', savedAt: '2026-10-31T00:00:00Z', addedAt: '2026-10-31T00:00:00Z' };
const posts = [
  { ...base, id: 1, platform: 'instagram', accounts: ['@me'], author: 'creator', url: 'https://www.instagram.com/p/SavedOne/', localImage: '/api/posts/1/image', thumbnail: 'https://scontent.cdninstagram.com/expired.jpg' },
  { ...base, id: 2, platform: 'instagram', accounts: ['@me'], author: 'other', url: 'https://www.instagram.com/p/SavedTwo/', thumbnail: 'https://scontent.cdninstagram.com/dead.jpg' },
  { ...base, id: 3, platform: 'x', accounts: ['@me'], author: 'writer', url: 'https://x.com/writer/status/1001' }
];
// A tall picture, shaped like an Instagram reel cover.
const TALL = '<svg xmlns="http://www.w3.org/2000/svg" width="450" height="800"><rect width="450" height="800" fill="#6a8"/></svg>';
async function setup(page, view) {
  const frames = [];
  await page.addInitScript(view => { localStorage.setItem('savex-live-previews', 'false'); localStorage.setItem('savex-card-view', view); }, view);
  page.on('framenavigated', frame => { if (frame !== page.mainFrame()) frames.push(frame.url()); });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts/1/image', route => route.fulfill({ contentType: 'image/svg+xml', body: TALL }));
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts, runs: [], instagramCollections: [] } }));
  await page.goto('/');
  return frames;
}
for (const view of ['feed', 'grid']) test(`${view} cards show saved details only, and open the post on request`, async ({ page }) => {
  const frames = await setup(page, view), card = page.locator('.save-card[data-post-id="1"]');
  await expect(card).toContainText('Saved caption about gradients');
  await expect(card.locator('.embed-capture-image')).toHaveAttribute('src', '/api/posts/1/image');
  await expect.poll(() => card.locator('.embed-capture-image').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const shown = await card.locator('.embed-capture-image').evaluate(image => { const { width, height } = image.getBoundingClientRect(); return { ratio: height / width, natural: image.naturalHeight / image.naturalWidth }; });
  expect(shown.ratio, 'the whole picture shows, uncropped').toBeCloseTo(shown.natural, 1);
  if (view === 'grid') {
    expect(await card.locator('.embed-capture-image').evaluate(image => image.getBoundingClientRect().height), 'grid pictures stay short').toBeLessThanOrEqual(320);
    await expect(page.locator('.save-card[data-post-id="2"] .embed-capture-image-link'), 'an expired picture leaves no empty mat').toBeHidden();
  }
  if (view === 'grid') await expect.poll(async () => {
    const boxes = await page.locator('.save-card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect()).map(({ left, right, top, bottom }) => ({ left, right, top, bottom })));
    return boxes.some((a, i) => boxes.some((b, j) => i < j && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
  }, { message: 'cards make room for the taller picture' }).toBe(false);
  await expect(page.locator('#results iframe'), 'nothing loads from the platforms by itself').toHaveCount(0);
  expect(frames).toEqual([]);
  await expect(card.getByRole('button', { name: 'Retry post preview', exact: true })).toHaveCount(0);
  await expect(card.getByText('Loading preview…')).toBeHidden();
  await expect(card.locator('.embed-capture-date'), 'cards carry no date').toHaveCount(0);
  await page.screenshot({ path: `test-results/saved-previews-${view}.png`, animations: 'disabled' });
  await expect(card.getByRole('button', { name: 'Preview post', exact: true }), 'there is no preview button or dialog any more').toHaveCount(0);
  if (view === 'grid') {
    // Without the desktop app there is no panel, so a post opens in a new tab.
    const [popup] = await Promise.all([page.waitForEvent('popup'), card.locator('.embed-capture-text').click()]);
    expect(popup.url()).toContain('instagram.com/p/SavedOne/');
    await popup.close();
    await expect(page.locator('#modal')).toBeHidden();
  }
});
test('clicking the picture opens that post, and the link stays out of the way when there is no picture', async ({ page }) => {
  await setup(page, 'feed');
  const picture = page.locator('.save-card[data-post-id="1"] .embed-capture-image');
  await expect(page.locator('.save-card[data-post-id="1"] .embed-capture-image-link')).toHaveAttribute('href', 'https://www.instagram.com/p/SavedOne/');
  const [popup] = await Promise.all([page.waitForEvent('popup'), picture.click()]);
  expect(popup.url()).toContain('instagram.com/p/SavedOne/');
  await popup.close();
  await expect(page.locator('#modal'), 'the picture opens the post, not a dialog').toBeHidden();
  await expect(page.locator('.save-card[data-post-id="2"] .embed-capture-image-link')).toBeHidden();
  await expect(page.locator('.save-card[data-post-id="3"] .embed-capture-image-link')).toHaveCount(0);
});
test('a link that has expired drops the picture instead of showing it broken, and the rest of the card stays', async ({ page }) => {
  await setup(page, 'feed');
  const card = page.locator('.save-card[data-post-id="2"]');
  await expect(card.locator('.embed-capture-image')).toBeHidden();
  await expect(card).toContainText('Saved caption about gradients');
  await expect(card.locator('.embed-open-original'), 'the post can still be opened').toBeVisible();
});
