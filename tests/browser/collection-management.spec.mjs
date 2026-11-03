import { test, expect } from '@playwright/test';

const origin = 'http://localhost:3211';
const names = ['Foods and recipes fixture', 'Other fixture', 'Renamed recipes fixture', 'Empty fixture'];
const urls = ['https://x.com/i/status/809008001', 'https://www.instagram.com/p/ManageCollections/'];
const row = (page, name) => page.locator('[data-nav-topic]').filter({ has: page.locator('.nav-label-text', { hasText: new RegExp(`^${name}$`) }) });
async function seed(page) {
  await expect(await page.request.post('/api/posts/import', { headers: { Origin: origin }, data: {
    topics: names.filter(name=>name !== names[2]).map(name=>({name,description:''})),
    posts: [
      {url:urls[0],text:'Dinner reference',notes:'Keep my recipe note',topics:[names[0],names[1]],topicsCurated:true},
      {url:urls[1],text:'Archived recipe',archived:true,topics:[names[0],names[1]],topicsCurated:true,collections:[{account:'@cook',name:'Instagram recipes',url:'https://www.instagram.com/cook/saved/123/'}]}
    ]
  }})).toBeOK();
  await page.route('https://**/*', route=>route.abort());
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await page.getByRole('tab',{name:'Topics',exact:true}).click();
  return (await (await page.request.get('/api/posts?scope=all')).json()).posts.filter(post=>urls.includes(post.url));
}
test.afterEach(async({page})=>{
  const data=await(await page.request.get('/api/posts?scope=all')).json();
  for(const post of data.posts.filter(post=>urls.includes(post.url))) await page.request.delete(`/api/posts/${post.id}`,{headers:{Origin:origin}});
  for(const topic of data.topics.filter(topic=>names.includes(topic.name))) await page.request.delete(`/api/topics/${topic.id}`,{headers:{Origin:origin}});
});

test('right-click renames a selected collection and preserves saves, notes and other tags',async({page})=>{
  const posts=await seed(page),post=posts.find(post=>!post.archived);
  await row(page,names[0]).click();
  const card=page.locator(`.save-card[data-post-id="${post.id}"]`),editor=await card.getByLabel('Note',{exact:true}).elementHandle();
  await row(page,names[0]).click({button:'right'});
  await expect(page.getByRole('menu',{name:'Collection options'}).getByRole('menuitem')).toHaveText(['Rename','Delete']);
  await page.getByRole('menuitem',{name:'Rename',exact:true}).click();
  const dialog=page.locator('#modal'),input=dialog.getByRole('textbox',{name:'Collection name'});
  await expect(input).toHaveValue(names[0]);
  await input.fill(names[1]);await dialog.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('already in use');
  await expect(row(page,names[0])).toHaveAttribute('aria-pressed','true');
  await input.fill(names[2]);await dialog.getByRole('button',{name:'Rename',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(row(page,names[2])).toHaveAttribute('aria-pressed','true');await expect(row(page,names[2]).locator('.nav-count')).toHaveText('1');
  await expect(row(page,names[0])).toHaveCount(0);await expect(card.locator('.tag')).toHaveText([names[1],names[2]]);
  expect(await editor.evaluate(el=>el.isConnected)).toBe(true);await expect(card.getByLabel('Note',{exact:true})).toHaveValue('Keep my recipe note');
  await expect(row(page,names[2])).toBeFocused();
  await page.reload();await page.getByRole('tab',{name:'Topics',exact:true}).click();await expect(row(page,names[2])).toBeVisible();
});

test('delete confirms, cancel leaves everything intact, and confirmation untags archived saves too',async({page})=>{
  const before=await seed(page);
  await row(page,names[0]).click();await row(page,names[0]).click({button:'right'});
  await page.getByRole('menuitem',{name:'Delete',exact:true}).click();
  const dialog=page.locator('#modal');await expect(dialog).toContainText('Are you sure you want to delete');
  await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(row(page,names[0])).toBeFocused();
  await expect(row(page,names[0])).toHaveAttribute('aria-pressed','true');
  await row(page,names[0]).click({button:'right'});await page.getByRole('menuitem',{name:'Delete',exact:true}).click();
  await dialog.screenshot({path:'test-results/delete-collection-confirmation.png'});
  await dialog.getByRole('button',{name:'Delete',exact:true}).click();await expect(dialog).not.toBeVisible();
  await expect(row(page,names[0])).toHaveCount(0);await expect(page.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#toast')).toHaveText('Collection deleted');
  const after=(await(await page.request.get('/api/posts?scope=all')).json()).posts;
  for(const original of before){
    const saved=after.find(post=>post.id===original.id);expect(saved).toBeTruthy();expect(saved.topics).toEqual([names[1]]);
    for(const key of ['notes','archived','addedAt','url','collections'])expect(saved[key]).toEqual(original[key]);
  }
  await expect(row(page,names[1]).locator('.nav-count')).toHaveText('1');
});

test('keyboard menu deletes an empty collection, retries a failed request, and fits mobile',async({page})=>{
  await seed(page);await page.setViewportSize({width:390,height:844});
  const topic=(await(await page.request.get('/api/topics')).json()).topics.find(topic=>topic.name===names[3]);
  let online=false;
  await page.route(`**/api/topics/${topic.id}`,route=>online?route.continue():route.fulfill({status:503,json:{error:'Please try again.'}}));
  await row(page,names[3]).focus();await page.keyboard.press('Shift+F10');
  await page.keyboard.press('End');await page.keyboard.press('Enter');
  const dialog=page.locator('#modal');await dialog.getByRole('button',{name:'Delete',exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Please try again.');await expect(row(page,names[3])).toBeVisible();
  const bounds=await dialog.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
  online=true;await dialog.getByRole('button',{name:'Delete',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(row(page,names[3])).toHaveCount(0);
});
