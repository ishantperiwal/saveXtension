import { instagramSyncScope, saveListSelections } from './instagram-save-lists.mjs';
import { isPinterestHost, PINTEREST_DOMAINS } from '../public/pinterest-host.js';

// Each site's own domains, and how to tell its cookies apart. Google is never one of them.
const SESSION_SITES = {
  pinterest: { domains: PINTEREST_DOMAINS, owns: isPinterestHost },
  x: { domains: ['x.com', 'twitter.com'], owns: host => /^(?:[\w-]+\.)?(?:x|twitter)\.com$/.test(host) },
  instagram: { domains: ['instagram.com'], owns: host => /^(?:[\w-]+\.)?instagram\.com$/.test(host) }
};
import { randomBytes } from 'node:crypto';
import { HttpError, text } from './domain.mjs';

// Which Pinterest account, ticked boards or single board a job covers; null means everything on every connected account.
function pinterestSyncScope(store, account, collectionId, targets) {
  if (account !== 'current' && (typeof account !== 'string' || !/^@[\w.-]{1,100}$/.test(account))) throw new HttpError(400, 'Choose a Pinterest account.');
  if (collectionId === null || collectionId === undefined) {
    const selections = saveListSelections(store, 'pinterest'), limited = Object.keys(selections).length > 0;
    if (account === 'current') return limited ? { selections } : null;
    return limited ? { account, selections } : { account };
  }
  if (targets.length !== 1) throw new HttpError(400, 'A board refresh must target Pinterest only.');
  const collection = store.instagramCollections().find(item => item.id === collectionId && item.platform === 'pinterest');
  if (!collection) throw new HttpError(400, 'Choose a Pinterest board.');
  return { account: collection.account, collection };
}
export function syncQueue(store, { native = false } = {}) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS sync_jobs (
    id TEXT PRIMARY KEY, targets TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
    message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    owner TEXT, results TEXT NOT NULL DEFAULT '[]'
  )`);
  if (!store.db.prepare('PRAGMA table_info(sync_jobs)').all().some(c => c.name === 'x_account')) store.db.exec("ALTER TABLE sync_jobs ADD COLUMN x_account TEXT NOT NULL DEFAULT 'current'");
  if (!store.db.prepare('PRAGMA table_info(sync_jobs)').all().some(c => c.name === 'mode')) store.db.exec("ALTER TABLE sync_jobs ADD COLUMN mode TEXT NOT NULL DEFAULT 'quick'");
  if (!store.db.prepare('PRAGMA table_info(sync_jobs)').all().some(c => c.name === 'instagram_scope')) store.db.exec("ALTER TABLE sync_jobs ADD COLUMN instagram_scope TEXT NOT NULL DEFAULT 'null'");
  if (!store.db.prepare('PRAGMA table_info(sync_jobs)').all().some(c => c.name === 'pinterest_scope')) store.db.exec("ALTER TABLE sync_jobs ADD COLUMN pinterest_scope TEXT NOT NULL DEFAULT 'null'");
  if (!store.db.prepare('PRAGMA table_info(sync_jobs)').all().some(c => c.name === 'quiet')) store.db.exec('ALTER TABLE sync_jobs ADD COLUMN quiet INTEGER NOT NULL DEFAULT 0');
  if (native) {
    const now = new Date().toISOString();
    store.db.prepare("UPDATE sync_jobs SET status='failed',message='Sync was interrupted. Your imported saves are kept; retry to continue.',updated_at=? WHERE status IN ('queued','running')").run(now);
    store.db.prepare("UPDATE sync_runs SET status='partial',message='Sync was interrupted. Imported saves are kept.',finished_at=? WHERE status='running'").run(now);
  }
  let browser = null;
  try { browser = JSON.parse(store.get('sync_browser') || 'null'); } catch { /* First launch. */ }
  let setupRequest = null;
  let accountScanRequested = false;
  let xAccounts = null;
  let nativeBrowser = null, nativeAccounts = [], sessionHandoff = null;
  const lastSync = store.db.prepare(`SELECT MAX(at) AS at FROM (
    SELECT finished_at AS at FROM sync_runs WHERE status IN ('completed', 'partial')
    UNION ALL SELECT updated_at AS at FROM sync_jobs WHERE status IN ('completed', 'partial')
  )`);
  try { xAccounts = JSON.parse(store.get('x_accounts') || 'null'); } catch { /* No discovered accounts yet. */ }
  const decode = row => row && ({ ...row, instagramScope: JSON.parse(row.instagram_scope || 'null'), pinterestScope: JSON.parse(row.pinterest_scope || 'null'), xAccount: row.x_account?.startsWith('[') ? JSON.parse(row.x_account) : row.x_account || 'current', targets: JSON.parse(row.targets), results: JSON.parse(row.results), quiet: row.quiet === 1 });
  const latest = () => decode(store.db.prepare('SELECT * FROM sync_jobs ORDER BY created_at DESC, rowid DESC LIMIT 1').get()) || null;
  const chosen = () => decode(store.db.prepare('SELECT * FROM sync_jobs WHERE quiet=0 ORDER BY created_at DESC, rowid DESC LIMIT 1').get()) || null;
  return {
    status() {
      const job = latest();
      if (job && ['queued', 'running'].includes(job.status) && Date.now() - Date.parse(job.updated_at) > (job.status === 'queued' ? 5 : 25) * 60000) {
        store.db.prepare("UPDATE sync_jobs SET status='failed', message='Sync was interrupted. Click Sync to try again.' WHERE id=?").run(job.id);
      }
      const chrome = browser && { ...browser, online: Date.now() - browser.seenAt < 90000 };
      const nativeOnline = !!nativeBrowser && Date.now() - nativeBrowser.seenAt < 90000;
      const connected = nativeAccounts.filter(account => account.status === 'connected');
      return { job: latest(), browser: native ? { ...chrome, name: 'saveXtension', online: nativeOnline, ready: nativeOnline && connected.length > 0, unsave: nativeOnline, bookmarksSupported: true, bookmarksReady: nativeOnline, accountSwitching: true, selectedAccounts: true, syncModes: true, instagramCollections: true, instagramSaveLists: true } : chrome, ...(native ? { nativeSocial: { enabled: true, online: nativeOnline, accounts: nativeAccounts }, chromeBrowser: chrome, chromeBookmarkTreeAt: store.get('chrome_bookmark_tree_at') || null } : {}), xAccounts, accountScanRequested, lastSyncedAt: lastSync.get().at || null };
    },
    // Chrome's own bookmark tree, sent by the helper extension for computers where the
    // desktop app can't find Chrome's bookmark file. The first copy starts an import.
    setChromeBookmarks(tree) {
      const first = !store.get('chrome_bookmark_tree_at'), at = new Date().toISOString();
      store.set('chrome_bookmark_tree', JSON.stringify(tree)); store.set('chrome_bookmark_tree_at', at);
      const current = latest();
      if (first && !(current && ['queued', 'running'].includes(current.status))) this.enqueue(['chrome']);
      return { ok: true, at };
    },
    chromeBookmarks() { try { return JSON.parse(store.get('chrome_bookmark_tree') || 'null'); } catch { return null; } },
    // A one-time handoff of a site's sign-in from the Chrome helper. The cookies live in this
    // variable only, are never written to the library, and go to the one extension instance
    // that picked up the request. Nothing asks for them except a sign-in the person started.
    requestChromeSession(platform) {
      if (!Object.hasOwn(SESSION_SITES, platform)) throw new HttpError(400, 'This site can’t use a Chrome sign-in yet.');
      sessionHandoff = { id: randomBytes(16).toString('hex'), platform, expires: Date.now() + 60000, instance: null, cookies: null };
      return sessionHandoff.id;
    },
    chromeSessionRequestFor(instance) {
      const handoff = sessionHandoff;
      if (!instance || !handoff || handoff.cookies || Date.now() > handoff.expires || handoff.instance && handoff.instance !== instance) return null;
      handoff.instance = instance;
      return { id: handoff.id, platform: handoff.platform, domains: SESSION_SITES[handoff.platform].domains };
    },
    receiveChromeSession({ id, instance, cookies }) {
      const handoff = sessionHandoff;
      if (!handoff || handoff.id !== id || handoff.instance !== instance || handoff.cookies || Date.now() > handoff.expires) throw new HttpError(409, 'That sign-in request has ended.');
      if (!Array.isArray(cookies) || cookies.length > 1000) throw new HttpError(400, 'Send a site’s cookies.');
      handoff.cookies = cookies.filter(cookie => cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string' && typeof cookie.domain === 'string' && cookie.name.length <= 4096 && cookie.value.length <= 16384 && SESSION_SITES[handoff.platform].owns(cookie.domain.replace(/^\./, '').toLowerCase()));
      return { ok: true };
    },
    takeChromeSession(id) {
      if (sessionHandoff?.id !== id || !sessionHandoff.cookies) return null;
      const { cookies } = sessionHandoff; sessionHandoff = null; return cookies;
    },
    cancelChromeSession(id) { if (sessionHandoff?.id === id) sessionHandoff = null; },
    configureNativeAccounts(accounts) { nativeAccounts = accounts.map(({ id, platform, handle, name, status }) => ({ id, platform, handle, name, status })); },
    nativeHeartbeat(input) { nativeBrowser = { seenAt: Date.now() }; if (input.jobId) store.db.prepare("UPDATE sync_jobs SET updated_at=? WHERE id=? AND status='running' AND owner=?").run(new Date().toISOString(), input.jobId, input.instance); },
    nativeStopped() { nativeBrowser = null; },
    // The last scan someone asked for, which background checks repeat.
    chosenJob: chosen,
    // What the library shows. A background check stays out of sight unless it found new saves,
    // and then only those show; anything else it ran into waits for a scan someone asks for.
    presented() {
      const status = this.status(), job = status.job;
      if (!job?.quiet) return status;
      const found = job.results.filter(result => Number(result.imported) > 0);
      if (!found.length || ['queued', 'running'].includes(job.status)) return { ...status, job: chosen() };
      return { ...status, job: { ...job, status: 'completed', targets: [...new Set(found.map(result => result.platform))], results: found.map(result => ({ ...result, status: 'completed' })) } };
    },
    // Anything a person starts comes before a background check.
    giveWay() {
      const job = latest();
      if (job?.quiet && ['queued', 'running'].includes(job.status)) this.cancel();
    },
    enqueue(targets, xAccount = 'current', mode = 'quick', instagramAccount = 'current', instagramCollectionId = null, pinterestAccount = 'current', pinterestCollectionId = null, quiet = false) {
      if (!['quick', 'deep'].includes(mode)) throw new HttpError(400, 'Choose a quick check or a deep scan.');
      if (!Array.isArray(targets) || !targets.length || targets.some(t => !['x', 'instagram', 'pinterest', 'chrome'].includes(t))) throw new HttpError(400, 'Choose X, Instagram, Pinterest, Chrome bookmarks, or all sources.');
      if (targets.includes('pinterest') && !native) throw new HttpError(400, 'Pinterest syncs from the saveXtension desktop app.');
      if (Array.isArray(xAccount)) {
        if (!xAccount.length || xAccount.length > 30 || xAccount.some(handle => typeof handle !== 'string' || !/^@[A-Za-z0-9_]{1,30}$/.test(handle))) throw new HttpError(400, 'Choose valid X accounts.');
        xAccount = [...new Set(xAccount.map(handle => handle.toLowerCase()))];
      } else if (typeof xAccount !== 'string' || !/^(current|all|@[A-Za-z0-9_]{1,30})$/.test(xAccount)) throw new HttpError(400, 'Choose the current X account, all signed-in accounts, or a specific @handle.');
      if (instagramCollectionId !== null && (targets.length !== 1 || targets[0] !== 'instagram')) throw new HttpError(400, 'A collection refresh must target Instagram only.');
      const instagramScope = targets.includes('instagram') ? instagramSyncScope(store, instagramAccount, instagramCollectionId) : null;
      const pinterestScope = targets.includes('pinterest') ? pinterestSyncScope(store, pinterestAccount, pinterestCollectionId, targets) : null;
      const current = this.status().job;
      if (current && ['queued', 'running'].includes(current.status)) return current;
      const id = randomBytes(12).toString('hex'), now = new Date().toISOString();
      store.db.prepare('INSERT INTO sync_jobs (id,targets,created_at,updated_at,x_account,mode,instagram_scope,pinterest_scope,quiet) VALUES (?,?,?,?,?,?,?,?,?)').run(id, JSON.stringify([...new Set(targets)]), now, now, Array.isArray(xAccount) ? JSON.stringify(xAccount) : xAccount, mode, JSON.stringify(instagramScope), JSON.stringify(pinterestScope), quiet ? 1 : 0);
      return latest();
    },
    heartbeat(input) {
      browser = { chromeSession: input.chromeSession === true, chromeSessionSites: Array.isArray(input.chromeSessionSites) ? input.chromeSessionSites.filter(site => Object.hasOwn(SESSION_SITES, site)) : [], unsave: input.unsave === true, desktopBookmarks: input.desktopBookmarks === true, seenAt: Date.now(), ready: input.ready === true, name: text(input.name, 80) || 'Chrome', instance: text(input.instance, 100), version: text(input.version, 30), accountSwitching: input.accountSwitching === true, selectedAccounts: input.selectedAccounts === true, syncModes: input.syncModes === true, instagramCollections: input.instagramCollections === true, instagramSaveLists: input.instagramSaveLists === true, bookmarksSupported: input.bookmarksSupported === true, bookmarksReady: input.bookmarksReady === true };
      store.set('sync_browser', JSON.stringify(browser));
      if (input.jobId) store.db.prepare("UPDATE sync_jobs SET updated_at=? WHERE id=? AND status='running' AND owner=?").run(new Date().toISOString(), input.jobId, browser.instance);
      return browser;
    },
    requestSetup(kind = 'social') {
      setupRequest = { id: randomBytes(12).toString('hex'), expires: Date.now() + 300000, instance: browser?.instance, kind: kind === 'chrome' ? 'chrome' : 'social' };
      return { ok: true };
    },
    takeSetup(instance, kind = 'social') {
      if (!setupRequest || setupRequest.kind !== kind || setupRequest.expires < Date.now() || (setupRequest.instance && setupRequest.instance !== instance)) return false;
      setupRequest = null;
      return true;
    },
    requestAccountScan() { accountScanRequested = true; return { ok: true }; },
    takeAccountScan() { const requested = accountScanRequested; accountScanRequested = false; return requested; },
    setAccounts(input) {
      if (!Array.isArray(input.accounts) || input.accounts.length > 30) throw new HttpError(400, 'Invalid X account list.');
      const accounts = new Map();
      for (const item of input.accounts) {
        if (!item || !/^@[A-Za-z0-9_]{1,30}$/.test(item.handle)) throw new HttpError(400, 'Invalid X account handle.');
        accounts.set(item.handle.toLowerCase(), { handle: item.handle, name: text(item.name, 80) });
      }
      xAccounts = { accounts: [...accounts.values()], active: /^@[A-Za-z0-9_]{1,30}$/.test(input.active) ? input.active : '', checkedAt: Date.now(), busy: input.busy === true, error: text(input.error, 300), instance: text(input.instance, 100) };
      store.set('x_accounts', JSON.stringify(xAccounts)); return xAccounts;
    },
    claim(instance, accountSwitching = false, capabilities = {}) {
      if (!instance) throw new HttpError(400, 'Browser ID required.');
      if (native && !capabilities.native) return null;
      const job = this.status().job;
      if (!job || job.status !== 'queued') return null;
      if (job.mode === 'deep' && !capabilities.syncModes) return null;
      if (job.targets.includes('instagram') && !capabilities.instagramCollections) return null;
      if (job.instagramScope && !capabilities.instagramSaveLists) return null;
      if (job.targets.includes('chrome') && (!capabilities.bookmarksSupported || !capabilities.bookmarksReady)) return null;
      if (job.targets.some(t => t !== 'chrome') && capabilities.socialReady === false) return null;
      if (Array.isArray(job.xAccount) && !capabilities.selectedAccounts) return null;
      if (job.targets.includes('x') && job.xAccount !== 'current' && !accountSwitching) return null;
      store.db.prepare("UPDATE sync_jobs SET status='running',owner=?,message='Opening your saved posts in the background…',updated_at=? WHERE id=? AND status='queued'").run(instance, new Date().toISOString(), job.id);
      return latest();
    },
    update(id, instance, input) {
      const job = latest();
      if (!job || job.id !== id || job.owner !== instance) throw new HttpError(404, 'Sync not found for this browser.');
      if (job.status === 'cancelled') return job;
      if (job.status !== 'running') throw new HttpError(409, 'Sync already finished.');
      const status = ['completed', 'partial', 'failed', 'cancelled'].includes(input.status) ? input.status : 'running';
      const results = Array.isArray(input.results) ? input.results.slice(0, 40).map(r => ({ platform: text(r.platform, 20), account: text(r.account, 100), imported: Math.max(0, Number(r.imported) || 0), updated: Math.max(0, Number(r.updated) || 0), enriched: Math.max(0, Number(r.enriched) || 0), status: text(r.status, 20), message: text(r.message, 500) })) : job.results;
      store.db.prepare('UPDATE sync_jobs SET status=?,message=?,results=?,updated_at=? WHERE id=?').run(status, text(input.message, 500), JSON.stringify(results), new Date().toISOString(), id);
      return latest();
    },
    cancel() {
      const job = latest();
      if (job && ['queued', 'running'].includes(job.status)) store.db.prepare("UPDATE sync_jobs SET status='cancelled',message='Stopped. Everything already imported is saved.',updated_at=? WHERE id=?").run(new Date().toISOString(), job.id);
      return latest();
    }
  };
}
