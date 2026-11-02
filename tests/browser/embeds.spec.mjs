import { test, expect } from '@playwright/test';
const posts = () => [
  { id: 901, platform: 'x', externalId: '123456789', url: 'https://x.com/i/status/123456789', title: 'Motion reference', text: 'Captured X caption for the offline copy.', author: 'creator', authorName: 'Example creator', thumbnail: '', media: [], kind: 'video', tags: ['motion'], topics: ['Design'], accounts: ['@my-account'], notes: 'Keep this transition for the next project.', favorite: false, archived: false, savedAt: '2026-10-31T12:00:00Z' },
  { id: 902, platform: 'instagram', externalId: 'Reel123', url: 'https://www.instagram.com/reel/Reel123/', title: 'A useful Reel', text: 'Captured Instagram caption for the offline copy.', author: 'designer', authorName: 'Example designer', thumbnail: '', media: [], kind: 'video', tags: ['inspiration'], topics: ['Design'], accounts: [], notes: '', favorite: false, archived: false, savedAt: '2026-10-30T12:00:00Z' }
];
const xSdk = `window.twttr={widgets:{createTweet:async function(id,root){try{parent.document.body;root.dataset.isolated='false'}catch{root.dataset.isolated='true'} const frame=document.createElement('iframe');frame.title='Native X fixture';frame.src='https://platform.twitter.com/fixture/'+id;frame.style.height='360px';frame.style.width='100%';root.append(frame);await new Promise(resolve=>frame.onload=resolve);return frame;}}};`;
const igSdk = `window.instgrm={Embeds:{process:function(){const block=document.querySelector('.instagram-media');if(!block)return;const frame=document.createElement('iframe');frame.title='Native Instagram fixture';frame.className='instagram-media';frame.src='https://www.instagram.com/fixture/reel';frame.style.cssText='height:520px;width:100%;border-radius:4px;box-shadow:0 2px 10px #0003';block.replaceWith(frame);}}};`;
async function setup(page, saved = posts(), unavailable = false, sdkGate = Promise.resolve()) {
  const model = { posts: saved, unavailable };
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: model.posts, runs: [] } }));
  await page.route('https://platform.twitter.com/widgets.js', async route => { await sdkGate; return model.unavailable ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: xSdk }); });
  await page.route('https://www.instagram.com/embed.js', async route => { await sdkGate; return model.unavailable ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: igSdk }); });
  await page.route('https://platform.twitter.com/fixture/**', route => route.fulfill({ contentType: 'text/html', body: '<style>body{font:15px system-ui;margin:0;padding:20px;color:#15202b}video{width:100%;height:200px;background:#d9e2ea}</style><article><strong>Example creator · @creator</strong><p>Original X post, served inside the native post frame.</p><video controls aria-label="X video player"></video><p>Photos, video and the original post together.</p></article>' }));
  await page.route('https://www.instagram.com/fixture/**', route => route.fulfill({ contentType: 'text/html', body: '<style>body{font:15px system-ui;margin:0;padding:20px;color:#262626}video{width:100%;height:340px;background:#e8e1d7}</style><article><strong>Example designer · Instagram</strong><p>A public Reel in its original post frame.</p><video controls aria-label="Instagram Reel player"></video></article>' }));
  await page.goto('/', { waitUntil: 'domcontentloaded' }); return model;
}

test('native X and Instagram grid players retain library metadata and survive background refresh', async ({ page }) => {
  const model = await setup(page);
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(2);
  await expect(page.locator('.card-note')).toHaveText('Keep this transition for the next project.');
  await expect(page.locator('.save-card[data-post-id="901"]').getByRole('button', { name: 'Design', exact: true })).toBeVisible();
  const xHost = page.frameLocator('.save-card[data-post-id="901"] .embed-stage>iframe');
  await expect(xHost.locator('#embed-root')).toHaveAttribute('data-isolated', 'true');
  await expect(xHost.frameLocator('iframe').locator('video')).toHaveAttribute('controls', '');
  await expect(page.frameLocator('.save-card[data-post-id="902"] .embed-stage>iframe').frameLocator('iframe').locator('video')).toHaveAttribute('controls', '');
  const frame = await page.locator('.save-card[data-post-id="901"] .embed-stage>iframe').elementHandle();
  model.posts[0] = { ...model.posts[0], notes: 'A refreshed note, without restarting the player.' };
  await expect(page.locator('.card-note')).toContainText('refreshed note', { timeout: 8000 });
  expect(await frame.evaluate(el => el.isConnected)).toBe(true);
  expect(await page.locator('script[src*="platform.twitter.com"],script[src*="instagram.com"]').count()).toBe(0);
  await page.screenshot({ path: 'test-results/native-post-grid.png', fullPage: true });
  await page.locator('.save-card[data-post-id="901"]').getByRole('button', { name: 'Edit note', exact: true }).click();
  await expect(page.locator('#modal .native-embed')).toHaveAttribute('data-embed-state', 'ready');
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue(model.posts[0].notes);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('#modal iframe')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/native-post-grid-mobile.png', fullPage: true });
});

test('unavailable embeds keep captured metadata visible with retry and original links', async ({ page }) => {
  const model = await setup(page, posts().slice(0, 1), true);
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state', 'failed');
  await expect(page.getByText('This post can’t be loaded right now.')).toBeVisible();
  await expect(page.getByText('Captured X caption for the offline copy.')).toBeVisible();
  await expect(page.locator('.embed-error').getByRole('link', { name: 'Open original', exact: true })).toBeVisible();
  model.unavailable = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state', 'ready');
  await expect(page.locator('.embed-toolbar,.embed-fallback,[data-embed-toggle]')).toHaveCount(0);
});

test('masonry keeps two posts adjacent and fills the shorter column as sync adds posts', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const model = await setup(page);
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(2);
  const first = page.locator('.save-card[data-post-id="901"]'), second = page.locator('.save-card[data-post-id="902"]');
  const player = await first.locator('.embed-stage > iframe').elementHandle();
  const host = page.frameLocator('.save-card[data-post-id="901"] .embed-stage > iframe');
  await host.locator('#embed-root > iframe').evaluate(frame => { frame.style.height = '1400px'; });
  await expect.poll(async () => (await first.boundingBox()).height).toBeGreaterThan(1400);
  let a = await first.boundingBox(), b = await second.boundingBox();
  expect(Math.abs(a.y - b.y)).toBeLessThan(2); expect(b.x).toBeGreaterThan(a.x + a.width);
  model.posts.push({ ...posts()[0], id: 903, externalId: '123456790', url: 'https://x.com/i/status/123456790', savedAt: '2026-10-29T12:00:00Z' });
  const third = page.locator('.save-card[data-post-id="903"]');
  await expect(third).toBeVisible({ timeout: 8000 });
  await expect(third.locator('.native-embed')).toHaveAttribute('data-embed-state', 'ready');
  a = await first.boundingBox(); b = await second.boundingBox(); const c = await third.boundingBox();
  expect(Math.abs(c.x - b.x)).toBeLessThan(2); expect(Math.abs(c.y - b.y - b.height - 20)).toBeLessThan(2);
  expect(c.y).toBeLessThan(a.y + a.height);
  expect(await player.evaluate(frame => frame.isConnected)).toBe(true);
  await page.screenshot({ path: 'test-results/masonry-grid-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => Math.round((await second.boundingBox()).x)).toBe(Math.round((await first.boundingBox()).x));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await player.evaluate(frame => frame.isConnected)).toBe(true);
});

test('a lone archived or filtered post keeps the populated grid card width', async ({ page }) => {
  await page.setViewportSize({ width: 1660, height: 1000 });
  const saved = [
    ...posts(),
    { ...posts()[0], id: 903, externalId: '123456790', url: 'https://x.com/i/status/123456790' },
    { ...posts()[1], id: 904, archived: true }
  ];
  await setup(page, saved);
  const cards = page.locator('.save-card');
  await expect(cards).toHaveCount(3);
  const normalWidth = (await cards.first().boundingBox()).width;
  await page.locator('.archive-nav').click();
  await expect(cards).toHaveCount(1);
  const archived = cards.first();
  await expect(archived.locator('.native-embed')).toHaveAttribute('data-embed-state', 'ready');
  expect(Math.abs((await archived.boundingBox()).width - normalWidth)).toBeLessThan(2);
  const grid = await page.locator('.cards').boundingBox();
  expect(Math.abs((await archived.boundingBox()).x - grid.x)).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/archive-card-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => Math.abs((await archived.boundingBox()).width - (await page.locator('.cards').boundingBox()).width)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1660, height: 1000 });
  await page.locator('[data-filter="all"]').click();
  await page.getByRole('searchbox').fill('A useful Reel');
  await expect(cards).toHaveCount(1);
  expect(Math.abs((await cards.first().boundingBox()).width - normalWidth)).toBeLessThan(2);
});

test('creator identity appears only inside the native post, with no empty metadata header', async ({ page }) => {
  const saved = posts().map(p => ({ ...p, title: '', notes: '', archived: false, favorite: true }));
  await setup(page, saved);
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(2);
  await expect(page.locator('.card-title-button,.card-handle,.embed-toolbar')).toHaveCount(0);
  await expect(page.locator('.card-metadata').first()).toBeHidden();
  await expect(page.locator('.save-card').first().locator('.embed-placeholder')).toBeHidden();
  await expect(page.getByText('Example creator', { exact: true })).toBeHidden();
  await expect(page.getByText('@creator', { exact: true })).toBeHidden();
  await expect(page.getByText('Saved copy', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /favorites/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Archive save', exact: true })).toHaveCount(2);
  await expect(page.locator('#sync-status')).toBeHidden();
  await page.getByRole('searchbox').fill('inspiration');
  await expect(page.locator('.save-card')).toHaveCount(1);
  await page.getByRole('searchbox').fill('');
  await page.screenshot({ path: 'test-results/embed-clean-grid.png', fullPage: true });
});

test('grid embeds load near the viewport rather than loading the entire library', async ({ page }) => {
  const saved = Array.from({ length: 24 }, (_, i) => ({ ...posts()[0], id: 1000 + i, url: `https://x.com/i/status/${100000000 + i}` }));
  await setup(page, saved);
  await expect(page.locator('.embed-stage iframe').first()).toBeVisible();
  expect(await page.locator('.embed-stage iframe').count()).toBeLessThan(saved.length);
  await page.locator('.save-card').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.save-card').last().locator('.native-embed')).toHaveAttribute('data-embed-state', 'ready');
});

test('native borders and shadows have room inside the grid and expanded preview, including at phone widths', async ({ page }) => {
  await setup(page, posts().slice(1));
  async function checkFrame(selector) {
    const frame = page.locator(`${selector} .embed-stage > iframe`);
    await expect(page.locator(`${selector} .native-embed`)).toHaveAttribute('data-embed-state', 'ready');
    const host = page.frameLocator(`${selector} .embed-stage > iframe`);
    const spacing = await host.locator('#embed-root').evaluate(root => {
      const widget = root.querySelector('iframe'), r = widget.getBoundingClientRect();
      return { left: r.left, top: r.top, right: innerWidth - r.right, bottom: root.getBoundingClientRect().bottom - r.bottom, height: root.getBoundingClientRect().height, shadow: getComputedStyle(widget).boxShadow, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    for (const side of ['left', 'top', 'right', 'bottom']) expect(spacing[side]).toBeGreaterThanOrEqual(12);
    expect(spacing.shadow).not.toBe('none'); expect(spacing.overflow).toBe(false);
    await expect.poll(async () => (await frame.boundingBox()).height).toBe(Math.ceil(spacing.height));
  }
  await checkFrame('.save-card');
  await page.setViewportSize({ width: 390, height: 844 }); await checkFrame('.save-card');
  await page.getByRole('button', { name: 'Edit note', exact: true }).click(); await checkFrame('#modal');
});

test('captured metadata and images show while both platforms load, update without restarting embeds, and disappear when ready', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const saved = posts().map((p, index) => ({ ...p, thumbnail: index ? 'https://scontent.cdninstagram.com/expired-preview.jpg' : 'https://pbs.twimg.com/media/preview.jpg' }));
  saved[0].text = 'Captured caption <script>window.untrusted = true</script>';
  await page.route('https://pbs.twimg.com/media/preview.jpg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="600" height="360" fill="#e0e7da"/><circle cx="300" cy="180" r="80" fill="#81936f"/></svg>' }));
  await page.route('https://scontent.cdninstagram.com/expired-preview.jpg', route => route.abort());
  try {
    const model = await setup(page, saved, false, gate);
    const x = page.locator('.save-card[data-post-id="901"]'), ig = page.locator('.save-card[data-post-id="902"]');
    await expect(x.locator('.native-embed')).toHaveAttribute('data-embed-state', 'loading');
    await expect(x.locator('.embed-placeholder')).toBeVisible();
    await expect(x.locator('.embed-capture-author')).toContainText('Example creator');
    await expect(x.locator('.embed-capture-text')).toHaveText(saved[0].text);
    expect(await page.evaluate(() => window.untrusted)).toBeUndefined();
    await expect(x.locator('.embed-capture-image')).toBeVisible();
    await expect(ig.locator('.embed-capture-text')).toContainText('Captured Instagram caption');
    await expect(ig.locator('.embed-capture-image')).toBeHidden();
    await expect(page.getByText('Loading post…', { exact: true })).toHaveCount(0);
    const frame = await x.locator('.embed-stage > iframe').elementHandle();
    model.posts[0] = { ...model.posts[0], text: 'New details captured during sync.' };
    await expect(x.locator('.embed-capture-text')).toHaveText('New details captured during sync.', { timeout: 8000 });
    expect(await frame.evaluate(el => el.isConnected)).toBe(true);
    await page.screenshot({ path: 'test-results/loading-post-metadata.png' });
    await x.getByRole('button', { name: 'Edit note', exact: true }).click();
    await expect(page.locator('#modal .embed-capture-text')).toHaveText('New details captured during sync.');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    release();
    await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(2);
    await expect(x.locator('.embed-placeholder')).toBeHidden();
    await expect(ig.locator('.embed-placeholder')).toBeHidden();
    expect(await frame.evaluate(el => el.isConnected)).toBe(true);
  } finally { release(); }
});

test('a save with no captured caption still shows its platform and original link while loading', async ({ page }) => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  try {
    await setup(page, [{ ...posts()[0], title: '', text: '', author: '', authorName: '', notes: '' }], false, gate);
    await expect(page.locator('.embed-capture-author')).toHaveText('X');
    await expect(page.locator('.embed-capture-link')).toHaveAttribute('href', posts()[0].url);
    await expect(page.locator('.embed-capture-date')).toContainText('Saved');
  } finally { release(); }
});
