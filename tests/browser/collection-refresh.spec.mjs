import {test,expect,chromium} from '@playwright/test';
import{mkdtemp,cp,readFile,writeFile,rm}from'node:fs/promises';
import{resolve}from'node:path';
import{tmpdir}from'node:os';
const folders=[{id:11,account:'@me',name:'Design'},{id:12,account:'@me',name:'Food'}];
const post={id:801,platform:'instagram',url:'https://www.instagram.com/p/CollectionRefresh/',accounts:['@me'],collections:folders,notes:'Keep my note',topics:[],media:[],archived:false,addedAt:new Date().toISOString(),savedAt:new Date().toISOString()};
async function setup(page,{offline=false}={}){
 const model={jobs:[],online:!offline,preferences:{'@me':{all:true,collectionIds:[11,12]}}};
 await page.route('https://**/*',r=>r.abort());
 await page.route('**/api/posts?scope=all',r=>r.fulfill({json:{posts:[post],runs:[],instagramCollections:folders,instagramSaveLists:model.preferences}}));
 await page.route('**/api/sync',r=>{if(r.request().method()==='POST'){const input=r.request().postDataJSON();model.jobs.push(input);return r.fulfill({json:{job:{...input,id:'collection-refresh',status:'queued'}}});}return r.fulfill({json:{job:null,browser:{online:model.online,ready:true,syncModes:true,instagramCollections:true,instagramSaveLists:true}}});});
 await page.goto('/');return model;
}
for(const mode of ['quick','deep'])test(`a collection right-click ${mode} refresh targets only that collection without changing the current view or preferences`,async({page})=>{
 const model=await setup(page),collection=page.locator('[data-instagram-collection="11"]');
 await collection.click({button:'right'});const menu=page.getByRole('menu',{name:'Collection options',exact:true});
 await expect(menu).toBeVisible();await expect(menu.getByRole('menuitem')).toHaveCount(3);await page.keyboard.press('Escape');await expect(collection).toBeFocused();
 await collection.click({button:'right'});await page.getByRole('menuitem',{name:`${mode==='quick'?'Quick':'Deep'} scan and refresh`,exact:true}).click();
 await expect.poll(()=>model.jobs).toEqual([{targets:['instagram'],xAccount:'current',instagramAccount:'@me',instagramCollectionId:11,mode}]);
 await expect(page.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed','true');expect(model.preferences).toEqual({'@me':{all:true,collectionIds:[11,12]}});
 await expect(page.locator('.note-input')).toHaveValue('Keep my note');
});
test('the left-edge refresh follows the selected collection and reconnecting preserves its scope',async({page})=>{
 const model=await setup(page,{offline:true}),collection=page.locator('[data-instagram-collection="12"]');await collection.click();
 const refresh=page.getByRole('button',{name:'Refresh Instagram @me · Food',exact:true});await expect(refresh).toBeVisible();await expect(page.locator('.sidebar-account-refresh')).toHaveCount(1);
 const before=await collection.boundingBox(),marker=await refresh.boundingBox();expect(Math.abs(marker.y+marker.height/2-before.y-before.height/2)).toBeLessThan(2);
 await refresh.click();await expect(page.getByRole('heading',{name:'Open Chrome to sync.',exact:true})).toBeVisible();model.online=true;
 await expect.poll(()=>model.jobs,{timeout:8000}).toEqual([{targets:['instagram'],xAccount:'current',instagramAccount:'@me',instagramCollectionId:12,mode:'quick'}]);
 await expect(collection).toHaveAttribute('aria-pressed','true');expect(model.preferences).toEqual({'@me':{all:true,collectionIds:[11,12]}});
});

test('the installed helper visits only the requested Instagram collection for both refresh modes',async({baseURL})=>{
 test.setTimeout(120000);const profile=await mkdtemp(resolve(tmpdir(),'savex-one-collection-')),extension=resolve(profile,'extension');await cp(resolve('extension'),extension,{recursive:true});
 const bg=resolve(extension,'background.js');await writeFile(bg,(await readFile(bg,'utf8')).replace("const DEFAULT_ORIGIN = 'http://localhost:3210'",`const DEFAULT_ORIGIN = ${JSON.stringify(baseURL)}`));
 const manifest=JSON.parse(await readFile(resolve(extension,'manifest.json'),'utf8'));manifest.host_permissions.push('https://x.com/*','https://www.instagram.com/*');await writeFile(resolve(extension,'manifest.json'),JSON.stringify(manifest));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 let groupWorker;const workGroups=[];const visits=[],shell=body=>`<a href="/collection_user/" aria-label="Profile">Profile</a><main>${body}</main>`,catalog='<a href="/collection_user/saved/all-posts/">All Posts</a><a href="/collection_user/saved/design/1001/">Design</a><a href="/collection_user/saved/food/1002/">Food</a>';
 try{
  await context.route('https://x.com/**',r=>r.fulfill({contentType:'text/html',body:'<a data-testid="AppTabBar_Profile_Link" href="/one">Profile</a><button data-testid="SideNav_AccountSwitcher_Button" onclick="document.querySelector(\'#menu\').hidden=false">Accounts</button><div id="menu" hidden><button>Log out @one</button></div>'}));
  await context.route('https://www.instagram.com/**',async r=>{const path=new URL(r.request().url()).pathname;if(path==='/embed.js')return r.abort();visits.push(path);if(path.includes('/1001/')&&groupWorker)workGroups.push(await groupWorker.evaluate(async()=>{const state=(await chrome.storage.session.get('savexWorkTabs')).savexWorkTabs;const id=Object.keys(state.tabs).find(id=>state.tabs[id].kind==='sync'),tab=await chrome.tabs.get(Number(id));return{active:tab.active,muted:tab.mutedInfo.muted,group:await chrome.tabGroups.get(tab.groupId)};}));const body=path==='/'?'<a href="/collection_user/saved/">Saved</a>':path==='/collection_user/saved/'?catalog:path.includes('/1001/')?'<a href="/creator/p/CollectionKeep/"><img alt="Known reference"></a><a href="/creator/p/CollectionNew/"><img alt="New reference"></a>':'Unexpected page';return r.fulfill({contentType:'text/html',body:shell(body)});});
  let[worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');await worker.evaluate(async()=>chrome.storage.local.set({xAccountCatalog:{active:'@one',accounts:[{handle:'@one'}],checkedAt:Date.now(),busy:false}}));
  groupWorker=worker;const page=await context.newPage();await page.goto(baseURL);const headers={Origin:baseURL};
  const created=await page.request.post('/api/extension/instagram-collections',{headers,data:{account:'@collection_user',collections:[{externalId:'1001',name:'Design',url:'https://www.instagram.com/collection_user/saved/design/1001/'},{externalId:'1002',name:'Food',url:'https://www.instagram.com/collection_user/saved/food/1002/'}]}});expect(created.ok()).toBe(true);const collections=(await created.json()).collections,design=collections.find(c=>c.externalId==='1001'),food=collections.find(c=>c.externalId==='1002');
  await page.request.post('/api/posts/import',{headers,data:{posts:[{url:'https://www.instagram.com/p/CollectionKeep/',accounts:['@collection_user'],notes:'Keep this note'},{url:'https://www.instagram.com/p/OtherCollection/',accounts:['@collection_user'],notes:'Unrelated note',collections:[food]}]}});
  await page.request.post('/api/instagram-save-list',{headers,data:{account:'@collection_user',all:true,collectionIds:[design.id,food.id]}});
  for(const mode of ['quick','deep']){
   visits.length=0;workGroups.length=0;const response=await page.request.post('/api/sync',{headers,data:{targets:['instagram'],instagramAccount:'@collection_user',instagramCollectionId:design.id,mode}});expect(response.ok()).toBe(true);const queued=(await response.json()).job;
   expect(queued.instagramScope).toEqual({account:'@collection_user',selections:{'@collection_user':[design.id]}});
   await expect.poll(async()=>(await(await page.request.get('/api/sync')).json()).job.status,{timeout:45000}).toBe('partial');
   expect(workGroups.length).toBeGreaterThan(0);for(const item of workGroups){expect(item.active).toBe(false);expect(item.muted).toBe(true);expect(item.group.title).toBe('Save Extension Tabs');expect(item.group.collapsed).toBe(true);}
   await expect.poll(()=>worker.evaluate(async()=>Object.keys((await chrome.storage.session.get('savexWorkTabs')).savexWorkTabs?.tabs||{}))).toEqual([]);
   expect(await worker.evaluate(async()=>(await chrome.tabGroups.query({title:'Save Extension Tabs'})).length)).toBe(0);
   expect(await worker.evaluate(async()=>(await chrome.tabs.query({active:true,currentWindow:true}))[0].url)).toBe(`${baseURL}/`);
   expect(visits).toContain('/collection_user/saved/design/1001/');expect(visits.filter(p=>p.includes('/saved/')&&!['/collection_user/saved/','/collection_user/saved/design/1001/'].includes(p))).toEqual([]);
   const data=await(await page.request.get('/api/posts?scope=all')).json(),saved=data.posts.filter(p=>['CollectionKeep','CollectionNew','OtherCollection'].includes(p.externalId));expect(saved).toHaveLength(3);expect(saved.find(p=>p.externalId==='CollectionKeep').notes).toBe('Keep this note');expect(saved.find(p=>p.externalId==='CollectionNew').collections.map(c=>c.id)).toContain(design.id);expect(saved.find(p=>p.externalId==='OtherCollection').notes).toBe('Unrelated note');expect(data.instagramSaveLists).toEqual({'@collection_user':{all:true,collectionIds:[design.id,food.id]}});
  }
 }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});
