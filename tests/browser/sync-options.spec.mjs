import { test, expect } from '@playwright/test';
const post=(id,platform,accounts,archived=false)=>({id,platform,accounts,archived,url:platform==='x'?`https://x.com/writer/status/${900000000+id}`:platform==='instagram'?'https://www.instagram.com/p/Test/':'https://example.com',topics:[],notes:'',folders:[],savedAt:'2026-11-01T10:00:00Z'});
async function setup(page){
 const state={queued:[],job:null,browser:{online:true,ready:true,syncModes:true,accountSwitching:true,selectedAccounts:true,bookmarksReady:true,bookmarksSupported:true}};
 await page.route('https://**/*',r=>r.abort());
 await page.route('**/api/posts?scope=all',r=>r.fulfill({json:{posts:[post(1,'x',['@one','@two']),post(2,'x',['@two']),post(3,'x',['@one'],true),post(4,'instagram',['@ig']),post(5,'chrome',[])],runs:[]}}));
 await page.route('**/api/sync',r=>{if(r.request().method()==='POST'){const input=r.request().postDataJSON();state.queued.push(input);state.job={...input,id:'scope-job',status:'queued'};}return r.fulfill({json:{browser:state.browser,job:state.job,xAccounts:{active:'@one',accounts:[{handle:'@one'},{handle:'@two'},{handle:'@three'}]}}});});
 await page.goto('/');return state;
}
test('sidebar shows per-account counts and global refresh offers both modes without account dropdowns',async({page})=>{
 const state=await setup(page);await expect(page.locator('.search-tools .search')).toHaveCount(1);
 await expect(page.locator('[data-nav-account="x:@one"] .nav-count')).toHaveText('1');
 await expect(page.locator('[data-nav-account="x:@two"] .nav-count')).toHaveText('2');
 await expect(page.locator('[data-nav-account="x:@three"] .nav-count')).toHaveText('0');
 await page.getByRole('button',{name:'Refresh all sources',exact:true}).click();
 await expect(page.locator('#modal select,#modal [role="combobox"]')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Deep scan',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Quick scan',exact:true}).click();
 await expect.poll(()=>state.queued).toEqual([{targets:['chrome','x','instagram'],xAccount:'all',mode:'quick'}]);
});
test('account context menu offers a deep scan for only that account without changing browsing',async({page})=>{
 const state=await setup(page),account=page.locator('[data-nav-account="x:@two"]');
 await account.click();await account.click({button:'right'});
 await expect(page.getByRole('menuitem',{name:'Quick scan and refresh',exact:true})).toBeVisible();
 await page.getByRole('menuitem',{name:'Deep scan and refresh',exact:true}).click();
 await expect.poll(()=>state.queued).toEqual([{targets:['x'],xAccount:'@two',mode:'deep'}]);
 await expect(account).toHaveAttribute('aria-pressed','true');
});
test('closing reconnect setup cancels the pending scan and refresh options fit a phone',async({page})=>{
 const state=await setup(page);state.browser.online=false;await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Refresh all sources',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Quick scan',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Open Chrome to sync.',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();state.browser.online=true;
 await expect(page.getByRole('button',{name:'Refresh all sources',exact:true})).toBeEnabled();expect(state.queued).toHaveLength(0);
});
