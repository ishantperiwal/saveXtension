import test from 'node:test';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import { mkdtemp, mkdir, cp, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function fixtureSetup(ses) {
  if (ses.__fixtureInstalled) return;
  ses.__fixtureInstalled = true;
  ses.protocol.handle('https', async request => {
    const url = new URL(request.url), platform = url.hostname === 'x.com' ? 'x' : 'instagram';
    if (!['x.com', 'www.instagram.com'].includes(url.hostname)) return new Response('', { status: 404 });
    const handles = platform === 'x' ? ['alpha', 'beta'] : ['iguser'];
    const postId = url.pathname.match(/\/status\/(\d+)/)?.[1];
    const posts = (postId ? [Number(postId)] : Array.from({ length: 9 }, (_, index) => 400001 + index)).map(id => `<article data-testid="tweet"><div data-testid="User-Name"><a href="/creator"><span>Creator</span></a><a href="/creator/status/${id}"><time datetime="2026-11-03T08:00:00Z">Today</time></a></div><div data-testid="tweetText">Reference ${id}</div><button data-post="${id}" data-testid="removeBookmark" aria-label="Remove Bookmark" onclick="localStorage.setItem('removed-${id}','1');this.dataset.testid='bookmark';this.setAttribute('aria-label','Bookmark')">Bookmark</button></article>`).join('');
    const login = handles.map(handle => `<button onclick="document.cookie='fixture_account=${handle}; Path=/; Max-Age=86400; Secure; SameSite=Lax'; location.reload()">Sign in @${handle}</button>`).join('');
    const shortcode = url.pathname.match(/\/p\/(NativeIG\d+)/)?.[1];
    const igPosts = Array.from({ length: 9 }, (_, index) => `<a href="/p/NativeIG${index + 1}/"><img alt="Photo by creator on November 3, 2026. Captured Instagram reference ${index + 1}."></a>`).join('');
    const ig = shortcode ? `<article><h1>Full caption for ${shortcode}. Additional context from the original post, including a detailed explanation that was not available in its saved-list thumbnail.</h1><a href="/p/${shortcode}/"><time datetime="2026-11-03T08:00:00Z">Today</time></a><section><button><svg width="24" height="24" aria-label="Like"></svg></button><button><svg width="24" height="24" aria-label="Comment"></svg></button><button onclick="localStorage.setItem('removed-${shortcode}','1');this.querySelector('svg').setAttribute('aria-label','Save')"><svg id="ig-save" width="24" height="24" aria-label="Saved"></svg></button></section></article>` : /\/saved\/$/.test(url.pathname) ? '<a href="/iguser/saved/all-posts/">All posts</a><a href="/iguser/saved/design/123/">Design</a>' : /\/saved\//.test(url.pathname) ? igPosts : '<h1>Instagram home</h1>';
    const html = `<!doctype html><meta charset="utf-8"><body><div id="login">${login}</div><div id="authenticated" hidden><a id="profile" data-testid="AppTabBar_Profile_Link" aria-label="Profile" href="/">Profile</a>${platform === 'instagram' ? '<a href="/iguser/saved/">Saved</a>' : ''}<main>${platform === 'x' ? posts : ig}</main></div><script>
      const account = document.cookie.match(/(?:^|; )fixture_account=([^;]+)/)?.[1];
      if(account){document.getElementById('login').hidden=true;document.getElementById('authenticated').hidden=false;document.getElementById('profile').href='/'+account;}
      for(const button of document.querySelectorAll('[data-post]'))if(localStorage.getItem('removed-'+button.dataset.post)){button.dataset.testid='bookmark';button.setAttribute('aria-label','Bookmark');}
      if(${JSON.stringify(shortcode || '')}&&localStorage.getItem('removed-'+${JSON.stringify(shortcode || '')}))document.getElementById('ig-save')?.setAttribute('aria-label','Save');
    </script>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  });
}

test('native sessions persist, two X accounts scan without focusing Chrome, and unsave verifies the correct isolated account', { timeout: 120000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-native-')), appPath = join(dir, 'application'); await mkdir(appPath);
  for (const name of ['desktop', 'server', 'public', 'extension']) await cp(resolve(name), join(appPath, name), { recursive: true });
  await cp(resolve('package.json'), join(appPath, 'package.json')); await symlink(resolve('node_modules'), join(appPath, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const manager = join(appPath, 'desktop/social.mjs');
  await writeFile(manager, (await readFile(manager, 'utf8')).replace("const ses = session.fromPartition(partition);", `const ses = session.fromPartition(partition); (${fixtureSetup})(ses);`));
  await writeFile(join(appPath, 'desktop/browser.mjs'), 'export async function openSyncBrowser(){throw new Error("Native social sync must not open Chrome");}export async function focusSyncBrowser(){throw new Error("Native social sync must not focus Chrome");}');
  const env = { ...process.env, SAVEX_DESKTOP_DATA_DIR: join(dir, 'library'), SAVEX_DESKTOP_LEGACY_ORIGIN: 'http://localhost:1', SAVEX_DESKTOP_DISABLE_AUTO_SYNC: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => _electron.launch({ executablePath: require('electron'), args: [appPath], env });
  let desktop = await launch();
  try {
    let page = await desktop.firstWindow(); await page.waitForSelector('[data-action="settings"]');
    assert.equal(await page.evaluate(() => typeof window.IdentityCredential), 'undefined', 'FedCM stays off, or Google sign-in buttons silently do nothing in Electron');
    let origin = new URL(page.url()).origin, headers = { Origin: origin };
    const status = async () => (await page.request.get(origin + '/api/sync')).json();
    await expect.poll(async () => (await status()).nativeSocial?.online).toBe(true);
    await page.getByRole('button', { name: 'Settings & backups' }).click();
    for (const handle of ['alpha', 'beta']) {
      const [login] = await Promise.all([desktop.waitForEvent('window'), page.getByRole('button', { name: 'Add X account', exact: true }).click()]);
      await login.getByRole('button', { name: `Sign in @${handle}`, exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.saveXDesktop.socialAccounts())).toContainEqual(expect.objectContaining({ platform: 'x', handle: `@${handle}`, status: 'connected' }));
      await expect.poll(() => login.isClosed()).toBe(true);
    }
    const accounts = await page.evaluate(() => window.saveXDesktop.socialAccounts()); assert.equal(accounts.length, 2);
    assert.notEqual(accounts[0].id, accounts[1].id);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    const seed = Array.from({ length: 7 }, (_, index) => ({ url: `https://x.com/creator/status/${400003 + index}`, accounts: ['@alpha', '@beta'] }));
    await page.request.post(origin + '/api/posts/import', { headers, data: { posts: seed } });
    for (const account of ['@alpha', '@beta']) {
      const { runId } = await (await page.request.post(origin + '/api/extension/runs', { headers, data: { platform: 'x', account } })).json();
      await page.request.post(origin + `/api/extension/runs/${runId}`, { headers, data: { posts: seed } });
      await page.request.post(origin + `/api/extension/runs/${runId}/finish`, { headers, data: { status: 'completed' } });
    }
    const queued = await page.request.post(origin + '/api/sync', { headers, data: { targets: ['x'], xAccount: 'all', mode: 'quick' } }); assert.equal(queued.ok(), true);
    await expect.poll(async () => (await status()).job?.status, { timeout: 45000 }).toMatch(/^(completed|partial|failed)$/);
    const job = (await status()).job; assert.equal(job.status, 'completed', JSON.stringify(job.results)); assert.deepEqual(job.results.map(result => result.account), ['@alpha', '@beta']);
    const posts = (await (await page.request.get(origin + '/api/posts?scope=all')).json()).posts;
    assert.equal(posts.length, 9); assert.deepEqual(posts.find(post => post.externalId === '400001').accounts.sort(), ['@alpha', '@beta']);
    // The library stays focused while native work windows are hidden.
    assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(win => win.isVisible()).length), 1);
    const first = posts.find(post => post.externalId === '400001');
    const proof = await (await page.request.post(origin + `/api/posts/${first.id}/unsave/prepare`, { headers, data: {} })).json();
    await page.request.post(origin + `/api/posts/${first.id}/unsave`, { headers, data: { nonce: proof.nonce, confirmed: true, account: '@beta' } });
    await expect.poll(async () => (await (await page.request.get(origin + '/api/posts?scope=all')).json()).posts.find(post => post.id === first.id).accounts, { timeout: 30000 }).toEqual(['@alpha']);
    assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(win => win.isVisible()).length), 1);
    // Instagram discovers native collections, records their membership, fetches
    // captions and verifies an unsave in its own persistent account session.
    await page.getByRole('button', { name: 'Settings & backups' }).click();
    const [igLogin] = await Promise.all([desktop.waitForEvent('window'), page.getByRole('button', { name: 'Add Instagram account', exact: true }).click()]);
    await igLogin.getByRole('button', { name: 'Sign in @iguser', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.saveXDesktop.socialAccounts())).toContainEqual(expect.objectContaining({ platform: 'instagram', handle: '@iguser', status: 'connected' }));
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    const collectionReply = await (await page.request.post(origin + '/api/extension/instagram-collections', { headers, data: { account: '@iguser', collections: [{ name: 'Design', url: 'https://www.instagram.com/iguser/saved/design/123/', externalId: '123' }] } })).json();
    const collection = collectionReply.collections[0];
    const { runId: igSeed } = await (await page.request.post(origin + '/api/extension/runs', { headers, data: { platform: 'instagram', account: '@iguser', collectionId: collection.id } })).json();
    await page.request.post(origin + `/api/extension/runs/${igSeed}`, { headers, data: { posts: Array.from({ length: 7 }, (_, index) => ({ url: `https://www.instagram.com/p/NativeIG${index + 3}/` })) } });
    await page.request.post(origin + `/api/extension/runs/${igSeed}/finish`, { headers, data: { status: 'completed' } });
    await page.request.post(origin + '/api/sync', { headers, data: { targets: ['instagram'], instagramAccount: '@iguser', mode: 'quick' } });
    await expect.poll(async () => (await status()).job?.status, { timeout: 45000 }).toMatch(/^(completed|partial|failed)$/);
    const igJob = (await status()).job; assert.equal(igJob.status, 'completed', JSON.stringify(igJob.results));
    const igPosts = (await (await page.request.get(origin + '/api/posts?scope=all')).json()).posts.filter(post => post.platform === 'instagram');
    assert.equal(igPosts.length, 9); assert(igPosts.every(post => post.collections.some(item => item.id === collection.id)));
    const igPost = igPosts.find(post => post.externalId === 'NativeIG1'); assert.match(igPost.text, /Full caption/);
    const igProof = await (await page.request.post(origin + `/api/posts/${igPost.id}/unsave/prepare`, { headers, data: {} })).json();
    await page.request.post(origin + `/api/posts/${igPost.id}/unsave`, { headers, data: { nonce: igProof.nonce, confirmed: true, account: '@iguser' } });
    await expect.poll(async () => (await (await page.request.get(origin + '/api/posts?scope=all')).json()).posts.some(post => post.id === igPost.id), { timeout: 30000 }).toBe(false);
    // Fully restart with the same disposable data directory: account sessions
    // must survive without asking for credentials again.
    await desktop.close(); desktop = await launch();
    page = await desktop.firstWindow(); await page.waitForSelector('[data-action="settings"]'); origin = new URL(page.url()).origin; headers = { Origin: origin };
    await expect.poll(() => page.evaluate(() => window.saveXDesktop.socialAccounts())).toHaveLength(3);
    await page.request.post(origin + '/api/sync', { headers, data: { targets: ['x'], xAccount: '@alpha', mode: 'quick' } });
    await expect.poll(async () => (await status()).job?.status, { timeout: 30000 }).toBe('completed');
  } catch (error) {
    try { console.error((await readFile(join(dir, 'library/desktop.log'), 'utf8')).slice(-6000)); } catch {}
    throw error;
  } finally { await desktop.close(); await rm(dir, { recursive: true, force: true }); }
});
