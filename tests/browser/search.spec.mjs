import { test, expect } from '@playwright/test';

for (const [platform, keys, hint] of [['MacIntel', 'Meta+f', '⌘ F'], ['Win32', 'Control+f', 'Ctrl F'], ['Linux x86_64', 'Control+f', 'Ctrl F']]) {
  test(`${platform}: find shortcut focuses and selects library search`, async ({ page, context }) => {
    await context.addInitScript(platform => {
      Object.defineProperty(navigator, 'platform', { get: () => platform });
      Object.defineProperty(navigator, 'userAgentData', { get: () => ({ platform }) });
    }, platform);
    await page.route('**/api/posts?scope=all', route => route.fulfill({ json: { posts: [
      { id: 9901, platform: 'chrome', url: 'https://search-fixture.example/reference', bookmarkTitle: 'Motion reference', title: '', text: '', author: '', authorName: '', thumbnail: '', media: [], kind: 'text', tags: [], topics: ['Design'], accounts: [], notes: '', savedAt: '2026-10-31T12:00:00Z', favorite: false, archived: false, folders: [] }
    ], runs: [] } }));
    await page.goto('/');
    await expect(page.locator('.search kbd')).toHaveText(hint);
    await expect(page.locator('.source-nav .source-icon')).toHaveCount(3);
    const search = page.getByRole('searchbox', { name: 'Search saves' });
    await search.fill('Motion');
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.keyboard.press(keys);
    await expect(page.locator('#modal')).not.toBeVisible();
    await expect(search).toBeFocused();
    expect(await search.evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([0, 6]);
    await page.keyboard.type('reference');
    await expect(search).toHaveValue('reference');
    await expect(page.locator('.save-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('/'); await expect(search).not.toBeFocused();
    const box = await page.locator('.sidebar').boundingBox();
    expect(box.x).toBeGreaterThan(0); expect(box.y).toBeGreaterThan(0);
    if (platform === 'MacIntel') {
      await page.screenshot({ path: 'test-results/floating-sidebar-desktop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await page.screenshot({ path: 'test-results/floating-sidebar-mobile.png', fullPage: true });
    }
  });
}
