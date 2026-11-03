import { test, expect } from '@playwright/test';
test.use({timezoneId:'Asia/Kolkata'});
const now = Date.parse('2026-11-03T12:00:00Z'), hour = 3600000;
const post = (id, age, archived = false) => ({ id, platform:'chrome', url:`https://time-fixture.example/${id}`, bookmarkTitle:`Reference ${id}`, text:'', topics:[], tags:[], accounts:[], folders:[], notes:'', media:[], archived, savedAt:'2000-01-01T00:00:00Z', addedAt:new Date(now-age*hour).toISOString(), publishedAt:'2001-01-01T00:00:00Z' });
async function setup(page, posts) {
  await page.clock.setFixedTime(new Date(now));
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json:{ posts, runs:[] } }));
  await page.goto('/');
}
const tagged = page => page.locator('.save-card').evaluateAll(cards => cards.filter(card => card.querySelector('.new-tag')).map(card => Number(card.dataset.postId)));
const order = page => page.locator('.save-card').evaluateAll(cards => cards.map(card => Number(card.dataset.postId)));

// Time separators gave way to a "New" tag on posts first added today (local time).
test('posts added today come first with a New tag; older and archived posts have none', async ({ page }) => {
  await setup(page,[post(1,.25),post(2,.5),post(3,4),post(4,20),post(5,72),post(6,200),post(7,2,true)]);
  await expect(page.locator('.save-time-separator')).toHaveCount(0);
  await expect.poll(()=>tagged(page)).toEqual([1,2,3]);
  expect((await order(page)).slice(0,3)).toEqual([1,2,3]);
  await expect(page.locator('.save-card[data-post-id="1"] .new-tag')).toHaveText('New');
  await page.getByRole('searchbox').fill('Reference 5');
  await expect.poll(()=>order(page)).toEqual([5]); expect(await tagged(page)).toEqual([]);
  await page.getByRole('searchbox').fill('');
  await page.locator('.archive-nav').click();
  await expect.poll(()=>order(page)).toEqual([7]); expect(await tagged(page)).toEqual([7]);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('appending a batch keeps today’s posts tagged without adding separators', async ({ page }) => {
  await page.setViewportSize({width:1280,height:600});
  await setup(page,Array.from({length:400},(_,index)=>post(index+1,(index<390?2:24)+index/100)));
  await expect.poll(()=>page.locator('.save-card').count()).toBeGreaterThanOrEqual(34);
  const initial=await page.locator('.save-card').count(); expect(initial).toBeLessThan(400);
  await page.locator('.more-saves').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.locator('.save-card').count()).toBeGreaterThan(initial);
  await expect(page.locator('.save-time-separator')).toHaveCount(0);
  const ids=await order(page), marked=new Set(await tagged(page));
  expect(marked.size).toBeGreaterThan(initial-10);
  expect(ids.slice(0,marked.size).every(id=>marked.has(id))).toBe(true);
  expect(ids.slice(marked.size).every(id=>id>390)).toBe(true);
});

test('the New tag drops off at local midnight without replacing the card', async ({ page }) => {
  await setup(page,[post(1,4),post(2,20)]);
  const card=page.locator('[data-post-id="1"]');
  const original=await card.elementHandle();
  await expect(card.locator('.new-tag')).toHaveCount(1);
  await page.clock.setFixedTime(new Date('2026-11-03T18:31:00Z'));
  await expect(card.locator('.new-tag')).toHaveCount(0,{timeout:8000});
  expect(await original.evaluate(el=>el.isConnected)).toBe(true);
});
