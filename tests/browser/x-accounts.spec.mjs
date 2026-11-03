import { chooseSelect, openSyncOptions, startQuickSync } from './select-helper.mjs';
import { test, expect, chromium } from '@playwright/test';
import { readFile, mkdtemp, rm, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const fixture = `<!doctype html><html><body><a data-testid="AppTabBar_Profile_Link" id="profile" href="/alpha">Profile</a><button data-testid="SideNav_AccountSwitcher_Button" aria-label="Account menu">Account menu</button><div id="account-menu" hidden><button data-testid="UserCell" aria-label="Switch to @alpha">Alpha @alpha</button><button data-testid="UserCell" aria-label="Switch to @beta">Beta @beta</button><button role="menuitem">Add an existing account</button></div><main></main><script>
const account = localStorage.getItem('active-account') || 'alpha';
document.getElementById('profile').href='/'+account;
document.querySelector('[aria-label="Account menu"]').onclick=()=>{const menu=document.getElementById('account-menu');menu.hidden=!menu.hidden;};
document.querySelectorAll('[data-testid="UserCell"]').forEach(button=>{button.onclick=()=>{localStorage.setItem('active-account',button.getAttribute('aria-label').split('@')[1]);location.reload();};});
const ids = account==='alpha'?['800000001','800000002']:['800000003','800000002'];
document.querySelector('main').innerHTML=ids.map(id=>'<article data-testid="tweet"><div data-testid="User-Name"><a href="/writer"><span>Writer</span></a><a href="/writer/status/'+id+'"><time datetime="2026-10-31T12:00:00Z">Today</time></a></div><div data-testid="tweetText">A design idea '+id+'</div></article>').join('');
</script></body></html>`;

test('choose one X account or all, switch automatically, and deduplicate with source labels', async () => {
  test.setTimeout(100000);
  const profile = await mkdtemp(resolve(tmpdir(), 'savex-multi-account-'));
  const extension = resolve(profile, 'extension'); await cp(resolve('extension'), extension, { recursive: true });
  const path = resolve(extension, 'background.js'); await writeFile(path, (await readFile(path, 'utf8')).replace("const DEFAULT_ORIGIN = 'http://localhost:3210'", "const DEFAULT_ORIGIN = 'http://localhost:3211'"));
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push('https://x.com/*', 'https://www.instagram.com/*'); await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    await context.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    await context.route('https://platform.twitter.com/**', route => route.abort());
    let [worker] = context.serviceWorkers(); if (!worker) worker = await context.waitForEvent('serviceworker');
    const library = await context.newPage(); await library.goto('http://localhost:3211'); await library.bringToFront();
    // Startup detection can race fixture route installation. Refresh the test
    // catalog after interception is ready; production discovery runs automatically.
    await library.request.post('/api/sync/accounts', { headers: { Origin: 'http://localhost:3211' }, data: {} });
    await library.evaluate(() => window.postMessage({ source: 'savex-library', type: 'WAKE_SYNC' }, location.origin));
    await expect(library.locator('[data-nav-account="x:@beta"]')).toHaveCount(1, { timeout: 20000 });
    await chooseSelect(library, 'X accounts', '@beta');
    await library.screenshot({ path: 'test-results/x-account-selector.png', fullPage: true });
    const job = () => library.evaluate(async () => (await (await fetch('/api/sync')).json()).job);
    const previousJobId = (await job())?.id;
    await startQuickSync(library);
    await expect.poll(async () => (await job())?.id).not.toBe(previousJobId);
    await expect.poll(async () => { const current = await job(); if (current?.status === 'failed') throw new Error(current.message); return current?.status; }, { timeout: 35000 }).toBe('partial');
    expect((await job()).results.map(r => r.account)).toEqual(['@beta']);
    let saved = await library.evaluate(async () => (await (await fetch('/api/posts')).json()).posts);
    expect(saved.find(p => p.externalId === '800000003').accounts).toEqual(['@beta']); expect(saved.some(p => p.externalId === '800000001')).toBe(false);
    const firstJobId = (await job()).id;
    // The job API supports all signed-in X accounts; individual account UI is exercised above.
    await library.evaluate(async()=>{await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targets:['x'],xAccount:'all',mode:'quick'})});window.postMessage({source:'savex-library',type:'WAKE_SYNC'},location.origin);});
    await expect.poll(async () => (await job())?.id).not.toBe(firstJobId);
    await expect.poll(async () => (await job())?.status, { timeout: 45000 }).toBe('partial');
    expect((await job()).results.map(r => r.account).sort()).toEqual(['@alpha', '@beta']);
    saved = await library.evaluate(async () => (await (await fetch('/api/posts')).json()).posts);
    expect(saved.filter(p => p.externalId.startsWith('80000000'))).toHaveLength(3);
    expect(saved.find(p => p.externalId === '800000002').accounts.sort()).toEqual(['@alpha', '@beta']);
    expect(saved.find(p => p.externalId === '800000001').accounts).toEqual(['@alpha']);
    const foreground = await worker.evaluate(async () => (await chrome.tabs.query({active:true,currentWindow:true}))[0].url); expect(foreground).toBe('http://localhost:3211/');
    // A remembered account that has been removed must fail rather than importing the current account.
    await library.evaluate(async () => { await fetch('/api/sync', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targets:['x'],xAccount:'@missing'})}); window.postMessage({source:'savex-library',type:'WAKE_SYNC'},location.origin); });
    await expect.poll(async () => (await job())?.status, { timeout: 15000 }).toBe('failed');
    expect((await job()).message).toContain('not signed in');
    expect((await library.evaluate(async () => (await (await fetch('/api/posts')).json()).posts)).length).toBe(saved.length);
    await library.setViewportSize({ width:390,height:844 });
    expect(await library.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});
