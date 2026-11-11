import { mkdir, readFile, cp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';
import { Store } from '../server/store.mjs';
import { topicCatalog, importTopicCatalog, topicNames } from '../server/topics.mjs';
import { isPinterestHost, PINTEREST_DOMAINS, PINTEREST_PIN } from '../public/pinterest-host.js';

export const DEFAULT_PORT = 3217;
export const isWebLink = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } };
// An Instagram post or reel link, reduced to its canonical page (no tracking query).
export const instagramPost = value => {
  try {
    const url = new URL(value), path = url.pathname.match(/^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/[\w-]+/)?.[0];
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && ['instagram.com', 'www.instagram.com'].includes(url.hostname) && path ? `https://www.instagram.com${path}/` : '';
  } catch { return ''; }
};
// An X post link, reduced to its canonical page.
export const xPost = value => {
  try {
    const url = new URL(value), id = url.pathname.match(/^\/(?:\w+|i\/web|i)\/status\/(\d+)(?:\/|$)/)?.[1];
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && ['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname) && id ? `https://x.com/i/status/${id}` : '';
  } catch { return ''; }
};
// A Pinterest pin link, reduced to its canonical page.
export const pinterestPost = value => {
  try {
    const url = new URL(value), id = url.pathname.match(PINTEREST_PIN)?.[1];
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && isPinterestHost(url.hostname) && id ? `https://www.pinterest.com/pin/${id}/` : '';
  } catch { return ''; }
};
// The ID a post is stored under, read from its link.
export const postExternalId = (platform, url) => url.match(platform === 'x' ? /\/status\/(\d+)/ : platform === 'pinterest' ? /\/pin\/(\d+)/ : /\/(?:p|reels?|tv)\/([\w-]+)/)?.[1] || null;
// Which connected account a post opens as: one that saved it, preferring one being browsed.
// `owner` says whether it saved the post, since any other account's Save button says nothing about this save.
export function panelAccount(connected, savedBy = [], browsing = []) {
  const saved = new Set(savedBy.map(handle => handle.toLowerCase())), viewing = new Set(browsing.map(handle => handle.toLowerCase()));
  const owners = connected.filter(account => saved.has(account.handle.toLowerCase()));
  const profile = owners.find(account => viewing.has(account.handle.toLowerCase())) || owners[0];
  return { profile: profile || connected[0] || null, owner: !!profile };
}
// What a request from the post panel does: 'save', 'unsave' or nothing. These are the sites' own web
// requests, so one can change; a save missed here is found by the next background check, and an unsave stays as it was.
export function panelRequestKind(platform, { method, url, body = '' }) {
  if (method !== 'POST') return null;
  let path; try { path = new URL(url).pathname; } catch { return null; }
  if (platform === 'x') return /\/graphql\/[^/]+\/CreateBookmark$/.test(path) ? 'save' : /\/graphql\/[^/]+\/DeleteBookmark$/.test(path) ? 'unsave' : null;
  if (platform === 'pinterest') return /^\/resource\/(?:Repin|Pin)Resource\/create\/?$/.test(path) ? 'save' : /^\/resource\/PinResource\/delete\/?$/.test(path) ? 'unsave' : null;
  const direct = path.match(/\/api\/v1\/web\/save\/\d+\/(save|unsave)\/?$/)?.[1];
  if (direct) return direct;
  const name = decodeBody(body).match(/fb_api_req_friendly_name=([^&\s]+)/)?.[1] || '';
  return !/save/i.test(name) || !/mutation/i.test(name) ? null : /unsave/i.test(name) ? 'unsave' : 'save';
}
const decodeBody = body => { try { return decodeURIComponent(body.replace(/\+/g, ' ')); } catch { return body; } };
// Instagram posts are stored by their link's shortcode, which is the media ID its requests use, in base 64.
const SHORTCODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// The real addresses of the links on a post's page, because page text can cut them short. Takes each link's text and address.
// Links within the site itself are left out, since they're its own menus and profiles, and the site's redirects are unwrapped.
const SITE_LINK = /(^|\.)(x\.com|twitter\.com|instagram\.com|threads\.(net|com)|facebook\.com|fbcdn\.net|cdninstagram\.com|twimg\.com|pinimg\.com|pinterest\.[a-z.]+)$/i;
export function pageLinks(anchors, limit = 100) {
  const found = new Set();
  for (const [shown, href] of anchors) {
    let url;
    try { url = new URL(href); } catch { continue; }
    const wrapped = /^l\.(instagram|facebook)\.com$/i.test(url.hostname) ? url.searchParams.get('u') : /pinterest\./i.test(url.hostname) && url.pathname.startsWith('/offsite') ? url.searchParams.get('url') : null;
    if (wrapped) { try { url = new URL(wrapped); } catch { continue; } }
    // X's short links hide the address, but the text of a link in a post holds it in full, ending in "…" when it's only cut for display.
    // Text like "From github.com" on a link card, or a bare site name, isn't the address, so those stay short links for expandShortLinks.
    if (/^t\.co$/i.test(url.hostname)) {
      const text = String(shown || '').trim().replace(/…$/, '');
      if (/^https?:\/\/[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text) || /^[\w-]+(\.[\w-]+)+\/\S+$/.test(text)) { try { url = new URL(/^https?:/i.test(text) ? text : `https://${text}`); } catch { /* Keep the short link. */ } }
    }
    if (!/^https?:$/.test(url.protocol) || SITE_LINK.test(url.hostname)) continue;
    url.hash = ''; found.add(url.href);
    if (found.size >= limit) break;
  }
  return [...found];
}
// Short links that are still left, such as link cards. Only t.co itself is asked, without following it, so the destination isn't visited and no sign-in is sent.
const SHORT_LINK = /^https:\/\/t\.co\/\w+$/;
export async function expandShortLinks(links, ask = fetch, limit = 20) {
  let asked = 0;
  const expanded = await Promise.all(links.map(async link => {
    if (!SHORT_LINK.test(link) || ++asked > limit) return link;
    try {
      const reply = await ask(link, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(4000) });
      return new URL(reply.headers.get('location')).href;
    } catch { return link; }
  }));
  return pageLinks(expanded.map(link => ['', link]), links.length);
}
export function instagramShortcode(mediaId) {
  let id = BigInt(mediaId), code = '';
  while (id > 0n) { code = SHORTCODE[Number(id % 64n)] + code; id /= 64n; }
  return code;
}
// Which post a panel unsave was for. The request says, even when scrolling a feed; failing that, the page on screen does.
export function panelRequestPost(platform, { url, body = '', pageUrl = '' }) {
  if (platform === 'x') return decodeBody(body).match(/"tweet_id"\s*:\s*"(\d+)"/)?.[1] || pageUrl.match(/\/status\/(\d+)/)?.[1] || null;
  const mediaId = url.match(/\/web\/save\/(\d+)\//)?.[1] || decodeBody(body).match(/"media_id"\s*:\s*"?(\d+)/)?.[1];
  return mediaId ? instagramShortcode(mediaId) : pageUrl.match(/\/(?:p|reels?|tv)\/([\w-]+)/)?.[1] || null;
}
export const isLibraryFrame = (value, origin) => { try { return new URL(value).origin === origin; } catch { return false; } };

export async function prepareHelper(source, destination, origin) {
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
  // Chrome ignores this metadata; the native Node worker needs an explicit ESM
  // boundary because this copied folder lives outside the application package.
  await writeFile(join(destination, 'package.json'), JSON.stringify({ type: 'module' }));
  // The desktop helper exists to read bookmarks, so it asks for them when it's loaded
  // instead of needing a second approval inside Chrome.
  const manifestPath = join(destination, 'manifest.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // It can also hand a site's sign-in to the app, so it may read those sites' cookies and no others.
  manifest.permissions = [...new Set([...(manifest.permissions || []), 'bookmarks', 'cookies'])];
  manifest.host_permissions = [...new Set([...(manifest.host_permissions || []), ...PINTEREST_DOMAINS.map(domain => `https://*.${domain}/*`), 'https://*.x.com/*', 'https://*.twitter.com/*', 'https://*.instagram.com/*'])];
  manifest.optional_permissions = (manifest.optional_permissions || []).filter(permission => permission !== 'bookmarks');
  if (!manifest.optional_permissions.length) delete manifest.optional_permissions;
  // Sites it now holds outright can't also be optional; Chrome warns about that on load.
  delete manifest.optional_host_permissions;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  for (const name of ['background.js', 'options.js', 'options.html']) {
    const path = join(destination, name), contents = await readFile(path, 'utf8');
    await writeFile(path, contents.replaceAll('http://localhost:3210', origin));
  }
  return destination;
}

export function readDatabaseSnapshot(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('BEGIN');
    const has = table => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!has('posts')) throw new Error('This file is not a saveXtension library.');
    const posts = db.prepare('SELECT * FROM posts').all().map(row => Store.prototype.decode(row));
    const topics = has('topics') ? topicCatalog(db, { all: true }) : [];
    if (has('post_topics')) for (const post of posts) post.topics = topicNames(db, post.id);
    const collections = has('instagram_collections') ? db.prepare(`SELECT id,${db.prepare('PRAGMA table_info(instagram_collections)').all().some(column => column.name === 'platform') ? 'platform' : "'instagram' AS platform"},account,external_id AS externalId,name,url FROM instagram_collections`).all() : [];
    if (has('instagram_collection_posts')) {
      const byId = new Map(posts.map(post => [post.id, post]));
      const folders = new Map(collections.map(c => [c.id, c]));
      for (const member of db.prepare('SELECT * FROM instagram_collection_posts').all()) {
        const post = byId.get(member.post_id), collection = folders.get(member.collection_id);
        if (post && collection) (post.collections ||= []).push(collection);
      }
    }
    const name = has('settings') ? db.prepare("SELECT value FROM settings WHERE key='name'").get()?.value : null;
    db.exec('COMMIT'); return { posts, instagramCollections: collections, name, topics };
  } finally { db.close(); }
}

export function importSnapshot(store, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.posts)) throw new Error('Choose a saveXtension JSON backup or SQLite library.');
  if (snapshot.topics) importTopicCatalog(store.db, snapshot.topics);
  let imported = 0, updated = 0, rejected = 0;
  for (let i = 0; i < snapshot.posts.length; i += 200) {
    const result = store.importPosts(snapshot.posts.slice(i, i + 200));
    imported += result.imported; updated += result.updated; rejected += result.rejected;
  }
  const accounts = new Map();
  for (const collection of snapshot.instagramCollections || []) {
    if (!collection || typeof collection.account !== 'string') continue;
    const platform = collection.platform === 'pinterest' ? 'pinterest' : 'instagram', key = `${platform}:${collection.account}`;
    if (!accounts.has(key)) accounts.set(key, { platform, account: collection.account, collections: [] });
    accounts.get(key).collections.push(collection);
  }
  for (const { platform, account, collections } of accounts.values()) for (let i = 0; i < collections.length; i += 1000) store.upsertInstagramCollections(account, collections.slice(i, i + 1000), platform);
  if (typeof snapshot.name === 'string' && !store.get('name')) store.set('name', snapshot.name.slice(0, 80));
  return { imported, updated, rejected };
}

async function legacySnapshot(origin, databasePath) {
  try {
    const session = await (await fetch(`${origin}/api/session`, { signal: AbortSignal.timeout(1000) })).json();
    if (session.localMode === true && session.authenticated === true) {
      const response = await fetch(`${origin}/api/export`, { signal: AbortSignal.timeout(10000) });
      if (response.ok) return { ...await response.json(), name: session.name };
    }
  } catch { /* A stopped browser-based library is normal. */ }
  if (databasePath && existsSync(databasePath)) return readDatabaseSnapshot(databasePath);
  return null;
}

export async function startDesktopLibrary({ dataDir, helperSource, legacyOrigin = 'http://localhost:3210', legacyDatabasePath, preferredPort = DEFAULT_PORT, nativeTransport, keyVault = null }) {
  await mkdir(dataDir, { recursive: true });
  const settingsPath = join(dataDir, 'desktop.json');
  let settings = {};
  try { settings = JSON.parse(await readFile(settingsPath, 'utf8')); } catch { /* First launch. */ }
  const initialPort = Number.isInteger(settings.port) && settings.port > 1024 && settings.port < 65516 ? settings.port : preferredPort;
  let instance, origin;
  for (let offset = 0; offset < 20; offset++) {
    origin = `http://localhost:${initialPort + offset}`;
    // Test runs start from an empty folder each time, so they leave out search by meaning instead of downloading it every launch.
    instance = createApp({ dataPath: join(dataDir, 'savextension.sqlite'), imagesDir: join(dataDir, 'images'), meaningDir: process.env.SAVEX_DESKTOP_NO_SEARCH_MODEL ? undefined : join(dataDir, 'meaning-search'), origin, localMode: true, nativeTransport, checkPinterestGifs: true, keyVault, aiKeysFile: join(dataDir, 'ai-keys.json') });
    try {
      await new Promise((resolve, reject) => { instance.server.once('error', reject); instance.server.listen(initialPort + offset, '127.0.0.1', resolve); });
      break;
    } catch (error) { instance.store.close(); instance = null; if (error.code !== 'EADDRINUSE') throw error; }
  }
  if (!instance) throw new Error('No local port is available for the library. Close another copy and try again.');
  try {
    // Import records only: never copy old queued jobs or authentication settings.
    if (!instance.store.get('desktop_initialized')) {
      if (!instance.store.db.prepare('SELECT 1 FROM posts LIMIT 1').get()) {
        const snapshot = await legacySnapshot(legacyOrigin, legacyDatabasePath);
        if (snapshot) {
          importSnapshot(instance.store, snapshot);
          instance.store.set('desktop_migration', new Date().toISOString());
        }
      }
      instance.store.set('desktop_initialized', 'true');
    }
    settings.port = new URL(origin).port;
    settings.port = Number(settings.port);
    await writeFile(settingsPath, JSON.stringify(settings, null, 2));
    const helperPath = await prepareHelper(helperSource, join(dataDir, 'browser-helper', 'extension'), origin);
    const session = await fetch(`${origin}/api/session`); if (!session.ok) throw new Error('The local library could not start.');
    let closed = false;
    return { ...instance, origin, helperPath, async close() {
      if (closed) return; closed = true;
      // Stop explicitly so reopening can never leave an orphaned running job.
      await fetch(`${origin}/api/sync/stop`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      await instance.mcp.close();
      await new Promise(resolve => {
        const timeout = setTimeout(() => instance.server.closeAllConnections(), 2000);
        instance.server.close(() => { clearTimeout(timeout); resolve(); }); instance.server.closeIdleConnections();
      });
      instance.store.close();
    } };
  } catch (error) {
    await new Promise(resolve => { instance.server.close(resolve); instance.server.closeAllConnections(); });
    instance.store.close(); throw error;
  }
}
