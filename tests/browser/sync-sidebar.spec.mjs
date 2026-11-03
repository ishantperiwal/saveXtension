import {test,expect} from '@playwright/test';
async function setup(page,timestamp){
 const state={browser:{online:true,ready:true,bookmarksReady:true,bookmarksSupported:true},lastSyncedAt:timestamp,job:null,requests:0};
 await page.route('**/api/posts?scope=all',r=>r.fulfill({json:{posts:[],runs:[]}}));
 await page.route('**/api/sync',r=>{if(r.request().method()==='POST'){state.requests++;state.job={id:'sidebar-job',status:'queued',targets:['x']};}return r.fulfill({json:state});});await page.goto('/');return state;
}
test('All saves and its refresh sit below the browse tabs, and busy scans disable another refresh',async({page})=>{
 const state=await setup(page,'2026-11-01T11:00:00Z');
 const tabs=await page.getByRole('tablist').boundingBox(),all=await page.locator('[data-filter="all"]').boundingBox();
 expect(all.y).toBeGreaterThan(tabs.y+tabs.height);
 await expect(page.locator('.sidebar-sync')).toHaveCount(0);
 const refresh=page.getByRole('button',{name:'Refresh all sources',exact:true});
 await refresh.click();await page.getByRole('button',{name:'Quick scan',exact:true}).click();
 await expect.poll(()=>state.requests).toBe(1);await expect(refresh).toBeDisabled();
 state.job={...state.job,status:'completed'};await expect(refresh).toBeEnabled({timeout:6000});
});
test('failed scans use a floating status while the sidebar and minimal settings remain usable',async({page})=>{
 const state=await setup(page,'2026-11-01T11:00:00Z');state.job={id:'failed',status:'failed',targets:['x'],message:'Try again'};
 await expect(page.locator('#sync-status')).toContainText('Try again',{timeout:6000});
 expect(await page.locator('#sync-status').evaluate(el=>getComputedStyle(el.closest('.notification-stack')).position)).toBe('fixed');
 await page.getByRole('button',{name:'Settings & backups',exact:true}).click();
 await expect(page.getByRole('button',{name:'Accounts & deep scan',exact:true})).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('a new library offers quick and manual deep scans without a fabricated sync label',async({page})=>{
 await setup(page,null);await expect(page.locator('#last-sync-label')).toHaveCount(0);
 await page.getByRole('button',{name:'Refresh all sources',exact:true}).click();
 await expect(page.getByRole('button',{name:'Quick scan',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Deep scan',exact:true})).toBeVisible();
});
