import { test, expect } from '@playwright/test';

const running = (selector, property) => selector.evaluate((el, property) => el.getAnimations().filter(animation => animation.playState === 'running').some(animation => animation.effect.getKeyframes().some(frame => frame[property] !== undefined)), property);
async function library(page, status) {
  await page.addInitScript(() => { const known = { helperInfo: async () => ({ version: '1.0.0', path: '/helper' }), socialAccounts: async () => [] }; window.saveXDesktop = new Proxy(known, { get: (target, key) => target[key] || (async () => null) }); });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [], runs: [], topics: [], instagramCollections: [] } }));
  await page.route('**/api/sync', route => route.fulfill({ json: status }));
  await page.goto('/');
}
const job = (status, extra = {}) => ({ id: 'job-1', status, targets: ['x'], results: [], message: 'Checking X', xAccount: 'current', ...extra });
const modal0 = page => page.locator('#modal').evaluate(el => getComputedStyle(el, '::backdrop').backdropFilter);
const nativeStatus = { job: null, browser: { online: true, ready: true, bookmarksReady: true }, nativeSocial: { enabled: true, online: true, accounts: [] }, chromeBrowser: null };

test('setup slides up as a sheet over Settings, which sinks back and returns', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await library(page, nativeStatus);
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  const modal = page.locator('#modal'), sheet = page.locator('#sheet');
  await page.getByRole('button', { name: 'Chrome extension', exact: true }).click();
  const connect = page.getByRole('button', { name: 'Connect extension', exact: true });
  await connect.click();
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.evaluate(el => el.getAnimations().some(animation => animation.animationName === 'sheet-up')), { intervals: [10], timeout: 1000 }).toBe(false);
  await expect(modal).toBeVisible();
  await expect(modal).toHaveCSS('scale', '0.94');
  await page.waitForTimeout(450);
  const back = await modal.boundingBox(), front = await sheet.boundingBox();
  expect(back.y, 'its top edge shows above the sheet').toBeLessThan(front.y);
  expect(front.y - back.y).toBeLessThan(24);
  expect(back.y + back.height, 'nothing shows below the sheet').toBeLessThan(front.y + front.height);
  expect(back.width, 'and it sits narrower, behind').toBeLessThan(front.width);
  const covered = await page.evaluate(() => { const box = document.querySelector('#sheet').getBoundingClientRect(); return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2).closest('dialog').id; });
  expect(covered, 'the sheet is on top').toBe('sheet');
  // Escape closes only the top sheet, sliding it away first.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(modal).toBeVisible();
  await expect(modal).toHaveCSS('scale', 'none');
  await page.waitForTimeout(450);
  expect(await modal.evaluate(el => [el.style.height, el.style.translate, el.dataset.stacking ?? ''])).toEqual(['', '', '']);
  const centred = await modal.boundingBox();
  expect(Math.abs(centred.y + centred.height / 2 - 450), 'back to the centre at its own height').toBeLessThan(2);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  // The sheet's content changes glide too, and the dialog below is usable again.
  await connect.click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).last().click();
  await expect(sheet).toBeHidden();
  await expect(modal).toBeVisible();
});

test('the sync toast slides in, glides between compact and expanded, and slides out', async ({ page }) => {
  const status = { ...nativeStatus, job: job('running', { message: 'Checking your X bookmarks. A longer message that only shows when this is expanded.' }) };
  await page.setViewportSize({ width: 1280, height: 800 });
  await library(page, status);
  const toast = page.locator('#sync-status');
  await expect(toast).toBeVisible();
  await expect.poll(() => toast.evaluate(el => el.getAnimations().some(animation => animation.animationName === 'sync-toast-in')), { intervals: [10], timeout: 2000 }).toBe(false);
  const compact = await toast.boundingBox();
  await toast.hover();
  await expect.poll(() => running(toast, 'width'), { intervals: [10], timeout: 1000 }).toBe(true);
  await expect.poll(() => running(toast, 'width')).toBe(false);
  const expanded = await toast.boundingBox();
  expect(expanded.width).toBeGreaterThan(compact.width);
  expect(Math.abs(expanded.x + expanded.width - compact.x - compact.width), 'stays anchored to the right').toBeLessThan(2);
  await page.mouse.move(10, 10);
  await expect.poll(() => running(toast, 'width'), { intervals: [10], timeout: 1000 }).toBe(true);
  await expect.poll(() => running(toast, 'width')).toBe(false);
  expect(Math.round((await toast.boundingBox()).width)).toBe(Math.round(compact.width));
  status.job = null;
  await expect.poll(() => running(toast, 'transform'), { intervals: [20], timeout: 5000 }).toBe(true);
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden();
  expect(await toast.evaluate(el => el.children.length)).toBe(0);
  // It comes back cleanly if a sync starts again.
  status.job = job('running');
  await expect(toast).toBeVisible({ timeout: 5000 });
  await expect(toast).toHaveCSS('opacity', '1');
});

test('a focused topic search fills its whole pill, not just the text box inside', async ({ page }) => {
  const topic = { id: 'a', name: 'Coding' };
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [{ id: 1, platform: 'x', accounts: ['@a'], url: 'https://x.com/a/status/1', text: 'A', notes: '', topics: ['Coding'], tags: [], media: [], folders: [], collections: [], archived: false, savedAt: '2026-10-31T00:00:00Z' }], runs: [], topics: [topic], instagramCollections: [] } }));
  await page.route('**/api/sync', route => route.fulfill({ json: { job: null, browser: null } }));
  await page.goto('/');
  await page.locator('#open-filters').click();
  const input = page.getByRole('searchbox', { name: 'Search topics' });
  await input.focus(); await page.keyboard.type('c');
  await expect(input).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect.poll(() => input.evaluate(el => getComputedStyle(el.parentElement).backgroundColor !== getComputedStyle(el.closest('dialog')).backgroundColor)).toBe(true);
});

test('Settings sections are containers that open and close, and stay as you left them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await library(page, nativeStatus);
  const settings = page.getByRole('button', { name: 'Settings & backups', exact: true });
  await settings.click();
  const accounts = page.locator('.settings-panel[data-panel="accounts"]'), backup = page.locator('.settings-panel[data-panel="backup"]');
  const backupToggle = backup.getByRole('button', { name: 'Backup', exact: true }), exportLink = page.getByRole('link', { name: 'Export library' });
  await expect(page.getByRole('button', { name: 'Add X account' }), 'Accounts starts open').toBeVisible();
  await expect(exportLink, 'the rest start closed').toBeHidden();
  await expect(page.locator('.settings-panel[data-panel="library"]'), 'no library name section').toHaveCount(0);
  await expect(page.locator('.settings-panel').first(), 'the extension comes first').toHaveAttribute('data-panel', 'extension');
  await expect(backupToggle).toHaveAttribute('aria-expanded', 'false');
  await page.waitForTimeout(350);
  // A click anywhere on the header toggles it, and the height animates.
  const header = await backup.locator('.settings-panel-header').boundingBox();
  await page.mouse.click(header.x + header.width / 2, header.y + header.height / 2);
  await expect(backupToggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => backup.locator('.settings-panel-body').evaluate(el => el.getAnimations().some(animation => animation.transitionProperty === 'grid-template-rows')), { intervals: [10], timeout: 1000 }).toBe(true);
  await expect(exportLink).toBeVisible();
  await page.waitForTimeout(350);
  // Hover fills a closed container; an open one stays plain.
  const mcp = page.locator('.settings-panel[data-panel="mcp"]'), plain = el => getComputedStyle(el).backgroundColor === getComputedStyle(el.closest('dialog')).backgroundColor;
  await mcp.locator('h3').hover();
  await expect.poll(() => mcp.evaluate(plain)).toBe(false);
  await backup.locator('.settings-panel-inner').hover();
  await expect.poll(() => backup.evaluate(plain)).toBe(true);
  // Every bar is the same height, with its controls centred.
  const mcpBar = page.locator('.settings-panel[data-panel="mcp"] .settings-panel-header');
  const mcpSwitch = page.locator('.settings-panel[data-panel="mcp"] .mcp-switch');
  await expect.poll(() => mcpSwitch.count()).toBe(1);
  const bar = await mcpBar.boundingBox(), toggle = await mcpSwitch.boundingBox();
  expect(bar.height).toBe((await page.locator('.settings-panel[data-panel="backup"] .settings-panel-header').boundingBox()).height);
  expect(Math.abs(toggle.y + toggle.height / 2 - bar.y - bar.height / 2)).toBeLessThan(1);
  // Keyboard works, and choices survive reopening.
  await accounts.getByRole('button', { name: /^Accounts/ }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Add X account' })).toBeHidden();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).first().click();
  await settings.click();
  await expect(page.getByRole('button', { name: 'Add X account' })).toBeHidden();
  await expect(exportLink).toBeVisible();
});

test('adding an account without the extension offers it first, or the normal login', async ({ page }) => {
  const status = { ...nativeStatus };
  await page.addInitScript(() => { window.connected = []; });
  await library(page, status);
  await page.evaluate(() => { window.saveXDesktop.connectSocial = async options => { window.connected.push(options); return []; }; });
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  const sheet = page.locator('#sheet'), add = page.getByRole('button', { name: 'Add X account', exact: true });
  const connected = () => page.evaluate(() => window.connected);
  // Sign in manually: the normal login window.
  await add.click();
  await expect(sheet.getByRole('heading')).toHaveText('Use your Chrome login for X?');
  await page.waitForTimeout(450);
  expect(await connected()).toEqual([]);
  await sheet.getByRole('button', { name: 'Sign in manually', exact: true }).click();
  await expect(sheet).toBeHidden();
  expect(await connected()).toEqual([{ platform: 'x' }]);
  // Closing the prompt signs in to nothing.
  await add.click(); await page.keyboard.press('Escape'); await expect(sheet).toBeHidden();
  expect(await connected()).toHaveLength(1);
  // Connect the extension: its steps, back to the prompt, then carrying on once connected.
  await add.click();
  await sheet.getByRole('button', { name: 'Connect extension and use Chrome login', exact: true }).click();
  await expect(sheet.locator('.chrome-setup-steps > li')).toHaveCount(4);
  await sheet.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(sheet.getByRole('heading')).toHaveText('Use your Chrome login for X?');
  await sheet.getByRole('button', { name: 'Connect extension and use Chrome login', exact: true }).click();
  status.chromeBrowser = { online: true, chromeSession: true, chromeSessionSites: ['x', 'instagram', 'pinterest'] };
  await sheet.getByRole('button', { name: 'Continue to X', exact: true }).click({ timeout: 6000 });
  await expect(sheet).toBeHidden();
  expect(await connected()).toHaveLength(2);
  // Once connected there's no prompt at all.
  await page.getByRole('button', { name: 'Add Pinterest account', exact: true }).click();
  await expect.poll(connected).toHaveLength(3);
  await expect(sheet).toBeHidden();
});
