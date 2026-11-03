// Drive the current sidebar/context-menu scan controls. Scope is a fixture choice,
// not a hidden settings dialog or a synthetic production click target.
const scanScopes = new WeakMap();
export async function openSyncOptions(page) {
  if (await page.locator('#modal[data-all-sources-scan]').isVisible()) return;
  if (await page.locator('#modal').isVisible()) await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  // The all-sources refresh sits on the All saves row while it is selected.
  if (!(await page.getByRole('button',{name:'Refresh all sources',exact:true}).isVisible())) await page.locator('[data-filter="all"]').click();
  await page.getByRole('button',{name:'Refresh all sources',exact:true}).click();
}
export async function closeSyncOptions(page) {
  if (await page.locator('#modal').isVisible()) await page.locator('#modal').getByRole('button',{name:'Close dialog',exact:true}).click();
}
export async function chooseSelect(page,label,value) {
  if (label==='Sync source'||label==='X accounts') {
    await closeSyncOptions(page);
    const scope=label==='Sync source'?{platform:value,account:null}:{platform:'x',account:value};
    scanScopes.set(page,scope);
    const row=scope.platform==='chrome'?page.locator('[data-filter="chrome"]'):page.locator(scope.account?.startsWith('@')?`[data-nav-account="x:${scope.account.toLowerCase()}"]`:`[data-nav-account^="${scope.platform}:"]`).first();
    await row.click();
    if(scope.platform==='instagram'&&await row.getAttribute('aria-expanded')==='false') await row.locator('..').locator('.collection-toggle').click();
    return;
  }
  const native=page.locator(`select[aria-label="${label}"]`);
  const text=await native.locator('option').evaluateAll((options,value)=>options.find(o=>o.value===value)?.label,value);
  await page.getByRole('combobox',{name:label,exact:true}).click();
  await page.getByRole('option',{name:text,exact:true}).click();
}
export async function startScan(page,mode='quick') {
  await closeSyncOptions(page);
  // Server completion can precede the next UI heartbeat. Open a fresh menu only
  // after the visible controls have left their busy state.
  await page.waitForFunction(()=>![...document.querySelectorAll('.sidebar-account-refresh')].some(button=>button.disabled),null,{timeout:10000});
  const scope=scanScopes.get(page)||{platform:'x',account:null};
  if(scope.platform==='all') {await openSyncOptions(page);await page.getByRole('button',{name:mode==='deep'?'Deep scan':'Quick scan',exact:true}).click();return;}
  const row=scope.platform==='chrome'?page.locator('[data-filter="chrome"]'):page.locator(scope.account?.startsWith('@')?`[data-nav-account="x:${scope.account.toLowerCase()}"]`:`[data-nav-account^="${scope.platform}:"]`).first();
  await row.click({button:'right'});
  await page.getByRole('menuitem',{name:mode==='deep'?'Deep scan and refresh':'Quick scan and refresh',exact:true}).click();
}
export const startQuickSync=page=>startScan(page,'quick');
export const startDeepSync=page=>startScan(page,'deep');
