import { chooseSelect, openSyncOptions, closeSyncOptions, startQuickSync } from './select-helper.mjs';
import { test, expect, chromium } from '@playwright/test';
import { readFile, mkdtemp, rm, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

test('Chrome bookmarks sync without social access or opening sites, with folders, search and safe refresh', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'savex-chrome-bookmarks-'));
  const extension = resolve(profile, 'extension'); await cp(resolve('extension'), extension, { recursive: true });
  const workerPath = resolve(extension, 'background.js'); await writeFile(workerPath, (await readFile(workerPath, 'utf8')).replace("const DEFAULT_ORIGIN = 'http://localhost:3210'", "const DEFAULT_ORIGIN = 'http://localhost:3211'"));
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8')); manifest.permissions.push('bookmarks'); delete manifest.optional_permissions;
  await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
  let library;
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    let [worker] = context.serviceWorkers(); if (!worker) worker = await context.waitForEvent('serviceworker');
    const seed = await worker.evaluate(async () => {
      const root = (await chrome.bookmarks.getTree())[0].children.find(n => n.children);
      const design = await chrome.bookmarks.create({ parentId: root.id, title: 'Design research' });
      const reading = await chrome.bookmarks.create({ parentId: root.id, title: 'Reading' });
      const first = await chrome.bookmarks.create({ parentId: design.id, title: 'Design handbook', url: 'https://example.com/handbook?chapter=1#intro' });
      await chrome.bookmarks.create({ parentId: reading.id, title: 'Duplicate handbook', url: first.url });
      await chrome.bookmarks.create({ parentId: reading.id, title: 'Coding reference', url: 'https://example.org/reference' });
      await chrome.bookmarks.create({ parentId: reading.id, title: 'Bookmarklet', url: 'javascript:alert(1)' });
      return { first: first.id, design: design.id, reading: reading.id };
    });
    library = await context.newPage(); await library.goto('http://localhost:3211'); await library.bringToFront();
    await library.getByRole('button',{name:'Grid view',exact:true}).click();
    const initialTabs = await worker.evaluate(async () => (await chrome.tabs.query({})).map(t => t.id));
    const sync = async () => {
      const previous = await library.evaluate(async () => (await (await fetch('/api/sync')).json()).job?.id);
      await startQuickSync(library);
      await expect.poll(async () => library.evaluate(async () => (await (await fetch('/api/sync')).json()).job?.id)).not.toBe(previous);
      await expect.poll(async () => library.evaluate(async () => (await (await fetch('/api/sync')).json()).job?.status)).toBe('completed');
      await openSyncOptions(library); await closeSyncOptions(library);
      await library.locator('[data-filter="chrome"]').click();
    };
    await library.getByRole('button', { name: /^Chrome bookmarks/ }).click();
    await chooseSelect(library, 'Sync source', 'chrome');
    await openSyncOptions(library);
    await expect(library.getByRole('button', { name: 'Quick scan', exact: true })).toBeVisible();
    await expect(library.getByRole('button', { name: 'Deep scan', exact: true })).toBeVisible();
    await closeSyncOptions(library);
    await sync();
    await expect(library.locator('.save-card.chrome')).toHaveCount(2, { timeout: 10000 });
    await expect(library.locator('.bookmark-title').filter({ hasText: 'Design handbook' })).toHaveAttribute('href', 'https://example.com/handbook?chapter=1#intro');
    const posts = await library.evaluate(async () => (await (await fetch('/api/posts')).json()).posts.filter(p => p.platform === 'chrome'));
    const handbook = posts.find(p => p.bookmarkTitle === 'Design handbook'); expect(handbook.folders).toHaveLength(2);
    await library.getByRole('button', { name: 'Filters', exact: true }).click();
    await chooseSelect(library, 'Bookmark folder', handbook.folders.find(f => f.endsWith('Design research')));
    await library.getByRole('button', { name: 'Show 1 save', exact: true }).click();
    await expect(library.locator('.save-card.chrome')).toHaveCount(1);
    await library.getByRole('button', { name: 'Filters', exact: true }).click();
    await chooseSelect(library, 'Bookmark folder', '');
    await library.getByRole('button', { name: 'Show 2 saves', exact: true }).click();
    await library.getByRole('searchbox').fill('Reading'); await expect(library.locator('.save-card.chrome')).toHaveCount(2);
    await library.getByRole('searchbox').fill('');
    await library.locator('.save-card.chrome').filter({ hasText: 'Design handbook' }).getByRole('button', { name: 'Edit note' }).click();
    await library.locator(`.save-card[data-post-id="${handbook.id}"]`).getByLabel('Note', { exact: true }).fill('Try this on Sunday');
    await library.getByRole('searchbox').focus();
    await expect(library.locator(`.save-card[data-post-id="${handbook.id}"] .note-status`)).toHaveAttribute('data-state','saved');
    await worker.evaluate(async id => { await chrome.bookmarks.update(id, { title: 'Renamed source title' }); }, seed.first);
    await sync();
    await expect(library.locator('.bookmark-title').filter({ hasText: 'Renamed source title' })).toBeVisible();
    const saved = await library.evaluate(async () => (await (await fetch('/api/posts')).json()).posts.filter(p => p.platform === 'chrome'));
    expect(saved).toHaveLength(2); expect(saved.find(p => p.id === handbook.id).notes).toBe('Try this on Sunday'); expect(saved.find(p => p.id === handbook.id).bookmarkTitle).toBe('Renamed source title');
    expect(await worker.evaluate(async () => (await chrome.tabs.query({})).map(t => t.id))).toEqual(initialTabs);
    expect((await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].url))).toBe('http://localhost:3211/');
    expect(await worker.evaluate(async () => (await chrome.permissions.contains({ origins: ['https://x.com/*'] })))).toBe(false);
    await library.screenshot({ path: 'test-results/chrome-bookmarks-desktop.png', fullPage: true });
    await library.setViewportSize({ width: 390, height: 844 }); expect(await library.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  } finally {
    // Remove only this test's records from the isolated test server.
    if (library) await library.evaluate(async () => { const { posts } = await (await fetch('/api/posts')).json(); for (const p of posts.filter(p => p.platform === 'chrome' && ['https://example.com/handbook?chapter=1#intro', 'https://example.org/reference'].includes(p.url))) await fetch('/api/posts/' + p.id, { method: 'DELETE' }); }).catch(() => {});
    await context.close(); await rm(profile, { recursive: true, force: true });
  }
});
