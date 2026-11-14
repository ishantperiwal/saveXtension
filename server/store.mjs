import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cleanPost, cleanCollection, imageUrl, instagramCaption, text, noteText, tags, HttpError, updatedTime } from './domain.mjs';
import { initializeTopics, topicNames, writeTopicNames } from './topics.mjs';
import { initializeDocuments } from './documents.mjs';

export const token = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(String(value)).digest('hex');
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, last_seen TEXT);
      CREATE TABLE IF NOT EXISTS pairing (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY, platform TEXT NOT NULL, external_id TEXT NOT NULL, url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT '', author_name TEXT NOT NULL DEFAULT '',
        thumbnail TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'text', tags TEXT NOT NULL DEFAULT '[]', topics TEXT NOT NULL DEFAULT '[]',
        accounts TEXT NOT NULL DEFAULT '[]', published_at TEXT, saved_at TEXT NOT NULL, added_at TEXT, updated_at TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '', favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
        UNIQUE(platform, external_id)
      );
      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY, device_id TEXT, platform TEXT NOT NULL, account TEXT NOT NULL DEFAULT '',
        started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL DEFAULT 'running',
        imported INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0, rejected INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS sync_discoveries (
        platform TEXT NOT NULL, account TEXT NOT NULL COLLATE NOCASE, external_id TEXT NOT NULL,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        last_seen_run TEXT NOT NULL,
        PRIMARY KEY(platform, account, external_id)
      );
      CREATE INDEX IF NOT EXISTS sync_discoveries_run ON sync_discoveries(last_seen_run);
      CREATE TABLE IF NOT EXISTS instagram_collections (
        id INTEGER PRIMARY KEY, account TEXT NOT NULL COLLATE NOCASE, external_id TEXT NOT NULL,
        name TEXT NOT NULL, url TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(account,external_id)
      );
      CREATE TABLE IF NOT EXISTS instagram_collection_posts (
        collection_id INTEGER NOT NULL REFERENCES instagram_collections(id) ON DELETE CASCADE,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        PRIMARY KEY(collection_id,post_id)
      );
      CREATE INDEX IF NOT EXISTS instagram_collection_posts_post ON instagram_collection_posts(post_id);
    `);
    // These tables hold every platform's folders: Instagram collections and Pinterest boards.
    if (!this.db.prepare('PRAGMA table_info(instagram_collections)').all().some(column => column.name === 'platform')) this.db.exec("ALTER TABLE instagram_collections ADD COLUMN platform TEXT NOT NULL DEFAULT 'instagram'");
    if (!this.db.prepare('PRAGMA table_info(posts)').all().some(c => c.name === 'added_at')) {
      // Social saved_at was the first local import time. Chrome saved_at was
      // the browser bookmark date; leave unrecoverable historic imports unknown.
      this.db.exec("BEGIN IMMEDIATE; ALTER TABLE posts ADD COLUMN added_at TEXT; UPDATE posts SET added_at=saved_at WHERE platform!='chrome'; COMMIT;");
    }
    if (!this.db.prepare('PRAGMA table_info(posts)').all().some(c => c.name === 'gif_checked')) this.db.exec('ALTER TABLE posts ADD COLUMN gif_checked INTEGER NOT NULL DEFAULT 0');
    if (!this.db.prepare('PRAGMA table_info(posts)').all().some(c => c.name === 'image_description')) this.db.exec("ALTER TABLE posts ADD COLUMN image_description TEXT NOT NULL DEFAULT ''");
    // Every description before this column came from Haiku 5.5, the only model that had read images.
    if (!this.db.prepare('PRAGMA table_info(posts)').all().some(c => c.name === 'image_description_model')) this.db.exec("BEGIN IMMEDIATE; ALTER TABLE posts ADD COLUMN image_description_model TEXT NOT NULL DEFAULT ''; UPDATE posts SET image_description_model='Haiku 5.5' WHERE image_description!=''; COMMIT;");
    if (!this.db.prepare('PRAGMA table_info(posts)').all().some(c => c.name === 'media')) this.db.exec("ALTER TABLE posts ADD COLUMN media TEXT NOT NULL DEFAULT '[]'");
    // Earlier versions kept Instagram's counts and date at the top of captions.
    for (const row of this.db.prepare("SELECT id,text FROM posts WHERE platform='instagram' AND text LIKE '% comment%'").all()) {
      const caption = instagramCaption(row.text);
      if (caption !== row.text) this.db.prepare('UPDATE posts SET text=? WHERE id=?').run(caption, row.id);
    }
    // Earlier versions could capture a profile picture as one of a post's images.
    for (const row of this.db.prepare("SELECT id,thumbnail,media FROM posts WHERE thumbnail||media LIKE '%/profile_images/%' OR thumbnail||media LIKE '%/t51.2885-19/%'").all()) {
      const media = JSON.parse(row.media).filter(imageUrl);
      this.db.prepare('UPDATE posts SET thumbnail=?,media=? WHERE id=?').run(imageUrl(row.thumbnail) || media[0] || '', JSON.stringify(media), row.id);
    }
    if (!this.db.prepare('PRAGMA table_info(posts)').all().some(c => c.name === 'bookmark_title')) this.db.exec("ALTER TABLE posts ADD COLUMN bookmark_title TEXT NOT NULL DEFAULT ''");
    if (!this.db.prepare('PRAGMA table_info(posts)').all().some(c => c.name === 'folders')) this.db.exec("ALTER TABLE posts ADD COLUMN folders TEXT NOT NULL DEFAULT '[]'");
    if (!this.db.prepare('PRAGMA table_info(sync_runs)').all().some(c => c.name === 'activity_at')) this.db.exec('ALTER TABLE sync_runs ADD COLUMN activity_at TEXT');
    if (!this.db.prepare('PRAGMA table_info(sync_runs)').all().some(c => c.name === 'mode')) this.db.exec("ALTER TABLE sync_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'quick'");
    if (!this.db.prepare('PRAGMA table_info(sync_runs)').all().some(c => c.name === 'collection_id')) this.db.exec('ALTER TABLE sync_runs ADD COLUMN collection_id INTEGER');
    if (!this.db.prepare('PRAGMA table_info(sync_discoveries)').all().some(c => c.name === 'seen_position')) this.db.exec('ALTER TABLE sync_discoveries ADD COLUMN seen_position INTEGER');
    initializeTopics(this.db); initializeDocuments(this.db);
  }
  get(key) { return this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value; }
  set(key, value) { this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key, value); }
  createSession() {
    const value = token();
    this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    this.db.prepare('INSERT INTO sessions VALUES (?,?)').run(hash(value), Date.now() + 7 * 86400000);
    return value;
  }
  session(value) { return !!value && !!this.db.prepare('SELECT hash FROM sessions WHERE hash=? AND expires>?').get(hash(value), Date.now()); }
  deleteSession(value) { this.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(value)); }
  pairCode() {
    const code = randomBytes(6).toString('hex').toUpperCase();
    this.db.prepare('DELETE FROM pairing').run();
    this.db.prepare('INSERT INTO pairing VALUES (?,?)').run(hash(code), Date.now() + 300000);
    return code.match(/.{4}/g).join('-');
  }
  pair(code, name) {
    const cleaned = text(code, 60).replace(/[-\s]/g, '').toUpperCase();
    const found = this.db.prepare('SELECT hash FROM pairing WHERE hash=? AND expires>?').get(hash(cleaned), Date.now());
    if (!found) throw new HttpError(401, 'That pairing code is invalid or expired. Generate a new one in your library.');
    this.db.prepare('DELETE FROM pairing WHERE hash=?').run(found.hash);
    const value = token(), id = randomBytes(12).toString('hex');
    this.db.prepare('INSERT INTO devices (id,name,token_hash,created_at) VALUES (?,?,?,?)').run(id, text(name, 80) || 'Browser extension', hash(value), new Date().toISOString());
    return { token: value, deviceId: id };
  }
  device(value) {
    if (!value) return null;
    const device = this.db.prepare('SELECT id,name FROM devices WHERE token_hash=?').get(hash(value));
    if (device) this.db.prepare('UPDATE devices SET last_seen=? WHERE id=?').run(new Date().toISOString(), device.id);
    return device;
  }
  devices() { return this.db.prepare('SELECT id,name,created_at AS createdAt,last_seen AS lastSeen FROM devices ORDER BY created_at DESC').all(); }
  revoke(id) { this.db.prepare('DELETE FROM devices WHERE id=?').run(id); }
  // What an AI saw in a post's image, kept apart from the person's notes. It doesn't count as an edit to the post.
  uncheckedPins(limit) { return this.db.prepare("SELECT id,thumbnail FROM posts WHERE platform='pinterest' AND kind='image' AND gif_checked=0 AND archived=0 ORDER BY id LIMIT ?").all(limit); }
  markPinChecked(id, isGif) { this.db.prepare(`UPDATE posts SET gif_checked=1${isGif ? ",kind='video',updated_at=?" : ''} WHERE id=?`).run(...(isGif ? [new Date().toISOString(), id] : [id])); }
  setImageDescription(id, description, model = '') { this.db.prepare('UPDATE posts SET image_description=?,image_description_model=? WHERE id=?').run(description, model, id); }
  decode(row, sourceOrder = []) {
    return { id: row.id, platform: row.platform, externalId: row.external_id, url: row.url, title: row.title, text: row.text, author: row.author, authorName: row.author_name,
      thumbnail: row.thumbnail, bookmarkTitle: row.bookmark_title || '', folders: JSON.parse(row.folders || '[]'), media: JSON.parse(row.media || '[]'), kind: row.kind, tags: JSON.parse(row.tags), topics: JSON.parse(row.topics), accounts: JSON.parse(row.accounts),
      publishedAt: row.published_at, savedAt: row.saved_at, addedAt: row.added_at === undefined ? (row.platform === 'chrome' ? null : row.saved_at) : row.added_at, updatedAt: row.updated_at, notes: row.notes, imageDescription: row.image_description || '', imageDescriptionModel: row.image_description_model || '', favorite: !!row.favorite, archived: !!row.archived,
      topicsCurated: !!row.topics_curated, ...(row.platform === 'x' || sourceOrder.length ? { sourceOrder } : {}) };
  }
  posts({ scope = 'active' } = {}) {
    if (!['active', 'archive', 'all'].includes(scope)) throw new HttpError(400, 'Unknown library scope.');
    const where = scope === 'all' ? '' : scope === 'archive' ? ' WHERE archived=1' : ' WHERE archived=0';
    const memberships = new Map();
    for (const row of this.db.prepare(`SELECT m.post_id,c.id,c.platform,c.external_id AS externalId,c.account,c.name,c.url FROM instagram_collection_posts m JOIN instagram_collections c ON c.id=m.collection_id`).all()) {
      const { post_id, ...collection } = row;
      if (!memberships.has(post_id)) memberships.set(post_id, []);
      memberships.get(post_id).push(collection);
    }
    const sourceOrder = this.sourceOrder(), listOrder = this.listOrder();
    return this.db.prepare(`SELECT * FROM posts${where} ORDER BY saved_at DESC,id DESC`).all().map(row => ({ ...this.decode(row, sourceOrder.get(row.id) || listOrder.get(`${row.platform}:${row.external_id}`) || []), topics: topicNames(this.db, row.id), collections: memberships.get(row.id) || [] }));
  }
  post(id) {
    const row = this.db.prepare('SELECT * FROM posts WHERE id=?').get(id);
    if (!row) return null;
    const collections = this.db.prepare(`SELECT c.id,c.platform,c.external_id AS externalId,c.account,c.name,c.url FROM instagram_collection_posts m JOIN instagram_collections c ON c.id=m.collection_id WHERE m.post_id=?`).all(id);
    return { ...this.decode(row, this.sourceOrder(id).get(id) || []), topics: topicNames(this.db, id), collections };
  }
  // Where each Instagram post and Pinterest pin sits in the lists read from the site, top first. What a running scan
  // has read so far goes first. A place in a list always outranks a post no scan has placed yet, so they all share one far-off date.
  listOrder() {
    const lists = new Map(), result = new Map();
    for (const { key, value } of this.db.prepare(`SELECT key,value FROM settings WHERE key LIKE 'list-order:instagram:%' OR key LIKE 'list-order:pinterest:%' OR key LIKE 'list-reading:instagram:%' OR key LIKE 'list-reading:pinterest:%'`).all()) {
      const [kind, platform, account, list] = key.split(':'), name = `${platform}:${account}:${list}`;
      if (!lists.has(name)) lists.set(name, { platform, account, list, order: [], reading: [] });
      try { if (kind === 'list-reading') lists.get(name).reading = JSON.parse(value).ids || []; else lists.get(name).order = JSON.parse(value); } catch { /* Left out until the next scan. */ }
    }
    for (const { platform, account, list, order, reading } of lists.values()) {
      [...new Set([...reading, ...order])].forEach((externalId, position) => {
        const id = `${platform}:${externalId}`;
        if (!result.has(id)) result.set(id, []);
        result.get(id).push({ account, collection: list === 'all' ? null : Number(list), position, observedAt: '9999-01-01T00:00:00.000Z' });
      });
    }
    return result;
  }
  sourceOrder(postId = null) {
    const result = new Map();
    // Older runs did not retain positions. For saves first imported in that
    // very run, insertion IDs still preserve traversal order. Refreshed older
    // saves have no recoverable order until the next scan; do not invent one.
    const rows = this.db.prepare(`SELECT d.post_id,d.account,r.started_at AS observedAt,r.rowid AS runOrder,
      COALESCE(d.seen_position,p.id) AS position FROM sync_discoveries d
      JOIN sync_runs r ON r.id=d.last_seen_run JOIN posts p ON p.id=d.post_id
      WHERE d.platform='x' AND (? IS NULL OR d.post_id=?) AND
      (d.seen_position IS NOT NULL OR (p.added_at>=r.started_at AND (r.finished_at IS NULL OR p.added_at<=r.finished_at)))`).all(postId,postId);
    for (const {post_id,...entry} of rows) {
      if (!result.has(post_id)) result.set(post_id,[]);
      result.get(post_id).push(entry);
    }
    return result;
  }
  saveInstagramCollection(collection) {
    return this.db.prepare(`INSERT INTO instagram_collections(platform,account,external_id,name,url,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(account,external_id) DO UPDATE SET name=excluded.name,url=excluded.url,updated_at=excluded.updated_at RETURNING id`).get(collection.platform || 'instagram', collection.account, collection.externalId, collection.name, collection.url, new Date().toISOString()).id;
  }
  upsertInstagramCollections(account, inputs, platform = 'instagram') {
    if (typeof account !== 'string' || !/^@[\w.-]{1,100}$/.test(account)) throw new HttpError(400, 'Choose an account.');
    if (!Array.isArray(inputs) || inputs.length > 1000) throw new HttpError(400, 'Send up to 1,000 collections at a time.');
    const collections = inputs.map(input => cleanCollection(platform, account, input));
    this.db.exec('BEGIN IMMEDIATE');
    try { for (const collection of collections) this.saveInstagramCollection(collection); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.instagramCollections().filter(c => c.platform === platform && c.account.toLowerCase() === account.toLowerCase());
  }
  instagramCollections() {
    return this.db.prepare(`SELECT c.id,c.platform,c.account,c.external_id AS externalId,c.name,c.url,c.updated_at AS updatedAt,
      COUNT(CASE WHEN p.archived=0 THEN 1 END) AS count
      FROM instagram_collections c LEFT JOIN instagram_collection_posts m ON m.collection_id=c.id LEFT JOIN posts p ON p.id=m.post_id
      GROUP BY c.id ORDER BY c.account COLLATE NOCASE,c.name COLLATE NOCASE,c.id`).all();
  }
  importPosts(inputs) {
    const result = { imported: 0, updated: 0, rejected: 0, errors: [] };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [index, input] of inputs.entries()) {
        let p;
        try { p = cleanPost(input); } catch (e) { result.rejected++; result.errors.push({ index, message: e.message }); continue; }
        const row = this.db.prepare('SELECT * FROM posts WHERE platform=? AND external_id=?').get(p.platform, p.externalId);
        const now = updatedTime(row?.updated_at);
        const accounts = new Set(row ? JSON.parse(row.accounts) : []);
        p.accounts.forEach(a => accounts.add(a));
        if (p.sourceAccount) accounts.add(p.sourceAccount);
        if (row) {
          // An incomplete re-import must never erase a better caption, thumbnail or user edits.
          const old = this.decode(row);
          this.db.prepare(`UPDATE posts SET text=?, title=?, author=?, author_name=?, thumbnail=?, media=?, kind=?, tags=?, topics=?, accounts=?, published_at=?, updated_at=? WHERE id=?`).run(
            (p.platform === 'pinterest' && p.text) || p.text.length > old.text.length ? p.text : old.text, old.title || p.title, p.author || old.author, p.authorName || old.authorName,
            p.thumbnail || old.thumbnail, JSON.stringify(p.media.length > old.media.length ? p.media : old.media), p.kindSure || !['text', 'image'].includes(p.kind) ? p.kind : p.kind === 'image' && old.kind === 'text' ? 'image' : old.kind, JSON.stringify([...new Set([...old.tags, ...p.tags])]),
            JSON.stringify(row.topics_curated ? topicNames(this.db, row.id) : [...new Set([...topicNames(this.db, row.id), ...p.topics])]), JSON.stringify([...accounts]), p.publishedAt || old.publishedAt, now, row.id);
          result.updated++;
        } else {
          this.db.prepare(`INSERT INTO posts (platform,external_id,url,title,text,author,author_name,thumbnail,media,kind,tags,topics,accounts,published_at,saved_at,added_at,updated_at,notes,favorite,archived) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            p.platform, p.externalId, p.url, p.title, p.text, p.author, p.authorName, p.thumbnail, JSON.stringify(p.media), p.kind, JSON.stringify(p.tags), JSON.stringify(p.topics), JSON.stringify([...accounts]), p.publishedAt, p.savedAt || now, p.addedAt === undefined ? now : p.addedAt, now, p.notes, +p.favorite, +p.archived);
          result.imported++;
        }
        const stored = this.db.prepare('SELECT id,topics,topics_curated FROM posts WHERE platform=? AND external_id=?').get(p.platform, p.externalId);
        if (!row || !row.topics_curated) writeTopicNames(this.db, stored.id, JSON.parse(stored.topics), input.topicsCurated === true);
        if (p.platform === 'chrome') this.db.prepare('UPDATE posts SET bookmark_title=?,folders=? WHERE platform=? AND external_id=?').run(p.bookmarkTitle, JSON.stringify(p.folders), p.platform, p.externalId);
        if (['instagram', 'pinterest'].includes(p.platform) && Array.isArray(input.collections)) {
          const postId = this.db.prepare('SELECT id FROM posts WHERE platform=? AND external_id=?').get(p.platform, p.externalId).id;
          for (const value of input.collections.slice(0, 1000)) {
            let collection; try { collection = cleanCollection(p.platform, value.account, value); } catch { continue; }
            const collectionId = this.saveInstagramCollection(collection);
            this.db.prepare('INSERT OR IGNORE INTO instagram_collection_posts VALUES(?,?)').run(collectionId, postId);
          }
        }
      }
      this.db.exec('COMMIT');
      this.onPostsImported?.();
      return result;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  updatePost(id, input) {
    const post = this.post(id);
    if (!post) throw new HttpError(404, 'Post not found.');
    this.db.prepare('UPDATE posts SET title=?,notes=?,tags=?,favorite=?,archived=?,updated_at=? WHERE id=?').run(
      input.title === undefined ? post.title : text(input.title, 180), input.notes === undefined ? post.notes : noteText(input.notes),
      JSON.stringify(input.tags === undefined ? post.tags : tags(input.tags)), input.favorite === undefined ? +post.favorite : +!!input.favorite,
      input.archived === undefined ? +post.archived : +!!input.archived, updatedTime(post.updatedAt), id);
    return this.post(id);
  }
  // A pin left one board. It stays while it's on another board. On its last, it goes, unless asked to keep what someone added to it.
  pinLeftBoard(id, boardId, keepAdditions = false) {
    this.db.prepare('DELETE FROM instagram_collection_posts WHERE collection_id=? AND post_id=?').run(boardId, id);
    if (this.db.prepare('SELECT 1 FROM instagram_collection_posts WHERE post_id=? LIMIT 1').get(id)) return { deleted: false };
    const post = this.post(id); if (!post) return { deleted: false };
    if (keepAdditions && (post.notes.trim() || post.topicsCurated)) { this.db.prepare('UPDATE posts SET archived=1,updated_at=? WHERE id=?').run(new Date().toISOString(), id); return { deleted: false, archived: true }; }
    this.deletePost(id); return { deleted: true };
  }
  // Who saved a post, for opening it as the right account.
  saveOwners(platform, externalId) {
    const row = this.db.prepare('SELECT accounts,archived FROM posts WHERE platform=? AND external_id=?').get(platform, externalId);
    return row ? { accounts: JSON.parse(row.accounts), archived: !!row.archived } : null;
  }
  confirmSourceUnsave(id, account) {
    const post=this.post(id);if(!post)throw new HttpError(404,'Save not found.');
    const remaining=post.accounts.filter(a=>a.toLowerCase()!==account.toLowerCase());
    if(!remaining.length){this.deletePost(id);return {deleted:true};}
    this.db.prepare('UPDATE posts SET accounts=?,updated_at=? WHERE id=?').run(JSON.stringify(remaining),updatedTime(post.updatedAt),id);
    this.db.prepare('DELETE FROM sync_discoveries WHERE post_id=? AND account=? COLLATE NOCASE').run(id,account);
    this.db.prepare('DELETE FROM instagram_collection_posts WHERE post_id=? AND collection_id IN (SELECT id FROM instagram_collections WHERE account=? COLLATE NOCASE)').run(id,account);
    return {deleted:false};
  }
  deletePost(id) {
    const post=this.post(id);if(!post)return;
    for(const row of this.db.prepare('SELECT id,changes FROM mcp_changes').all()){
      const changes=JSON.parse(row.changes).filter(change=>change.key!==`post:${id}`);
      if(!changes.length)this.db.prepare('DELETE FROM mcp_changes WHERE id=?').run(row.id);
      else if(JSON.stringify(changes)!==row.changes)this.db.prepare('UPDATE mcp_changes SET changes=? WHERE id=?').run(JSON.stringify(changes),row.id);
    }
    for(const key of [`detail:${post.url}`,`detail-attempt:${post.url}`,...post.accounts.map(account=>`unsave-attempt:${account.toLowerCase()}:${post.url}`)])this.db.prepare('DELETE FROM settings WHERE key=?').run(key);
    this.onPostDelete?.(id);
    this.db.prepare('DELETE FROM posts WHERE id=?').run(id);
  }
  startRun(deviceId, platform, account, mode = 'quick', collectionId = null) {
    if (!['x', 'instagram', 'pinterest', 'chrome'].includes(platform)) throw new HttpError(400, 'Unknown platform.');
    if (!['quick', 'deep'].includes(mode)) throw new HttpError(400, 'Choose a quick check or a deep scan.');
    if (collectionId !== null) {
      const collection = this.db.prepare('SELECT * FROM instagram_collections WHERE id=?').get(Number(collectionId));
      if (!collection || collection.platform !== platform || collection.account.toLowerCase() !== String(account).toLowerCase()) throw new HttpError(400, 'Choose a collection belonging to this account.');
    }
    const id = randomBytes(12).toString('hex');
    this.db.prepare('INSERT INTO sync_runs (id,device_id,platform,account,started_at,mode,collection_id) VALUES (?,?,?,?,?,?,?)').run(id, deviceId, platform, text(account, 100), new Date().toISOString(), mode, collectionId === null ? null : Number(collectionId));
    return id;
  }
  run(id, deviceId) { return this.db.prepare('SELECT * FROM sync_runs WHERE id=? AND device_id=?').get(id, deviceId); }
  knownPostIds(platform, account, collectionId = null) {
    if (collectionId !== null) return this.db.prepare(`SELECT p.external_id FROM instagram_collection_posts m JOIN posts p ON p.id=m.post_id
      JOIN instagram_collections c ON c.id=m.collection_id WHERE c.id=? AND c.account=? AND p.platform=?`).all(Number(collectionId), account, platform).map(p => p.external_id);
    return this.db.prepare(`SELECT DISTINCT p.external_id FROM posts p JOIN json_each(p.accounts) a
      WHERE p.platform=? AND a.value=? COLLATE NOCASE`).all(platform, account).map(row => row.external_id);
  }
  scanKnownPostIds(platform, account, collectionId = null) {
    // First quick check after this upgrade walks the exposed X history to
    // establish ordering. It stays a quick run: no missing-save deletion checks.
    if (platform === 'x' && !this.db.prepare("SELECT 1 FROM sync_discoveries WHERE platform='x' AND account=? AND seen_position IS NOT NULL LIMIT 1").get(account)) return [];
    return this.knownPostIds(platform, account, collectionId);
  }
  recordDiscoveries(run, inputs) {
    const find = this.db.prepare('SELECT id FROM posts WHERE platform=? AND external_id=?');
    const save = this.db.prepare(`INSERT INTO sync_discoveries(platform,account,external_id,post_id,last_seen_run,seen_position) VALUES(?,?,?,?,?,?)
      ON CONFLICT(platform,account,external_id) DO UPDATE SET post_id=excluded.post_id,
      seen_position=CASE WHEN sync_discoveries.last_seen_run=excluded.last_seen_run AND sync_discoveries.seen_position IS NOT NULL THEN sync_discoveries.seen_position ELSE excluded.seen_position END,
      last_seen_run=excluded.last_seen_run`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      let position = this.db.prepare('SELECT COALESCE(MAX(seen_position),-1)+1 AS next FROM sync_discoveries WHERE last_seen_run=?').get(run.id).next;
      for (const input of inputs) {
        let p; try { p = cleanPost(input); } catch { continue; }
        if (p.platform !== run.platform) continue;
        const post = find.get(p.platform, p.externalId);
        if (post) {
          save.run(p.platform, run.account, p.externalId, post.id, run.id, run.platform === 'x' ? position++ : null);
          if (run.collection_id) this.db.prepare('INSERT OR IGNORE INTO instagram_collection_posts VALUES(?,?)').run(run.collection_id, post.id);
        }
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  detailCandidates(platform, account, runId) {
    // A pin's title and image already come from the list; its own page adds nothing to read.
    if (platform === 'pinterest') return [];
    const rows = runId
      ? this.db.prepare(`SELECT p.* FROM posts p JOIN sync_discoveries d ON d.post_id=p.id
          WHERE d.last_seen_run=? AND d.platform=? AND d.account=? AND p.archived=0 ORDER BY p.id`).all(runId, platform, account)
      : this.db.prepare('SELECT * FROM posts WHERE platform=? AND archived=0 ORDER BY id').all(platform);
    return rows.map(row => this.decode(row)).filter(p => {
      if (account && !p.accounts.some(a => a.toLowerCase() === account.toLowerCase())) return false;
      // A successful detail fetch remains valid. Missing details can retry after a day.
      if (Number(this.get(`detail:${p.url}`) || 0) > 0) return false;
      if (Date.now() - Number(this.get(`detail-attempt:${p.url}`) || 0) < 86400000) return false;
      return platform === 'instagram' || !p.text || !p.author;
    });
  }
  missingFromRun(run) {
    return this.db.prepare(`SELECT p.id,p.url,p.external_id FROM posts p
      LEFT JOIN sync_discoveries d ON d.post_id=p.id AND d.account=?
      WHERE p.platform='x' AND p.archived=0
      AND EXISTS(SELECT 1 FROM json_each(p.accounts) a WHERE a.value=? COLLATE NOCASE)
      AND (d.last_seen_run IS NULL OR d.last_seen_run<>?) ORDER BY p.id`).all(run.account, run.account, run.id)
      .filter(p => Date.now() - Number(this.get(`unsave-attempt:${run.account.toLowerCase()}:${p.url}`) || 0) >= 86400000)
      .map(p => ({ url: p.url, externalId: p.external_id }));
  }
  removeSourceSave(url, account) {
    const row = this.db.prepare("SELECT * FROM posts WHERE platform='x' AND url=?").get(url);
    if (!row || row.archived) return false;
    const accounts = JSON.parse(row.accounts);
    if (!accounts.some(a => a.toLowerCase() === account.toLowerCase())) return false;
    const remaining = accounts.filter(a => a.toLowerCase() !== account.toLowerCase());
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (remaining.length) {
        this.db.prepare('UPDATE posts SET accounts=?,updated_at=? WHERE id=?').run(JSON.stringify(remaining), new Date().toISOString(), row.id);
        this.db.prepare('DELETE FROM sync_discoveries WHERE post_id=? AND account=?').run(row.id, account);
      } else this.deletePost(row.id);
      this.db.exec('COMMIT');
      return true;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  recordRun(id, result) { this.db.prepare('UPDATE sync_runs SET imported=imported+?,updated=updated+?,rejected=rejected+?,activity_at=? WHERE id=?').run(result.imported, result.updated, result.rejected, new Date().toISOString(), id); }
  finishRun(id, status, message) {
    this.db.prepare('UPDATE sync_runs SET status=?,message=?,finished_at=? WHERE id=?').run(['completed', 'partial', 'cancelled', 'failed'].includes(status) ? status : 'partial', text(message, 500), new Date().toISOString(), id);
  }
  runs() {
    return this.db.prepare(`SELECT id,platform,account,started_at AS startedAt,finished_at AS finishedAt,
      CASE WHEN status='running' AND julianday(COALESCE(activity_at,started_at)) < julianday('now','-20 minutes') THEN 'interrupted' ELSE status END AS status,
      imported,updated,rejected,message FROM sync_runs ORDER BY started_at DESC LIMIT 30`).all();
  }
  close() { this.db.close(); }
}
