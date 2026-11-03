import { test, expect } from '@playwright/test';
test.use({timezoneId:'Asia/Kolkata'});
const posts = () => [
  { id: 901, platform: 'x', externalId: '123456789', url: 'https://x.com/i/status/123456789', title: 'Motion reference', text: 'Captured X caption for the offline copy.', author: 'creator', authorName: 'Example creator', thumbnail: '', media: [], kind: 'video', tags: ['motion'], topics: ['Design'], accounts: ['@my-account'], notes: 'Keep this transition for the next project.', favorite: false, archived: false, savedAt: '2026-10-31T12:00:00Z' },
  { id: 902, platform: 'instagram', externalId: 'Reel123', url: 'https://www.instagram.com/reel/Reel123/', title: 'A useful Reel', text: 'Captured Instagram caption for the offline copy.', author: 'designer', authorName: 'Example designer', thumbnail: '', media: [], kind: 'video', tags: ['inspiration'], topics: ['Design'], accounts: [], notes: '', favorite: false, archived: false, savedAt: '2026-10-31T11:00:00Z' }
];
const xSdk = `window.twttr={widgets:{createTweet:async function(id,root){try{parent.document.body;root.dataset.isolated='false'}catch{root.dataset.isolated='true'} const frame=document.createElement('iframe');frame.title='Native X fixture';frame.src='https://platform.twitter.com/fixture/'+id;frame.style.height='360px';frame.style.width='100%';root.append(frame);await new Promise(resolve=>frame.onload=resolve);return frame;}}};`;
const igSdk = `window.instgrm={Embeds:{process:function(){const block=document.querySelector('.instagram-media');if(!block)return;const frame=document.createElement('iframe');frame.title='Native Instagram fixture';frame.className='instagram-media';frame.src='https://www.instagram.com/fixture/reel';frame.style.cssText='height:520px;width:100%;border-radius:4px;box-shadow:0 2px 10px #0003';block.replaceWith(frame);}}};`;
async function setup(page, saved = posts(), unavailable = false, sdkGate = Promise.resolve()) {
  const model = { posts: saved, unavailable };
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: model.posts, runs: [] } }));
  await page.route('https://platform.twitter.com/widgets.js', async route => { await (typeof sdkGate === 'function' ? sdkGate(route) : sdkGate); return model.unavailable ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: xSdk }); });
  await page.route('https://www.instagram.com/embed.js', async route => { await (typeof sdkGate === 'function' ? sdkGate(route) : sdkGate); return model.unavailable ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: igSdk }); });
  await page.route('https://platform.twitter.com/fixture/**', route => route.fulfill({ contentType: 'text/html', body: '<style>body{font:15px system-ui;margin:0;padding:20px;color:#15202b}video{width:100%;height:200px;background:#d9e2ea}</style><article><strong>Example creator · @creator</strong><p>Original X post, served inside the native post frame.</p><video controls aria-label="X video player"></video><p>Photos, video and the original post together.</p></article>' }));
  await page.route('https://www.instagram.com/fixture/**', route => route.fulfill({ contentType: 'text/html', body: '<style>body{font:15px system-ui;margin:0;padding:20px;color:#262626}video{width:100%;height:340px;background:#e8e1d7}</style><article><strong>Example designer · Instagram</strong><p>A public Reel in its original post frame.</p><video controls aria-label="Instagram Reel player"></video></article>' }));
  await page.route('**/api/sync',r=>r.fulfill({json:{browser:null,job:null}}));
  await page.goto('/', { waitUntil: 'domcontentloaded' }); return model;
}

test('native X and Instagram grid players retain library metadata and survive background refresh', async ({ page }) => {
  const model = await setup(page);
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(2);
  await expect(page.locator('.save-card[data-post-id="901"]').getByLabel('Note',{exact:true})).toHaveValue('Keep this transition for the next project.');
  await expect(page.locator('.save-card[data-post-id="901"]').getByRole('button', { name: 'Design', exact: true })).toBeVisible();
  const xHost = page.frameLocator('.save-card[data-post-id="901"] .embed-stage>iframe');
  await expect(xHost.locator('#embed-root')).toHaveAttribute('data-isolated', 'true');
  await expect(xHost.frameLocator('iframe').locator('video')).toHaveAttribute('controls', '');
  await expect(page.frameLocator('.save-card[data-post-id="902"] .embed-stage>iframe').frameLocator('iframe').locator('video')).toHaveAttribute('controls', '');
  const frame = await page.locator('.save-card[data-post-id="901"] .embed-stage>iframe').elementHandle();
  model.posts[0] = { ...model.posts[0], notes: 'A refreshed note, without restarting the player.', topics:['Design','Tools','Research','Learning'] };
  await expect(page.locator('.save-card[data-post-id="901"]').getByLabel('Note',{exact:true})).toHaveValue(model.posts[0].notes, { timeout: 8000 });
  expect(await frame.evaluate(el => el.isConnected)).toBe(true);
  await expect(page.locator('[data-post-id="901"] .card-footer .tag')).toHaveText(['Design','Tools','Research','Learning']);
  await expect(page.locator('[data-post-id="901"] .card-header .card-actions button')).toHaveCount(4);
  await expect(page.locator('.card-footer .card-actions')).toHaveCount(0);
  expect(await page.locator('script[src*="platform.twitter.com"],script[src*="instagram.com"]').count()).toBe(0);
  await page.screenshot({ path: 'test-results/native-post-grid.png', fullPage: true });
  await page.locator('.save-card[data-post-id="901"]').getByRole('button', { name: 'Edit note', exact: true }).click();
  const note=page.locator('.save-card[data-post-id="901"]').getByLabel('Note',{exact:true});
  await expect(note).toBeFocused(); await expect(page.locator('#modal')).not.toBeVisible();
  await page.route('**/api/posts/901',route=>{model.posts[0]={...model.posts[0],notes:route.request().postDataJSON().notes,updatedAt:new Date().toISOString()};return route.fulfill({json:model.posts[0]});});
  await note.fill('My interpretation for the next project.');
  await expect(page.locator('.save-card[data-post-id="901"] .note-status')).toHaveAttribute('data-state','saved');
  await expect(note).toBeFocused(); expect(await frame.evaluate(el=>el.isConnected)).toBe(true);
  await expect(page.locator('.card-footer a')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Delete',exact:true})).toHaveCount(0);
  await page.getByRole('searchbox').focus();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/native-post-grid-mobile.png', fullPage: true });
});

test('unavailable embeds keep captured metadata visible with retry and original links', async ({ page }) => {
  const model = await setup(page, posts().slice(0, 1), true);
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state', 'failed');
  await expect(page.getByText('This post can’t be loaded right now.')).toBeVisible();
  await expect(page.getByText('Captured X caption for the offline copy.')).toBeVisible();
  await expect(page.locator('.embed-loading')).toBeHidden();
  await expect(page.locator('.embed-error').getByRole('link', { name: 'Open original', exact: true })).toBeVisible();
  model.unavailable = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state', 'ready');
  await expect(page.locator('.embed-toolbar,.embed-fallback,[data-embed-toggle]')).toHaveCount(0);
});

for (const platform of ['x','instagram']) test(`${platform} confirmed failures retry with backoff and leave healthy players intact`, async ({ page }) => {
  await page.clock.install();
  await setup(page);
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(2);
  const card=page.locator(`.save-card.${platform}`), other=page.locator(`.save-card:not(.${platform})`);
  const untouched=await other.locator('.embed-stage > iframe').elementHandle();
  let attempts=0, fail=true;
  const script=platform==='x'?'https://platform.twitter.com/widgets.js':'https://www.instagram.com/embed.js';
  await page.route(script,route=>{ attempts++; return fail?route.abort():route.fulfill({contentType:'text/javascript',body:platform==='x'?xSdk:igSdk}); });
  await card.getByRole('button',{name:'Retry post preview',exact:true}).click();
  await expect(card.locator('.native-embed')).toHaveAttribute('data-embed-state','failed');
  expect(attempts).toBe(1);
  await page.clock.fastForward(6000);
  await expect.poll(()=>attempts).toBe(2);
  await expect(card.locator('.native-embed')).toHaveAttribute('data-embed-state','failed');
  await expect(card.locator('.embed-capture-text')).toBeVisible();
  await page.clock.fastForward(5000); expect(attempts).toBe(2);
  fail=false; await page.clock.fastForward(6000);
  await expect(card.locator('.native-embed')).toHaveAttribute('data-embed-state','ready');
  expect(attempts).toBe(3); expect(await untouched.evaluate(el=>el.isConnected)).toBe(true);
  await page.clock.fastForward(60000); expect(attempts).toBe(3);
});

test('automatic retries pause offline and while hidden, then resume when the visible app returns', async ({ page, context }) => {
  await page.clock.install();
  let attempts=0;
  const model=await setup(page,posts().slice(0,1),true,()=>{attempts++;return Promise.resolve();});
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state','failed');
  await context.setOffline(true); await page.clock.fastForward(60000);
  expect(attempts).toBe(1);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await context.setOffline(false); await page.clock.fastForward(60000);
  expect(attempts).toBe(1);
  model.unavailable=false;
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state','ready');
  expect(attempts).toBe(2);
});

test('time groups age automatically and preserve the loaded player when separators merge', async ({ page }) => {
  const now=Date.parse('2026-11-03T12:00:00Z');
  await page.clock.setFixedTime(new Date(now));
  const saved=posts().map((post,index)=>({...post,addedAt:new Date(now-(index?72:4)*3600000).toISOString()}));
  await setup(page,saved);
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(2);
  await expect.poll(()=>page.locator('.save-card .new-tag').count()).toBeGreaterThan(0); await expect.poll(()=>page.locator('.save-card:not(:has(.new-tag))').count()).toBeGreaterThan(0);
  const player=await page.locator('.save-card[data-post-id="901"] .embed-stage > iframe').elementHandle();
  const root=page.frameLocator('.save-card[data-post-id="901"] .embed-stage > iframe').locator('#embed-root');
  await root.evaluate(el=>{el.dataset.continuity='retained';});
  await page.clock.setFixedTime(new Date(now+24*3600000));
  await expect(page.locator('.save-card .new-tag')).toHaveCount(0,{timeout:8000});
  expect(await player.evaluate(el=>el.isConnected)).toBe(true);
  await expect(root).toHaveAttribute('data-continuity','retained');
});

test('masonry keeps two posts adjacent and fills the shorter column as sync adds posts', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1000 });
  const model = await setup(page);
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(2);
  const first = page.locator('.save-card[data-post-id="901"]'), second = page.locator('.save-card[data-post-id="902"]');
  const player = await first.locator('.embed-stage > iframe').elementHandle();
  const host = page.frameLocator('.save-card[data-post-id="901"] .embed-stage > iframe');
  await host.locator('#embed-root > iframe').evaluate(frame => { frame.style.height = '1400px'; });
  await expect.poll(async () => (await first.boundingBox()).height).toBeGreaterThan(1400);
  let a = await first.boundingBox(), b = await second.boundingBox();
  expect(Math.abs(a.y - b.y)).toBeLessThan(2); expect(b.x).toBeGreaterThan(a.x + a.width);
  model.posts.push({ ...posts()[0], id: 903, externalId: '123456790', url: 'https://x.com/i/status/123456790', savedAt: '2026-10-31T10:00:00Z' });
  const third = page.locator('.save-card[data-post-id="903"]');
  await expect(third).toBeVisible({ timeout: 8000 });
  await expect(third.locator('.native-embed')).toHaveAttribute('data-embed-state', 'ready');
  a = await first.boundingBox(); b = await second.boundingBox(); const c = await third.boundingBox();
  expect(Math.abs(c.x - b.x)).toBeLessThan(2); expect(Math.abs(c.y - b.y - b.height - 16)).toBeLessThan(2);
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
  await page.locator('.save-card').last().locator('.native-embed').scrollIntoViewIfNeeded();
  await expect(page.locator('.save-card').last().locator('.native-embed')).toHaveAttribute('data-embed-state', 'ready');
});

const manyPosts = count => Array.from({ length: count }, (_, index) => ({ ...posts()[0], id: 2000 + index, externalId: String(200000000 + index), url: `https://x.com/i/status/${200000000 + index}`, text: `Pagination reference number ${index}.`, notes: '', savedAt: new Date(Date.UTC(2026, 9, 31, 12) - index * 60000).toISOString() }));

test('failed previews only retry in the current viewport and resume when scrolled back into view', async ({ page }) => {
  await page.clock.install();
  const attempts=new Map();
  const model=await setup(page,manyPosts(24),true,route=>{const path=new URL(route.request().frame().url()).pathname;attempts.set(path,(attempts.get(path)||0)+1);return Promise.resolve();});
  const first=page.locator('.save-card[data-post-id="2000"] .native-embed');
  await expect(first).toHaveAttribute('data-embed-state','failed');
  const original=attempts.get('/embed/x/200000000');
  await page.locator('.save-card').last().locator('.native-embed').scrollIntoViewIfNeeded();
  await page.clock.fastForward(60000);
  expect(attempts.get('/embed/x/200000000')).toBe(original);
  await expect(first).toHaveAttribute('data-embed-state','failed');
  model.unavailable=false; await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('data-embed-state','ready');
  expect(attempts.get('/embed/x/200000000')).toBe(original+1);
});

test('automatic retries share the six-load budget and queued failures retain their metadata', async ({ page }) => {
  await page.setViewportSize({width:1440,height:1800});
  await page.clock.install();
  let block=false; const waiting=[];
  const model=await setup(page,manyPosts(9),true,()=>block?new Promise(resolve=>waiting.push(resolve)):Promise.resolve());
  try {
    await expect(page.locator('.native-embed[data-embed-state="failed"]')).toHaveCount(9);
    block=true; await page.clock.fastForward(6000);
    await expect(page.locator('.native-embed[data-embed-state="loading"]')).toHaveCount(6);
    await expect.poll(()=>waiting.length).toBe(6);
    await expect(page.locator('.native-embed[data-embed-state="failed"]')).toHaveCount(3);
    await expect(page.locator('.native-embed[data-embed-state="failed"] .embed-capture-text').first()).toBeVisible();
    model.unavailable=false; block=false; waiting.forEach(resolve=>resolve());
    await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(9);
  } finally {waiting.forEach(resolve=>resolve());}
});

test('compact cards fit three across a wide window and editing a note keeps the native player in place', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const saved = manyPosts(6).map((post, index) => index % 2 ? { ...post, platform: 'instagram', externalId: `Compact${index}`, url: `https://www.instagram.com/reel/Compact${index}/` } : post);
  await setup(page, saved);
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(6);
  await expect.poll(() => page.locator('.embed-stage[data-layout-height]').count()).toBe(0);
  const row = await page.locator('.save-card').evaluateAll(cards => cards.slice(0, 3).map(card => { const r = card.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width }; }));
  expect(row.every(card => card.width >= 340 && card.width < 380)).toBe(true);
  expect(row.every(card => Math.abs(card.y - row[0].y) < 2)).toBe(true);
  expect(row[1].x).toBeGreaterThan(row[0].x + row[0].width);
  expect(row[2].x).toBeGreaterThan(row[1].x + row[1].width);
  const ig = page.locator('.save-card[data-post-id="2001"]');
  const player = await ig.locator('.embed-stage > iframe').elementHandle();
  const host = page.frameLocator('.save-card[data-post-id="2001"] .embed-stage > iframe');
  const native = await host.locator('#embed-root > iframe').evaluate(frame => ({ width:frame.offsetWidth, left:frame.getBoundingClientRect().left, right:innerWidth - frame.getBoundingClientRect().right, overflow:document.documentElement.scrollWidth > innerWidth }));
  expect(native.width).toBeGreaterThanOrEqual(325);
  expect(native.left).toBeGreaterThanOrEqual(11.9); expect(native.right).toBeGreaterThanOrEqual(11.9);
  expect(native.overflow).toBe(false);
  await page.screenshot({ path: 'test-results/compact-post-grid.png' });
  await ig.getByRole('button', { name: 'Edit note', exact:true }).click();
  await expect(ig.getByLabel('Note',{exact:true})).toBeVisible();
  await expect(page.locator('#modal')).not.toBeVisible();
  expect(Math.abs((await ig.boundingBox()).width-row[1].width)).toBeLessThan(1);
  expect(await player.evaluate(el => el.isConnected)).toBe(true);
});

test('cards enter softly and preview growth moves neighboring cards without replacing players or changing columns', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1800 });
  await page.addInitScript(() => {
    window.motionSamples = [];
    function sample() {
      const card = document.querySelector('.save-card'), below = document.querySelector('.save-card[data-post-id="2002"]');
      const stage = card?.querySelector('.embed-stage'), content = card?.querySelector('.card-content');
      if (stage && below) window.motionSamples.push({
        height: stage.offsetHeight, target: Number(stage.dataset.layoutHeight) || null,
        entrance: getComputedStyle(content).transform, opacity: Number(getComputedStyle(content).opacity),
        x: below.getBoundingClientRect().x, y: below.getBoundingClientRect().y
      });
      if (window.motionSamples.length > 300) window.motionSamples.shift();
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await setup(page, manyPosts(6));
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(6);
  await expect.poll(() => page.locator('.embed-stage[data-layout-height]').count()).toBe(0);
  const initial = await page.evaluate(() => window.motionSamples);
  expect(initial.some(s => s.entrance !== 'none' && s.opacity > 0 && s.opacity < 1)).toBe(true);
  expect(initial.some(s => s.target && Math.abs(s.target - s.height) > 2)).toBe(true);
  const card = page.locator('.save-card[data-post-id="2000"]');
  const below = page.locator('.save-card[data-post-id="2002"]');
  const player = await card.locator('.embed-stage > iframe').elementHandle();
  const before = await below.boundingBox();
  await page.evaluate(() => { window.motionSamples = []; });
  await page.frameLocator('.save-card[data-post-id="2000"] .embed-stage > iframe').locator('#embed-root > iframe').evaluate(frame => { frame.style.height = '900px'; });
  await expect.poll(() => card.locator('.embed-stage').evaluate(stage => stage.offsetHeight)).toBeGreaterThan(800);
  await expect.poll(() => card.locator('.embed-stage[data-layout-height]').count()).toBe(0);
  await expect.poll(() => below.evaluate(el => el.getAnimations().length)).toBe(0);
  const after = await below.boundingBox(), samples = await page.evaluate(() => window.motionSamples);
  expect(after.y).toBeGreaterThan(before.y + 400);
  expect(samples.some(s => s.target && s.height > 400 && s.height < 890)).toBe(true);
  expect(samples.some(s => s.y > before.y + 20 && s.y < after.y - 20)).toBe(true);
  expect(samples.every(s => Math.abs(s.x - before.x) < 1)).toBe(true);
  const first = await card.boundingBox();
  expect(Math.abs(after.y - first.y - first.height - 16)).toBeLessThan(2);
  expect(await player.evaluate(el => el.isConnected)).toBe(true);
});

test('reduced motion keeps posts immediately visible and disables preview and layout animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, manyPosts(6));
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(6);
  await expect(page.locator('.awaiting-reveal,.embed-stage[data-layout-height]')).toHaveCount(0);
  const card = page.locator('.save-card').first();
  expect(await card.locator('.card-content').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await page.frameLocator('.save-card[data-post-id="2000"] .embed-stage > iframe').locator('#embed-root > iframe').evaluate(frame => { frame.style.height = '900px'; });
  await expect.poll(() => card.locator('.embed-stage').evaluate(stage => stage.offsetHeight)).toBeGreaterThan(800);
  expect(await page.locator('.save-card').evaluateAll(cards => cards.every(card => card.getAnimations({ subtree: true }).length === 0))).toBe(true);
});

test('scrolling appends batches, preserves players across sync updates, searches all saves and resets the batch for a new filter', async ({ page }) => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  try {
    const model = await setup(page, manyPosts(240), false, gate);
    await expect(page.locator('.native-embed[data-embed-state="loading"]')).toHaveCount(6);
    // The next batch is mounted before reaching its boundary, so the expanded
    // preview queue can work ahead without waiting for a viewport-edge scroll.
    await expect.poll(()=>page.locator('.save-card').count()).toBeGreaterThan(24);
    const initialCount=await page.locator('.save-card').count();
    expect(initialCount).toBeGreaterThanOrEqual(24); expect(initialCount).toBeLessThan(240);
    release(); await expect(page.locator('.save-card[data-post-id="2000"] .native-embed')).toHaveAttribute('data-embed-state', 'ready');
    const firstPlayer = await page.locator('.save-card[data-post-id="2000"] .embed-stage > iframe').elementHandle();
    await page.locator('.more-saves').scrollIntoViewIfNeeded();
    await expect.poll(()=>page.locator('.save-card').count()).toBeGreaterThan(initialCount);
    expect(await firstPlayer.evaluate(frame => frame.isConnected)).toBe(true);
    model.posts.unshift({ ...manyPosts(1)[0], id: 3000, url: 'https://x.com/i/status/300000000', text: 'A newly synced reference', savedAt: '2026-11-01T00:00:00Z' });
    await expect(page.locator('.save-card[data-post-id="3000"]')).toHaveCount(1, { timeout: 8000 });
    expect(await firstPlayer.evaluate(frame => frame.isConnected)).toBe(true);
    await page.getByRole('searchbox').fill('Pagination reference number 64.');
    await expect(page.locator('.save-card')).toHaveCount(1); await expect(page.locator('.save-card')).toHaveAttribute('data-post-id', '2064');
    await page.getByRole('searchbox').fill('');
    await expect(page.locator('.save-card[data-post-id="3000"]')).toHaveCount(1);
    await expect.poll(()=>page.locator('.save-card').count()).toBeGreaterThanOrEqual(24);
    expect(await page.locator('.save-card').count()).toBeLessThan(241);
    for(let batch=0;batch<10&&await page.locator('.more-saves').count();batch++) {
      const count=await page.locator('.save-card').count();
      await page.locator('.more-saves').scrollIntoViewIfNeeded();
      await expect.poll(()=>page.locator('.save-card').count()).toBeGreaterThan(count);
    }
    await expect(page.locator('.save-card')).toHaveCount(241);
    await expect(page.locator('.more-saves')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/paged-saves-loading.png' });
  } finally { release(); }
});

test('six previews load at once, recover after failure, and inline notes do not consume loading slots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1800 });
  const waiting = [], gate = () => new Promise(resolve => waiting.push(resolve));
  try {
    const model = await setup(page, manyPosts(9), false, gate);
    await expect.poll(() => waiting.length).toBe(6);
    await expect(page.locator('.native-embed[data-embed-state="loading"]')).toHaveCount(6);
    await expect(page.locator('.native-embed[data-embed-state="queued"]')).toHaveCount(3);
    await expect(page.getByText('Waiting to load preview…', { exact: true })).toHaveCount(3);
    waiting[0](); await expect.poll(() => waiting.length).toBe(7);
    await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(1);
    await expect(page.locator('.native-embed[data-embed-state="loading"]')).toHaveCount(6);
    model.unavailable = true; waiting[1]();
    await expect(page.locator('.native-embed[data-embed-state="failed"]')).toHaveCount(1); model.unavailable = false;
    await expect.poll(() => waiting.length).toBe(8);
    await page.locator('.save-card').first().getByRole('button', { name: 'Edit note', exact: true }).click();
    await expect(page.locator('.save-card').first().getByLabel('Note',{exact:true})).toBeVisible();
    await expect(page.locator('#modal')).not.toBeVisible();
    expect(waiting.length).toBe(8);
    await expect(page.locator('.save-card .native-embed[data-embed-state="loading"]')).toHaveCount(6);
    const waitingPost = await page.locator('.save-card .native-embed[data-embed-state="queued"]').first().evaluate(holder => Number(holder.closest('.save-card').dataset.postId) - 2000);
    await page.getByRole('searchbox').fill(`Pagination reference number ${waitingPost}.`);
    await expect(page.locator('.save-card')).toHaveCount(1);
    await expect(page.locator('.save-card .native-embed')).toHaveAttribute('data-embed-state', 'loading');
    await expect.poll(() => waiting.length).toBe(9);
    await page.getByRole('button', { name: 'Retry post preview', exact: true }).click();
    await expect.poll(() => waiting.length).toBe(10);
    waiting.forEach(resolve => resolve());
    await expect(page.locator('.save-card .native-embed')).toHaveAttribute('data-embed-state', 'ready');
  } finally { waiting.forEach(resolve => resolve()); }
});

test('scrolling prioritizes visible previews, lets started ones finish, and preloads four screens in either direction', async ({ page }) => {
  const waiting = []; let autoRelease = false;
  const gate = () => autoRelease ? Promise.resolve() : new Promise(resolve => waiting.push(resolve));
  const loading = page.locator('.save-card .native-embed[data-embed-state="loading"]');
  const geometry = () => page.locator('.save-card .native-embed').evaluateAll(holders => holders.map(holder => {
    const r = holder.getBoundingClientRect();
    return { state: holder.dataset.embedState, visible: r.bottom > 0 && r.top < innerHeight, near: r.bottom > -innerHeight * 4 && r.top < innerHeight * 5, beyondAdjacent:r.top>=innerHeight*2||r.bottom<=-innerHeight };
  }));
  try {
    await setup(page, manyPosts(180), false, gate);
    await expect(loading).toHaveCount(6);
    const originalFrames = await page.locator('.save-card .embed-stage > iframe').elementHandles();
    const destination = page.locator('.save-card[data-post-id="2021"] .native-embed');
    await destination.scrollIntoViewIfNeeded();
    await expect(destination).toHaveAttribute('data-embed-state', /queued|loading/);
    await expect.poll(async () => (await geometry()).filter(p => p.state === 'loading' && p.visible).length).toBeGreaterThan(0);
    // Downloads already in progress may finish in up to four extra slots instead of restarting later.
    const kept = (await Promise.all(originalFrames.map(frame => frame.evaluate(el => el.isConnected)))).filter(Boolean).length;
    expect(kept).toBeLessThanOrEqual(4);
    expect(await loading.count()).toBeLessThanOrEqual(10);
    expect((await geometry()).filter(p => p.state === 'queued').every(p => p.near)).toBe(true);
    await expect(page.locator('.embed-error:visible')).toHaveCount(0);
    autoRelease = true; waiting.forEach(resolve => resolve());
    await expect(destination).toHaveAttribute('data-embed-state', 'ready');
    await expect.poll(async () => (await geometry()).filter(p => p.near && ['pending', 'queued', 'loading'].includes(p.state)).length, { timeout: 8000 }).toBe(0);
    expect((await geometry()).some(p => p.near && p.beyondAdjacent && p.state==='ready')).toBe(true);
    expect((await geometry()).some(p => !p.near && p.state === 'pending')).toBe(true);
    const readyPlayer = await destination.locator('.embed-stage > iframe').elementHandle();
    const top = page.locator('.save-card[data-post-id="2000"] .native-embed');
    await top.scrollIntoViewIfNeeded(); await expect(top).toHaveAttribute('data-embed-state', 'ready');
    expect(await readyPlayer.evaluate(el => el.isConnected)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await top.scrollIntoViewIfNeeded(); await expect(top).toHaveAttribute('data-embed-state', 'ready');
    await expect.poll(async () => (await geometry()).filter(p => p.state === 'loading' && !p.near).length).toBeLessThanOrEqual(4);
    await page.screenshot({ path: 'test-results/viewport-priority-mobile.png' });
  } finally { autoRelease = true; waiting.forEach(resolve => resolve()); }
});

test('native borders and shadows retain their padding when editing inline, including at phone widths', async ({ page }) => {
  await setup(page, posts().slice(1));
  async function checkFrame(selector) {
    const frame = page.locator(`${selector} .embed-stage > iframe`);
    await expect(page.locator(`${selector} .native-embed`)).toHaveAttribute('data-embed-state', 'ready');
    const host = page.frameLocator(`${selector} .embed-stage > iframe`);
    const spacing = await host.locator('#embed-root').evaluate(root => {
      const widget = root.querySelector('iframe'), r = widget.getBoundingClientRect();
      return { left: r.left, top: r.top, right: innerWidth - r.right, bottom: root.getBoundingClientRect().bottom - r.bottom, height: root.getBoundingClientRect().height, shadow: getComputedStyle(widget).boxShadow, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    for (const side of ['left', 'top', 'right', 'bottom']) expect(spacing[side]).toBeGreaterThanOrEqual(11.9);
    expect(spacing.shadow).not.toBe('none'); expect(spacing.overflow).toBe(false);
    // Resizing can change the widget scale again after the padding sample.
    // Compare live heights until the host and its parent frame agree.
    await expect.poll(async () => {
      const height = await host.locator('#embed-root').evaluate(root => Math.ceil(root.getBoundingClientRect().height));
      return Math.abs((await frame.boundingBox()).height - height);
    }).toBeLessThan(1);
  }
  await checkFrame('.save-card');
  await page.setViewportSize({ width: 390, height: 844 }); await checkFrame('.save-card');
  await page.getByRole('button', { name: 'Edit note', exact: true }).click(); await checkFrame('.save-card');
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
    await expect(x.locator('.embed-loading')).toBeVisible(); await expect(ig.locator('.embed-loading')).toBeVisible();
    for(const [card,post] of [[x,saved[0]],[ig,saved[1]]]){
      const original=card.getByRole('link',{name:'Open original post',exact:true});
      await expect(original).toBeVisible();await expect(original).toHaveAttribute('href',post.url);await expect(original).toHaveAttribute('target','_blank');
    }
    await expect(x.locator('.native-embed')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText('Loading post…', { exact: true })).toHaveCount(0);
    const frame = await x.locator('.embed-stage > iframe').elementHandle();
    model.posts[0] = { ...model.posts[0], text: 'New details captured during sync.' };
    await expect(x.locator('.embed-capture-text')).toHaveText('New details captured during sync.', { timeout: 8000 });
    expect(await frame.evaluate(el => el.isConnected)).toBe(true);
    await page.screenshot({ path: 'test-results/loading-post-metadata.png' });
    await x.getByRole('button', { name: 'Edit note', exact: true }).click();
    await expect(x.locator('.embed-capture-text')).toHaveText('New details captured during sync.');
    await expect(x.getByLabel('Note',{exact:true})).toBeFocused();
    expect(await frame.evaluate(el=>el.isConnected)).toBe(true);
    await page.getByRole('searchbox').focus();
    release();
    await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(2);
    await expect(x.locator('.embed-placeholder')).toBeHidden();
    await expect(ig.locator('.embed-placeholder')).toBeHidden();
    await expect(x.getByRole('link',{name:'Open original post',exact:true})).toBeHidden();
    await expect(x.locator('.embed-loading')).toBeHidden(); await expect(x.locator('.native-embed')).toHaveAttribute('aria-busy', 'false');
    expect(await frame.evaluate(el => el.isConnected)).toBe(true);
  } finally { release(); }
});

for (const platform of ['x', 'instagram']) test(`${platform} preview can be retried after ready without restarting another card`, async ({ page }) => {
  await setup(page);
  await expect(page.locator('.native-embed[data-embed-state="ready"]')).toHaveCount(2);
  const card = page.locator(`.save-card.${platform}`), other = page.locator(`.save-card:not(.${platform})`);
  const previous = await card.locator('.embed-stage > iframe').elementHandle(), untouched = await other.locator('.embed-stage > iframe').elementHandle();
  let release; const gate = new Promise(resolve => { release = resolve; });
  const script = platform === 'x' ? 'https://platform.twitter.com/widgets.js' : 'https://www.instagram.com/embed.js';
  await page.route(script, async route => { await gate; await route.fulfill({ contentType: 'text/javascript', body: platform === 'x' ? xSdk : igSdk }); });
  try {
    await card.getByRole('button', { name: 'Retry post preview', exact: true }).click();
    await expect(card.locator('.native-embed')).toHaveAttribute('data-embed-state', 'loading');
    await expect(card.locator('.embed-capture-text')).toBeVisible(); await expect(card.locator('.embed-loading')).toBeVisible();
    expect(await previous.evaluate(el => el.isConnected)).toBe(false); expect(await untouched.evaluate(el => el.isConnected)).toBe(true);
    release(); await expect(card.locator('.native-embed')).toHaveAttribute('data-embed-state', 'ready');
    expect(await untouched.evaluate(el => el.isConnected)).toBe(true);
    await card.getByRole('button', { name: 'Edit note', exact: true }).click();
    await expect(card.getByLabel('Note',{exact:true})).toBeFocused();
    await expect(page.locator('#modal')).not.toBeVisible();
    expect(await untouched.evaluate(el=>el.isConnected)).toBe(true);
  } finally { release(); }
});

test('Instagram helper frames never hide captured metadata, and a missing widget restores Retry', async ({ page }) => {
  await page.clock.install();
  await setup(page, posts().slice(1), true);
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state', 'failed');
  await page.route('https://www.instagram.com/embed.js', route => route.fulfill({ contentType:'text/javascript', body:`window.instgrm={Embeds:{process(){const frame=document.createElement('iframe');frame.src='about:blank';frame.style.height='1px';document.querySelector('#embed-root').append(frame);}}};` }));
  await page.getByRole('button', { name: 'Retry post preview', exact: true }).click();
  const host = page.frameLocator('.embed-stage > iframe');
  await expect(host.locator('#embed-root > iframe')).toHaveCount(1);
  await expect(page.locator('.embed-capture-text')).toBeVisible(); await expect(page.locator('.embed-loading')).toBeVisible();
  await page.clock.fastForward(24500);
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state', 'failed');
  await expect(page.locator('.embed-capture-text')).toBeVisible(); await expect(page.locator('.embed-loading')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await page.route('https://www.instagram.com/embed.js', route => route.fulfill({ contentType:'text/javascript', body:igSdk }));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state', 'ready');
  await page.frameLocator('.embed-stage > iframe').locator('#embed-root').evaluate(root => { root.innerHTML='<blockquote class="instagram-media"><a>View this post on Instagram</a></blockquote>'; });
  await expect(page.locator('.native-embed')).toHaveAttribute('data-embed-state', 'failed');
  await expect(page.locator('.embed-capture-text')).toBeVisible(); await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
});

test('a save with no captured caption still shows its platform and original link while loading', async ({ page }) => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  try {
    await setup(page, [{ ...posts()[0], title: '', text: '', author: '', authorName: '', notes: '' }], false, gate);
    await expect(page.locator('.embed-capture-author')).toHaveText('X');
    await expect(page.locator('.embed-capture-link')).toHaveAttribute('href', posts()[0].url);
    await expect(page.locator('.embed-capture-date')).toContainText('Added');
  } finally { release(); }
});
