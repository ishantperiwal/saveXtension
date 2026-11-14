import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const base={id:401,platform:'x',url:'https://x.com/i/status/930000001',externalId:'930000001',author:'creator',text:'A reference to review before removing.',accounts:['@one','@two'],topics:['Design'],notes:'A note',media:[],archived:false,addedAt:new Date().toISOString(),savedAt:new Date().toISOString()};
async function mocked(page){
 const model={posts:[{...base}],confirmed:[],prepared:0,job:null,ack:0};
 await page.route('https://**/*',r=>r.abort());
 await page.route('**/api/posts?scope=all',r=>r.fulfill({json:{posts:model.posts,runs:[]}}));
 await page.route('**/api/sync',r=>r.fulfill({json:{job:null,browser:{online:true,ready:true,unsave:true},unsave:model.job}}));
 await page.route('**/api/posts/401/unsave/prepare',r=>{model.prepared++;return r.fulfill({json:{nonce:`nonce-${model.prepared}`,accounts:model.posts[0].accounts}});});
 await page.route('**/api/posts/401/unsave',r=>{model.confirmed.push(r.request().postDataJSON());model.job={id:'a'.repeat(24),post_id:401,platform:'x',url:base.url,account:r.request().postDataJSON().account,status:'queued'};return r.fulfill({json:model.job});});
 await page.route('**/api/unsave/*/ack',r=>{model.ack++;model.job=null;return r.fulfill({json:{ok:true}});});
 await page.goto('/');return model;
}
test('a compact unsave confirmation requires an account but no checkbox; cancelling never queues a platform action',async({page})=>{
 const model=await mocked(page);const action=page.getByRole('button',{name:'Unsave on X',exact:true});await action.click();
 const confirm=page.locator('#unsave-confirm');
 await expect(page.getByRole('heading',{name:'Unsave on X?',exact:true})).toBeVisible();await expect(page.locator('#unsave-cancel')).toBeFocused();await expect(confirm).toBeDisabled();
 await expect(page.locator('#unsave-form').getByRole('checkbox')).toHaveCount(0);
 await page.getByRole('radio',{name:'@one',exact:true}).check();await expect(confirm).toBeEnabled();
 await page.getByRole('radio',{name:'@two',exact:true}).check();await expect(confirm).toBeEnabled();
 await expect(page.locator('#unsave-form')).toContainText('This account’s save will be removed from X and saveXtension.');await expect(page.locator('#unsave-form')).not.toContainText('Archive');
 await expect(page.locator('.unsave-browser-note')).toContainText('Chrome will open briefly');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(model.confirmed).toEqual([]);await expect(page.locator('.save-card')).toHaveCount(1);
 await action.click();await page.getByRole('radio',{name:'@two',exact:true}).check();await confirm.click();
 // The unsave queue asks for a fresh confirmation code just before it sends, so the third one is used.
 await expect.poll(()=>model.confirmed).toEqual([{nonce:'nonce-3',confirmed:true,account:'@two'}]);await expect(page.locator('.save-card')).toHaveCount(1);
 model.posts=[];model.job={...model.job,status:'succeeded',deleted:1};
 await expect(page.locator('.save-card')).toHaveCount(0,{timeout:8000});await expect(page.locator('.archive-nav .nav-count')).toHaveText('0');await expect.poll(()=>model.ack).toBe(1);
 await expect(page.locator('#toast')).toHaveText('Unsaved on X.');
});
test('an unverified result keeps the local save and reports failure instead of claiming deletion',async({page})=>{
 const model=await mocked(page);model.posts[0].accounts=['@one'];await page.reload();
 await page.getByRole('button',{name:'Unsave on X',exact:true}).click();
 await expect(page.locator('#unsave-form')).toContainText('This post will be unsaved from X and deleted from saveXtension.');
 await expect(page.locator('#unsave-form').getByRole('radio')).toHaveCount(0);await expect(page.locator('#unsave-form').getByRole('checkbox')).toHaveCount(0);
 await expect(page.locator('#unsave-confirm')).toBeEnabled();await page.locator('#modal').screenshot({path:'test-results/unsave-simple-confirmation.png'});await page.locator('#unsave-confirm').click();
 // The queue sends the unsave a moment after the click, so the result is only set once it has.
 await expect.poll(()=>model.confirmed.length).toBe(1);model.job={...model.job,status:'uncertain',message:'Couldn’t verify the unsave. Check the original post.'};
 await expect(page.locator('#toast')).toHaveText(model.job.message,{timeout:8000});await expect(page.locator('.save-card')).toHaveCount(1);await expect(page.locator('.archive-nav .nav-count')).toHaveText('0');
});

test('the real helper unsaves X and Instagram fixtures once, verifies after reload, then deletes locally without archiving',async({baseURL},testInfo)=>{
 test.setTimeout(100000);const profile=await mkdtemp(resolve(tmpdir(),'savex-unsave-')),extension=resolve(profile,'extension');await cp(resolve('extension'),extension,{recursive:true});
 const bg=resolve(extension,'background.js');await writeFile(bg,(await readFile(bg,'utf8')).replace("const DEFAULT_ORIGIN = 'http://localhost:3210'",`const DEFAULT_ORIGIN = ${JSON.stringify(baseURL)}`));
 // Headless Chromium can report inactive tabs as visible. Simulate a hidden
 // renderer with paused native frames before the real document-start shim.
 // This modification exists only in the disposable test extension copy.
 const renderPath=resolve(extension,'background-render.js');
 await writeFile(renderPath,`if(!window.__savexBackgroundFrames){Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});window.requestAnimationFrame=()=>0;window.cancelAnimationFrame=()=>{};}\n`+await readFile(renderPath,'utf8'));
 const manifest=JSON.parse(await readFile(resolve(extension,'manifest.json'),'utf8'));manifest.host_permissions.push('https://x.com/*','https://www.instagram.com/*');await writeFile(resolve(extension,'manifest.json'),JSON.stringify(manifest));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 let rejectX=false;const saved={x:true,instagram:true},clicks={x:0,instagram:0},loads={x:0,instagram:0},actions={x:[],instagram:[]};
 const xId='930000009',igId='UnsaveFixture';
 const xContent=()=>`<a data-testid="AppTabBar_Profile_Link" href="/one">Profile</a><button data-testid="SideNav_AccountSwitcher_Button" onclick="document.querySelector('#menu').hidden=!document.querySelector('#menu').hidden">Accounts</button><div id="menu" hidden><button>Log out @one</button></div><main><article data-testid="tweet"><a href="/writer/status/${xId}"><time>Today</time></a><div data-testid="tweetText">Unsave X fixture</div><button data-testid="${saved.x?'removeBookmark':'bookmark'}" aria-label="${saved.x?'235 Bookmarks. Remove Bookmark':'235 Bookmarks. Bookmark'}" onclick="fetch('/test-unsave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hidden:document.hidden,shim:!!window.__savexBackgroundFrames})}).then(()=>requestAnimationFrame(()=>{this.dataset.testid='bookmark';this.setAttribute('aria-label','235 Bookmarks. Bookmark');}))">Bookmark control</button></article></main>`;
 // The profile, account controls, post and state changes all need animation
 // callbacks, just like a client-rendered site in a non-painting tab.
 const xShell=()=>`<div id="root"></div><script>if(location.pathname.includes('/status/'))history.replaceState(null,'','/writer/status/${xId}');requestAnimationFrame(()=>document.querySelector('#root').innerHTML=${JSON.stringify(xContent())});</script>`;
 const igShell=()=>`<aside><a href="/">Home</a><a href="/direct/inbox/">Messages</a><a href="/explore/">Search</a><a href="/one/"><img alt="one's profile picture"></a><a href="/one/saved/all-posts/">Saved</a></aside><main><div><section><button><svg aria-label="Like"></svg></button><button><svg aria-label="Comment"></svg></button><button id="save"><svg aria-label="${saved.instagram?'Remove':'Save'}"></svg></button></section><a href="/writer/reel/${igId}/"><time>Today</time></a></div><div><a href="/reel/AnotherPost/">Recommendation</a></div></main><script>
 document.querySelector('#save').onclick=()=>{
  const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.innerHTML='<h2>Remove from saved?</h2><button>Remove</button>';
  dialog.querySelector('button').onclick=async()=>{await fetch('/test-unsave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hidden:document.hidden,shim:!!window.__savexBackgroundFrames})});document.querySelector('#save svg').setAttribute('aria-label','Save');dialog.remove();};document.body.append(dialog);
 };</script>`;
 try{
  await context.route('https://x.com/**',r=>{if(r.request().url().includes('/test-unsave')){clicks.x++;actions.x.push(r.request().postDataJSON());if(!rejectX)saved.x=false;return r.fulfill({json:{ok:true}});}if(r.request().url().includes('/status/'))loads.x++;return r.fulfill({contentType:'text/html',body:xShell()});});
  await context.route('https://www.instagram.com/**',r=>{if(r.request().url().includes('/test-unsave')){clicks.instagram++;actions.instagram.push(r.request().postDataJSON());saved.instagram=false;return r.fulfill({json:{ok:true}});}if(r.request().url().includes('/p/'))loads.instagram++;return r.fulfill({contentType:'text/html',body:new URL(r.request().url()).pathname.startsWith('/reel/')?'<main><button><svg aria-label="Remove"></svg></button><button><svg aria-label="Save"></svg></button></main>':igShell()});});
  await context.route('https://platform.twitter.com/**',r=>r.abort());
  let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
  await worker.evaluate(async()=>chrome.storage.local.set({xAccountCatalog:{active:'@one',accounts:[{handle:'@one'}],checkedAt:Date.now(),busy:false}}));
  const page=await context.newPage();await page.goto(`${baseURL}/`);
  await page.request.post('/api/posts/import',{headers:{Origin:baseURL},data:{posts:[{url:`https://x.com/i/status/${xId}`,accounts:['@one'],notes:'Delete this X note',topics:['Test collection'],topicsCurated:true},{url:`https://www.instagram.com/reel/${igId}/`,accounts:['@one'],notes:'Delete this Instagram note',topics:['Test collection'],topicsCurated:true}]}});
  await page.reload();await expect.poll(async()=>(await(await page.request.get('/api/sync')).json()).browser?.unsave).toBe(true);
  for(const [platform,url] of [['x',`https://x.com/i/status/${xId}`],['instagram',`https://www.instagram.com/reel/${igId}/`]]){
   const data=await(await page.request.get('/api/posts?scope=all')).json(),post=data.posts.find(p=>p.url===url),label=platform==='x'?'X':'Instagram';
   const card=page.locator(`[data-post-id="${post.id}"]`);await card.getByRole('button',{name:`Unsave on ${label}`,exact:true}).click();
   await expect(page.locator('#unsave-confirm')).toBeEnabled();await expect(page.locator('#unsave-form').getByRole('checkbox')).toHaveCount(0);
   if(platform==='instagram')await page.locator('#modal').screenshot({path:testInfo.outputPath('unsave-confirmation.png')});
   await page.locator('#unsave-confirm').click();
   await expect.poll(()=>worker.evaluate(async()=>(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0]?.url)).toContain(platform==='x'?'x.com/':'instagram.com/');
   try{await expect.poll(async()=>(await(await page.request.get('/api/posts?scope=all')).json()).posts.some(p=>p.id===post.id),{timeout:40000}).toBe(false);}catch(error){console.log(platform,await(await page.request.get('/api/sync')).json(),{saved,clicks,loads});throw error;}
   expect(saved[platform]).toBe(false);expect(clicks[platform]).toBe(1);expect(loads[platform]).toBeGreaterThanOrEqual(2);
   expect(actions[platform]).toEqual([{hidden:true,shim:true}]);
   const foreground=await worker.evaluate(async()=>(await chrome.tabs.query({active:true,currentWindow:true}))[0].url);expect(foreground).toBe(`${baseURL}/`);
   await expect.poll(()=>worker.evaluate(async()=>Object.keys((await chrome.storage.session.get('savexWorkTabs')).savexWorkTabs?.tabs||{}))).toEqual([]);expect(await worker.evaluate(async()=>(await chrome.tabGroups.query({title:'Save Extension Tabs'})).length)).toBe(0);
   // A stale local reference can outlive an upstream unsave. Confirming it
   // removes only the local data; clicking the now-empty bookmark would save it again.
   const priorClicks=clicks[platform],priorLoads=loads[platform];
   await page.request.post('/api/posts/import',{headers:{Origin:baseURL},data:{posts:[{url,accounts:['@one'],notes:'Stale reference to remove',topics:['Test collection'],topicsCurated:true}]}});
   await page.reload();
   const stale=(await(await page.request.get('/api/posts?scope=all')).json()).posts.find(post=>post.url===url);
   await page.locator(`[data-post-id="${stale.id}"]`).getByRole('button',{name:`Unsave on ${label}`,exact:true}).click();await page.locator('#unsave-confirm').click();
   await expect.poll(async()=>(await(await page.request.get('/api/posts?scope=all')).json()).posts.some(post=>post.id===stale.id),{timeout:40000}).toBe(false);
   expect(clicks[platform]).toBe(priorClicks);expect(saved[platform]).toBe(false);expect(loads[platform]).toBeGreaterThanOrEqual(priorLoads+2);
   await expect(page.locator('#toast')).toHaveText('Removed from saveXtension.');
   await expect.poll(()=>worker.evaluate(async()=>Object.keys((await chrome.storage.session.get('savexWorkTabs')).savexWorkTabs?.tabs||{}))).toEqual([]);
  }
  // A local visual toggle is insufficient: rejected upstream writes must keep
  // the local record, and the helper must never toggle again to retry it.
  rejectX=true;saved.x=true;clicks.x=0;
  await page.request.post('/api/posts/import',{headers:{Origin:baseURL},data:{posts:[{url:`https://x.com/i/status/${xId}`,accounts:['@one'],notes:'Keep this note after a rejected unsave',topics:['Test collection'],topicsCurated:true}]}});
  await page.reload();const retained=(await(await page.request.get('/api/posts?scope=all')).json()).posts.find(p=>p.url===`https://x.com/i/status/${xId}`);
  await page.locator(`[data-post-id="${retained.id}"]`).getByRole('button',{name:'Unsave on X',exact:true}).click();await page.locator('#unsave-confirm').click();
  await expect(page.locator('#toast')).toContainText('did not confirm the unsave after reloading',{timeout:40000});
  const kept=(await(await page.request.get('/api/posts?scope=all')).json()).posts.find(p=>p.id===retained.id);
  await expect.poll(()=>worker.evaluate(async()=>Object.keys((await chrome.storage.session.get('savexWorkTabs')).savexWorkTabs?.tabs||{}))).toEqual([]);
  expect(kept.notes).toBe('Keep this note after a rejected unsave');expect(kept.archived).toBe(false);expect(kept.topics).toContain('Test collection');expect(clicks.x).toBe(1);expect(saved.x).toBe(true);
 }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});
test('the post being unsaved shows a processing overlay that clears on failure and leaves with the card on success',async({page})=>{
 const model=await mocked(page),card=page.locator('.save-card[data-post-id="401"]'),overlay=card.locator('.unsave-overlay');
 await expect(overlay).toHaveCount(0);
 await page.getByRole('button',{name:'Unsave on X',exact:true}).click();await page.getByRole('radio',{name:'@one',exact:true}).check();await page.locator('#unsave-confirm').click();
 await expect(overlay).toHaveText('Unsaving on X…');await expect(card).toHaveAttribute('aria-busy','true');
 expect(await overlay.evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
 await card.screenshot({path:'test-results/unsave-overlay.png',animations:'disabled'});
 model.job={...model.job,status:'failed',message:'Couldn’t identify the saved post and account. Nothing was clicked.'};
 await expect(overlay).toHaveCount(0,{timeout:8000});await expect(card).toBeVisible();await expect(card).toHaveAttribute('aria-busy','false');
 await page.getByRole('button',{name:'Unsave on X',exact:true}).click();await page.getByRole('radio',{name:'@one',exact:true}).check();await page.locator('#unsave-confirm').click();
 await expect(overlay).toBeVisible();
 model.posts=[];model.job={...model.job,status:'succeeded',deleted:1};
 await expect(card).toHaveCount(0,{timeout:8000});
});
