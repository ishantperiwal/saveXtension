import { test, expect, chromium } from '@playwright/test';
import { readFile, mkdtemp, rm, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const password = 'my strong test password';
test('complete library and real extension flow', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Library name').fill('Ishant’s library');
  await page.getByLabel('Setup code').fill('test-only-setup-code');
  await page.getByLabel('Choose a password').fill(password);
  await page.getByRole('button', { name: 'Create my library' }).click();
  await expect(page.getByRole('heading', { name: 'Save it once.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/library-empty-desktop.png', fullPage: true });

  await page.getByRole('button', { name: 'Add a save', exact: true }).click();
  await page.getByLabel('Post URL').fill('https://twitter.com/alice/status/111111111?s=20');
  await page.getByLabel('Title', { exact: false }).fill('An AI coding workflow');
  await page.getByLabel('Caption or context').fill('Try this AI coding tool. Build a prototype and read the research paper.');
  await page.getByLabel('Tags').fill('try next, read later');
  await page.getByRole('button', { name: 'Save to my library' }).click();
  await expect(page.locator('.save-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add to favorites' }).click();
  await expect(page.getByRole('button', { name: 'Remove from favorites' })).toBeVisible();
  await page.getByRole('button', { name: 'View An AI coding workflow' }).click();
  await page.getByLabel('Your notes').fill('Try this on Sunday. <img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.save-card')).toContainText('Has a note');
  await page.getByRole('searchbox').fill('Sunday'); await expect(page.locator('.save-card')).toHaveCount(1);
  await page.getByRole('searchbox').fill('doesnotexist'); await expect(page.locator('.save-card')).toHaveCount(0);
  await page.getByRole('searchbox').fill(''); await expect(page.locator('.save-card')).toHaveCount(1);

  // Test all supported import shapes in the browser, without executing exported JS or HTML.
  const parsed = await page.evaluate(async () => {
    const { parseImport } = await import('/app.js');
    return [
      parseImport(JSON.stringify({ saved_saved_media: [{ string_list_data: [{ href: 'https://www.instagram.com/p/Fixture123/', value: 'saved' }] }] }), 'saved_posts.json'),
      parseImport('window.YTD.bookmark.part0 = [{"bookmark":{"tweetId":"222222222","fullText":"A design tutorial"}}];', 'bookmark.js'),
      parseImport('<script>window.bad=true</script><a href="https://x.com/b/status/333333333">post</a>', 'saved.html')
    ];
  });
  expect(parsed.map(p => p.length)).toEqual([1, 1, 1]); expect(await page.evaluate(() => window.bad)).toBeUndefined();
  await page.getByRole('button', { name: 'Add a save', exact: true }).click();
  await page.getByRole('button', { name: /Import JSON/ }).click();
  await page.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ posts: [
    { url: 'https://instagram.com/p/Fixture123/', title: 'A design tutorial', text: 'UI and Figma details to learn from.', accounts: ['@personal'], notes: 'Look again', favorite: true },
    { url: 'https://x.com/bob/status/222222222', text: 'A useful paper about models and agents.', author: 'bob', authorName: 'Bob Example' }
  ] })) });
  await page.getByRole('button', { name: 'Import supported post links' }).click();
  await expect(page.locator('.save-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'List view' }).click(); await expect(page.locator('.cards')).toHaveClass(/list-view/);
  await page.getByRole('button', { name: 'Grid view' }).click();
  await page.screenshot({ path: 'test-results/library-populated-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'test-results/library-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: 'Connect & sync' }).click();
  await page.getByRole('button', { name: 'Generate pairing code' }).click();
  const code = await page.locator('.pair-code code').textContent(); expect(code).toMatch(/^[A-F0-9-]+$/);
  await page.screenshot({ path: 'test-results/pairing-dialog.png', fullPage: true });

  // Load the real Manifest V3 extension in an isolated browser profile.
  const profile = await mkdtemp(resolve(tmpdir(), 'savex-extension-'));
  const extension = resolve(profile, 'test-extension');
  await cp(resolve('extension'), extension, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
  // Tests pre-grant the origins normally granted by the permission dialog and toolbar
  // action. Production keeps activeTab and optional host permissions only.
  manifest.host_permissions = ['http://localhost/*', 'https://x.com/*', 'https://www.instagram.com/*'];
  await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    let [worker] = context.serviceWorkers(); if (!worker) worker = await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const options = await context.newPage(); await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.locator('#origin').fill('http://localhost:3211'); await options.locator('#code').fill(code);
    await options.locator('#consent').check();
    await options.getByRole('button', { name: 'Pair my library' }).click();
    await expect(options.locator('#result')).toContainText('Paired.', { timeout: 15000 });

    const fixture = await readFile('tests/fixtures/x.html', 'utf8');
    await context.route('https://x.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: fixture }));
    await context.route('https://pbs.twimg.com/**', route => route.abort());
    const source = await context.newPage(); await source.goto('https://x.com/i/bookmarks');
    // activeTab is normally granted by clicking the toolbar action. In automated tests
    // temporarily grant X through optional host permissions in the extension context.
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const sourceTab = await worker.evaluate(async () => (await chrome.tabs.query({})).find(t => t.url?.startsWith('https://x.com/i/bookmarks'))?.id);
    const syncResult = await popup.evaluate(async tabId => chrome.runtime.sendMessage({ type: 'START_SYNC', tabId, account: '@test-account', maxPosts: 100 }), sourceTab);
    expect(syncResult.ok, syncResult.error).toBeTruthy();
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get('syncState')).syncState))?.status, { timeout: 20000 }).not.toBe('running');
    const run = await worker.evaluate(async () => (await chrome.storage.local.get('syncState')).syncState);
    expect(run.imported).toBe(2); expect(run.status).toBe('partial');
    await page.getByRole('button', { name: 'Close dialog' }).click(); await page.reload(); await expect(page.locator('.save-card')).toHaveCount(5);
    const stored = await page.evaluate(async () => (await (await fetch('/api/posts')).json()).posts);
    expect(stored.find(p => p.externalId === '123456789').accounts).toEqual(['@test-account']);

    const instagramFixture = await readFile('tests/fixtures/instagram.html', 'utf8');
    await context.route('https://www.instagram.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: instagramFixture }));
    await context.route('https://scontent.cdninstagram.com/**', route => route.abort());
    await source.goto('https://www.instagram.com/second_account/saved/all-posts/');
    const igResult = await popup.evaluate(async tabId => chrome.runtime.sendMessage({ type: 'START_SYNC', tabId, maxPosts: 100 }), sourceTab);
    expect(igResult.ok, igResult.error).toBeTruthy();
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get('syncState')).syncState))?.status, { timeout: 20000 }).not.toBe('running');
    const igRun = await worker.evaluate(async () => (await chrome.storage.local.get('syncState')).syncState);
    expect(igRun.imported).toBe(2); expect(igRun.account).toBe('@second_account');

    // Re-syncing is additive and stoppable, with no duplicate library records.
    const repeat = await popup.evaluate(async tabId => chrome.runtime.sendMessage({ type: 'START_SYNC', tabId, maxPosts: 100 }), sourceTab);
    expect(repeat.ok).toBeTruthy();
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get('syncState')).syncState))?.updated).toBe(2);
    await popup.evaluate(async () => chrome.runtime.sendMessage({ type: 'STOP_SYNC' }));
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get('syncState')).syncState))?.status).toBe('cancelled');
    await page.reload(); await expect(page.locator('.save-card')).toHaveCount(7);
    const finalPosts = await page.evaluate(async () => (await (await fetch('/api/posts')).json()).posts);
    expect(finalPosts.find(p => p.externalId === 'AbC123_-').accounts).toEqual(['@second_account']);
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }

  await page.getByRole('button', { name: 'Settings & backups' }).click();
  await expect(page.getByText('My browser', { exact: true })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export library' }).click()]);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8')); expect(exported.posts.length).toBe(7); expect(exported.posts.find(p => p.externalId === '111111111').notes).toContain('Sunday');
  await page.getByRole('button', { name: 'Sign out of this browser' }).click();
  await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Open my library' }).click();
  await expect(page.locator('.save-card')).toHaveCount(7);
  expect(errors).toEqual([]);
});
