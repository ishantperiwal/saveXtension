import { test,expect } from '@playwright/test';
const xUrl='https://x.com/i/status/809000001',chromeUrl='https://collection-picker.example/reference';
const card=(page,id)=>page.locator(`.save-card[data-post-id="${id}"]`);
async function seed(page){
  const result=await page.request.post('/api/posts/import',{headers:{Origin:'http://localhost:3211'},data:{
    topics:[{name:'Available collection',description:''},{name:'Another collection',description:''}],
    posts:[{url:xUrl,notes:'Keep my note',topics:['Already assigned'],topicsCurated:true},{platform:'chrome',url:chromeUrl,bookmarkTitle:'Collection fixture',topics:[],topicsCurated:true}]
  }});await expect(result).toBeOK();
  const {posts}=await(await page.request.get('/api/posts?scope=all')).json();return posts.filter(p=>[xUrl,chromeUrl].includes(p.url));
}
async function setup(page){
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('https://**/*',route=>route.abort());
  await page.route('https://platform.twitter.com/widgets.js',route=>route.fulfill({contentType:'text/javascript',body:`window.twttr={widgets:{createTweet(id,root){const frame=document.createElement('iframe');frame.height='360';frame.srcdoc='<p>Original post preview</p>';root.append(frame);return Promise.resolve(frame);}}};`}));
  await page.goto('/');
}
async function saved(page,id){return(await(await page.request.get('/api/posts?scope=all')).json()).posts.find(p=>p.id===id);}
test.afterEach(async({page})=>{
  const {posts}=await(await page.request.get('/api/posts?scope=all')).json();
  for(const post of posts.filter(p=>[xUrl,chromeUrl].includes(p.url)))await page.request.delete('/api/posts/'+post.id,{headers:{Origin:'http://localhost:3211'}});
});

test('collection pills add an existing unassigned collection without replacing the player or note',async({page})=>{
  const posts=await seed(page),post=posts.find(p=>p.url===xUrl);await setup(page);
  const item=card(page,post.id),plus=item.getByRole('button',{name:'Add to collection',exact:true});
  await expect(item.locator('.native-embed')).toHaveAttribute('data-embed-state','ready');
  const player=await item.locator('.embed-stage > iframe').elementHandle(),editor=await item.getByLabel('Note',{exact:true}).elementHandle();
  await expect(item.locator('.tag')).toHaveCSS('border-radius','999px');
  const order=await item.locator('.card-footer').evaluate(el=>[...el.children].map(child=>child.className));expect(order).toEqual(['collection-add','card-tags']);
  await plus.click();const picker=page.getByRole('dialog',{name:'Add to collection',exact:true});
  await expect(picker).toBeVisible();await expect(picker.getByRole('button',{name:'Add to Already assigned',exact:true})).toHaveCount(0);
  await picker.getByRole('button',{name:'Add to Available collection',exact:true}).click();
  await expect(picker).toHaveCount(0);await expect(item.locator('.tag')).toHaveText(['Already assigned','Available collection']);
  await expect(item.getByLabel('Note',{exact:true})).toHaveValue('Keep my note');await expect(plus).toBeFocused();
  expect(await player.evaluate(el=>el.isConnected)).toBe(true);expect(await editor.evaluate(el=>el.isConnected)).toBe(true);
  expect((await saved(page,post.id)).addedAt).toBe(post.addedAt);
  await plus.click();await expect(picker.getByRole('button',{name:'Add to Available collection',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(picker).toHaveCount(0);await expect(plus).toBeFocused();
  await page.reload();await expect(item.locator('.tag')).toHaveText(['Already assigned','Available collection']);
});

test('an unorganized card creates and adds a collection inline, retries failure and fits mobile',async({page})=>{
  const posts=await seed(page),post=posts.find(p=>p.url===chromeUrl);await setup(page);await page.setViewportSize({width:390,height:844});
  const item=card(page,post.id),plus=item.getByRole('button',{name:'Add to collection',exact:true});
  await expect(plus).toBeVisible();await expect(item.locator('.tag')).toHaveCount(0);
  let online=false;
  await page.route(`**/api/posts/${post.id}/collections`,route=>online?route.continue():route.fulfill({status:503,json:{error:'Please try again.'}}));
  await plus.click();const picker=page.getByRole('dialog',{name:'Add to collection',exact:true}),input=picker.getByRole('searchbox',{name:'Collection name',exact:true});
  await input.fill('Personal <ideas>');await picker.getByRole('button',{name:'Create “Personal <ideas>”',exact:true}).click();
  await expect(picker.getByRole('alert')).toHaveText('Please try again.');await expect(input).toHaveValue('Personal <ideas>');await expect(item.locator('.tag')).toHaveCount(0);
  online=true;await picker.getByRole('button',{name:'Create “Personal <ideas>”',exact:true}).click();
  await expect(picker).toHaveCount(0);await expect(item.locator('.tag')).toHaveText(['Personal <ideas>']);await expect(item.locator('.card-footer img')).toHaveCount(0);
  await page.getByRole('tab',{name:'Collections',exact:true}).click();await expect(page.locator('[data-nav-topic="Personal <ideas>"]')).toContainText('1');
  await plus.click();await expect(picker.getByRole('button',{name:'Add to Personal <ideas>',exact:true})).toHaveCount(0);
  await picker.getByRole('searchbox',{name:'Collection name',exact:true}).fill('Available collection');await page.keyboard.press('ArrowDown');
  await expect(picker.getByRole('button',{name:'Add to Available collection',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  await expect(item.locator('.tag')).toHaveText(['Available collection','Personal <ideas>']);
  await plus.click();const bounds=await picker.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({path:'test-results/collection-picker-mobile.png'});await page.keyboard.press('Escape');
  await item.screenshot({path:'test-results/collection-pills.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();await expect(item.locator('.tag')).toHaveText(['Available collection','Personal <ideas>']);
});
