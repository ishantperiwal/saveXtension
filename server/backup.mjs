// A whole-library backup in one file, for moving to another computer (user's decision): every save with its
// notes, topics, collections and boards, image descriptions and site order, the documents with their
// pictures and fonts, the saved cover images, and the accounts list. Sign-ins, AI keys, MCP access and
// caches stay behind. The file is a SQLite database: a snapshot of the library plus a table of the files.
//
// Importing merges it into whatever library is there, with the same care as a scan: nothing better is
// overwritten, notes are kept, and importing twice changes nothing. Accounts arrive as Needs sign-in, so
// their saves show at once but nothing scans or removes them until someone signs in to that same handle.
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { HttpError } from './domain.mjs';
import { topicCatalog, importTopicCatalog, topicNames, writeTopicNames } from './topics.mjs';

export const BACKUP_FORMAT = 1;
// Settings that describe the library. Everything else is this computer's: sign-in state, caches, history.
const LIBRARY_SETTINGS = ['name', 'desktop_social_accounts', 'instagram_save_lists', 'x_accounts', 'ai-search-tool', 'retired_auto_topics'];
const travels = key => LIBRARY_SETTINGS.includes(key) || /^(list-order|list-reading|kind-checked):/.test(key);
// Work that belongs to this computer and would be wrong elsewhere: in-flight jobs, sign-in records, undo history.
const LOCAL_TABLES = ['sessions', 'devices', 'pairing', 'sync_jobs', 'sync_runs', 'unsave_requests', 'mcp_changes'];
const FILE_NAME = /^[\w.-]{1,120}$/;

const hasTable = (db, name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
const json = (value, fallback) => { try { const parsed = JSON.parse(value); return parsed ?? fallback; } catch { return fallback; } };
const removeDatabase = path => Promise.all(['', '-wal', '-shm', '-journal'].map(end => rm(path + end, { force: true })));

// Writes the backup to a new file in the system's temporary folder and returns its path.
export async function exportBackup({ store, imagesDir, documentImagesDir, documentFontsDir, appVersion = '' }) {
  const path = join(tmpdir(), `savextension-backup-${randomUUID()}.savex`);
  // A consistent copy of the live database, taken without stopping the library.
  store.db.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
  const db = new DatabaseSync(path);
  try {
    for (const table of LOCAL_TABLES) if (hasTable(db, table)) db.exec(`DELETE FROM ${table}`);
    for (const { key } of db.prepare('SELECT key FROM settings').all()) if (!travels(key)) db.prepare('DELETE FROM settings WHERE key=?').run(key);
    db.exec('CREATE TABLE backup_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE backup_files (kind TEXT NOT NULL, name TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(kind, name));');
    const meta = db.prepare('INSERT INTO backup_meta VALUES(?,?)');
    meta.run('format', String(BACKUP_FORMAT)); meta.run('exportedAt', new Date().toISOString()); meta.run('appVersion', appVersion);
    const file = db.prepare('INSERT OR REPLACE INTO backup_files VALUES(?,?,?)');
    // Saved cover images, as listed for each post. A file that's gone is dropped, so it downloads again.
    if (imagesDir && hasTable(db, 'post_images')) {
      for (const row of db.prepare('SELECT post_id, file FROM post_images WHERE file IS NOT NULL').all()) {
        try { file.run('image', row.file, await readFile(join(imagesDir, row.file))); }
        catch { db.prepare('UPDATE post_images SET file=NULL WHERE post_id=?').run(row.post_id); }
      }
    }
    for (const [kind, dir] of [['document-image', documentImagesDir], ['font', documentFontsDir]]) {
      if (!dir || !existsSync(dir)) continue;
      for (const name of await readdir(dir)) if (FILE_NAME.test(name)) file.run(kind, name, await readFile(join(dir, name)).catch(() => Buffer.alloc(0)));
    }
    db.exec('VACUUM');
  } catch (error) { db.close(); await removeDatabase(path); throw error; }
  db.close();
  return path;
}

// Merges a backup into the library. Returns what changed, and the accounts it brought.
export async function importBackup({ store, bytes, imagesDir, documentImagesDir, documentFontsDir }) {
  const path = join(tmpdir(), `savextension-import-${randomUUID()}.sqlite`);
  await writeFile(path, bytes, { mode: 0o600 });
  let source;
  try {
    try { source = new DatabaseSync(path); source.prepare('SELECT platform, external_id FROM posts LIMIT 1').all(); }
    catch { throw new HttpError(400, 'That file isn’t a saveXtension backup.'); }
    const format = hasTable(source, 'backup_meta') ? Number(source.prepare("SELECT value FROM backup_meta WHERE key='format'").get()?.value) : 0;
    if (format > BACKUP_FORMAT) throw new HttpError(400, 'This backup comes from a newer saveXtension. Update the app, then import it.');
    return await merge({ store, source, imagesDir, documentImagesDir, documentFontsDir });
  } finally { source?.close(); await removeDatabase(path); }
}

async function merge({ store, source, imagesDir, documentImagesDir, documentFontsDir }) {
  const target = store.db, files = hasTable(source, 'backup_files');
  const fileData = (kind, name) => files ? source.prepare('SELECT data FROM backup_files WHERE kind=? AND name=?').get(kind, name)?.data : undefined;
  const summary = { added: 0, merged: 0, documents: 0, images: 0, accounts: [] };
  const postIds = new Map(), collectionIds = new Map();
  const shared = columns(source, 'posts').filter(name => name !== 'id' && columns(target, 'posts').includes(name));
  const union = (a, b) => JSON.stringify([...new Set([...json(a, []), ...json(b, [])])]);
  // Fill what's missing and keep what's there: the same rule scans follow, so a later scan's data and the person's
  // own notes win over the backup.
  const FILL = ['title', 'text', 'author', 'author_name', 'thumbnail', 'published_at', 'bookmark_title', 'image_description', 'image_description_model'];
  const pictures = []; // Written once the database has taken the import.

  // Topic descriptions and nesting go in first, in their own step; a malformed catalog leaves the saves to come in
  // regardless, since each post's topic names arrive with it.
  if (hasTable(source, 'topics')) try { importTopicCatalog(target, topicCatalog(source, { all: true })); } catch { /* Topic names still arrive with each post. */ }
  target.exec('BEGIN IMMEDIATE');
  try {
    for (const row of source.prepare(`SELECT id, ${shared.join(',')} FROM posts`).all()) {
      const existing = target.prepare('SELECT * FROM posts WHERE platform=? AND external_id=?').get(row.platform, row.external_id);
      if (!existing) {
        const id = target.prepare(`INSERT INTO posts (${shared.join(',')}) VALUES (${shared.map(() => '?').join(',')})`).run(...shared.map(name => row[name])).lastInsertRowid;
        postIds.set(row.id, Number(id)); summary.added++; continue;
      }
      postIds.set(row.id, existing.id);
      const set = {};
      for (const name of FILL) if (shared.includes(name) && !existing[name] && row[name]) set[name] = row[name];
      if (!existing.notes?.trim() && row.notes?.trim()) set.notes = row.notes;
      if (existing.kind === 'text' && row.kind && row.kind !== 'text') set.kind = row.kind;
      if (shared.includes('media') && json(existing.media, []).length === 0 && json(row.media, []).length) set.media = row.media;
      for (const name of ['accounts', 'tags', 'folders']) if (shared.includes(name)) { const merged = union(existing[name], row[name]); if (merged !== existing[name]) set[name] = merged; }
      for (const name of ['favorite', 'archived', 'gif_checked', 'topics_curated']) if (shared.includes(name) && row[name] && !existing[name]) set[name] = row[name];
      // When it first entered the library is the earliest either side knows.
      if (row.added_at && (!existing.added_at || row.added_at < existing.added_at)) set.added_at = row.added_at;
      const names = Object.keys(set);
      if (names.length) { target.prepare(`UPDATE posts SET ${names.map(name => `${name}=?`).join(',')} WHERE id=?`).run(...names.map(name => set[name]), existing.id); summary.merged++; }
    }

    // Each post's topics, joined with any it already has here.
    const sourceTopics = hasTable(source, 'post_topics')
      ? id => source.prepare('SELECT t.name FROM post_topics pt JOIN topics t ON t.id=pt.topic_id WHERE pt.post_id=?').all(id).map(topic => topic.name)
      : id => json(source.prepare('SELECT topics FROM posts WHERE id=?').get(id)?.topics, []);
    for (const [from, to] of postIds) {
      const incoming = sourceTopics(from); if (!incoming.length) continue;
      const current = topicNames(target, to), names = [...new Set([...current, ...incoming])];
      if (names.length !== current.length) writeTopicNames(target, to, names, !!target.prepare('SELECT topics_curated FROM posts WHERE id=?').get(to)?.topics_curated);
    }

    // Instagram collections and Pinterest boards, matched by the site's own id, and which posts are in them.
    if (hasTable(source, 'instagram_collections')) {
      const platform = columns(source, 'instagram_collections').includes('platform');
      for (const row of source.prepare('SELECT * FROM instagram_collections').all()) {
        const kind = platform ? row.platform : 'instagram';
        const found = target.prepare('SELECT id FROM instagram_collections WHERE account=? AND external_id=? AND platform=?').get(row.account, row.external_id, kind);
        collectionIds.set(row.id, found ? found.id : Number(target.prepare('INSERT INTO instagram_collections (account, external_id, name, url, updated_at, platform) VALUES (?,?,?,?,?,?)').run(row.account, row.external_id, row.name, row.url, row.updated_at, kind).lastInsertRowid));
      }
      for (const row of source.prepare('SELECT * FROM instagram_collection_posts').all()) {
        const collection = collectionIds.get(row.collection_id), post = postIds.get(row.post_id);
        if (collection && post) target.prepare('INSERT OR IGNORE INTO instagram_collection_posts VALUES (?,?)').run(collection, post);
      }
    }

    // Where each save sat in its list, so posts keep their site order.
    if (hasTable(source, 'sync_discoveries')) {
      for (const row of source.prepare('SELECT * FROM sync_discoveries').all()) {
        const post = postIds.get(row.post_id);
        if (post) target.prepare('INSERT OR IGNORE INTO sync_discoveries (platform, account, external_id, post_id, last_seen_run, seen_position) VALUES (?,?,?,?,?,?)').run(row.platform, row.account, row.external_id, post, row.last_seen_run, row.seen_position ?? null);
      }
    }

    // Saved cover images. Files are named after the post, which may have a new number here.
    if (imagesDir && hasTable(source, 'post_images') && hasTable(target, 'post_images')) {
      for (const row of source.prepare('SELECT * FROM post_images WHERE file IS NOT NULL').all()) {
        const post = postIds.get(row.post_id), data = fileData('image', row.file);
        if (!post || !data?.length || target.prepare('SELECT 1 FROM post_images WHERE post_id=? AND file IS NOT NULL').get(post)) continue;
        const name = `${post}${row.file.slice(row.file.lastIndexOf('.'))}`;
        target.prepare('INSERT INTO post_images (post_id, link, file, type, attempted_at) VALUES (?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET link=excluded.link, file=excluded.file, type=excluded.type').run(post, row.link, name, row.type, row.attempted_at || Date.now());
        pictures.push([imagesDir, name, data]); summary.images++;
      }
    }

    if (hasTable(source, 'website_previews') && hasTable(target, 'website_previews')) {
      const shown = columns(source, 'website_previews').filter(name => columns(target, 'website_previews').includes(name));
      for (const row of source.prepare(`SELECT ${shown.join(',')} FROM website_previews`).all()) target.prepare(`INSERT OR IGNORE INTO website_previews (${shown.join(',')}) VALUES (${shown.map(() => '?').join(',')})`).run(...shown.map(name => row[name]));
    }

    // Documents keep their ids, so the same document is never brought in twice. One that's here already is kept.
    if (hasTable(source, 'documents') && hasTable(target, 'documents')) {
      const shown = columns(source, 'documents').filter(name => columns(target, 'documents').includes(name));
      for (const row of source.prepare(`SELECT ${shown.join(',')} FROM documents`).all()) {
        summary.documents += Number(target.prepare(`INSERT OR IGNORE INTO documents (${shown.join(',')}) VALUES (${shown.map(() => '?').join(',')})`).run(...shown.map(name => row[name])).changes);
      }
    }

    mergeSettings({ target, source, collectionIds, summary });
    target.exec('COMMIT');
  } catch (error) { target.exec('ROLLBACK'); throw error; }

  for (const [dir, name, data] of pictures) { await mkdir(dir, { recursive: true, mode: 0o700 }); await writeFile(join(dir, name), data); }
  if (files) {
    // Document pictures are named by their contents, so one that's here already is the same picture.
    for (const [kind, dir] of [['document-image', documentImagesDir], ['font', documentFontsDir]]) {
      if (!dir) continue;
      for (const { name } of source.prepare('SELECT name FROM backup_files WHERE kind=?').all(kind)) {
        if (!FILE_NAME.test(name) || name !== basename(name) || name === 'fonts.json') continue;
        if (!existsSync(join(dir, name))) { await mkdir(dir, { recursive: true, mode: 0o700 }); await writeFile(join(dir, name), fileData(kind, name)); }
      }
    }
    // The list of fonts by name, joined with any added here already.
    const fontList = fileData('font', 'fonts.json');
    if (documentFontsDir && fontList) {
      const index = join(documentFontsDir, 'fonts.json'), here = json(await readFile(index, 'utf8').catch(() => '[]'), []);
      const known = new Set(here.map(font => font.family?.toLowerCase()));
      const added = json(Buffer.from(fontList).toString('utf8'), []).filter(font => font?.family && FILE_NAME.test(font.file || '') && !known.has(font.family.toLowerCase()));
      if (added.length) await writeFile(index, JSON.stringify([...here, ...added], null, 2));
    }
  }
  store.onPostsImported?.();
  return summary;
}

function mergeSettings({ target, source, collectionIds, summary }) {
  const get = (db, key) => db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;
  const set = (key, value) => target.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
  // Collection numbers in settings keys and values are this library's own, so they're translated.
  const collection = id => collectionIds.get(Number(id));
  for (const { key, value } of source.prepare('SELECT key, value FROM settings').all()) {
    if (!travels(key) || key === 'desktop_social_accounts' || key === 'instagram_save_lists') continue;
    let local = key;
    const list = key.match(/^(list-order|list-reading):([a-z]+):([^:]+):(\d+)$/);
    if (list) { const id = collection(list[4]); if (!id) continue; local = `${list[1]}:${list[2]}:${list[3]}:${id}`; }
    if (get(target, local) === undefined) set(local, value);
  }
  // Which collections and boards each account shows, for accounts this library hasn't chosen for yet.
  const lists = json(get(source, 'instagram_save_lists'), {}), here = json(get(target, 'instagram_save_lists'), {});
  let changed = false;
  for (const [account, ids] of Object.entries(lists)) {
    if (Object.hasOwn(here, account)) continue;
    here[account] = Array.isArray(ids) ? ids.map(collection).filter(Boolean) : ids; changed = true;
  }
  if (changed) set('instagram_save_lists', JSON.stringify(here));
  // Accounts come without their sign-in. One this library already has is left as it is.
  const accounts = json(get(source, 'desktop_social_accounts'), []), current = json(get(target, 'desktop_social_accounts'), []);
  const same = (a, b) => a.platform === b.platform && a.handle && b.handle && a.handle.toLowerCase() === b.handle.toLowerCase();
  for (const account of accounts) {
    if (!account?.id || !account.platform || !account.handle || current.some(item => same(item, account) || item.id === account.id)) continue;
    current.push({ id: account.id, platform: account.platform, handle: account.handle, name: account.name || '', status: 'needs-login' });
    summary.accounts.push({ platform: account.platform, handle: account.handle });
  }
  if (summary.accounts.length) set('desktop_social_accounts', JSON.stringify(current));
}
