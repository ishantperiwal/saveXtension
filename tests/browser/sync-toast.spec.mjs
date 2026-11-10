import { test, expect } from '@playwright/test';

async function setup(page) {
  const state = { browser: { online: true, ready: true, bookmarksReady: true }, job: null, reads: 0 };
  await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [], runs: [] } }));
  await page.route('**/api/sync', route => { state.reads++; return route.fulfill({ json: state }); });
  await page.goto('/'); return state;
}

test('sync progress stays visible with Stop while active; only finished notices can be dismissed', async ({ page }) => {
  await page.addInitScript(()=>{ if (!sessionStorage.getItem('savex-dismissed-sync-jobs')) sessionStorage.setItem('savex-dismissed-sync-jobs','["toast-active"]'); });
  const state = await setup(page), toast = page.locator('#sync-status');
  const before = await page.locator('#results').boundingBox();
  let stops = 0;
  await page.route('**/api/sync/stop', async route => { stops++; state.job = { ...state.job, status: 'cancelled' }; await route.fulfill({ json: {} }); });
  state.job = { id: 'toast-active', status: 'running', mode: 'deep', targets: ['x', 'instagram'], message: 'Instagram · scanning older saved posts' };
  await expect(toast).toBeVisible({ timeout: 6000 });
  await expect(toast).toHaveCSS('opacity', '1');
  await expect(toast).toContainText('Deep scanning Instagram');
  await expect(toast.locator('.source-icon-instagram')).toHaveCount(1);
  await expect(toast.locator('.source-icon-x')).toHaveCount(0);
  expect((await page.locator('#results').boundingBox()).y).toBe(before.y);
  expect(await toast.evaluate(element => !element.closest('main'))).toBeTruthy();
  const box = await toast.boundingBox(), viewport = page.viewportSize();
  expect(viewport.width - box.x - box.width).toBe(24); expect(viewport.height - box.y - box.height).toBe(24);
  expect(box.height).toBeLessThanOrEqual(48); expect(box.width).toBeLessThanOrEqual(400);
  await expect(toast.locator('#sync-toast-details')).toBeHidden();
  await expect(toast.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Dismiss sync status' })).toHaveCount(0);
  await expect(toast.locator('.sync-dots span').first()).toHaveCSS('animation-name', 'sync-dot');
  await toast.hover();
  await expect(toast.locator('#sync-toast-details')).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Deep scanning Instagram' })).toHaveAttribute('aria-expanded', 'true');
  expect((await toast.boundingBox()).height).toBeGreaterThan(box.height);
  await page.mouse.move(0, 0); await expect(toast.locator('#sync-toast-details')).toBeHidden();
  await toast.locator('.sync-toast-summary').focus(); await expect(toast.locator('#sync-toast-details')).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click(); await expect.poll(() => stops).toBe(1); await expect(toast).toBeHidden();
  state.job = { id: 'toast-failed', status: 'failed', targets: ['instagram'], message: 'Instagram: No tab with id: 2128255104.' };
  await expect(toast).toContainText('The background Instagram tab closed', { timeout: 6000 });
  await expect(toast).not.toContainText('2128255104'); await expect(toast).toHaveAttribute('data-tone', 'warning');
  await page.getByRole('button', { name: 'Dismiss Instagram sync report' }).click(); await expect(toast).toBeHidden();
  await page.reload(); await page.waitForResponse('**/api/sync'); await page.waitForTimeout(300); await expect(toast).toBeHidden();
});

test('finished sync reports group account and collection results into readable platform cards', async ({ page }) => {
  const state = await setup(page), toast = page.locator('#sync-status');
  const collectionResult = (name, imported, status) => ({ platform: 'instagram', account: '@ishantperiwal', imported, enriched: 1, status, message: `${name} · ${imported} new saves · 1 posts with added details. 0 confirmed unsaves removed. ${status === 'partial' ? 'Quick check stopped after five checks without more posts loading. Saved batches are kept; complete history and removals are not verified.' : 'Quick check finished at previously saved posts. Older history was not checked; use Deep scan to check it.'}` });
  state.job = { id: 'platform-results', status: 'partial', targets: ['x', 'instagram', 'chrome'], message: 'A long combined message that must never be used as the report', results: [
    { platform: 'x', account: '@one', imported: 2, updated: 0, enriched: 1, status: 'completed', message: '2 new saves · 1 posts with added details. 1 confirmed unsaves removed.' },
    { platform: 'x', account: '@two', imported: 3, updated: 2, enriched: 0, status: 'completed', message: '3 new saves · 0 posts with added details. 0 confirmed unsaves removed.' },
    collectionResult('ae. motion', 0, 'partial'), collectionResult('ai', 4, 'completed'), collectionResult('design', 1, 'partial'),
    { platform: 'chrome', account: '', imported: 0, updated: 23, enriched: 0, status: 'completed', message: '0 new bookmarks · 23 refreshed.' }
  ] };
  await expect(toast.locator('.sync-platform-card')).toHaveCount(3, { timeout: 6000 });
  const instagram = toast.locator('[data-platform="instagram"].sync-platform-card');
  const x = toast.locator('[data-platform="x"].sync-platform-card');
  await expect(x).toHaveAttribute('data-tone', 'success');
  await expect(x.locator('.sync-report-counts')).toHaveText('5 new saves2 refreshed1 with added details1 removed');
  await expect(instagram).toHaveAttribute('data-tone', 'warning');
  await expect(instagram.locator('.sync-report-counts')).toHaveText('5 new saves3 with added details');
  await expect(instagram.locator('.sync-report-issues li')).toHaveCount(1);
  await expect(instagram.locator('.sync-report-issues')).toHaveText('Some posts did not finish loading. Try syncing again.');
  await expect(toast).not.toContainText(state.job.message);
  // Just the source, its counts, and for a warning its message with Retry beneath, in one container.
  await expect(instagram.locator('.sync-report-header')).toHaveText('Instagram');
  await expect(instagram.locator('.sync-report-alert')).toBeVisible();
  await expect(x.locator('.sync-report-header')).toHaveText('X');
  await expect(x.locator('.sync-report-alert')).toHaveCount(0);
  await expect(x.locator('.sync-report-problem')).toHaveCount(0);
  await expect(toast).not.toContainText('Sync complete');
  await expect(toast).not.toContainText('Details');
  await expect(toast).not.toContainText('checks');
  await expect(toast).not.toContainText('Needs attention');
  await expect(instagram.locator('.sync-report-issues')).toBeVisible();
  const message = await instagram.locator('.sync-report-issues').boundingBox(), retry = await instagram.getByRole('button', { name: 'Retry Instagram sync' }).boundingBox(), counts = await instagram.locator('.sync-report-counts').boundingBox();
  expect(message.y, 'the message sits below the counts').toBeGreaterThanOrEqual(counts.y + counts.height);
  expect(retry.y, 'Retry sits below the message').toBeGreaterThanOrEqual(message.y + message.height);
  const plain = (await instagram.boundingBox()).height;
  await instagram.click({ position: { x: 40, y: 10 } }); await instagram.hover();
  expect((await instagram.boundingBox()).height, 'nothing expands').toBe(plain);
  await page.screenshot({ path: 'test-results/sync-report-platforms.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect.poll(async () => (await toast.boundingBox()).x, { message: 'fits once the resize settles' }).toBeGreaterThanOrEqual(12);
  const box = await toast.boundingBox(); expect(box.y).toBeGreaterThanOrEqual(12); expect(box.x + box.width).toBeLessThanOrEqual(378);
  await page.screenshot({ path: 'test-results/sync-report-mobile.png' });
  await page.getByRole('button', { name: 'Dismiss X sync report', exact: true }).click();
  await expect(toast.locator('.sync-platform-card')).toHaveCount(2);
  await page.reload();
  await expect(toast.locator('.sync-platform-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Dismiss Instagram sync report' }).click();
  await page.getByRole('button', { name: 'Dismiss Chrome bookmarks sync report' }).click();
  await expect(toast).toBeHidden();
});

test('finished notices fade away, later jobs still appear, and the notification fits on a phone', async ({ page }) => {
  const state = await setup(page), toast = page.locator('#sync-status');
  state.job = { id: 'toast-finishes', status: 'running', targets: ['chrome'], message: 'Chrome · reading bookmarks' };
  await expect(toast).toBeVisible({ timeout: 6000 });
  state.job = { ...state.job, status: 'completed', message: '23 bookmarks synced' };
  await expect(toast.getByRole('article', { name: 'Chrome bookmarks sync report', exact: true })).toBeVisible({ timeout: 6000 });
  await expect(toast).toBeHidden({ timeout: 10000 });
  state.job = { id: 'toast-next', status: 'running', targets: ['chrome', 'x', 'instagram'], message: 'Syncing your saves in the background' };
  await expect(toast).toBeVisible({ timeout: 6000 }); await expect(toast.locator('.source-icon')).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toast).toHaveCSS('opacity', '1');
  const box = await toast.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(16); expect(box.x + box.width).toBeLessThanOrEqual(374); expect(box.y + box.height).toBeLessThanOrEqual(828);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/sync-toast-mobile.png' });
  await toast.getByRole('button', { name: /Syncing saves/ }).click();
  await expect(toast.locator('#sync-toast-details')).toBeVisible();
  await page.screenshot({ path: 'test-results/sync-toast-expanded-mobile.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(toast.locator('.sync-dots span').first()).toHaveCSS('animation-name', 'none');
});

test('successful cards count down independently, pause for reading, and warning Retry keeps the source and scan mode', async ({ page }) => {
  const state = await setup(page), toast = page.locator('#sync-status');
  const requests = [];
  await page.route('**/api/sync', async route => {
    if (route.request().method() === 'POST') {
      requests.push(route.request().postDataJSON());
      state.job = { id: 'retried-instagram', status: 'queued', ...requests.at(-1), message: 'Waiting for Chrome' };
      return route.fulfill({ json: { job: state.job } });
    }
    state.reads++; return route.fulfill({ json: state });
  });
  state.job = { id: 'countdown-results', status: 'partial', mode: 'deep', targets: ['x', 'instagram', 'chrome'], instagramScope: { account: '@collector', selections: { '@collector': [42] } }, results: [
    { platform: 'x', account: '@one', imported: 2, status: 'completed' },
    { platform: 'instagram', account: '@collector', imported: 1, status: 'partial', message: 'timed out' },
    { platform: 'chrome', imported: 0, updated: 23, status: 'completed' }
  ] };
  const x = toast.getByRole('article', { name: 'X sync report', exact: true });
  const instagram = toast.getByRole('article', { name: 'Instagram sync report', exact: true });
  const chrome = toast.getByRole('article', { name: 'Chrome bookmarks sync report', exact: true });
  await expect(x.locator('.sync-dismiss-progress')).toBeVisible({ timeout: 6000 });
  await expect(x).toHaveAttribute('data-paused', 'false');
  await expect(instagram.locator('.sync-dismiss-progress')).toHaveCount(0);
  await expect(instagram.getByRole('button', { name: 'Retry Instagram sync' })).toBeVisible();
  await chrome.hover();
  await expect(chrome).toHaveAttribute('data-paused', 'true');
  await page.screenshot({ path: 'test-results/sync-report-countdown-retry.png' });
  await expect(x).toHaveCount(0, { timeout: 10000 });
  await expect(chrome).toHaveAttribute('data-paused', 'true');
  await expect(instagram).toBeVisible();
  await instagram.getByRole('button', { name: 'Retry Instagram sync' }).click();
  await expect.poll(() => requests.length, { timeout: 6000 }).toBe(1);
  expect(requests[0]).toMatchObject({ targets: ['instagram'], mode: 'deep', instagramAccount: '@collector', instagramCollectionId: 42 });
  await expect(toast).toContainText('Sync queued');
  await expect(toast.getByRole('button', { name: 'Retry Instagram sync' })).toHaveCount(0);
});
