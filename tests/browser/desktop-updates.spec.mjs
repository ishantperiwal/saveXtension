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
  await expect(page.getByText('Installed version 1.0.1', { exact: true })).toBeVisible();
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
