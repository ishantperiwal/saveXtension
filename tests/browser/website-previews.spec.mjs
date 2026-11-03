import {test,expect} from '@playwright/test';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const posts=count=>Array.from({length:count},(_,i)=>({id:16000+i,platform:'chrome',url:`https://bookmark-media.example/${i}`,bookmarkTitle:`My bookmark ${i}`,notes:'',topics:['Design'],folders:[],media:[],accounts:[],text:'',archived:false,addedAt:new Date(Date.now()-i*60000).toISOString()}));
test('website images preload nearby, preserve the bookmark title and survive note refreshes without reloading',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('savex-card-view','feed'));
 await page.emulateMedia({reducedMotion:'reduce'});
 const saved=posts(80);let active=0,peak=0,requests=0;const waiting=[];let released=false;
 await page.route('**/api/posts?scope=all',r=>r.fulfill({json:{posts:saved,runs:[]}}));
 await page.route('**/api/posts/*/website-preview',async r=>{active++;requests++;peak=Math.max(peak,active);if(!released)await new Promise(resolve=>waiting.push(resolve));active--;const id=r.request().url().match(/posts\/(\d+)/)[1];return r.fulfill({json:{title:'Website supplied title',description:'Description from the website <script> is plain text.',image:`/api/posts/${id}/website-image`,imageAlt:'Website cover'}});});
 await page.route('**/api/posts/*/website-image',r=>r.fulfill({contentType:'image/png',body:png}));
 try{
  await page.goto('/');await expect.poll(()=>requests).toBe(3);expect(peak).toBe(3);
  const first=page.locator('[data-post-id="16000"]');await expect(first.locator('.bookmark-title')).toHaveText('My bookmark 0');
  released=true;waiting.forEach(resolve=>resolve());
  await expect(first.locator('.bookmark-media')).toBeVisible();await expect(first.locator('.bookmark-description')).toContainText('<script>');
  await expect(first.locator('.bookmark-description script')).toHaveCount(0);await expect(first.getByRole('img',{name:'Chrome bookmark',exact:true})).toBeVisible();
  expect(peak).toBeLessThanOrEqual(3);
  const image=await first.locator('.bookmark-media img').elementHandle(),count=requests;
  saved[0].notes='A thought added later';await expect(first.getByLabel('Note',{exact:true})).toHaveValue(saved[0].notes,{timeout:8000});
  expect(await image.evaluate(el=>el.isConnected)).toBe(true);expect(requests).toBeGreaterThanOrEqual(count);
  await first.screenshot({path:'test-results/bookmark-website-preview.png'});
 }finally{released=true;waiting.forEach(resolve=>resolve());}
});
test('absent or broken website images leave the bookmark URL and title usable without an empty media box',async({page})=>{
 await page.route('**/api/posts?scope=all',r=>r.fulfill({json:{posts:posts(2),runs:[]}}));
 await page.route('**/api/posts/*/website-preview',r=>r.fulfill({json:{description:'',image:r.request().url().includes('16000')?'/api/posts/16000/website-image':null}}));
 await page.route('**/api/posts/*/website-image',r=>r.fulfill({status:404,body:''}));
 await page.goto('/');await expect(page.locator('.bookmark-preview[data-website-state="ready"]')).toHaveCount(2);
 await expect(page.locator('.bookmark-media:visible')).toHaveCount(0);await expect(page.locator('.bookmark-title')).toHaveText(['My bookmark 0','My bookmark 1']);
 await expect(page.locator('.bookmark-title').first()).toHaveAttribute('href','https://bookmark-media.example/0');
});
