import { test, expect } from '@playwright/test';
test.use({ storageState: { cookies: [], origins: [] } });
async function setup(page, count = 8, tall = false, instagramIndex = 1) {
  const posts = Array.from({length: count}, (_, i) => ({id: 8800+i, platform: i===instagramIndex?'instagram':'x', externalId: i===instagramIndex?'View1':String(900000+i), url: i===instagramIndex?'https://www.instagram.com/p/View1/':`https://x.com/i/status/${900000+i}`, title: `Reference ${i}`, text:'A useful reference with captured metadata.', author:'creator', authorName:'Creator', media:[], topics:['Design'], accounts:[], notes:i===0?'My interpretation of this post.':'', archived:false, savedAt:'2026-11-03T08:00:00Z', addedAt:new Date(Date.parse('2026-11-03T08:00:00Z')-i*60000).toISOString()}));
  await page.route('**/api/posts?scope=all',r=>r.fulfill({json:{posts,runs:[]}}));
  await page.route('https://platform.twitter.com/widgets.js',r=>r.fulfill({contentType:'text/javascript',body:`window.twttr={widgets:{createTweet:async(id,root)=>{const f=document.createElement('iframe');f.title='X fixture';f.src='https://platform.twitter.com/fixture';f.style.cssText='width:100%;height:'+(id==='900011'&&${tall}?'1800px':'260px');root.append(f);await new Promise(r=>f.onload=r);return f;}}};`}));
  await page.route('https://www.instagram.com/embed.js',r=>r.fulfill({contentType:'text/javascript',body:`window.instgrm={Embeds:{process:()=>{const b=document.querySelector('.instagram-media');const f=document.createElement('iframe');f.className='instagram-media';f.src='https://www.instagram.com/fixture';f.style.cssText='width:100%;height:360px';b.replaceWith(f);}}};`}));
  await page.route('**/fixture',r=>r.fulfill({contentType:'text/html',body:'<article>Original post preview</article>'}));
  await page.goto('/');
  await expect(page.locator('.save-card')).toHaveCount(count);
  await expect(page.locator('[data-post-id="8800"] .native-embed')).toHaveAttribute('data-embed-state','ready');
  return posts;
}
async function settled(page) { await expect(page.locator('.cards')).not.toHaveClass(/switching-view/); }
async function resizeWidget(widget,height) {
  return widget.evaluate((el,height)=>{
    el.style.height=`${height}px`;
    const reported=Math.ceil(el.parentElement.getBoundingClientRect().height);
    // Deliver the widget's normal height report deterministically even when
    // Chromium throttles ResizeObserver inside an offscreen nested iframe.
    el.ownerDocument.defaultView.parent.postMessage({source:'savex-native-embed',type:'resize',height:reported},'*');
    return reported;
  },height);
}

for (const [width, motion, platform] of [[1440, 'no-preference','x'], [1440, 'reduce','x'], [390, 'no-preference','x'], [1440,'no-preference','instagram']]) {
  test(`feed holds the reading position while ${platform} previews above grow and shrink (${width}px, ${motion})`, async ({page}) => {
    await page.setViewportSize({width, height:700}); await page.emulateMedia({reducedMotion:motion});
    await setup(page,24,false,platform==='instagram'?10:1);
    const above=page.locator('[data-post-id="8810"]'), focused=page.locator('[data-post-id="8811"]');
    await above.scrollIntoViewIfNeeded();
    await expect(above.locator('.native-embed')).toHaveAttribute('data-embed-state','ready');
    await focused.scrollIntoViewIfNeeded();
    await expect(focused.locator('.native-embed')).toHaveAttribute('data-embed-state','ready');
    await expect(page.locator('.embed-stage[data-layout-height]')).toHaveCount(0);
    await expect.poll(()=>page.locator('.cards').evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
    await focused.locator('.card-preview').evaluate(el=>scrollTo({top:scrollY+el.getBoundingClientRect().top-140,behavior:'instant'}));
    const player=await focused.locator('.embed-stage>iframe').elementHandle();
    const before=(await focused.locator('.card-preview').boundingBox()).y;
    const upperPlayer=page.frameLocator('[data-post-id="8810"] .embed-stage>iframe').locator('#embed-root>iframe');
    for (const height of [1400,260]) {
      await page.evaluate(()=>{
        window.readingSamples=[];
        const until=performance.now()+1100, preview=document.querySelector('[data-post-id="8811"] .card-preview');
        // Sample after the frame's layout/scroll compensation callbacks, rather
        // than observing an intermediate position earlier in the same frame.
        const sample=()=>{setTimeout(()=>window.readingSamples.push(preview.getBoundingClientRect().top),0);if(performance.now()<until)requestAnimationFrame(sample);};
        requestAnimationFrame(sample);
      });
      const reported=await resizeWidget(upperPlayer,height);
      await expect.poll(()=>above.locator('.embed-stage').evaluate(el=>Math.round(el.getBoundingClientRect().height))).toBe(reported);
      await expect.poll(()=>page.locator('.cards').evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
      await expect.poll(()=>page.evaluate(()=>window.readingSamples.length)).toBeGreaterThan(50);
      expect(await page.evaluate(before=>Math.max(...window.readingSamples.map(y=>Math.abs(y-before))),before)).toBeLessThan(5);
      expect(Math.abs((await focused.locator('.card-preview').boundingBox()).y-before)).toBeLessThan(2);
    }
    // Growing the focused post preserves its top/text, rather than scrolling
    // proportionally through its newly increased height.
    await resizeWidget(page.frameLocator('[data-post-id="8811"] .embed-stage>iframe').locator('#embed-root>iframe'),1100);
    await expect.poll(()=>focused.locator('.embed-stage').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(900);
    await expect.poll(()=>page.locator('.cards').evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
    expect(Math.abs((await focused.locator('.card-preview').boundingBox()).y-before)).toBeLessThan(2);
    // A deliberate scroll during another expansion remains under user control.
    await resizeWidget(upperPlayer,1000);
    await page.mouse.wheel(0,650);
    await expect.poll(()=>focused.locator('.card-preview').evaluate(el=>el.getBoundingClientRect().top)).toBeLessThan(before-300);
    await expect.poll(()=>page.locator('.cards').evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
    expect((await focused.locator('.card-preview').boundingBox()).y).toBeLessThan(before-300);
    expect(await player.evaluate(el=>el.isConnected)).toBe(true);
  });
}

for (const [width,motion] of [[1440,'no-preference'],[1440,'reduce'],[390,'no-preference']]) {
  test(`view changes keep the most visible post on screen (${width}px, ${motion})`,async({page})=>{
    await page.setViewportSize({width,height:700});await page.emulateMedia({reducedMotion:motion});
    await setup(page,24);
    const middle=page.locator('[data-post-id="8811"]');
    await middle.scrollIntoViewIfNeeded();
    await expect(middle.locator('.native-embed')).toHaveAttribute('data-embed-state','ready');
    await expect(page.locator('.embed-stage[data-layout-height]')).toHaveCount(0);
    const player=await middle.locator('.embed-stage>iframe').elementHandle();
    const focused=await page.locator('.save-card').evaluateAll(cards=>cards.map(card=>{
        const r=card.querySelector('.card-preview').getBoundingClientRect();
        return {id:card.dataset.postId,area:Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(0,r.top))*Math.max(0,Math.min(r.right,innerWidth)-Math.max(0,r.left)),distance:Math.abs((Math.max(0,r.top)+Math.min(innerHeight,r.bottom))/2-innerHeight/2)};
      }).sort((a,b)=>b.area-a.area||a.distance-b.distance)[0].id);
    for (const view of ['Grid','Feed','Grid','Feed']) {
      await page.getByRole('button',{name:`${view} view`,exact:true}).click();
      await settled(page);
      const preview=page.locator(`[data-post-id="${focused}"] .card-preview`);
      await expect(preview).toBeInViewport();
      expect(await preview.evaluate(el=>{
        const r=el.getBoundingClientRect();return Math.min(innerHeight,r.bottom)-Math.max(0,r.top);
      })).toBeGreaterThan(100);
      expect(await player.evaluate(el=>el.isConnected)).toBe(true);
    }
    // A manual scroll after the transition is never pulled back to the anchor.
    await page.evaluate(()=>scrollTo(0,0));
    await page.setViewportSize({width:width-10,height:700});
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  });
}

test('switching views preserves the visible middle of a tall post',async({page})=>{
  await page.setViewportSize({width:1440,height:700});await setup(page,24,true);
  const card=page.locator('[data-post-id="8811"]'),preview=card.locator('.card-preview');
  await card.scrollIntoViewIfNeeded();await expect(card.locator('.native-embed')).toHaveAttribute('data-embed-state','ready');
  await expect.poll(async()=>(await card.locator('.embed-stage').boundingBox()).height).toBeGreaterThan(1500);
  await expect(page.locator('.embed-stage[data-layout-height]')).toHaveCount(0);
  await preview.evaluate(el=>window.scrollTo({top:scrollY+el.getBoundingClientRect().top+800-innerHeight/2,behavior:'instant'}));
  const ratio=await preview.evaluate(el=>{const r=el.getBoundingClientRect();return (innerHeight/2-r.top)/r.height;});
  for(const view of ['Grid','Feed']) {
    await page.getByRole('button',{name:`${view} view`,exact:true}).click();await settled(page);
    expect(await preview.evaluate((el,ratio)=>{const r=el.getBoundingClientRect();return Math.abs(r.top+r.height*ratio-innerHeight/2);},ratio)).toBeLessThan(5);
  }
});

test('feed is the default; animated grid switches preserve native players, notes and the preference',async({page})=>{
  await setup(page);
  const cards=page.locator('.save-card'), first=cards.first();
  const feed=page.getByRole('button',{name:'Feed view',exact:true}), grid=page.getByRole('button',{name:'Grid view',exact:true});
  await expect(feed).toHaveAttribute('aria-pressed','true');
  const before=await first.boundingBox();expect(before.width).toBe(796);
  const rows=await cards.evaluateAll(items=>items.map(el=>el.getBoundingClientRect().x));expect(new Set(rows).size).toBe(1);
  const iframe=await first.locator('.embed-stage>iframe').elementHandle();
  const note=await first.getByLabel('Note',{exact:true}).elementHandle();
  await grid.click();
  expect(await page.locator('.cards').evaluate(el=>el.getAnimations({subtree:true}).some(a=>a.effect?.getKeyframes().some(k=>String(k.transform).includes('scale('))))).toBe(true);
  await settled(page);
  const compact=await first.boundingBox();expect(compact.width).toBeLessThan(400);expect(compact.width).toBeGreaterThan(280);
  expect(new Set(await cards.evaluateAll(items=>items.slice(0,3).map(el=>el.getBoundingClientRect().x))).size).toBe(3);
  expect(await iframe.evaluate(el=>el.isConnected)).toBe(true);expect(await note.evaluate(el=>el.isConnected)).toBe(true);
  await feed.click();await grid.click();await feed.click();await settled(page);
  expect((await first.boundingBox()).width).toBe(796);
  expect(await iframe.evaluate(el=>el.isConnected)).toBe(true);
  await page.reload();await expect(feed).toHaveAttribute('aria-pressed','true');
  await grid.click();await settled(page);await page.reload();await expect(grid).toHaveAttribute('aria-pressed','true');
});
test('both layouts fit a narrow screen and honor reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await setup(page);
  for(const name of ['Grid view','Feed view']) {
    await page.getByRole('button',{name,exact:true}).click();await settled(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('.cards').evaluate(el=>el.getAnimations().length)).toBe(0);
    expect((await page.locator('.save-card').first().boundingBox()).width).toBeLessThan(390);
  }
});

test('feed card edges stay aligned across platforms while Instagram preview content stays compact',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await setup(page);
  const instagram=page.locator('[data-post-id="8801"]'),preview=instagram.locator('.card-preview');
  expect((await preview.boundingBox()).width).toBe(500);
  expect((await page.locator('[data-post-id="8800"] .card-preview').boundingBox()).width).toBe(500);
  expect((await instagram.locator('.native-embed').boundingBox()).width).toBe(440);
  const loadedBounds=await preview.boundingBox();
  const xBounds=await page.locator('[data-post-id="8800"] .card-preview').boundingBox();
  expect(loadedBounds.x).toBe(xBounds.x);
  // Failure and retry retain the same outer card width and note alignment.
  await expect(instagram.locator('.native-embed')).toHaveAttribute('data-embed-state','ready');
  await page.frameLocator('[data-post-id="8801"] .embed-stage>iframe').locator('body').evaluate(el=>el.ownerDocument.defaultView.parent.postMessage({source:'savex-native-embed',type:'failed',reason:'Fixture unavailable'},'*'));
  await expect(instagram.locator('.native-embed')).toHaveAttribute('data-embed-state','failed');
  expect((await preview.boundingBox()).width).toBe(loadedBounds.width);
  expect((await preview.boundingBox()).x).toBe(loadedBounds.x);
  await instagram.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(instagram.locator('.native-embed')).toHaveAttribute('data-embed-state','ready');
  expect((await preview.boundingBox()).width).toBe(loadedBounds.width);
  const note=await instagram.locator('.card-note').boundingBox(),feed=await preview.boundingBox();
  expect(note.x-feed.x-feed.width).toBe(16);expect(note.width).toBe(240);
  const player=await instagram.locator('.embed-stage>iframe').elementHandle();
  await page.getByRole('button',{name:'Grid view',exact:true}).click();await settled(page);
  const colors=await instagram.evaluate(el=>Object.fromEntries(['.card-header','.card-footer','.card-preview'].map(selector=>[selector,getComputedStyle(el.querySelector(selector)).backgroundColor])));
  // Grid card bars are white so the card stands apart from the page background.
  expect(colors['.card-header']).toBe('rgb(255, 255, 255)');
  expect(colors['.card-footer']).toBe('rgb(255, 255, 255)');
  expect((await instagram.locator('.card-content').boundingBox()).width).toBe((await instagram.boundingBox()).width);
  await instagram.screenshot({path:'test-results/grid-tinted-bars.png'});
  await page.getByRole('button',{name:'Feed view',exact:true}).click();await settled(page);
  expect((await preview.boundingBox()).width).toBe(500);
  expect(await player.evaluate(el=>el.isConnected)).toBe(true);
  await instagram.screenshot({path:'test-results/feed-compact-instagram.png'});
  await page.setViewportSize({width:950,height:1000});
  await expect(page.locator('.cards')).toHaveAttribute('data-side-notes','false');
  expect((await preview.boundingBox()).width).toBe(500);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('feed notes sit beside the post without increasing its height, stack in grid, and keep autosave and players',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await setup(page);
  const card=page.locator('[data-post-id="8800"]'), note=card.locator('.card-note'), field=card.getByLabel('Note',{exact:true});
  const bounds=await card.evaluate(el=>{
    const preview=el.querySelector('.card-preview').getBoundingClientRect(),note=el.querySelector('.card-note').getBoundingClientRect(),header=el.querySelector('.card-header').getBoundingClientRect();
    return {postWidth:preview.width,postRight:preview.right,noteLeft:note.left,noteWidth:note.width,noteTop:note.top,previewTop:preview.top,previewLeft:preview.left,headerTop:header.top,headerRight:header.right};
  });
  expect(bounds.postWidth).toBe(500);expect(bounds.noteWidth).toBe(240);expect(bounds.noteLeft-bounds.postRight).toBe(16);expect(bounds.noteTop-bounds.previewTop).toBe(8);expect(bounds.headerTop).toBeGreaterThanOrEqual(bounds.previewTop);expect(bounds.headerRight).toBeLessThan(bounds.previewLeft);
  await expect(card.locator('.feed-source-pill')).toBeHidden();
  const actions=await card.locator('.card-actions button:visible').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {x:r.x,y:r.y};}));
  expect(actions).toHaveLength(3);expect(new Set(actions.map(r=>r.x)).size).toBe(1);expect(actions[1].y).toBeGreaterThan(actions[0].y);expect(actions[2].y).toBeGreaterThan(actions[1].y);
  await card.screenshot({path:"test-results/feed-side-notes.png"});
  const player=await card.locator('.embed-stage>iframe').elementHandle();
  const host=page.frameLocator('[data-post-id="8800"] .embed-stage>iframe');
  await expect(host.locator('#embed-root')).toHaveCSS('zoom','0.88');
  expect(await host.locator('#embed-root>iframe').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(260);
  await expect(page.locator('.embed-stage[data-layout-height]')).toHaveCount(0);
  const height=(await card.boundingBox()).height;
  let saved='';
  await page.route('**/api/posts/8800',route=>{saved=route.request().postDataJSON().notes;return route.fulfill({json:{id:8800,notes:saved,updatedAt:new Date().toISOString()}});});
  await expect(card.getByRole('button',{name:'Edit note',exact:true})).toHaveCount(0);
  await field.click();await field.fill('A short thought beside this reference.');
  await expect.poll(()=>saved).toBe('A short thought beside this reference.');
  expect((await card.boundingBox()).height).toBeCloseTo(height,0);
  await page.getByRole('button',{name:'Grid view',exact:true}).click();await settled(page);
  expect(await player.evaluate(el=>el.isConnected)).toBe(true);
  expect((await note.boundingBox()).y).toBeLessThan((await card.locator('.card-preview').boundingBox()).y);
  await page.getByRole('button',{name:'Feed view',exact:true}).click();await settled(page);
  await page.setViewportSize({width:950,height:1000});
  await expect(page.locator('.cards')).toHaveAttribute('data-side-notes','false');
  expect((await note.boundingBox()).y).toBeGreaterThan((await card.locator('.card-preview').boundingBox()).y);
  expect(await player.evaluate(el=>el.isConnected)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('empty feed notes are directly editable, stay visible when cleared, and keep collection pills below the note',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});const posts=await setup(page);
  const card=page.locator('[data-post-id="8801"]'),note=card.locator('.card-note'),field=card.getByLabel('Note',{exact:true});
  await expect(field).toBeVisible();await expect(field).toHaveValue('');await expect(field).toHaveAttribute('placeholder','No notes added yet.');
  await expect(card.getByRole('button',{name:'Edit note',exact:true})).toHaveCount(0);
  const geometry=await card.evaluate(el=>{const n=el.querySelector('.card-note').getBoundingClientRect(),f=el.querySelector('.card-footer').getBoundingClientRect(),p=el.querySelector('.card-preview').getBoundingClientRect(),r=el.getBoundingClientRect();return {gap:f.top-n.bottom,sameColumn:f.left===n.left,previewTop:p.top,cardTop:r.top};});
  expect(geometry.gap).toBe(10);expect(geometry.sameColumn).toBe(true);expect(geometry.previewTop).toBe(geometry.cardTop);
  let writes=0;
  await page.route('**/api/posts/8801',r=>{writes++;const post=posts.find(p=>p.id===8801);post.notes=r.request().postDataJSON().notes;return r.fulfill({json:{...post,updatedAt:new Date().toISOString()}});});
  await note.click({position:{x:10,y:10}});await expect(field).toBeFocused();expect(writes).toBe(0);
  await field.fill('Context for my AI assistant.');await expect(card.locator('.note-status')).toHaveAttribute('data-state','saved');
  const player=await card.locator('.embed-stage>iframe').elementHandle();
  await field.fill('');await card.locator('.collection-add').focus();await expect(field).toHaveValue('');await expect(field).toBeVisible();
  await page.route('**/api/posts/8801/collections',r=>{const post=posts.find(p=>p.id===8801);post.topics=['Design','Research'];return r.fulfill({json:{post,topics:[{id:42,name:'Research'}]}});});
  await card.getByRole('button',{name:'Add to collection',exact:true}).click();
  await page.getByRole('searchbox',{name:'Collection name',exact:true}).fill('Research');await page.getByRole('button',{name:'Create “Research”',exact:true}).click();
  await expect(card.locator('.card-tags .tag')).toHaveText(['Design','Research']);
  await expect(field).toBeVisible();expect(await player.evaluate(el=>el.isConnected)).toBe(true);
  await card.screenshot({path:'test-results/feed-direct-note.png'});
  await page.getByRole('button',{name:'Grid view',exact:true}).click();await settled(page);
  await expect(card.getByRole('button',{name:'Edit note',exact:true})).toBeVisible();await expect(field).toBeHidden();
  await page.getByRole('button',{name:'Feed view',exact:true}).click();await settled(page);
  await expect(field).toBeVisible();await expect(field).toHaveAttribute('placeholder','No notes added yet.');
});
