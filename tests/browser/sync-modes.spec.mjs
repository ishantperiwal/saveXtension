import { test, expect, chromium } from '@playwright/test';
import { readFile, mkdtemp, rm, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openSyncOptions, startQuickSync, startDeepSync, chooseSelect } from './select-helper.mjs';
import { tmpdir } from 'node:os';

test('deep scans are explicit and the selected mode survives helper setup', async ({ page }) => {
  let browser = { online: false, ready: true, bookmarksSupported:true, bookmarksReady:true }, job = null; const queued = [];
  await page.route('**/api/sync', async route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON(); queued.push(input);
      job = { ...input, id: 'manual-scan', status: 'queued' };
    }
    return route.fulfill({ json: { browser, job } });
  });
  await page.goto('/');
  expect(queued).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Deep scan', exact: true })).toHaveCount(0);
  await openSyncOptions(page);
  await page.getByRole('button', { name: 'Deep scan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Open Chrome to sync.' })).toBeVisible();
  browser = { online: true, ready: true, syncModes: true, bookmarksSupported:true, bookmarksReady:true };
  await expect.poll(() => queued.length, { timeout: 8000 }).toBe(1);
  expect(queued[0].mode).toBe('deep');
  await expect(page.getByRole('button', { name: 'Refresh all sources', exact: true })).toBeDisabled();
  job = { ...job, status: 'partial', message: 'Deep scan is incomplete; saved batches are kept.' };
  // A multi-source report shows a note per source rather than repeating the job-level paragraph.
  await expect(page.locator('#sync-status')).toContainText('Sync ended before this source finished', { timeout: 6000 });
  await openSyncOptions(page);
  await startQuickSync(page);
  await expect.poll(() => queued.length).toBe(2);
  expect(queued[1].mode).toBe('quick');
  job = { ...job, status: 'completed' };
  await page.reload(); expect(queued).toHaveLength(2);
});

test('extension quick sync skips known history; manual deep scan finds gaps and confirms unsaves', async ({ baseURL }, testInfo) => {
  test.setTimeout(110000);
  const profile = await mkdtemp(resolve(tmpdir(), 'savex-sync-modes-'));
  const extension = resolve(profile, 'extension'); await cp(resolve('extension'), extension, { recursive: true });
  const backgroundPath = resolve(extension, 'background.js');
  await writeFile(backgroundPath, (await readFile(backgroundPath, 'utf8')).replace("const DEFAULT_ORIGIN = 'http://localhost:3210'", `const DEFAULT_ORIGIN = ${JSON.stringify(baseURL)}`));
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push('https://x.com/*', 'https://www.instagram.com/*');
  await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const known = Array.from({ length: 20 }, (_, i) => String(990000100 + i));
  const fresh = ['990000201', '990000202'], gap = '990000301', unsaved = '990000401', unknown = '990000402';
  const article = (id, control = '') => `<article data-testid="tweet"><a href="/writer/status/${id}"><time datetime="2026-11-01T00:00:00Z">Today</time></a><div data-testid="tweetText">Captured text ${id}</div>${control}</article>`;
  const shell = body => `<html><body><a data-testid="AppTabBar_Profile_Link" href="/sync_modes">Profile</a><main>${body}</main></body></html>`;
  const detailVisits = [];
  try {
    await context.route('https://x.com/**', route => {
      const id = route.request().url().match(/\/status\/(\d+)/)?.[1];
      let body;
      if (id) {
        detailVisits.push(id);
        body = shell(article(id, id === unsaved ? '<button data-testid="bookmark" aria-label="Bookmark">Bookmark</button>' : ''));
      } else {
        body = shell([...fresh, ...known].map(id => article(id)).join('')) + `<script>let added=false;window.addEventListener('scroll',()=>{if(!added){added=true;document.querySelector('main').insertAdjacentHTML('beforeend',${JSON.stringify(article(gap))});}});</script>`;
      }
      return route.fulfill({ contentType: 'text/html', body });
    });
    await context.route('https://platform.twitter.com/**', route => route.abort());
    let [worker] = context.serviceWorkers(); if (!worker) worker = await context.waitForEvent('serviceworker');
    const page = await context.newPage(); await page.goto(`${baseURL}/`);
    await page.evaluate(async ids => {
      // Seed an observed source traversal, not a legacy import that deliberately
      // triggers the first-run ordering repair before the quick boundary applies.
      const headers={'Content-Type':'application/json'};
      const {runId}=await (await fetch('/api/extension/runs',{method:'POST',headers,body:JSON.stringify({platform:'x',account:'@sync_modes',mode:'quick'})})).json();
      await fetch(`/api/extension/runs/${runId}`,{method:'POST',headers,body:JSON.stringify({posts:ids.map(id=>({url:`https://x.com/writer/status/${id}`,text:'Already captured',author:'writer'}))})});
      await fetch(`/api/extension/runs/${runId}/finish`,{method:'POST',headers,body:JSON.stringify({status:'completed'})});
    }, [...known, unsaved, unknown]);
    const status = () => page.evaluate(async () => (await (await fetch('/api/sync')).json()).job);
    const posts = () => page.evaluate(async () => (await (await fetch('/api/posts?scope=all')).json()).posts);
    const previousQuick = (await status())?.id;
    await chooseSelect(page,'X accounts','@sync_modes');
    await startQuickSync(page);
    await expect.poll(async () => (await status())?.id).not.toBe(previousQuick);
    await expect.poll(async () => (await status())?.status, { timeout: 25000 }).toBe('completed');
    expect((await status()).mode).toBe('quick');
    let saved = await posts();
    expect(saved.some(p => p.externalId === fresh[0])).toBe(true);
    expect(saved.some(p => p.externalId === gap)).toBe(false);
    expect(saved.some(p => p.externalId === unsaved)).toBe(true);
    expect(detailVisits).toHaveLength(0);
    await openSyncOptions(page);
    await expect(page.getByRole('button', { name: 'Deep scan', exact: true })).toBeEnabled();
    const previous = (await status()).id;
    await startDeepSync(page);
    await expect.poll(async () => (await status())?.id).not.toBe(previous);
    await expect.poll(async () => (await status())?.status, { timeout: 55000 }).toBe('partial');
    saved = await posts();
    expect(saved.some(p => p.externalId === gap)).toBe(true);
    expect(saved.some(p => p.externalId === unsaved)).toBe(false);
    expect(saved.some(p => p.externalId === unknown)).toBe(true);
    expect(detailVisits.filter(id => id === unsaved)).toHaveLength(2);
    expect(detailVisits.some(id => known.includes(id))).toBe(false);
    const foreground = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].url);
    expect(foreground).toBe(`${baseURL}/`);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await openSyncOptions(page);
    await expect(page.getByRole('button', { name: 'Deep scan', exact: true })).toBeEnabled();
    await expect(page.locator('.sidebar')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('manual-deep-scan-mobile.png') });
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});
