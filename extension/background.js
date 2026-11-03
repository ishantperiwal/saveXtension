import { createWorkTab, closeWorkTab, cleanWorkTabs, adoptConnectionTab } from './work-tabs.js';
import { performUnsave } from './unsave-worker.js';
import { bookmarkPosts } from './bookmarks.js';

const DEFAULT_ORIGIN = 'http://localhost:3210';
const SOCIAL_ORIGINS = ['https://x.com/*', 'https://www.instagram.com/*'];
// The desktop runs this same tested scan engine in a private Node worker. Its
// browser adapter owns isolated Electron sessions instead of Chrome tabs.
const desktop = globalThis.SaveXDesktopWorker;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let working = false, checking = false, unsaving = false;
let queuePoll;
const get = async key => (await chrome.storage.local.get(key))[key];
const setRun = syncState => chrome.storage.local.set({ syncState });
const localOrigin = value => {
  try { const u = new URL(value); return u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname) && !u.username && !u.password && u.pathname === '/' ? u.origin : null; } catch { return null; }
};
async function origin() { return (await get('libraryOrigin')) || DEFAULT_ORIGIN; }
async function request(path, body) {
  if (desktop) return desktop.request(path, body);
  const response = await fetch(`${await origin()}/api/extension${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Library request failed.'); return result;
}
async function instanceId() {
  let id = await get('instance'); if (!id) { id = crypto.randomUUID(); await chrome.storage.local.set({ instance: id }); } return id;
}
async function ready() { return chrome.permissions.contains({ origins: SOCIAL_ORIGINS }); }
async function bookmarksReady() { return chrome.permissions.contains({ permissions: ['bookmarks'] }); }
async function updateJob(input) {
  const job = await get('job'); if (!job) return;
  const response = await request(`/jobs/${job.id}`, { ...input, instance: await instanceId() });
  if (response.job?.status === 'cancelled') await chrome.storage.local.set({ cancelRequested: true });
}
async function progress(message) {
  const job = await get('job');
  if (job) await updateJob({ message, results: job.results });
}
async function closeOwned() {
  const owned = (await get('job'))?.ownedTabs || [];
  for (const tabId of owned) await closeWorkTab(tabId).catch(() => {});
}
async function stopped() {
  return (await get('cancelRequested')) === true;
}
async function loaded(tabId, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await stopped()) throw new Error('Stopped. Your imported saves are kept.');
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return tab;
    await sleep(400);
  }
  throw new Error('The site took too long to load. Click Sync to try again.');
}
async function inspect(tabId, platform) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await stopped()) throw new Error('Stopped.');
    const tab = await chrome.tabs.get(tabId);
    if (/\/accounts\/login|\/accounts\/password|\/challenge|\/checkpoint|\/i\/flow\/login/.test(new URL(tab.url).pathname)) throw new Error(`Sign in to ${platform === 'x' ? 'X' : 'Instagram'} in Chrome, then click Sync again.`);
    await chrome.scripting.executeScript({ target: { tabId }, files: ['extractors.js'] });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.SaveXExtractors.pageInfo(document, location) });
    if (result.valid) return result;
    await sleep(600);
  }
  throw new Error(platform === 'x' ? 'X did not show Bookmarks. Check that you are signed in and Bookmarks is selected.' : 'Instagram did not show Saved posts. Check your login, then try again.');
}
async function instagramUrl(tabId) {
  const end = Date.now() + 16000;
  while (Date.now() < end) {
    if (await stopped()) throw new Error('Stopped.');
    const tab = await chrome.tabs.get(tabId);
    if (/\/accounts\/login|\/challenge|\/checkpoint/.test(new URL(tab.url).pathname)) throw new Error('Sign in to Instagram in Chrome, then click Sync again.');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => {
      const saved = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).find(h => /^\/[\w.]+\/saved(?:\/|$)/.test(h));
      if (saved) return saved.replace(/\/saved.*$/, '/saved/all-posts/');
      const profile = [...document.querySelectorAll('a[href]')].find(a => /profile/i.test(a.getAttribute('aria-label') || '') || a.querySelector('img[alt*="profile picture"]'));
      const account = profile?.getAttribute('href')?.match(/^\/([\w.]+)\/?$/)?.[1];
      return account && !['accounts', 'direct', 'explore', 'reels'].includes(account) ? `/${account}/saved/all-posts/` : null;
    } });
    if (result) return `https://www.instagram.com${result}`;
    await sleep(700);
  }
  throw new Error('Couldn’t find your Instagram profile. Sign in to Instagram in Chrome, then try again.');
}
async function discoverInstagramCollections(tabId, allPostsUrl) {
  await progress('Instagram · finding your saved collections…');
  await chrome.tabs.update(tabId, { url: `${allPostsUrl.replace(/\/all-posts\/$/, '/')}#savex-sync` });
  await sleep(500); await loaded(tabId);
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['background-render.js'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['extractors.js'] });
  const found = new Map(); let idle = 0, ready = false, account = '';
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !(await stopped())) {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.SaveXExtractors.instagramCollections(document, location) });
    if (result.account) {
      if (account && account.toLowerCase() !== result.account.toLowerCase()) throw new Error('The Instagram account changed while reading collections.');
      account = result.account;
    }
    const before = found.size;
    for (const collection of result.collections) found.set(collection.externalId, collection);
    ready ||= result.ready;
    idle = ready && before === found.size ? idle + 1 : 0;
    if (idle >= 3) break;
    await chrome.scripting.executeScript({ target: { tabId }, func: () => {
      const root = document.scrollingElement || document.documentElement;
      root.scrollBy({ top: Math.max(500, innerHeight * .8), behavior: 'instant' });
      root.dispatchEvent(new Event('scroll', { bubbles: true })); window.dispatchEvent(new Event('scroll'));
    } });
    await sleep(700);
  }
  if (await stopped()) throw new Error('Stopped. Previously saved collections are kept.');
  if (!ready || !account) throw new Error('Instagram’s collection list did not finish loading. Try another sync.');
  const collections = [...found.values()]; let saved = [];
  for (let i = 0; i < Math.max(1, collections.length); i += 1000) {
    saved = (await request('/instagram-collections', { account, collections: collections.slice(i, i + 1000) })).collections;
  }
  // Keep earlier folders if a partial catalog omitted them; only visit folders exposed this time.
  return saved.filter(collection => found.has(collection.externalId));
}
let accountScanPromise = null, initialized = false;
async function publishAccounts(catalog) {
  await chrome.storage.local.set({ xAccountCatalog: catalog });
  await request('/accounts', { ...catalog, instance: await instanceId() });
}
async function discoverXAccounts() {
  if (desktop) { const catalog = await desktop.accounts('x'); await publishAccounts(catalog); return catalog; }
  if (accountScanPromise) return accountScanPromise;
  accountScanPromise = (async () => {
    let tab;
    const previous = await get('xAccountCatalog');
    await publishAccounts({ accounts: previous?.accounts || [], active: previous?.active || '', busy: true, checkedAt: Date.now() });
    try {
      tab = await createWorkTab('accounts');
      await chrome.storage.local.set({ accountScanTabId: tab.id });
      await chrome.tabs.update(tab.id, { muted: true, autoDiscardable: false, url: 'https://x.com/i/bookmarks#savex-sync' });
      await sleep(400); await loaded(tab.id);
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['x-accounts.js'] });
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: async () => globalThis.SaveXAccounts.discover() });
      if (!result?.active || !result.accounts?.length) throw new Error('X did not expose any signed-in accounts.');
      const catalog = { ...result, checkedAt: Date.now(), busy: false, error: '' };
      await publishAccounts(catalog); return catalog;
    } catch (error) {
      await publishAccounts({ accounts: previous?.accounts || [], active: previous?.active || '', checkedAt: Date.now(), busy: false, error: error.message });
      throw error;
    } finally { if (tab) await closeWorkTab(tab.id).catch(() => {}); await chrome.storage.local.remove('accountScanTabId'); }
  })();
  try { return await accountScanPromise; } finally { accountScanPromise = null; }
}
async function switchXAccount(tabId, account, { verifyBookmarks = true } = {}) {
  if (desktop) return desktop.verifyAccount(tabId, 'x', account);
  await chrome.scripting.executeScript({ target: { tabId }, files: ['x-accounts.js'] });
  let choice;
  try {
    // Return explicit errors: injected promise rejections are not consistently
    // propagated by Chrome's scripting API across document changes.
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: async target => {
      try { return { ok: true, ...await globalThis.SaveXAccounts.choose(target) }; }
      catch (error) { return { ok: false, error: error.message }; }
    }, args: [account] });
    if (result?.ok === false) throw new Error(result.error);
    choice=result;
  }
  catch (error) { if (/not signed in|valid X account|read X’s account switcher/.test(error.message)) throw error; /* A successful switch can replace the executing document. */ }
  const end = Date.now() + 20000; let matched = false;
  while (Date.now() < end && !(await stopped())) {
    const tab = await chrome.tabs.get(tabId);
    if (/\/i\/flow\/login|\/challenge|\/checkpoint/.test(new URL(tab.url).pathname)) throw new Error(`X needs you to finish signing in to ${account}.`);
    try {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.match(/^\/([\w]+)\/?$/)?.[1] || '' });
      if (`@${result}`.toLowerCase() === account.toLowerCase()) { matched = true; break; }
    } catch { /* The account switch may still be navigating. */ }
    await sleep(400);
  }
  if (!matched) throw new Error(`Couldn’t confirm ${account} is active. No posts were imported for that account.`);
  if (!verifyBookmarks) return {switched:choice?.requested===true};
  await chrome.tabs.update(tabId, { url: 'https://x.com/i/bookmarks#savex-sync' });
  await sleep(400); await loaded(tabId);
  const info = await inspect(tabId, 'x');
  if (info.account?.toLowerCase() !== account.toLowerCase()) throw new Error(`X is not showing ${account}. No posts were imported for that account.`);
}
async function preparePlan(job) {
  const plan = [];
  for (const platform of job.targets) {
    if (desktop && platform === 'instagram') {
      const catalog = await desktop.accounts('instagram'), requested = job.instagramScope?.account;
      const accounts = requested && requested !== 'current' ? catalog.accounts.filter(item => item.handle.toLowerCase() === requested.toLowerCase()) : catalog.accounts;
      if (!accounts.length) throw new Error(`Connect ${requested && requested !== 'current' ? requested : 'Instagram'} in saveXtension, then retry.`);
      plan.push(...accounts.map(item => ({ platform, account: item.handle })));
    } else if (platform === 'x' && Array.isArray(job.xAccount)) plan.push(...job.xAccount.map(account => ({ platform, account })));
    else if (platform !== 'x' || !job.xAccount || job.xAccount === 'current') plan.push({ platform, account: null });
    else if (job.xAccount === 'all') {
      await progress('Finding your signed-in X accounts…');
      const catalog = await discoverXAccounts();
      plan.push(...catalog.accounts.map(account => ({ platform: 'x', account: account.handle })));
    } else plan.push({ platform: 'x', account: job.xAccount });
  }
  job.plan = plan; await chrome.storage.local.set({ job });
  return job;
}
async function syncChromeBookmarks() {
  if (!(await bookmarksReady())) throw new Error('Allow Chrome bookmarks in saveXtension settings, then click Sync again.');
  await progress('Reading your Chrome bookmark folders…');
  const { posts, skipped } = bookmarkPosts(desktop ? await desktop.bookmarks() : await chrome.bookmarks.getTree());
  const { runId } = await request('/runs', { platform: 'chrome', account: '' });
  let imported = 0, updated = 0, rejected = 0, processed = 0;
  await setRun({ runId, platform: 'chrome', account: '', status: 'running', stage: 'importing', imported, updated, rejected, posts: [], message: 'Reading Chrome bookmarks…' });
  try {
    for (let i = 0; i < posts.length && !(await stopped()); i += 100) {
      const result = await request(`/runs/${runId}`, { posts: posts.slice(i, i + 100) });
      imported += result.imported; updated += result.updated; rejected += result.rejected; processed = Math.min(i + 100, posts.length);
      await progress(`Chrome bookmarks · ${processed} of ${posts.length} links saved`);
    }
    const cancelled = await stopped(), status = cancelled ? 'cancelled' : 'completed';
    const message = `${imported} new bookmarks · ${updated} refreshed${skipped ? ` · ${skipped} unsupported links skipped` : ''}${cancelled ? ' · stopped; imported bookmarks are kept' : ''}.`;
    await finishRun({ runId, platform: 'chrome', account: '', imported, updated, rejected, posts: [] }, status, message);
    const job = await get('job'); job.results.push({ platform: 'chrome', account: '', imported, updated, enriched: 0, status, message });
    job.index++; job.phase = 'next'; await chrome.storage.local.set({ job });
  } catch (error) { await finishRun({ runId, platform: 'chrome', imported, updated, rejected, posts: [] }, 'failed', error.message); throw error; }
}
async function startSource(platform, selectedAccount = null, collection = null) {
  let job = await get('job');
  if (desktop) await desktop.selectAccount(platform, selectedAccount);
  const tab = await createWorkTab('sync');
  job.ownedTabs.push(tab.id); job.sourceTabId = tab.id; job.phase = 'loading'; await chrome.storage.local.set({ job });
  await chrome.tabs.update(tab.id, { autoDiscardable: false, muted: true });
  await chrome.tabs.update(tab.id, { url: platform === 'x' ? 'https://x.com/i/bookmarks#savex-sync' : 'https://www.instagram.com/' });
  await sleep(400);
  await loaded(tab.id);
  if (desktop) await desktop.verifyAccount(tab.id, platform, selectedAccount);
  if (platform === 'instagram') {
    let url;
    if (collection) url = collection.url;
    else {
      url = await instagramUrl(tab.id);
      const account = '@' + decodeURIComponent(new URL(url).pathname.split('/')[1]);
      if (job.instagramScope?.account && job.instagramScope.account !== 'current' && account.toLowerCase() !== job.instagramScope.account.toLowerCase()) throw new Error(`Sign into Instagram as ${job.instagramScope.account} before refreshing this account. No posts were imported.`);
      const selected = job.instagramScope?.selections?.[account.toLowerCase()];
      let collections = [];
      try { collections = await discoverInstagramCollections(tab.id, url); }
      catch (error) {
        if (await stopped() || Array.isArray(selected)) throw error;
        job = await get('job'); job.instagramCollectionWarning = 'Instagram collections could not be read this time. Existing folders are kept; try another sync.';
        await chrome.storage.local.set({ job });
      }
      job = await get('job');
      if (!job.plan[job.index].collectionsDiscovered) {
        if (Array.isArray(selected)) {
          const chosen = collections.filter(item => selected.includes(item.id));
          if (!chosen.length || chosen.length !== selected.length) throw new Error('Some selected Instagram collections could not be found. Customize your save list and try again.');
          job.plan.splice(job.index, 1, ...chosen.map(collection => ({ platform: 'instagram', account: collection.account, collection })));
          collection = chosen[0]; url = collection.url;
        } else {
          job.plan.splice(job.index + 1, 0, ...collections.map(collection => ({ platform: 'instagram', account: collection.account, collection })));
          job.plan[job.index].collectionsDiscovered = true;
        }
        await chrome.storage.local.set({ job });
      }
    }
    await chrome.tabs.update(tab.id, { url: `${url}#savex-sync` }); await sleep(500); await loaded(tab.id);
  }
  if (platform === 'x' && selectedAccount) { await progress(`Opening X Bookmarks for ${selectedAccount}…`); await switchXAccount(tab.id, selectedAccount); }
  const info = await inspect(tab.id, platform);
  if (collection && (info.account.toLowerCase() !== collection.account.toLowerCase() || info.collectionId !== collection.externalId)) throw new Error('Instagram did not open the expected account and collection.');
  if (platform === 'x' && !info.account) throw new Error('Couldn’t identify the active X account. Try again after signing in.');
  if (platform === 'x') { const catalog = await get('xAccountCatalog'); if (catalog && catalog.active !== info.account) await publishAccounts({ ...catalog, active: info.account, busy: false }); }
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['background-render.js'] });
  const mode = job.mode === 'deep' ? 'deep' : 'quick';
  const { ids: knownIds } = await request(`/known?platform=${platform}&account=${encodeURIComponent(info.account)}${collection ? `&collectionId=${collection.id}` : ''}`);
  const { runId } = await request('/runs', { platform, account: info.account, mode, collectionId: collection?.id });
  const run = { runId, tabId: tab.id, platform, account: info.account, collectionId: collection?.id, collectionName: collection?.name, collectionWarning: platform === 'instagram' ? job.instagramCollectionWarning : '', status: 'running', stage: 'collecting', imported: 0, updated: 0, rejected: 0, seen: 0, enriched: 0, posts: [], message: 'Finding your saved posts…', startedAt: Date.now() };
  job = await get('job'); job.phase = 'collecting'; await chrome.storage.local.set({ job }); await setRun(run);
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['collector.js'] });
  const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_COLLECT', options: { runId, platform, mode, knownIds, collectionExternalId: collection?.externalId, maxPosts: mode === 'deep' ? 100000 : 500 } });
  if (!response?.ok) throw new Error(response?.error || 'Couldn’t start collection.');
}
async function finishRun(run, status, message) {
  await request(`/runs/${run.runId}/finish`, { status, message }).catch(() => {});
  await setRun({ ...run, status, stage: 'done', message, posts: [] });
}
async function readBookmarkState(run, post, reload = false) {
  if (reload) await chrome.tabs.reload(run.tabId);
  else await chrome.tabs.update(run.tabId, { url: post.url });
  await sleep(700); await loaded(run.tabId, 15000);
  await chrome.scripting.executeScript({ target: { tabId: run.tabId }, files: ['extractors.js'] });
  let previous = null;
  for (let attempt = 0; attempt < 5 && !(await stopped()); attempt++) {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: run.tabId }, func: url => {
      if (location.hostname !== 'x.com' || location.pathname.match(/\/status\/(\d+)/)?.[1] !== url.match(/\/status\/(\d+)/)?.[1]) return null;
      return globalThis.SaveXExtractors.xBookmarkState(document, url);
    }, args: [post.url] });
    if (result && result.account.toLowerCase() === run.account.toLowerCase()) {
      if (previous && JSON.stringify(previous) === JSON.stringify(result)) return result;
      previous = result;
    } else previous = null;
    await sleep(700);
  }
  return null;
}
async function verifyMissing() {
  let run = await get('syncState'), job = await get('job');
  if (!job || !run || job.mode !== 'deep' || run.platform !== 'x' || await stopped()) return;
  if (!job.missingPosts) {
    const data = await request(`/runs/${run.runId}/missing`);
    job.missingPosts = data.posts; job.missingRemaining = data.remaining;
    await chrome.storage.local.set({ job });
  }
  for (let i = job.missingIndex || 0; i < job.missingPosts.length && !(await stopped()); i++) {
    const post = job.missingPosts[i];
    await progress(`Deep scan · verifying missing X saves · ${i + 1} of ${job.missingPosts.length}`);
    try {
      const first = await readBookmarkState(run, post);
      const second = first?.state === 'unsaved' ? await readBookmarkState(run, post, true) : null;
      if (await stopped()) break;
      const observations = first?.state === 'unsaved' && second?.state === 'unsaved' ? [first, second] : undefined;
      const result = await request(`/runs/${run.runId}/missing`, { url: post.url, observations });
      if (result.removed) run.removed = (run.removed || 0) + 1;
    } catch {
      // Defer unavailable posts so the same failures cannot starve the rest of a large backlog.
      if (!(await stopped())) await request(`/runs/${run.runId}/missing`, { url: post.url }).catch(() => {});
    }
    job = await get('job'); job.missingIndex = i + 1;
    await chrome.storage.local.set({ job }); await setRun(run);
  }
}
async function enrich() {
  await verifyMissing();
  let run = await get('syncState'), job = await get('job');
  if (!run || !job) return;
  // Collection passes record membership and list metadata; don't multiply detail visits by folder count.
  if (run.collectionId && !job.detailPosts) { job.detailPosts = []; job.detailsRemaining = 0; await chrome.storage.local.set({ job }); }
  if (!job.detailPosts) { const data = await request(`/details?platform=${run.platform}&account=${encodeURIComponent(run.account || '')}&runId=${run.runId}`); job.detailPosts = data.posts; job.detailsRemaining = data.remaining; await chrome.storage.local.set({ job }); }
  const posts = job.detailPosts; let missed = 0;
  await setRun({ ...run, stage: 'enriching' });
  // Reuse only our own tab; the user's original tabs are never navigated or scrolled.
  for (let i = job.detailIndex || 0; i < posts.length && !(await stopped()); i++) {
    await progress(`${run.platform === 'x' ? run.account + ' · ' : ''}Refreshing metadata · ${i + 1} of ${posts.length} ${run.platform === 'x' ? 'X' : 'Instagram'} saves`);
    try {
      await chrome.tabs.update(run.tabId, { url: posts[i].url }); await sleep(350); await loaded(run.tabId, 15000);
      const end = Date.now() + 6000; let detail;
      while (Date.now() < end && !(await stopped())) {
        const tab = await chrome.tabs.get(run.tabId);
        if (/\/accounts\/login|\/challenge|\/checkpoint|\/i\/flow\/login/.test(new URL(tab.url).pathname)) throw new Error('The site needs a login or a check.');
        await chrome.scripting.executeScript({ target: { tabId: run.tabId }, files: ['extractors.js'] });
        const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: run.tabId }, func: (platform, url) => globalThis.SaveXExtractors.detail(document, platform, url), args: [run.platform, posts[i].url] });
        if (result) { detail = result; break; } await sleep(700);
      }
      if (detail) { await request(`/runs/${run.runId}`, { posts: [detail], details: true }); run.enriched++; }
      else { missed++; await request(`/runs/${run.runId}`, { posts: [], detailFailed: posts[i].url }); }
    } catch { missed++; await request(`/runs/${run.runId}`, { posts: [], detailFailed: posts[i].url }).catch(() => {}); }
    job = await get('job'); job.detailIndex = i + 1; await chrome.storage.local.set({ job }); await setRun(run);
    if (missed >= 3) break;
  }
  const cancelled = await stopped();
  const pendingDetails = (job.detailsRemaining || 0) + Math.max(0, posts.length - (job.detailIndex || 0));
  const message = cancelled ? 'Stopped. Everything already imported is saved.' : `${run.collectionName ? `${run.collectionName} · ` : ''}${run.imported} new saves · ${run.enriched} posts with added details. ${run.removed || 0} confirmed unsaves removed. ${run.collectorMessage || ''}${missed ? ' Some details were unavailable; captured links and previews are kept.' : ''}${pendingDetails ? ` ${pendingDetails} posts still have pending details; detail fetching is limited to 25 posts per scan.` : ''}${job.missingRemaining ? ` ${job.missingRemaining} missing saves remain unchecked; removal checks are limited to 25 posts per deep scan.` : ''}`;
  await finishRun(run, cancelled ? 'cancelled' : run.collectorStatus || 'partial', message);
  job = await get('job'); job.results.push({ platform: run.platform, account: run.account, imported: run.imported, updated: run.updated, enriched: run.enriched, status: cancelled ? 'cancelled' : run.collectorStatus || 'partial', message });
  await closeOwned(); job.ownedTabs = []; job.index++; job.phase = 'next'; job.detailIndex = 0;
  for (const key of ['detailPosts', 'detailsRemaining', 'missingPosts', 'missingRemaining', 'missingIndex']) delete job[key];
  await chrome.storage.local.set({ job });
}
async function advanceJob() {
  if (working) return;
  working = true; let failed = false;
  try {
    let job = await get('job'); if (!job) return;
    if (!job.plan) job = await preparePlan(job);
    if (job.phase === 'collecting') return;
    if (job.phase === 'enriching') await enrich();
    job = await get('job');
    if (await stopped() || job.index >= job.plan.length) {
      const status = await stopped() ? 'cancelled' : job.results.length && job.results.every(r => r.status === 'failed') ? 'failed' : job.results.some(r => r.status === 'failed') ? 'partial' : job.results.some(r => r.status === 'partial') ? 'partial' : 'completed';
      const total = job.results.reduce((n, r) => n + r.imported, 0);
      await closeOwned(); await updateJob({ status, results: job.results, message: await stopped() ? 'Stopped. Everything already imported is saved.' : `${total} new saves. ${job.results.map(r => `${r.platform === 'x' ? 'X' : r.platform === 'chrome' ? 'Chrome bookmarks' : 'Instagram'}${r.account ? ' ' + r.account : ''}: ${r.message}`).join(' ')}` });
      await chrome.storage.local.remove(['job', 'cancelRequested']); return;
    }
    try { if (job.phase === 'loading') { await closeOwned(); job.ownedTabs = []; await chrome.storage.local.set({ job }); } if (job.plan[job.index].platform === 'chrome') await syncChromeBookmarks(); else await startSource(job.plan[job.index].platform, job.plan[job.index].account, job.plan[job.index].collection); }
    catch (e) {
      if (desktop) await desktop.accountError(e.message);
      const run = await get('syncState'); if (run?.status === 'running') await finishRun(run, 'failed', e.message);
      job = await get('job'); job.results.push({ platform: job.plan[job.index].platform, account: job.plan[job.index].account || '', imported: run?.status === 'running' ? run.imported : 0, updated: 0, enriched: 0, status: 'failed', message: e.message });
      await closeOwned(); job.ownedTabs = []; job.index++; job.phase = 'next'; await chrome.storage.local.set({ job });
    }
  } catch (e) { failed = true; console.error('Background sync:', e.message); const job = await get('job'); if (job) { await closeOwned(); await updateJob({ status: 'failed', results: job.results || [], message: e.message }).catch(() => {}); await chrome.storage.local.remove(['job', 'cancelRequested']); } }
  finally {
    working = false;
    const job = await get('job'); if (!failed && job && ['next', 'enriching'].includes(job.phase)) void advanceJob();
  }
}
async function checkJobs() {
  if (checking) return; checking = true;
  clearTimeout(queuePoll);let reachedLibrary=false;
  try {
    const orphan=await get('unsaveWork');
    if(orphan&&!unsaving){
      await request(`/unsaves/${orphan.id}/finish`,{instance:await instanceId(),status:'uncertain',message:'The browser helper restarted. Check the original post before trying again.'}).catch(()=>{});
      if(orphan.tabId)await closeWorkTab(orphan.tabId).catch(()=>{});
      await chrome.storage.local.remove('unsaveWork');
    }
    const job = await get('job');
    if(!working&&!unsaving&&!accountScanPromise)await cleanWorkTabs(job?.ownedTabs || [],true);
    const allowed = await ready(), bookmarkAccess = await bookmarksReady();
    if (allowed && !(await chrome.scripting.getRegisteredContentScripts({ ids: ['savex-background-layout'] })).length) {
      await chrome.scripting.registerContentScripts([{ id: 'savex-background-layout', matches: SOCIAL_ORIGINS, js: ['background-render.js'], world: 'MAIN', runAt: 'document_start' }]);
    }
    const response = await request('/jobs', { instance: await instanceId(), name: desktop ? 'saveXtension' : navigator.userAgent.includes('Edg/') ? 'Edge' : 'Chrome', ready: allowed, bookmarksReady: bookmarkAccess, bookmarksSupported: true, version: chrome.runtime.getManifest().version, accountSwitching: true, selectedAccounts: true, syncModes: true, instagramCollections: true, instagramSaveLists: true, unsave: true, claim: (allowed || bookmarkAccess) && !job && !accountScanPromise && !unsaving, jobId: job?.id });
    reachedLibrary=true;
    if (!desktop && response.desktopSocial) {
      if (job) { await closeOwned(); await chrome.storage.local.remove(['job', 'cancelRequested']); }
      if (response.bookmarkSetupRequested && !bookmarkAccess) await chrome.runtime.openOptionsPage();
      return;
    }
    if (response.scanAccountsRequested) await chrome.storage.local.set({ accountScanRequested: true });
    if (response.setupRequested && !allowed) await chrome.runtime.openOptionsPage();
    if (response.bookmarkSetupRequested && !bookmarkAccess) await chrome.runtime.openOptionsPage();
    if(response.claimedUnsave){
      unsaving=true;
      if (desktop) {
        try { await desktop.selectAccount(response.claimedUnsave.platform, response.claimedUnsave.account); }
        catch (error) { await request(`/unsaves/${response.claimedUnsave.id}/finish`, { instance: await instanceId(), status: 'failed', message: error.message }); unsaving = false; return; }
      }
      void performUnsave(response.claimedUnsave,{request,instance:await instanceId(),switchXAccount,instagramUrl,loaded,sleep}).finally(()=>{unsaving=false;void checkJobs();});
      return;
    }
    if (job) {
      if (!response.job || response.job.id !== job.id || ['completed', 'partial', 'failed'].includes(response.job.status)) {
        await closeOwned(); await chrome.storage.local.remove(['job', 'cancelRequested']); return;
      }
      if (response.job?.id === job.id && response.job.status === 'cancelled') {
        await chrome.storage.local.set({ cancelRequested: true });
        const run = await get('syncState'); if (run?.stage === 'collecting') await chrome.tabs.sendMessage(run.tabId, { type: 'STOP_COLLECT' }).catch(() => {});
      }
      if (job.phase === 'collecting') {
        const run = await get('syncState');
        const alive = run && await chrome.tabs.sendMessage(run.tabId, { type: 'COLLECTOR_STATUS' }).catch(() => null);
        if (!alive?.running) {
          if (run) await setRun({ ...run, collectorStatus: 'partial', collectorMessage: 'Collection was interrupted; saved batches are kept.' });
          job.phase = 'enriching'; await chrome.storage.local.set({ job });
        }
      }
      void advanceJob();
    } else if (response.claimed) {
      await chrome.storage.local.set({ job: { ...response.claimed, index: 0, ownedTabs: [], phase: 'next', results: [], detailIndex: 0 }, cancelRequested: false }); void advanceJob();
    } else if (allowed && !accountScanPromise && !unsaving && !response.unsave?.status?.match(/^(queued|running)$/)) {
      const catalog = await get('xAccountCatalog');
      if (await get('accountScanRequested') || !catalog || Date.now() - catalog.checkedAt > 5 * 60000) {
        await chrome.storage.local.remove('accountScanRequested');
        void discoverXAccounts().catch(() => {}).finally(() => { void checkJobs(); });
      }
    }
  } catch { /* The local server may be stopped. Retry when it is available. */ }
  finally {
    checking = false;
    // Pick up desktop actions without opening a browser connection tab.
    // Back off when the local app is closed; alarms still wake a suspended worker.
    queuePoll=setTimeout(()=>void checkJobs(),reachedLibrary?2000:30000);
  }
}
async function handle(message, sender) {
  if (sender.id !== chrome.runtime.id) throw new Error('Unknown sender.');
  const extensionPage = sender.url?.startsWith(chrome.runtime.getURL(''));
  if (message.type === 'CLOSE_DESKTOP_CONNECT' && sender.tab) {
    const url = new URL(sender.url);
    if (localOrigin(url.origin) !== await origin() || url.pathname !== '/desktop-connect.html' || url.searchParams.get('desktop') !== '1') throw new Error('Only the desktop connection tab can close itself.');
    await adoptConnectionTab(sender.tab.id);await closeWorkTab(sender.tab.id); return {};
  }
  if (['CHECK_JOBS', 'OPEN_SETUP', 'OPEN_BOOKMARK_SETUP'].includes(message.type) && sender.tab && localOrigin(new URL(sender.url).origin)) {
    const address = localOrigin(message.origin);
    if (!address || address !== new URL(sender.url).origin) throw new Error('Unexpected library address.');
    await chrome.storage.local.set({ libraryOrigin: address });
    const connection=new URL(sender.url);
    if(connection.pathname==='/desktop-connect.html'&&connection.searchParams.get('desktop')==='1')await adoptConnectionTab(sender.tab.id);
    if (['OPEN_SETUP', 'OPEN_BOOKMARK_SETUP'].includes(message.type)) await chrome.runtime.openOptionsPage();
    await checkJobs(); return { ready: await ready(), bookmarksReady: await bookmarksReady(), bookmarksSupported: true, version: chrome.runtime.getManifest().version };
  }
  if (sender.tab && !extensionPage) {
    const run = await get('syncState');
    if (!run || run.tabId !== sender.tab.id || run.runId !== message.runId || run.stage !== 'collecting' || run.status !== 'running') throw new Error('No active sync for this tab.');
    const info = new URL(sender.url); if (!['x.com', 'www.x.com', 'twitter.com', 'www.instagram.com', 'instagram.com'].includes(info.hostname)) throw new Error('Unsupported source.');
    if (message.type === 'SYNC_BATCH') {
      const result = await request(`/runs/${run.runId}`, { posts: message.posts });
      await setRun({ ...run, imported: run.imported + result.imported, updated: run.updated + result.updated, rejected: run.rejected + result.rejected }); return result;
    }
    if (message.type === 'SYNC_PROGRESS') { await setRun({ ...run, seen: message.seen, message: message.message }); await progress(`${run.platform === 'x' ? 'X ' + run.account : 'Instagram'}${run.collectionName ? ` · ${run.collectionName}` : ''} · ${message.message}`); return {}; }
    if (message.type === 'SYNC_FINISH') {
      await setRun({ ...run, stage: 'enriching', collectorStatus: run.collectionWarning && message.status === 'completed' ? 'partial' : message.status, collectorMessage: `${run.collectionWarning ? `${run.collectionWarning} ` : ''}${message.message}` });
      const job = await get('job'); job.phase = 'enriching'; await chrome.storage.local.set({ job }); void advanceJob(); return {};
    }
    throw new Error('Unsupported collector action.');
  }
  if (!extensionPage) throw new Error('Only the library and extension can manage sync.');
  if (message.type === 'GET_STATUS') return { ready: await ready(), bookmarksReady: await bookmarksReady(), bookmarksSupported: true, origin: await origin(), syncState: await get('syncState'), job: await get('job'), xAccounts: await get('xAccountCatalog') };
  if (message.type === 'CHECK_JOBS') { await checkJobs(); return {}; }
  if (message.type === 'START_BACKGROUND') {
    if ((message.targets || ['x']).some(p => p !== 'chrome') && !(await ready())) throw new Error('Enable background access first.');
    if (message.targets?.includes('chrome') && !(await bookmarksReady())) throw new Error('Allow Chrome bookmarks first.');
    await request('/queue', { targets: message.targets || ['x'], xAccount: message.xAccount || 'current', mode: message.mode || 'quick' });
    await checkJobs(); return {};
  }
  if (message.type === 'STOP_SYNC') { await request('/stop', {}); await checkJobs(); return {}; }
  if (message.type === 'OPEN_LIBRARY') { await chrome.tabs.create({ url: await origin() }); return {}; }
  throw new Error('Unknown extension action.');
}
async function initialize() {
  if (initialized) return; initialized = true;
  const orphan = await get('accountScanTabId'); if (orphan) { await closeWorkTab(orphan).catch(() => {}); await chrome.storage.local.remove('accountScanTabId'); }
  await cleanWorkTabs((await get('job'))?.ownedTabs || []);
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.alarms.create('savex-sync', { periodInMinutes: 0.5 }); await checkJobs();
}
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'savex-sync') void checkJobs(); });
chrome.runtime.onMessage.addListener((message, sender, respond) => { handle(message, sender).then(data => respond({ ok: true, ...data })).catch(e => respond({ ok: false, error: e.message })); return true; });
void initialize();
