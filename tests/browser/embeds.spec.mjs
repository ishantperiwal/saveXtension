import { test, expect } from '@playwright/test';
const posts = () => [
  { id: 901, platform: 'x', externalId: '123456789', url: 'https://x.com/i/status/123456789', title: 'Motion reference', text: 'Captured X caption for the offline copy.', author: 'creator', authorName: 'Example creator', thumbnail: '', media: [], kind: 'video', tags: ['motion'], topics: ['Design'], accounts: ['@my-account'], notes: 'Keep this transition for the next project.', favorite: false, archived: false, savedAt: '2026-10-31T12:00:00Z' },
  { id: 902, platform: 'instagram', externalId: 'Reel123', url: 'https://www.instagram.com/reel/Reel123/', title: 'A useful Reel', text: 'Captured Instagram caption for the offline copy.', author: 'designer', authorName: 'Example designer', thumbnail: '', media: [], kind: 'video', tags: ['inspiration'], topics: ['Design'], accounts: [], notes: '', favorite: false, archived: false, savedAt: '2026-10-30T12:00:00Z' }
];
const xSdk = `window.twttr={widgets:{createTweet:async function(id,root){try{parent.document.body;root.dataset.isolated='false'}catch{root.dataset.isolated='true'} const frame=document.createElement('iframe');frame.title='Native X fixture';frame.src='https://platform.twitter.com/fixture/'+id;frame.style.height='360px';frame.style.width='100%';root.append(frame);await new Promise(resolve=>frame.onload=resolve);return frame;}}};`;
const igSdk = `window.instgrm={Embeds:{process:function(){const block=document.querySelector('.instagram-media');if(!block)return;const frame=document.createElement('iframe');frame.title='Native Instagram fixture';frame.className='instagram-media';frame.src='https://www.instagram.com/fixture/reel';frame.style.cssText='height:520px;width:100%;border-radius:4px;box-shadow:0 2px 10px #0003';block.replaceWith(frame);}}};`;
async function setup(page, saved = posts(), unavailable = false) {
  const model = { posts: saved, unavailable };
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: model.posts, runs: [] } }));
  await page.route('https://platform.twitter.com/widgets.js', route => model.unavailable ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: xSdk }));
  await page.route('https://www.instagram.com/embed.js', route => model.unavailable ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: igSdk }));
  await page.route('https://platform.twitter.com/fixture/**', route => route.fulfill({ contentType: 'text/html', body: '<style>body{font:15px system-ui;margin:0;padding:20px;color:#15202b}video{width:100%;height:200px;background:#d9e2ea}</style><article><strong>Example creator · @creator</strong><p>Original X post, served inside the native post frame.</p><video controls aria-label="X video player"></video><p>Photos, video and the original post together.</p></article>' }));
  await page.route('https://www.instagram.com/fixture/**', route => route.fulfill({ contentType: 'text/html', body: '<style>body{font:15px system-ui;margin:0;padding:20px;color:#262626}video{width:100%;height:340px;background:#e8e1d7}</style><article><strong>Example designer · Instagram</strong><p>A public Reel in its original post frame.</p><video controls aria-label="Instagram Reel player"></video></article>' }));
  await page.goto('/'); return model;
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

test('unavailable embeds offer retry and original links without showing a stored copy', async ({ page }) => {
  const model = await setup(page, posts().slice(0, 1), true);
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state', 'failed');
  await expect(page.getByText('This post can’t be loaded right now.')).toBeVisible();
  await expect(page.getByText('Captured X caption for the offline copy.')).toHaveCount(0);
  await expect(page.locator('.embed-error').getByRole('link', { name: 'Open original', exact: true })).toBeVisible();
  model.unavailable = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state', 'ready');
  await expect(page.locator('.embed-toolbar,.embed-fallback,[data-embed-toggle]')).toHaveCount(0);
});

test('creator identity appears only inside the native post, with no empty metadata header', async ({ page }) => {
  const saved = posts().map(p => ({ ...p, title: '', notes: '', archived: false, favorite: true }));
  await setup(page, saved);
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(2);
  await expect(page.locator('.card-title-button,.card-handle,.embed-toolbar')).toHaveCount(0);
  await expect(page.locator('.card-metadata').first()).toBeHidden();
  await expect(page.locator('.save-card').first()).not.toContainText('Example creator');
  await expect(page.locator('.save-card').first()).not.toContainText('@creator');
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
