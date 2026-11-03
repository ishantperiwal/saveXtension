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
async function setup(page,fixtures=posts){
  const model={lists:{},jobs:[]};
  await page.route('https://**/*',route=>route.abort());
  await page.route('**/api/posts?scope=all',route=>route.fulfill({json:{posts:fixtures,runs:[],instagramCollections:folders,instagramSaveLists:model.lists}}));
  await page.route('**/api/instagram-save-list',async route=>{
    const input=route.request().postDataJSON();
    if(input.collectionIds===null)delete model.lists[input.account];else model.lists[input.account]=input.all===undefined?input.collectionIds:{all:input.all,collectionIds:input.collectionIds};
    await route.fulfill({json:{instagramSaveLists:model.lists}});
  });
  await page.route('**/api/sync',async route=>{
    if(route.request().method()==='POST'){const input=route.request().postDataJSON();model.jobs.push(input);await route.fulfill({json:{job:{...input,id:'test',status:'queued'}}});}
    else await route.fulfill({json:{job:null,browser:{online:true,ready:true,bookmarksReady:true,syncModes:true,instagramCollections:true,instagramSaveLists:true},xAccounts:{accounts:[{handle:'@writer'}]}}});
  });
  await page.goto('/');return model;
}
const account=page=>page.locator('[data-nav-account="instagram:@me"]');
async function customize(page){await account(page).click({button:'right'});await page.getByRole('menuitem',{name:'Customize save list',exact:true}).click();}

test('selected collections limit the library while account and chevron always toggle and remember collapse',async({page})=>{
  const model=await setup(page);
  await customize(page);await expect(page.getByRole('heading',{name:'Customize save list',exact:true})).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'All',exact:true})).toBeChecked();
  await page.getByRole('checkbox',{name:'Design 2',exact:true}).check();
  await expect(page.getByRole('checkbox',{name:'All',exact:true})).toBeChecked();
  await page.getByRole('checkbox',{name:'Food 1',exact:true}).uncheck();
  await page.getByRole('checkbox',{name:'All',exact:true}).uncheck();
  await page.getByRole('checkbox',{name:'AI tools 1',exact:true}).check();
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  expect(model.lists).toEqual({'@me':{all:false,collectionIds:[11,12]}});
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
  await expect(page.getByRole('checkbox',{name:'Food 1',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/customize-instagram-save-list.png'});
  await page.getByRole('checkbox',{name:'All',exact:true}).check();
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(page.locator('.save-card')).toHaveCount(4);await expect(toggle).toBeEnabled();
  expect(model.lists).toEqual({'@me':{all:true,collectionIds:[11,12]}});
  await expect(page.locator('[data-instagram-collection]')).toHaveCount(2);
  await account(page).click();await expect(page.locator('.save-card')).toHaveCount(4);await expect(list).toBeHidden();
  await expect(page.locator('[data-post-id="3"],[data-post-id="4"]')).toHaveCount(2);
  await toggle.click();await expect(list).toBeVisible();
  await page.reload();await customize(page);
  await expect(page.getByRole('checkbox',{name:'All',exact:true})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Design 2',exact:true})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'AI tools 1',exact:true})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Food 1',exact:true})).not.toBeChecked();
  await page.getByRole('checkbox',{name:'All',exact:true}).uncheck();
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await account(page).click();await expect(page.locator('.save-card')).toHaveCount(2);await expect(list).toBeHidden();
  await toggle.click();await expect(list).toBeVisible();
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
  await page.keyboard.press('End');await expect(page.getByRole('menuitem',{name:'Customize save list',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);await expect(account(page)).toBeFocused();
  await customize(page);for(const box of await page.getByRole('checkbox').all())await box.uncheck();await expect(page.getByRole('button',{name:'Apply',exact:true})).toBeDisabled();
  await page.getByRole('checkbox',{name:'Food 1',exact:true}).check();await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(model.lists).toEqual({});
  await expect(page.locator('[data-instagram-collection]')).toHaveCount(3);
});


test('All works alone while individual collections only pin shortcuts when All is on',async({page})=>{
  const model=await setup(page);await customize(page);
  for(const name of ['Design 2','AI tools 1','Food 1'])await page.getByRole('checkbox',{name,exact:true}).uncheck();
  await expect(page.getByRole('checkbox',{name:'All',exact:true})).toBeChecked();
  await expect(page.getByRole('button',{name:'Apply',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  expect(model.lists).toEqual({'@me':{all:true,collectionIds:[]}});
  await expect(page.locator('[data-instagram-collection]')).toHaveCount(0);
  await account(page).click();await expect(page.locator('.save-card')).toHaveCount(4);
  await customize(page);await page.getByRole('checkbox',{name:'Design 2',exact:true}).check();
  await expect(page.getByRole('checkbox',{name:'All',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(page.locator('.save-card')).toHaveCount(4);
  const toggle=page.getByRole('button',{name:'Toggle Instagram collections for @me',exact:true});
  await expect(page.locator('[data-instagram-collection="11"]')).toBeVisible();
  await toggle.click();await expect(page.locator('[data-instagram-collection="11"]')).toBeHidden();
  await toggle.click();await expect(page.locator('[data-instagram-collection="11"]')).toBeVisible();
  await page.locator('[data-instagram-collection="11"]').click();await expect(page.locator('.save-card')).toHaveCount(2);
  await account(page).click();await expect(page.locator('.save-card')).toHaveCount(4);
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
