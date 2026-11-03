import { test, expect } from '@playwright/test';
test.use({timezoneId:'Asia/Kolkata'});
const now = Date.parse('2026-11-03T12:00:00Z'), hour = 3600000;
const post = (id, age, archived = false) => ({ id, platform:'chrome', url:`https://time-fixture.example/${id}`, bookmarkTitle:`Reference ${id}`, text:'', topics:[], tags:[], accounts:[], folders:[], notes:'', media:[], archived, savedAt:'2000-01-01T00:00:00Z', addedAt:new Date(now-age*hour).toISOString(), publishedAt:'2001-01-01T00:00:00Z' });
async function setup(page, posts) {
  await page.clock.setFixedTime(new Date(now));
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json:{ posts, runs:[] } }));
  await page.goto('/');
}
async function checkSections(page) {
  await expect.poll(() => page.locator('.cards').evaluate(el => el.getAnimations({subtree:true}).length)).toBe(0);
  const sections = await page.locator('.cards').evaluate(grid => {
    const sections = []; let section;
    const rect = el => { const r=el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,width:r.width}; };
    for (const item of grid.children) {
      if (item.matches('.save-time-separator')) { section={heading:rect(item),cards:[]}; sections.push(section); }
      else if (item.matches('.save-card') && !item.hidden) section.cards.push(rect(item));
    }
    return { width:grid.clientWidth, sections };
  });
  let bottom;
  for (const section of sections.sections) {
    expect(Math.abs(section.heading.width-sections.width)).toBeLessThan(1);
    expect(section.cards.length).toBeGreaterThan(0);
    if (bottom !== undefined) expect(section.heading.top-bottom).toBeGreaterThanOrEqual(15);
    for (const card of section.cards) expect(card.top-section.heading.bottom).toBeGreaterThanOrEqual(15);
    bottom=Math.max(...section.cards.map(card=>card.bottom));
  }
}

test('added-time separators span every column, respect search and archive, and fit a phone', async ({ page }) => {
  await page.setViewportSize({width:1280,height:1000});
  await setup(page,[post(1,.25),post(2,.5),post(3,4),post(4,20),post(5,72),post(6,200),post(7,72,true),post(8,48),post(9,96),post(10,120),post(11,144),post(12,336),post(13,504),post(14,744),post(15,1488),post(16,2232)]);
  const headings=page.locator('.save-time-separator');
  await expect(headings).toHaveText(['Added today','Added earlier']);
  await expect(page.locator('.card-header .card-platform')).toHaveCount(15);
  await expect(page.locator('.card-header .card-platform .source-icon-chrome')).toHaveCount(15);
  await expect(page.locator('.card-header time')).toHaveCount(0);
  await expect(page.locator('[data-post-id="1"] .card-header .card-platform')).toHaveAttribute('aria-label','Chrome bookmarks');
  await expect(page.locator('.card-header').filter({hasText:/Added|Saved/})).toHaveCount(0);
  await checkSections(page);
  const alignment = await page.locator('.save-card').first().evaluate(card => {
    const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
    return {tag:rect(card.querySelector('.card-platform')),actions:rect(card.querySelector('.card-actions')),header:rect(card.querySelector('.card-header')),body:rect(card.querySelector('.card-body'))};
  });
  expect(alignment.tag.top).toBeGreaterThan(alignment.body.top);
  expect(alignment.tag.left).toBeGreaterThan(alignment.body.left);
  expect(alignment.actions.right).toBeLessThan(alignment.tag.left);
  expect(alignment.actions.right).toBeLessThan(alignment.body.right);
  expect(alignment.tag.bottom).toBeLessThan(alignment.header.bottom);
  await expect(page.locator('.card-footer .card-actions')).toHaveCount(0);
  await checkSections(page);
  await page.screenshot({path:'test-results/saved-time-separators.png',fullPage:true});
  await page.getByRole('searchbox').fill('Reference 3');
  await expect(page.locator('.save-card')).toHaveCount(1);
  await expect(headings).toHaveText(['Added today']);
  await page.getByRole('searchbox').fill('');
  await expect(headings).toHaveCount(2);
  await page.setViewportSize({width:390,height:844});
  await checkSections(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.archive-nav').click();
  await expect(headings).toHaveText(['Added earlier']);
  await expect(page.locator('.save-card')).toHaveCount(1);
});

test('appending a batch continues the current group without duplicate separators', async ({ page }) => {
  await page.setViewportSize({width:1280,height:600});
  await setup(page,Array.from({length:40},(_,index)=>post(index+1,(index<30?2:24)+index/100)));
  await expect(page.locator('.save-card')).toHaveCount(34);
  await expect(page.locator('.save-time-separator')).toHaveCount(2);
  await page.locator('.more-saves').scrollIntoViewIfNeeded();
  await expect(page.locator('.save-card')).toHaveCount(40);
  await expect(page.locator('.save-time-separator')).toHaveText(['Added today','Added earlier']);
  await checkSections(page);
});

test('the whole separator toggles its group, remembers the choice and keeps older groups available', async ({ page }) => {
  await page.setViewportSize({width:1280,height:600});
  const saved=[...Array.from({length:50},(_,index)=>post(index+1,2+index/100)),post(100,72)];
  await setup(page,saved);
  const day=page.getByRole('button',{name:'Added today',exact:true});
  const week=page.getByRole('button',{name:'Added earlier',exact:true});
  await expect(page.locator('.save-card[data-saved-group="added-today"]')).toHaveCount(24);
  await expect(week).toHaveAttribute('aria-expanded','true');
  await day.locator('.save-time-rule').click();
  await expect(day).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.save-card[data-saved-group="added-today"]:visible')).toHaveCount(0);
  await expect(page.locator('.more-saves[data-more-group="added-today"]')).toHaveCount(0);
  await expect(page.locator('.save-card[data-post-id="100"]')).toBeInViewport();
  await week.focus(); await page.keyboard.press('Space');
  await expect(week).toHaveAttribute('aria-expanded','false'); await expect(week).toBeFocused();
  await expect(page.locator('.save-card:visible')).toHaveCount(0);
  await expect.poll(()=>page.locator('.cards').evaluate(el=>el.offsetHeight)).toBeLessThan(180);
  await page.reload();
  await expect(day).toHaveAttribute('aria-expanded','false'); await expect(week).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.save-card')).toHaveCount(0);
  await week.click();
  await expect(week).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('.save-card:visible')).toHaveCount(1);
  await expect(page.locator('.save-card[data-post-id="100"]')).toBeVisible();
  await expect(page.locator('.save-card[data-post-id="100"] .card-content')).toHaveCSS('opacity','1');
  await page.screenshot({path:'test-results/collapsed-time-groups.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  await day.click();
  await expect(day).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('.save-card[data-saved-group="added-today"]:visible')).toHaveCount(24);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('addition groups update across local midnight without replacing the card', async ({ page }) => {
  await setup(page,[post(1,4),post(2,20)]);
  const card=page.locator('[data-post-id="1"]');
  const original=await card.elementHandle();
  await expect(page.locator('.save-time-separator')).toHaveText(['Added today','Added earlier']);
  await page.clock.setFixedTime(new Date('2026-11-03T18:31:00Z'));
  await expect(page.locator('.save-time-separator')).toHaveText(['Added earlier'],{timeout:8000});
  await expect(card.locator('.card-header time')).toHaveCount(0);
  expect(await original.evaluate(el=>el.isConnected)).toBe(true);
});
