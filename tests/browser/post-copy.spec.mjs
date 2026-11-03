import { test, expect } from '@playwright/test';
const base={text:'Saved reference',author:'',authorName:'',notes:'',tags:[],topics:[],accounts:[],folders:[],media:[],archived:false,savedAt:'2026-11-03T12:00:00Z'};
const posts=[
  {...base,id:701,platform:'chrome',url:'https://example.org/tool?x=1&y=2',bookmarkTitle:'Reference tool'},
  {...base,id:702,platform:'x',url:'https://x.com/i/status/123456789',notes:'Private interpretation, kept in the library.'},
  {...base,id:703,platform:'instagram',url:'https://www.instagram.com/p/ArchivedRef/',archived:true}
];
async function setup(page){
  await page.route('https://**/*',route=>route.abort());
  await page.route('**/api/posts?scope=all',route=>route.fulfill({json:{posts,runs:[]}}));
  await page.goto('/');
}
const card=(page,id)=>page.locator(`.save-card[data-post-id="${id}"]`);

test('each card copies its exact URL and MCP save ID, including when its preview fails',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await setup(page);
  for(const post of posts.slice(0,2)){
    await card(page,post.id).getByRole('button',{name:'Copy post reference',exact:true}).click();
    const expected=`saveXtension save #${post.id}\n${post.url}\nRead its metadata and my note with saveXtension MCP get_saves: ${JSON.stringify({postIds:[post.id]})}`;
    await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(expected);
    await expect(page.locator('#modal')).not.toBeVisible();
    await expect(page.locator('#toast')).toHaveText('Reference copied');
    await expect(page.locator('#toast')).toHaveClass(/bottom-center/);
  }
  await expect(card(page,702).locator('.native-embed')).toHaveAttribute('data-embed-state','failed');
  await expect(card(page,702).getByLabel('Note',{exact:true})).toHaveValue(posts[1].notes);
  expect(await page.evaluate(()=>navigator.clipboard.readText())).not.toContain(posts[1].notes);
  await page.setViewportSize({width:390,height:844});
  await card(page,701).getByRole('button',{name:'Copy post reference',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toContain('saveXtension save #701');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('archived references explain that the save must be restored for MCP access',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await setup(page);await page.locator('.archive-nav').click();
  await card(page,703).getByRole('button',{name:'Copy post reference',exact:true}).click();
  const reference=await page.evaluate(()=>navigator.clipboard.readText());
  expect(reference).toContain('saveXtension save #703');expect(reference).toContain(posts[2].url);
  expect(reference).toContain('Archived; restore');expect(reference).not.toContain('get_saves:');
});

test('desktop copy uses its native clipboard and shows only a centered toast',async({page})=>{
  await page.addInitScript(()=>{
    window.saveXDesktop={copyText:async text=>{window.copiedReference=text;}};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Clipboard unavailable');}}});
  });
  await setup(page);
  await card(page,702).getByRole('button',{name:'Copy post reference',exact:true}).click();
  expect(await page.evaluate(()=>window.copiedReference)).toBe(`saveXtension save #702\n${posts[1].url}\nRead its metadata and my note with saveXtension MCP get_saves: {"postIds":[702]}`);
  await expect(page.locator('#modal')).not.toBeVisible();
  const toast=page.locator('#toast'); await expect(toast).toHaveText('Reference copied');
  const rect=await toast.boundingBox(), view=page.viewportSize();
  expect(Math.abs(rect.x+rect.width/2-view.width/2)).toBeLessThan(1);
  await expect.poll(async()=>{const r=await toast.boundingBox();return view.height-r.y-r.height;}).toBeCloseTo(24,0);
  await page.screenshot({path:'test-results/reference-copied-toast.png'});
  await expect(card(page,702).getByLabel('Note',{exact:true})).toHaveValue(posts[1].notes);
});

test('browser clipboard rejection falls back silently and never opens a modal',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.addInitScript(()=>Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new Error('Clipboard unavailable');}}));
  await setup(page);
  await card(page,701).getByRole('button',{name:'Copy post reference',exact:true}).click();
  await expect(page.locator('#toast')).toHaveText('Reference copied');
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('saveXtension save #701');
  await expect(page.locator('#modal')).not.toBeVisible();
});

test('a complete clipboard failure shows an error toast without claiming success or opening a modal',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Clipboard unavailable');}}});
    document.execCommand=()=>false;
  });
  await setup(page);
  await card(page,702).getByRole('button',{name:'Copy post reference',exact:true}).click();
  await expect(page.locator('#toast')).toHaveText('Couldn’t copy reference. Try again.');
  await expect(page.locator('#toast')).toHaveClass(/bottom-center/);
  await expect(page.locator('#modal')).not.toBeVisible();
  await expect(card(page,702).getByLabel('Note',{exact:true})).toHaveValue(posts[1].notes);
});
