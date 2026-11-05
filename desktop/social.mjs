import { app, BrowserWindow, dialog, session, ipcMain, shell } from 'electron';
import { isPinterestHost } from '../public/pinterest-host.js';
import { Worker } from 'node:worker_threads';
import { readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readChromeBookmarks } from './chrome-bookmarks.mjs';
import { findChrome, openChrome, waitForCookieSave, quitChrome, quitProfileChrome, readChromeCookies, electronCookie, extensionCookie } from './chrome-signin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const platforms = new Set(['x', 'instagram', 'pinterest']);
const platformLabel = platform => platform === 'x' ? 'X' : platform === 'pinterest' ? 'Pinterest' : 'Instagram';
const files = new Set(['extractors.js', 'collector.js', 'unsave-dom.js', 'x-accounts.js', 'background-render.js']);
const handlePattern = platform => platform === 'x' ? /^@[A-Za-z0-9_]{1,30}$/ : platform === 'pinterest' ? /^@[\w.-]{1,100}$/ : /^@[\w.]{1,100}$/;
const home = platform => platform === 'x' ? 'https://x.com/i/bookmarks' : platform === 'pinterest' ? 'https://www.pinterest.com/login/' : 'https://www.instagram.com/';
export function socialUrl(value, platform, login = false) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const host = url.hostname.replace(/^www\./, '');
    if (platform === 'pinterest' && isPinterestHost(host)) return true;
    return (platform === 'x' ? ['x.com', 'twitter.com'] : ['instagram.com']).includes(host) || login && ['accounts.google.com', 'facebook.com', 'm.facebook.com'].includes(host);
  } catch { return false; }
}
// Read account navigation only, never password fields, login forms or cookies.
function pageIdentity(platform) {
  if (platform === 'pinterest') {
    // Every Pinterest page ships its signed-in user in this JSON, in any site language.
    try {
      const user = JSON.parse(document.getElementById('__PWS_DATA__')?.textContent || '{}').context?.user;
      return user?.username ? { handle: `@${user.username}`, name: user.full_name || '' } : null;
    } catch { return null; }
  }
  if (platform === 'x') {
    const profile = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    const handle = profile?.getClientRects().length && profile.getAttribute('href')?.match(/^\/([\w]+)\/?$/)?.[1];
    return handle ? { handle: `@${handle}`, name: '' } : null;
  }
  const anchors = [...document.querySelectorAll('a[href]')].filter(anchor => !anchor.closest('main,article') && anchor.getClientRects().length);
  const saved = anchors.map(anchor => anchor.getAttribute('href')).find(href => /^\/[\w.]+\/saved(?:\/|$)/.test(href));
  if (saved) return { handle: `@${saved.split('/')[1]}`, name: '' };
  // The main navigation's only avatar link is the profile in every site
  // language; the English labels remain a fallback.
  const navigation = anchor => { for (let parent = anchor.parentElement; parent && !parent.querySelector('main'); parent = parent.parentElement) if (parent.querySelector('a[href="/explore/"]')) return true; return false; };
  const profile = anchors.find(anchor => anchor.querySelector('img') && /^\/[\w.]+\/?$/.test(anchor.getAttribute('href')) && navigation(anchor)) || anchors.find(anchor => /^profile$/i.test(anchor.getAttribute('aria-label') || '') || anchor.querySelector('img[alt*="profile picture"]'));
  const handle = profile?.getAttribute('href')?.match(/^\/([\w.]+)\/?$/)?.[1];
  return handle && !['accounts', 'explore', 'reels', 'direct', 'stories'].includes(handle) ? { handle: `@${handle}`, name: '' } : null;
}

export async function createNativeSocial({ library, transport, extensionRoot, version, onChange = () => {}, onError = () => {} }) {
  let accounts = [], selected, closed = false, nextTab = 1, nextGroup = 1, nextCollector = 1, restarts = 0, restartTimer;
  const work = new Map(), logins = new Map(), groups = new Map(), collectorCalls = new Map(), sources = new Map(), configured = new Set();
  try { accounts = JSON.parse(library.store.get('desktop_social_accounts') || '[]').filter(item => /^[a-f0-9-]{36}$/.test(item.id) && platforms.has(item.platform) && (!item.handle || handlePattern(item.platform).test(item.handle))).map(item => ({ ...item, status: item.status === 'connected' ? 'connected' : 'needs-login' })); } catch { /* First connection. */ }
  const publicAccounts = () => accounts.map(({ id, platform, handle, name, status }) => ({ id, platform, handle, name, status }));
  const publish = () => { library.store.set('desktop_social_accounts', JSON.stringify(accounts)); library.sync.configureNativeAccounts(publicAccounts()); onChange(); };
  publish();
  function profileSession(profile) { return appSession(`persist:savex-social-${profile.id}`, profile.id); }
  function appSession(partition, key) {
    const ses = session.fromPartition(partition);
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    if (!configured.has(key)) { configured.add(key); ses.on('will-download', event => event.preventDefault()); }
    // Session UA is independent of the library window and has no app branding.
    ses.setUserAgent(ses.getUserAgent().replace(/\s(?:saveXtension|savextension|Electron)\/[^\s]+/gi, ''));
    return ses;
  }
  const signedInCookie = {
    pinterest: cookie => cookie.name === '_auth' && cookie.value !== '0',
    x: cookie => cookie.name === 'auth_token' && !!cookie.value,
    instagram: cookie => cookie.name === 'sessionid' && !!cookie.value
  };
  // Fastest route: the Chrome helper hands over the person's existing sign-in. If Chrome is closed,
  // has no helper or isn't signed in, this quietly leaves the sign-in window as it was.
  async function signInFromHelper(login) {
    const { win, profile } = login, helper = library.sync.status().chromeBrowser;
    if (!helper?.online || !helper.chromeSessionSites?.includes(profile.platform)) return;
    const id = library.sync.requestChromeSession(profile.platform), original = win.getTitle(), end = Date.now() + 45000;
    win.setTitle(`Looking for your ${platformLabel(profile.platform)} sign-in in Chrome…`);
    let cookies = null;
    while (!cookies && Date.now() < end && !closed && !win.isDestroyed() && profile.status !== 'connected') {
      cookies = library.sync.takeChromeSession(id);
      if (!cookies) await new Promise(resolve => setTimeout(resolve, 400));
    }
    library.sync.cancelChromeSession(id);
    if (win.isDestroyed()) return;
    win.setTitle(original);
    // A signed-out Chrome has nothing to give, and reloading would interrupt someone typing here.
    if (!cookies?.some(signedInCookie[profile.platform]) || profile.status === 'connected') return;
    const ses = profileSession(profile);
    await Promise.allSettled(cookies.map(cookie => ses.cookies.set(extensionCookie(cookie))));
    await ses.cookies.flushStore();
    if (!win.isDestroyed()) void win.loadURL(home(profile.platform)).catch(() => {});
  }
  // A connected account's own site in a normal window, signed in with its saved session.
  // One window per account; links to other sites open in the browser.
  const browsers = new Map();
  function browseAccount(id) {
    const profile = accounts.find(item => item.id === id && item.status === 'connected');
    if (!profile) throw new Error('Connect this account first.');
    let win = browsers.get(id);
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); return true; }
    win = new BrowserWindow({ width: 1100, height: 900, title: `${platformLabel(profile.platform)} · ${profile.handle}`, backgroundColor: '#ffffff', autoHideMenuBar: true, webPreferences: { session: profileSession(profile), nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false } });
    const outside = url => { if (/^https?:/.test(url)) void shell.openExternal(url).catch(onError); };
    win.webContents.on('will-navigate', (event, url) => { if (!socialUrl(url, profile.platform, true)) { event.preventDefault(); outside(url); } });
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    win.webContents.setWindowOpenHandler(({ url }) => { if (socialUrl(url, profile.platform)) void win.loadURL(url).catch(onError); else outside(url); return { action: 'deny' }; });
    win.on('closed', () => browsers.delete(id));
    browsers.set(id, win);
    void win.loadURL(profile.platform === 'x' ? 'https://x.com/home' : profile.platform === 'pinterest' ? 'https://www.pinterest.com/' : 'https://www.instagram.com/').catch(() => {});
    return true;
  }
  const chromeProfile = () => join(app.getPath('userData'), 'chrome-sign-in');
  const openChromes = new Set();
  async function signInWithChrome(login) {
    const { win, profile } = login, name = platformLabel(profile.platform);
    if (login.chrome || win.isDestroyed()) return;
    const notice = (message, detail) => win.isDestroyed() ? null : dialog.showMessageBox(win, { type: 'info', message, detail, buttons: ['OK'] });
    const executable = await findChrome();
    if (!executable) { await notice('Google sign-in needs Chrome', `Google doesn’t allow sign-in inside apps, so this step uses Google Chrome, which isn’t installed. You can sign in to ${name} with the QR code or your email instead.`); return; }
    login.chrome = true;
    try {
      const child = openChrome(executable, chromeProfile(), home(profile.platform)), closed = new AbortController();
      openChromes.add(child); login.chromeChild = child;
      child.once('error', () => closed.abort());
      const opened = Date.now();
      // Exiting straight away means a Chrome already using this profile took the request, and
      // its window is the one to sign in with. Only a later exit means the person quit Chrome.
      child.once('exit', code => { openChromes.delete(child); if (code !== 0 || Date.now() - opened > 3000) closed.abort(); });
      const { response } = await dialog.showMessageBox(win, { type: 'info', message: 'Continue in Chrome', detail: `Chrome has opened ${name}. Sign in there with Google, then come back and click Done. saveXtension closes that Chrome window and brings your sign-in here. Your everyday Chrome isn’t touched.`, buttons: ['Done', 'Cancel'], defaultId: 0, cancelId: 1, signal: closed.signal });
      const finished = response === 0 || closed.signal.aborted;
      if (finished && !closed.signal.aborted) {
        win.setTitle('Bringing your sign-in from Chrome… this can take up to 30 seconds');
        await waitForCookieSave(chromeProfile(), { closed: () => closed.signal.aborted });
      }
      await quitChrome(child); await quitProfileChrome(chromeProfile());
      if (!finished || win.isDestroyed()) return;
      const cookies = await readChromeCookies(executable, chromeProfile(), host => socialUrl(`https://${host}/`, profile.platform));
      const ses = profileSession(profile);
      await Promise.allSettled(cookies.map(cookie => ses.cookies.set(electronCookie(cookie))));
      await ses.cookies.flushStore();
      if (win.isDestroyed()) return;
      void win.loadURL(home(profile.platform)).catch(() => {});
      // A connected account closes this window; still being here means the sign-in didn't finish.
      setTimeout(() => { if (profile.status !== 'connected') void notice(`${name} isn’t signed in yet`, `Chrome didn’t have a finished ${name} sign-in. Click Continue with Google to try again, or use the QR code or your email.`); }, 12000);
    } catch (error) { onError(error); await notice('Chrome sign-in didn’t finish', `${error.message} You can try again, or use the QR code or your email.`); }
    finally { login.chrome = false; }
  }
  function makeWindow(profile, login) {
    const win = new BrowserWindow({ width: 1100, height: 900, show: login, title: `${login ? 'Connect' : 'Sync'} ${platformLabel(profile.platform)}${profile.handle ? ` · ${profile.handle}` : ''}`, backgroundColor: '#ffffff', webPreferences: {
      session: profileSession(profile), preload: join(here, 'social-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false,
      backgroundThrottling: false, paintWhenInitiallyHidden: true
    } });
    win.webContents.setAudioMuted(true);
    win.webContents.on('will-navigate', (event, url) => { if (!socialUrl(url, profile.platform, login)) event.preventDefault(); });
    win.webContents.on('will-redirect', (event, url) => { if (!socialUrl(url, profile.platform, login)) event.preventDefault(); });
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    win.webContents.setWindowOpenHandler(({ url }) => {
      // Google refuses sign-in inside app windows, so this button continues in real Chrome.
      if (login && new URL(url).hostname === 'accounts.google.com') {
        const attempt = logins.get(profile.id); if (attempt) void signInWithChrome(attempt).catch(onError);
        return { action: 'deny' };
      }
      if (login && socialUrl(url, profile.platform, true)) {
        void win.loadURL(url).catch(onError);
      }
      return { action: 'deny' };
    });
    win.webContents.on('page-title-updated', event => event.preventDefault());
    return win;
  }
  // A small app-owned window for Instagram and Pinterest posts. It signs in with the
  // connected account for that site when there is one; other links go to the browser.
  const viewers = new Map();
  function openPost(url, platform = 'instagram') {
    let viewer = viewers.get(platform);
    if (!viewer || viewer.isDestroyed()) {
      const profile = accounts.find(item => item.platform === platform && item.status === 'connected');
      viewer = new BrowserWindow({ width: 460, height: 860, minWidth: 360, minHeight: 520, title: platformLabel(platform), backgroundColor: '#ffffff', autoHideMenuBar: true, webPreferences: {
        session: profile ? profileSession(profile) : appSession(`persist:savex-${platform}-viewer`, `${platform}-viewer`), nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false
      } });
      const outside = url => { if (/^https?:/.test(url)) void shell.openExternal(url).catch(onError); };
      viewer.webContents.on('will-navigate', (event, url) => { if (!socialUrl(url, platform)) { event.preventDefault(); outside(url); } });
      viewer.webContents.on('will-attach-webview', event => event.preventDefault());
      viewer.webContents.setWindowOpenHandler(({ url }) => { if (socialUrl(url, platform)) void viewer.loadURL(url).catch(onError); else outside(url); return { action: 'deny' }; });
      viewer.on('closed', () => viewers.delete(platform));
      viewers.set(platform, viewer);
    }
    void viewer.loadURL(url).catch(onError);
    if (viewer.isMinimized()) viewer.restore();
    viewer.show(); viewer.focus();
  }
  const tab = id => { const value = work.get(Number(id)); if (!value || value.win.isDestroyed()) throw new Error('The native sync page was closed.'); return value; };
  const tabInfo = value => ({ id: value.id, windowId: 1, groupId: value.groupId ?? -1, active: false, mutedInfo: { muted: true }, status: value.win.webContents.isLoadingMainFrame() ? 'loading' : 'complete', url: value.win.webContents.getURL() || 'about:blank' });
  async function evaluate(value, code) {
    if (!socialUrl(value.win.webContents.getURL(), value.profile.platform)) throw new Error('Reconnect this account in saveXtension before continuing.');
    return value.win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code }]);
  }
  async function identity(value) { return evaluate(value, `(${pageIdentity})(${JSON.stringify(value.profile.platform)})`); }
  async function verify(id, platform, expected) {
    const value = tab(id), end = Date.now() + 20000;
    expected ||= value.profile.handle;
    if (value.profile.platform !== platform || value.profile.handle.toLowerCase() !== expected.toLowerCase()) throw new Error('The native account session does not match this save.');
    let seen = false;
    while (Date.now() < end && !closed) {
      const actual = await identity(value).catch(() => null);
      if (actual?.handle.toLowerCase() === expected.toLowerCase()) return { switched: false };
      seen ||= !!actual;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    // A sign-in page, check page or sign-in link means the session ended.
    // Anything else is a page saveXtension can no longer read; reconnecting would not help.
    const loginPage = /\/accounts\/login|\/challenge|\/checkpoint|\/i\/flow\/login|^\/login/.test(new URL(value.win.webContents.getURL() || 'about:blank').pathname);
    const signedOut = loginPage || await evaluate(value, `!!document.querySelector('a[href^="/accounts/login"],a[href="/login"],a[href^="/i/flow/login"],a[href^="/i/flow/signup"],[data-test-id="login-button"],[data-test-id="unauth-header"]')`).catch(() => true);
    if (!seen && !signedOut) {
      throw new Error(`${platformLabel(platform)} loaded, but saveXtension couldn’t confirm the signed-in account. The site’s layout may have changed, so saveXtension needs an update. No posts were changed.`);
    }
    value.profile.status = 'needs-login'; publish();
    throw new Error(`Reconnect ${expected} in saveXtension before continuing. No posts were changed.`);
  }
  const workerOptions = { workerData: { ...transport, origin: library.origin, extensionRoot, version } };
  let worker = new Worker(new URL('./social-worker.mjs', import.meta.url), workerOptions);
  const wake = () => { if (closed) return; if (worker.threadId === -1) { if (restarts > 2) throw new Error('Restart saveXtension to reconnect the sync engine.'); return; } worker.postMessage({ wake: true }); };
  const methods = {
    accounts(platform) { const found = accounts.filter(item => item.platform === platform && item.status === 'connected'); return { active: found[0]?.handle || '', accounts: found.map(item => ({ handle: item.handle, name: item.name || '' })), checkedAt: Date.now(), busy: false }; },
    selectAccount(platform, handle) {
      selected = accounts.find(item => item.platform === platform && item.status === 'connected' && (!handle || handle === 'current' || item.handle.toLowerCase() === handle.toLowerCase()));
      if (!selected) throw new Error(`Connect ${handle && handle !== 'current' ? handle : platformLabel(platform)} in saveXtension, then retry.`);
      return true;
    },
    verifyAccount: verify,
    accountError(message) { if (selected && /sign.?in|log.?in|reconnect|challenge|checkpoint/i.test(message)) { selected.status = 'needs-login'; publish(); } },
    // Bookmarks come from Chrome's own file, so they need no permission.
    permissions(value) { return value?.permissions ? true : accounts.some(item => item.status === 'connected'); },
    // Chrome's own file first; if it isn't where Chrome normally keeps it, the copy the
    // Chrome helper sent. Neither is there until Chrome is connected on the Chrome page.
    bookmarks: () => readChromeBookmarks().catch(error => { const tree = library.sync.chromeBookmarks(); if (tree) return tree; throw error; }),
    openAccounts() { onChange(); return true; },
    'tabs.create'() {
      if (!selected) throw new Error('Choose a connected account first.');
      const value = { id: nextTab++, profile: selected, win: makeWindow(selected, false) }; work.set(value.id, value);
      value.win.on('closed', () => work.delete(value.id)); return tabInfo(value);
    },
    'tabs.get'(id) { return tabInfo(tab(id)); },
    'tabs.query'(options) { if (options?.active) return []; return [...work.values()].filter(value => options?.groupId === undefined || value.groupId === options.groupId).map(tabInfo); },
    'tabs.update'(id, changes) {
      const value = tab(id);
      if (changes.url) {
        if (!socialUrl(changes.url, value.profile.platform)) throw new Error('Unsupported social navigation.');
        void value.win.loadURL(changes.url).catch(error => { if (error.code !== 'ERR_ABORTED') onError(new Error('A native social page could not load.')); });
      }
      return tabInfo(value);
    },
    'tabs.reload'(id) { tab(id).win.webContents.reload(); return true; },
    'tabs.remove'(id) { const value = work.get(Number(id)); if (value && !value.win.isDestroyed()) value.win.destroy(); work.delete(Number(id)); return true; },
    'tabs.group'(options) { const id = options.groupId ?? nextGroup++; if (!groups.has(id)) groups.set(id, { id, windowId: 1 }); for (const tabId of options.tabIds) tab(tabId).groupId = id; return id; },
    'groups.get'(id) { if (!groups.has(id)) throw new Error('Group not found.'); return groups.get(id); },
    'groups.update'(id, properties) { const value = groups.get(id); if (!value) throw new Error('Group not found.'); Object.assign(value, properties); return value; },
    async execute(options) {
      const value = tab(options.target?.tabId);
      if (options.files) {
        for (const file of options.files) {
          if (!files.has(file)) throw new Error('Unknown native collector script.');
          // Electron already keeps these renderers running; no timer shim needed.
          if (file === 'background-render.js') continue;
          if (!sources.has(file)) sources.set(file, await readFile(join(extensionRoot, file), 'utf8'));
          await evaluate(value, sources.get(file));
        }
        return [{ result: null }];
      }
      if (typeof options.func !== 'string' || options.func.length > 50000) throw new Error('Invalid native collector command.');
      return [{ result: await evaluate(value, `(${options.func})(...${JSON.stringify(options.args || [])})`) }];
    },
    'tabs.sendMessage'(id, message) { return evaluate(tab(id), `globalThis.__savexSocialDispatch(${JSON.stringify(message)})`); }
  };
  function attachWorker(child) {
  child.on('message', message => {
    if (message.collectorReply) {
      const call = collectorCalls.get(message.collectorReply); if (call) { clearTimeout(call.timer); collectorCalls.delete(message.collectorReply); call.resolve(message.result); }
    } else if (message.id) {
      const method = methods[message.method];
      Promise.resolve().then(() => { if (closed || child.threadId === -1 || !method) throw new Error('Unsupported native worker command.'); return method(...message.args); }).then(result => { if (!closed && child.threadId !== -1) child.postMessage({ reply: message.id, result }); }, error => { if (!closed && child.threadId !== -1) child.postMessage({ reply: message.id, error: error.message }); });
    }
  });
  child.on('error', onError);
  child.on('exit', () => {
    if (closed) return;
    library.sync.nativeStopped(); library.bookmarks.cancel('The native sync worker restarted. Retry the scan.');
    const job = library.sync.status().job;
    if (job?.status === 'running' && job.owner === transport.instance) library.sync.update(job.id, transport.instance, { status: 'failed', message: 'Sync was interrupted. Imported saves are kept; retry to continue.', results: job.results });
    const unsave = library.unsaves.status();
    if (unsave?.status === 'running' && unsave.owner === transport.instance) library.unsaves.finish(unsave.id, transport.instance, { status: 'failed', message: 'The sync engine restarted before the unsave was verified. Check the original post before trying again.' });
    for (const value of work.values()) value.win.destroy(); work.clear(); groups.clear();
    for (const call of collectorCalls.values()) { clearTimeout(call.timer); call.reject(new Error('The native sync engine restarted.')); } collectorCalls.clear();
    if (++restarts > 2) { onError(new Error('The native sync engine stopped repeatedly. Restart saveXtension.')); return; }
    restartTimer = setTimeout(() => { if (!closed) { worker = new Worker(new URL('./social-worker.mjs', import.meta.url), workerOptions); attachWorker(worker); } }, 500);
  });
  }
  attachWorker(worker);
  const collectorHandler = async (event, message) => {
    const value = [...work.values()].find(item => item.win.webContents === event.sender);
    if (!value || event.senderFrame !== event.sender.mainFrame || !socialUrl(event.senderFrame.url, value.profile.platform) || !['SYNC_BATCH', 'SYNC_PROGRESS', 'SYNC_FINISH'].includes(message?.type)) throw new Error('Unknown native collector.');
    if (JSON.stringify(message).length > 4000000) throw new Error('Collector batch is too large.');
    return new Promise((resolve, reject) => {
      const id = nextCollector++, timer = setTimeout(() => { collectorCalls.delete(id); reject(new Error('The scan worker did not acknowledge this batch.')); }, 15000);
      collectorCalls.set(id, { resolve, reject, timer });
      worker.postMessage({ id, collector: message, sender: { id: 'savex-native', url: event.senderFrame.url, tab: tabInfo(value) } });
    });
  };
  ipcMain.handle('savex-social-collector', collectorHandler);

  async function connect({ platform, id, expectedHandle } = {}) {
    if (!platforms.has(platform)) throw new Error('Choose X, Instagram or Pinterest.');
    if (expectedHandle && !handlePattern(platform).test(expectedHandle)) throw new Error('Choose a valid account handle.');
    if (['queued', 'running'].includes(library.sync.status().job?.status) || library.unsaves.busy()) throw new Error('Finish or stop the current scan before connecting accounts.');
    let profile = id ? accounts.find(item => item.id === id && item.platform === platform) : accounts.find(item => item.platform === platform && (expectedHandle ? item.handle.toLowerCase() === expectedHandle.toLowerCase() : !item.handle));
    if (id && !profile) throw new Error('Account connection not found.');
    if (!profile) { profile = { id: randomUUID(), platform, handle: expectedHandle || '', name: '', status: 'needs-login' }; accounts.push(profile); publish(); }
    if (logins.has(profile.id)) { logins.get(profile.id).win.show(); logins.get(profile.id).win.focus(); return publicAccounts(); }
    const win = makeWindow(profile, true), login = { win, profile, pending: false, last: '', stable: 0 };
    logins.set(profile.id, login);
    const verifyLogin = async () => {
      if (closed || login.pending || win.isDestroyed() || !socialUrl(win.webContents.getURL(), platform)) return;
      login.pending = true;
      try {
        const actual = await identity({ win, profile });
        // Pinterest can sign in without a page load, leaving that page's data signed out.
        if (!actual && platform === 'pinterest' && Date.now() - (login.reloaded || 0) > 5000 && await evaluate({ win, profile }, `!!document.querySelector('[data-test-id="header-profile"]')`).catch(() => false)) { login.reloaded = Date.now(); win.webContents.reload(); }
        if (!actual || !handlePattern(platform).test(actual.handle)) { login.stable = 0; return; }
        if (profile.handle && profile.handle.toLowerCase() !== actual.handle.toLowerCase()) { win.setTitle(`Connect ${profile.handle} · currently signed in as ${actual.handle}`); login.stable = 0; return; }
        login.stable = login.last === actual.handle ? login.stable + 1 : 1; login.last = actual.handle;
        if (login.stable < 3) return;
        const duplicate = accounts.find(item => item.id !== profile.id && item.platform === platform && item.handle.toLowerCase() === actual.handle.toLowerCase());
        if (duplicate) throw new Error(`${actual.handle} is already connected. To add another, switch to it in Chrome and try again, or sign in here.`);
        Object.assign(profile, { handle: actual.handle, name: actual.name || '', status: 'connected' });
        profileSession(profile).flushStorageData(); publish(); wake(); win.close();
      } catch (error) { if (!win.isDestroyed() && /already connected/.test(error.message)) win.setTitle(error.message); }
      finally { login.pending = false; }
    };
    login.timer = setInterval(() => void verifyLogin(), 750);
    win.on('closed', () => { clearInterval(login.timer); logins.delete(profile.id); login.chromeChild?.kill(); publish(); });
    void win.loadURL(home(platform)).catch(() => {});
    void signInFromHelper(login).catch(onError);
    return publicAccounts();
  }
  return {
    status: publicAccounts, connect, wake, openPost, browse: browseAccount,
    async disconnect(id) {
      const profile = accounts.find(item => item.id === id); if (!profile) throw new Error('Connection not found.');
      if (['queued', 'running'].includes(library.sync.status().job?.status) || library.unsaves.busy()) throw new Error('Finish or stop the current scan before disconnecting.');
      logins.get(id)?.win.close(); browsers.get(id)?.destroy();
      await profileSession(profile).clearStorageData(); accounts = accounts.filter(item => item.id !== id); publish(); wake();
      // With nothing left connected, the app keeps no Google sign-in either.
      if (!accounts.length) await rm(chromeProfile(), { recursive: true, force: true }).catch(onError);
      return publicAccounts();
    },
    async close() {
      closed = true; clearTimeout(restartTimer); library.bookmarks.cancel(); ipcMain.removeHandler('savex-social-collector');
      const activeUnsave = library.unsaves.status();
      if (activeUnsave?.status === 'running' && activeUnsave.owner === transport.instance) library.unsaves.finish(activeUnsave.id, transport.instance, { status: 'failed', message: 'saveXtension closed before the unsave was verified. Check the original post before trying again.' });
      library.store.db.prepare("UPDATE sync_runs SET status='cancelled',finished_at=?,message='Stopped when saveXtension closed. Imported saves are kept.' WHERE status='running'").run(new Date().toISOString());
      for (const call of collectorCalls.values()) { clearTimeout(call.timer); call.reject(new Error('saveXtension is closing.')); }
      collectorCalls.clear();
      for (const { win, timer } of logins.values()) { clearInterval(timer); win.removeAllListeners('closed'); win.destroy(); }
      logins.clear();
      for (const value of work.values()) value.win.destroy(); work.clear();
      for (const viewer of [...viewers.values(), ...browsers.values()]) if (!viewer.isDestroyed()) viewer.destroy();
      for (const child of openChromes) child.kill();
      await worker.terminate();
    }
  };
}
