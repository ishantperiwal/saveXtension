import { test, expect } from '@playwright/test';
const folders=[{id:11,account:'@me',name:'Design'},{id:12,account:'@me',name:'AI tools'},{id:13,account:'@me',name:'Food'}];
const base={topics:[],tags:[],folders:[],notes:'',media:[],text:'',archived:false,savedAt:new Date().toISOString()};
const posts=[
  {...base,id:1,platform:'instagram',accounts:['@me'],url:'https://www.instagram.com/p/Design/',collections:[folders[0]]},
  {...base,id:2,platform:'instagram',accounts:['@me'],url:'https://www.instagram.com/p/Shared/',collections:[folders[0],folders[1]]},
  {...base,id:3,platform:'instagram',accounts:['@me'],url:'https://www.instagram.com/p/Food/',collections:[folders[2]]},
  {...base,id:4,platform:'instagram',accounts:['@me'],url:'https://www.instagram.com/p/Ungrouped/',collections:[]},
  {...base,id:5,platform:'x',accounts:['@writer'],url:'https://x.com/i/status/100000000',collections:[]},
  {...base,id:6,platform:'chrome',accounts:[],url:'https://example.org/',bookmarkTitle:'A bookmark',collections:[]}
];
async function setup(page,fixtures=posts,collections=folders){
  const model={lists:{},jobs:[]};
  await page.route('https://**/*',route=>route.abort());
  await page.route('**/api/posts?scope=all',route=>route.fulfill({json:{posts:fixtures,runs:[],instagramCollections:collections,instagramSaveLists:model.lists}}));
  await page.route('**/api/instagram-save-list',async route=>{
    const input=route.request().postDataJSON();
    const key=input.platform==='pinterest'?`pinterest:${input.account}`:input.account;
    if(input.collectionIds===null)delete model.lists[key];else model.lists[key]=input.collectionIds;
    await route.fulfill({json:{instagramSaveLists:model.lists}});
  });
  await page.route('**/api/sync',async route=>{
    if(route.request().method()==='POST'){const input=route.request().postDataJSON();model.jobs.push(input);await route.fulfill({json:{job:{...input,id:'test',status:'queued'}}});}
    else await route.fulfill({json:{job:null,browser:{online:true,ready:true,bookmarksReady:true,syncModes:true,instagramCollections:true,instagramSaveLists:true},xAccounts:{accounts:[{handle:'@writer'}]}}});
  });
  await page.goto('/');return model;
}
const account=page=>page.locator('[data-nav-account="instagram:@me"]');
async function customize(page){await account(page).click({button:'right'});await page.getByRole('menuitem',{name:'Choose collections',exact:true}).click();}

test('ticked collections limit the library while account and chevron always toggle and remember collapse',async({page})=>{
  const model=await setup(page);
  await customize(page);await expect(page.getByRole('heading',{name:'Choose collections',exact:true})).toBeVisible();
  const all=page.getByRole('checkbox',{name:'All saves',exact:true}),food=page.getByRole('checkbox',{name:'Food 1',exact:true});
  await expect(all).toBeChecked();
  for(const name of ['Design 2','AI tools 1','Food 1'])await expect(page.getByRole('checkbox',{name,exact:true})).toBeChecked();
  await food.uncheck();await expect(all).not.toBeChecked();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  expect(model.lists).toEqual({'@me':[11,12]});
  await expect(page.locator('.save-card')).toHaveCount(2);
  await expect(account(page).locator('.nav-count')).toHaveText('2');
  await expect(page.locator('[data-instagram-collection]')).toHaveCount(2);
  const toggle=page.getByRole('button',{name:'Toggle Instagram collections for @me',exact:true}), list=page.getByRole('list',{name:'Instagram collections for @me',exact:true});
  await expect(toggle).toBeEnabled();await expect(list).toBeVisible();
  await account(page).click();await expect(list).toBeHidden();await expect(account(page)).toHaveAttribute('aria-expanded','false');
  await toggle.click();await expect(list).toBeVisible();
  await toggle.click();await expect(list).toBeHidden();
  await page.locator('[data-filter="all"]').click();await expect(page.locator('.save-card')).toHaveCount(4);
  await page.reload();await expect(toggle).toBeEnabled();await expect(list).toBeHidden();
  await toggle.click();await expect(list).toBeVisible();
  await page.setViewportSize({width:390,height:844});await customize(page);
  await expect(food).toBeVisible();await expect(food).not.toBeChecked();await expect(all).not.toBeChecked();
  await page.screenshot({path:'test-results/customize-instagram-save-list.png'});
  await all.check();await expect(food).toBeChecked();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  expect(model.lists).toEqual({});
  await expect(page.locator('.save-card')).toHaveCount(4);await expect(toggle).toBeEnabled();
  await expect(page.locator('[data-instagram-collection]')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const [value,target] of [['x:@writer','x'],['instagram:@me','instagram'],['chrome:*','chrome']])test(`${target} right-click refresh targets only that account in either mode`,async({page})=>{
  const model=await setup(page),row=target==='chrome'?page.locator('[data-filter="chrome"]'):page.locator(`[data-nav-account="${value}"]`);
  for(const mode of ['quick','deep']){
    await row.click({button:'right'});
    await expect(page.getByRole('menuitem')).toHaveCount(target==='instagram'?3:2);
    await page.getByRole('menuitem',{name:mode==='quick'?'Quick scan and refresh':'Deep scan and refresh',exact:true}).click();
    await expect.poll(()=>model.jobs.length).toBe(mode==='quick'?1:2);
    expect(model.jobs.at(-1)).toEqual({targets:[target],xAccount:target==='x'?'@writer':'current',mode,...(target==='instagram'?{instagramAccount:'@me'}:{})});
    // Let the completed heartbeat clear the queued fixture before the next click.
    await expect(page.getByRole('button',{name:'Refresh all sources',exact:true})).toBeEnabled({timeout:5000});
  }
});

test('context menu supports keyboard, dismissal, empty selection and cancelling without changing the list',async({page})=>{
  const model=await setup(page);await account(page).focus();await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem',{name:'Quick scan and refresh',exact:true})).toBeFocused();
  await page.keyboard.press('End');await expect(page.getByRole('menuitem',{name:'Choose collections',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);await expect(account(page)).toBeFocused();
  await customize(page);for(const box of await page.getByRole('checkbox').all())await box.uncheck();await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeDisabled();
  await page.getByRole('checkbox',{name:'Food 1',exact:true}).check();await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(model.lists).toEqual({});
  await expect(page.locator('[data-instagram-collection]')).toHaveCount(3);
});


test('collection rows open the same chooser, and individually ticking everything still leaves out saves in no collection',async({page})=>{
  const model=await setup(page);
  await page.locator('[data-instagram-collection="11"]').click({button:'right'});
  await page.getByRole('menuitem',{name:'Choose collections',exact:true}).click();
  await page.getByRole('checkbox',{name:'All saves',exact:true}).uncheck();
  for(const name of ['Design 2','AI tools 1','Food 1'])await expect(page.getByRole('checkbox',{name,exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  expect(model.lists).toEqual({'@me':[11,12,13]});
  await expect(page.locator('.save-card')).toHaveCount(3);
  await expect(page.locator('[data-post-id="4"]')).toHaveCount(0);
});

const boards=[{id:21,platform:'pinterest',account:'@me',name:'Rooms'},{id:22,platform:'pinterest',account:'@me',name:'Posters'}];
const pins=[{...base,id:7,platform:'pinterest',accounts:['@me'],url:'https://www.pinterest.com/pin/7/',collections:[boards[0]]},{...base,id:8,platform:'pinterest',accounts:['@me'],url:'https://www.pinterest.com/pin/8/',collections:[boards[1]]}];

test('Pinterest boards use their own list even when Instagram shares the handle',async({page})=>{
  const model=await setup(page,[...posts,...pins],[...folders,...boards]);
  await page.locator('[data-nav-account="pinterest:@me"]').click({button:'right'});
  await page.getByRole('menuitem',{name:'Choose boards',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Choose boards',exact:true})).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'All pins',exact:true})).toBeChecked();
  await page.getByRole('checkbox',{name:'Posters 1',exact:true}).uncheck();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  expect(model.lists).toEqual({'pinterest:@me':[21]});
  await expect(page.locator('[data-nav-account="pinterest:@me"] .nav-count')).toHaveText('1');
  await expect(page.locator('[data-instagram-collection="22"]')).toHaveCount(0);
  await expect(account(page).locator('.nav-count')).toHaveText('4');
});

test('Settings opens the chooser for connected Instagram and Pinterest accounts and returns to Settings',async({page})=>{
  await page.addInitScript(()=>{
    const known={helperInfo:async()=>({version:'1.0.0',path:'/helper'}),socialAccounts:async()=>[{id:'a',platform:'x',handle:'@writer',status:'connected'},{id:'b',platform:'pinterest',handle:'@Me',status:'connected'},{id:'c',platform:'instagram',handle:'@me',status:'connected'}]};
    window.saveXDesktop=new Proxy(known,{get:(target,key)=>target[key]||(async()=>null)});
  });
  const model=await setup(page,[...posts,...pins],[...folders,...boards]);
  const open=async()=>{await page.locator('[data-action="settings"]').first().click();const panel=page.getByRole('button',{name:/^Accounts/});if(await panel.getAttribute('aria-expanded')==='false')await panel.click();};
  await open();
  await expect(page.getByRole('button',{name:/for @writer/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Choose collections for @me on Instagram',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Choose boards for @Me on Pinterest',exact:true}).click();
  await page.getByRole('checkbox',{name:'Rooms 1',exact:true}).uncheck();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  expect(model.lists).toEqual({'pinterest:@me':[22]});
  await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
  await expect(page.locator('[data-nav-account="pinterest:@me"] .nav-count')).toHaveText('1');
  await page.getByRole('button',{name:'Choose collections for @me on Instagram',exact:true}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
  expect(model.lists).toEqual({'pinterest:@me':[22]});
});

test('an account with All off does not inherit unselected saves through another owner',async({page})=>{
  const fixtures=posts.map(p=>p.id===3?{...p,accounts:['@me','@other']}:p);
  const model=await setup(page,fixtures);model.lists={'@me':{all:false,collectionIds:[11]}};
  await page.reload();
  await expect(page.locator('[data-post-id="3"]')).toHaveCount(1);
  await expect(account(page).locator('.nav-count')).toHaveText('2');
  await account(page).click();await expect(page.locator('.save-card')).toHaveCount(2);
  await expect(page.locator('[data-post-id="3"]')).toHaveCount(0);
  await page.locator('[data-nav-account="instagram:@other"]').click();await expect(page.locator('.save-card')).toHaveCount(1);
  await expect(page.locator('[data-post-id="3"]')).toHaveCount(1);
});
