import { mkdir, readFile, cp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';
import { Store } from '../server/store.mjs';

export const DEFAULT_PORT = 3217;
export const isWebLink = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } };
export const isLibraryFrame = (value, origin) => { try { return new URL(value).origin === origin; } catch { return false; } };

export async function prepareHelper(source, destination, origin) {
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
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
    const collections = has('instagram_collections') ? db.prepare('SELECT id,account,external_id AS externalId,name,url FROM instagram_collections').all() : [];
    if (has('instagram_collection_posts')) {
      const byId = new Map(posts.map(post => [post.id, post]));
      const folders = new Map(collections.map(c => [c.id, c]));
      for (const member of db.prepare('SELECT * FROM instagram_collection_posts').all()) {
        const post = byId.get(member.post_id), collection = folders.get(member.collection_id);
        if (post && collection) (post.collections ||= []).push(collection);
      }
    }
    const name = has('settings') ? db.prepare("SELECT value FROM settings WHERE key='name'").get()?.value : null;
    db.exec('COMMIT'); return { posts, instagramCollections: collections, name };
  } finally { db.close(); }
}

export function importSnapshot(store, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.posts)) throw new Error('Choose a saveXtension JSON backup or SQLite library.');
  let imported = 0, updated = 0, rejected = 0;
  for (let i = 0; i < snapshot.posts.length; i += 200) {
    const result = store.importPosts(snapshot.posts.slice(i, i + 200));
    imported += result.imported; updated += result.updated; rejected += result.rejected;
  }
  const accounts = new Map();
  for (const collection of snapshot.instagramCollections || []) {
    if (!collection || typeof collection.account !== 'string') continue;
    if (!accounts.has(collection.account)) accounts.set(collection.account, []);
    accounts.get(collection.account).push(collection);
  }
  for (const [account, collections] of accounts) for (let i = 0; i < collections.length; i += 1000) store.upsertInstagramCollections(account, collections.slice(i, i + 1000));
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

export async function startDesktopLibrary({ dataDir, helperSource, legacyOrigin = 'http://localhost:3210', legacyDatabasePath, preferredPort = DEFAULT_PORT }) {
  await mkdir(dataDir, { recursive: true });
  const settingsPath = join(dataDir, 'desktop.json');
  let settings = {};
  try { settings = JSON.parse(await readFile(settingsPath, 'utf8')); } catch { /* First launch. */ }
  const initialPort = Number.isInteger(settings.port) && settings.port > 1024 && settings.port < 65516 ? settings.port : preferredPort;
  let instance, origin;
  for (let offset = 0; offset < 20; offset++) {
    origin = `http://localhost:${initialPort + offset}`;
    instance = createApp({ dataPath: join(dataDir, 'savextension.sqlite'), origin, localMode: true });
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
