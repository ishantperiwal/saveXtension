import { test, expect } from '@playwright/test';

test('desktop Settings checks for an update, shows download progress, and offers installation', async ({ page }) => {
  await page.addInitScript(() => {
    let status = { phase: 'idle', currentVersion: '1.0.1', message: 'Checks GitHub when the app opens.' };
    window.saveXDesktop = {
      updateStatus: async () => ({ ...status }),
      checkForUpdates: async () => {
        status = { ...status, phase: 'downloading', availableVersion: '1.0.2', percent: 42, message: 'Downloading version 1.0.2…' };
        await new Promise(resolve => setTimeout(resolve, 1500));
        status = { ...status, phase: 'ready', percent: 100, message: 'Version 1.0.2 is downloaded and verified. Ready to install.' };
        return { ...status };
      },
      installUpdate: async () => { document.documentElement.dataset.installerOpened = 'true'; }
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await expect(page.locator('#app-update-version')).toHaveText('· 1.0.1');
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Update download' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install version 1.0.2', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Install version 1.0.2', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-installer-opened', 'true');
});

test('the ordinary browser library has no desktop installer control', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'App updates', exact: true })).toHaveCount(0);
});


test('local Settings keeps version inline and omits development text and duplicate source controls',async({page})=>{
  await page.addInitScript(()=>{window.saveXDesktop={updateStatus:async()=>({phase:'development',currentVersion:'1.1.2',message:'Running local source. Installer updates are available in the installed desktop app.'})};});
  await page.route('**/api/mcp',r=>r.fulfill({json:{available:true,enabled:true,url:'http://localhost:3211/mcp'}}));
  await page.goto('/');await page.getByRole('button',{name:'Settings & backups',exact:true}).click();
  await expect(page.locator('#app-update-version')).toHaveText('· 1.1.2');
  await expect(page.locator('#app-update-status')).toBeHidden();
  await expect(page.getByText(/Running local source/)).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Check for updates',exact:true})).toBeHidden();
  await expect(page.getByRole('heading',{name:'Sources',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Accounts & deep scan',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Export library',exact:true})).toBeVisible();
  const bounds=await page.locator('.app-update-heading').evaluate(el=>{const title=el.querySelector('h3').getBoundingClientRect(),version=el.querySelector('span').getBoundingClientRect();return{gap:version.left-title.right,top:Math.abs(version.top-title.top)};});
  expect(bounds.gap).toBeGreaterThan(0);expect(bounds.top).toBeLessThan(10);
  await page.screenshot({path:'test-results/settings-minimal-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
