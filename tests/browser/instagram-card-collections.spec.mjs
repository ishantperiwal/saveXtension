import {test,expect} from '@playwright/test';
const collections=[{id:11,account:'@me',name:'Design references for motion, typography and interface systems'},{id:12,account:'@me',name:'AI tools'},{id:13,account:'@other',name:'Other account folder'}];
const base={text:'A reference',notes:'',tags:[],topics:['Local collection'],folders:[],media:[],archived:false,savedAt:'2026-11-01T00:00:00Z'};
const initial=[
  {...base,id:1,platform:'instagram',accounts:['@me','@other'],url:'https://www.instagram.com/p/SharedFolder/',collections:collections.map(c=>({id:c.id}))},
  {...base,id:2,platform:'instagram',accounts:['@me'],url:'https://www.instagram.com/p/Uncollected/',collections:[]},
  {...base,id:3,platform:'x',accounts:['@writer'],url:'https://x.com/i/status/809000003',collections:[collections[0]]},
  {...base,id:4,platform:'instagram',accounts:['@me'],url:'https://www.instagram.com/p/ArchivedFolder/',collections:[collections[0]],archived:true}
];
const label=(page,id)=>page.locator(`[data-post-id="${id}"] .card-source-collection`);
async function setup(page){
  const model={posts:initial.map(p=>({...p})),collections:collections.map(c=>({...c}))};
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('https://**/*',route=>route.abort());
  await page.route('https://www.instagram.com/embed.js',route=>route.fulfill({contentType:'text/javascript',body:`window.instgrm={Embeds:{process(){const block=document.querySelector('.instagram-media');if(!block)return;const frame=document.createElement('iframe');frame.title='Instagram fixture';frame.className='instagram-media';frame.src='https://www.instagram.com/fixture/post';frame.style.height='260px';block.replaceWith(frame);}}};`}));
  await page.route('https://www.instagram.com/fixture/post',route=>route.fulfill({contentType:'text/html',body:'<p>Original Instagram post preview</p>'}));
  await page.route('**/api/posts?scope=all',route=>route.fulfill({json:{posts:model.posts,runs:[],instagramCollections:model.collections}}));
  await page.route('**/api/sync',route=>route.fulfill({json:{job:null,browser:null}}));
  await page.goto('/');return model;
}

test('source collection names appear only in consolidated views and match the selected owner',async({page})=>{
  await setup(page);
  await expect(label(page,1)).toHaveText('AI tools, Design references for motion, typography and interface systems, Other account folder');
  await expect(label(page,2)).toHaveCount(0);await expect(label(page,3)).toHaveCount(0);
  await page.locator('[data-nav-account="instagram:@me"]').click();
  await expect(label(page,1)).toHaveText('AI tools, Design references for motion, typography and interface systems');
  await expect(page.locator('[data-post-id="1"] .card-footer')).toContainText('Local collection');
  const toggle=page.getByRole('button',{name:'Toggle Instagram collections for @me',exact:true});
  if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await page.locator('[data-instagram-collection="11"]').click();await expect(page.locator('.card-source-collection')).toHaveCount(0);
  await page.locator('[data-nav-account="instagram:@me"]').click();await expect(label(page,1)).toBeVisible();
  await page.locator('[data-nav-account="instagram:@other"]').click();await expect(label(page,1)).toHaveText('Other account folder');
  await page.locator('[data-post-id="1"] .tag').click();await expect(page.locator('.card-source-collection')).toHaveCount(0);
  await page.locator('[data-filter="all"]').click();await expect(label(page,1)).toBeVisible();
  await page.locator('.archive-nav').click();await expect(page.locator('.card-source-collection')).toHaveCount(0);
});

test('long names truncate beside the icon and refresh without replacing native previews',async({page})=>{
  const model=await setup(page);await page.locator('[data-nav-account="instagram:@me"]').click();
  const card=page.locator('[data-post-id="1"]');await expect(card.locator('.native-embed')).toHaveAttribute('data-embed-state','ready');
  const player=await card.locator('.embed-stage > iframe').elementHandle();
  for(const width of [1100,390]){
    await page.setViewportSize({width,height:1000});
    await expect(label(page,1)).toHaveAttribute('title','AI tools, Design references for motion, typography and interface systems');
    const bounds=await card.locator('.card-header').evaluate(header=>{
      const label=header.querySelector('.card-source-collection'),actions=header.querySelector('.card-actions').getBoundingClientRect(),icon=header.querySelector('.card-platform').getBoundingClientRect(),r=label.getBoundingClientRect();
      return{truncated:label.scrollWidth>label.clientWidth,actionsRight:actions.right,left:r.left,right:r.right,iconLeft:icon.left};
    });
    expect(bounds.truncated).toBe(true);expect(bounds.actionsRight).toBeLessThan(bounds.left);expect(bounds.right).toBeLessThan(bounds.iconLeft);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await card.locator('.card-header').screenshot({path:'test-results/instagram-collection-header.png'});
  model.collections[0]={...model.collections[0],name:'New collection name'};
  await expect(label(page,1)).toHaveText('AI tools, New collection name',{timeout:8000});
  expect(await player.evaluate(el=>el.isConnected)).toBe(true);
});

test('feed source pills stay hidden while source metadata and native previews remain intact',async({page})=>{
  const model=await setup(page);await page.getByRole('button',{name:'Feed view',exact:true}).click();
  const card=page.locator('[data-post-id="1"]'),pill=card.locator('.feed-source-pill');
  await expect(pill).toBeHidden();await expect(pill).toHaveText('@me · AI tools · Design references for motion, typography and interface systems · @other · Other account folder');
  await expect(page.locator('[data-post-id="3"] .feed-source-pill')).toHaveText('@writer');
  await expect(page.locator('[data-post-id="2"] .feed-source-pill')).toHaveText('@me');
  const player=await card.locator('.embed-stage > iframe').elementHandle();
  await page.locator('[data-nav-account="instagram:@me"]').click();await expect(pill).toHaveText('@me · AI tools · Design references for motion, typography and interface systems');
  const toggle=page.getByRole('button',{name:'Toggle Instagram collections for @me',exact:true});if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await page.locator('[data-instagram-collection="11"]').click();await expect(pill).toHaveText('@me · Design references for motion, typography and interface systems');
  expect(await player.evaluate(el=>el.isConnected)).toBe(true);
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    await expect(pill).toBeHidden();await expect(card.locator('.card-preview')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'Grid view',exact:true}).click();await expect(pill).toBeHidden();
  await page.getByRole('button',{name:'Feed view',exact:true}).click();await expect(pill).toBeHidden();expect(await player.evaluate(el=>el.isConnected)).toBe(true);
  model.collections[0].name='Updated source collection';await expect(pill).toHaveText('@me · Updated source collection',{timeout:8000});
});
