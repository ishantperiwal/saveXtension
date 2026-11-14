import { test, expect } from '@playwright/test';

for (const [platform, keys, hint] of [['MacIntel', 'Meta+f', '⌘ F'], ['Win32', 'Control+f', 'Ctrl F'], ['Linux x86_64', 'Control+f', 'Ctrl F']]) {
  test(`${platform}: find shortcut focuses and selects library search`, async ({ page, context }) => {
    await context.addInitScript(platform => {
      Object.defineProperty(navigator, 'platform', { get: () => platform });
      Object.defineProperty(navigator, 'userAgentData', { get: () => ({ platform }) });
    }, platform);
    await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [
      { id: 9901, platform: 'chrome', url: 'https://search-fixture.example/reference', bookmarkTitle: 'Motion reference', title: '', text: '', author: '', authorName: '', thumbnail: '', media: [], kind: 'text', tags: [], topics: ['Design'], accounts: [], notes: '', savedAt: '2026-10-31T12:00:00Z', favorite: false, archived: false, folders: [] }
    ], runs: [] } }));
    await page.goto('/');
    await expect(page.locator('.search kbd')).toHaveText(hint);
    await expect(page.locator('.source-nav .source-icon')).toHaveCount(3);
    const search = page.getByRole('searchbox', { name: 'Search saves' });
    await search.fill('Motion');
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.keyboard.press(keys);
    await expect(page.locator('#modal')).not.toBeVisible();
    await expect(search).toBeFocused();
    expect(await search.evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([0, 6]);
    await page.keyboard.type('reference');
    await expect(search).toHaveValue('reference');
    await expect(page.locator('.save-card')).toHaveCount(1);
    // ⌘F floats the search over a dimmed library, and Enter puts it back before anything else is clicked.
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('reference');
    await page.keyboard.press('/'); await expect(search).not.toBeFocused();
    await search.focus(); await page.keyboard.press('Escape');
    await expect(search).toHaveValue(''); await expect(search).not.toBeFocused();
    const box = await page.locator('.sidebar').boundingBox();
    expect(box.x).toBeGreaterThan(0); expect(box.y).toBeGreaterThan(0);
    if (platform === 'MacIntel') {
      await page.screenshot({ path: 'test-results/floating-sidebar-desktop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.screenshot({ path: 'test-results/floating-sidebar-mobile.png', fullPage: true });
    }
  });
}

async function searchFixture(page,count=60,other=false) {
  const common={text:'',author:'',authorName:'',thumbnail:'',media:[],kind:'text',tags:[],topics:['Design'],accounts:[],notes:'',folders:['References'],savedAt:'2026-11-03T10:00:00Z',archived:false};
  const posts=Array.from({length:count},(_,index)=>({...common,id:10000+index,platform:'chrome',url:`https://search-fixture.example/${index}`,bookmarkTitle:`Reference ${index}`}));
  if(other)posts.push({...common,id:20000,platform:'instagram',url:'https://www.instagram.com/p/SearchScope/',text:'Reference on Instagram',accounts:['@other']});
  await page.route('https://**/*',route=>route.abort());
  await page.route('**/api/posts?scope=all',route=>route.fulfill({json:{posts,runs:[]}}));
  await page.goto('/'); await page.locator('[data-filter="chrome"]').click();
  return page.getByRole('searchbox',{name:'Search saves'});
}
async function findShortcut(page) {
  const mac=await page.evaluate(()=>/Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform||navigator.platform||''));
  await page.keyboard.press(mac?'Meta+f':'Control+f');
}

test('search, layout controls and Filters stick together while posts scroll',async({page})=>{
  await page.setViewportSize({width:1440,height:700});
  await searchFixture(page);
  const controls=page.locator('.search-tools'), search=page.locator('.search');
  const initial=await controls.boundingBox();
  expect((await search.boundingBox()).width).toBeLessThan(250);
  expect(initial.x+initial.width).toBe(1416);
  const searchBounds=await search.boundingBox(),filterBounds=await page.locator('#open-filters').boundingBox();
  expect(filterBounds.y).toBe(searchBounds.y);expect(filterBounds.height).toBe(searchBounds.height);
  await page.evaluate(()=>scrollTo(0,650));
  await expect.poll(async()=>Math.round((await controls.boundingBox()).y)).toBe(16);
  // Filters is pinned too, level with the search bar.
  await expect(page.getByRole('button',{name:'Filters',exact:true})).toBeInViewport();
  expect(Math.round((await page.locator('#open-filters').boundingBox()).y)).toBe(Math.round((await search.boundingBox()).y));
  for(const view of ['Feed','Grid']) {
    await page.getByRole('button',{name:`${view} view`,exact:true}).click();
    await expect(page.locator('.cards')).toHaveAttribute('data-view',view.toLowerCase());
    expect(Math.round((await controls.boundingBox()).y)).toBe(16);
  }
  await findShortcut(page);
  await expect(page.getByRole('searchbox',{name:'Search saves'})).toBeFocused();
  await page.keyboard.press('Escape');
  for(const width of [800,390]) {
    await page.setViewportSize({width,height:700});
    await page.evaluate(()=>scrollTo(0,0));
    const tools=await controls.boundingBox(), filters=await page.locator('.collection-tools').boundingBox();
    expect(filters.y).toBeGreaterThanOrEqual(tools.y+tools.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.evaluate(()=>scrollTo(0,1000));
    await expect.poll(async()=>Math.round((await controls.boundingBox()).y)).toBe(16);
    // On narrow screens Filters pins on its own line just below search.
    await expect(page.getByRole('button',{name:'Filters',exact:true})).toBeInViewport();
    expect((await page.locator('#open-filters').boundingBox()).y).toBeGreaterThanOrEqual((await controls.boundingBox()).y+(await controls.boundingBox()).height);
  }
});

test('Escape restores the unsearched source, loaded batch and scroll position',async({page})=>{
  await page.setViewportSize({width:1440,height:700});
  const search=await searchFixture(page,300);
  await expect.poll(()=>page.locator('.save-card').count()).toBeGreaterThanOrEqual(24);
  const initial=await page.locator('.save-card').count(); expect(initial).toBeLessThan(300);
  await page.locator('.more-saves').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.locator('.save-card').count()).toBeGreaterThan(initial);
  const anchor=page.locator('.save-card[data-post-id="10270"]');
  await anchor.scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>scrollY), rect=await anchor.boundingBox();
  const loaded=await page.locator('.save-card').count();
  expect(before).toBeGreaterThan(100);
  await findShortcut(page); await search.fill('Reference 59');
  await expect(page.locator('.save-card')).toHaveCount(1);
  await expect(page.locator('.save-card')).toHaveAttribute('data-post-id','10059');
  await search.press('Escape');
  await expect(search).toHaveValue(''); await expect(search).not.toBeFocused();
  await expect(page.locator('.save-card')).toHaveCount(loaded);
  await expect(page.locator('[data-filter="chrome"]')).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.evaluate(original=>Math.abs(scrollY-original),before)).toBeLessThan(3);
  expect(Math.abs((await anchor.boundingBox()).y-rect.y)).toBeLessThan(3);
});

test('Escape respects dialogs and notes, clears pending searches, and keeps a newly selected account',async({page})=>{
  const search=await searchFixture(page,2,true);
  await search.fill('Reference');
  await page.getByRole('button',{name:'Filters',exact:true}).click();
  await page.keyboard.press('Escape'); await expect(page.locator('#modal')).not.toBeVisible();
  await expect(search).toHaveValue('Reference');
  await page.keyboard.press('Escape'); await expect(search).toHaveValue('');
  await search.fill('Reference'); await expect(page.locator('.save-card')).toHaveCount(2);
  await page.locator('.save-card').first().getByRole('button',{name:'Edit note',exact:true}).click();
  const note=page.locator('.save-card').first().getByLabel('Note',{exact:true});
  await note.press('Escape'); await expect(note).toBeFocused(); await expect(search).toHaveValue('Reference');
  await findShortcut(page); await search.press('Escape'); await expect(search).toHaveValue('');
  await search.fill('No matching post'); await search.press('Escape');
  await expect(search).toHaveValue(''); await expect(page.locator('.save-card')).toHaveCount(2);
  await search.fill('Reference');
  await page.locator('[data-nav-account="instagram:@other"]').click();
  await expect(page.locator('.save-card')).toHaveCount(1);
  await page.keyboard.press('Escape'); await expect(search).toHaveValue('');
  await expect(page.locator('[data-nav-account="instagram:@other"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.save-card')).toHaveCount(1);
});
