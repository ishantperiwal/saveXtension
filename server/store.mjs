import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cleanPost, text, tags, HttpError } from './domain.mjs';

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
        accounts TEXT NOT NULL DEFAULT '[]', published_at TEXT, saved_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '', favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
        UNIQUE(platform, external_id)
      );
      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY, device_id TEXT, platform TEXT NOT NULL, account TEXT NOT NULL DEFAULT '',
        started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL DEFAULT 'running',
        imported INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0, rejected INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT ''
      );
    `);
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
  decode(row) {
    return { id: row.id, platform: row.platform, externalId: row.external_id, url: row.url, title: row.title, text: row.text, author: row.author, authorName: row.author_name,
      thumbnail: row.thumbnail, kind: row.kind, tags: JSON.parse(row.tags), topics: JSON.parse(row.topics), accounts: JSON.parse(row.accounts),
      publishedAt: row.published_at, savedAt: row.saved_at, updatedAt: row.updated_at, notes: row.notes, favorite: !!row.favorite, archived: !!row.archived };
  }
  posts() { return this.db.prepare('SELECT * FROM posts ORDER BY saved_at DESC,id DESC').all().map(row => this.decode(row)); }
  post(id) { const row = this.db.prepare('SELECT * FROM posts WHERE id=?').get(id); return row ? this.decode(row) : null; }
  importPosts(inputs) {
    const result = { imported: 0, updated: 0, rejected: 0, errors: [] };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [index, input] of inputs.entries()) {
        let p;
        try { p = cleanPost(input); } catch (e) { result.rejected++; result.errors.push({ index, message: e.message }); continue; }
        const row = this.db.prepare('SELECT * FROM posts WHERE platform=? AND external_id=?').get(p.platform, p.externalId);
        const now = new Date().toISOString();
        const accounts = new Set(row ? JSON.parse(row.accounts) : []);
        p.accounts.forEach(a => accounts.add(a));
        if (p.sourceAccount) accounts.add(p.sourceAccount);
        if (row) {
          // An incomplete re-import must never erase a better caption, thumbnail or user edits.
          const old = this.decode(row);
          this.db.prepare(`UPDATE posts SET text=?, title=?, author=?, author_name=?, thumbnail=?, kind=?, tags=?, topics=?, accounts=?, published_at=?, updated_at=? WHERE id=?`).run(
            p.text.length > old.text.length ? p.text : old.text, old.title || p.title, p.author || old.author, p.authorName || old.authorName,
            p.thumbnail || old.thumbnail, p.kind === 'text' ? old.kind : p.kind, JSON.stringify([...new Set([...old.tags, ...p.tags])]),
            JSON.stringify([...new Set([...old.topics, ...p.topics])]), JSON.stringify([...accounts]), p.publishedAt || old.publishedAt, now, row.id);
          result.updated++;
        } else {
          this.db.prepare(`INSERT INTO posts (platform,external_id,url,title,text,author,author_name,thumbnail,kind,tags,topics,accounts,published_at,saved_at,updated_at,notes,favorite,archived) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            p.platform, p.externalId, p.url, p.title, p.text, p.author, p.authorName, p.thumbnail, p.kind, JSON.stringify(p.tags), JSON.stringify(p.topics), JSON.stringify([...accounts]), p.publishedAt, p.savedAt || now, now, p.notes, +p.favorite, +p.archived);
          result.imported++;
        }
      }
      this.db.exec('COMMIT');
      return result;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  updatePost(id, input) {
    const post = this.post(id);
    if (!post) throw new HttpError(404, 'Post not found.');
    this.db.prepare('UPDATE posts SET title=?,notes=?,tags=?,favorite=?,archived=?,updated_at=? WHERE id=?').run(
      input.title === undefined ? post.title : text(input.title, 180), input.notes === undefined ? post.notes : text(input.notes, 10000),
      JSON.stringify(input.tags === undefined ? post.tags : tags(input.tags)), input.favorite === undefined ? +post.favorite : +!!input.favorite,
      input.archived === undefined ? +post.archived : +!!input.archived, new Date().toISOString(), id);
    return this.post(id);
  }
  deletePost(id) { this.db.prepare('DELETE FROM posts WHERE id=?').run(id); }
  startRun(deviceId, platform, account) {
    if (!['x', 'instagram'].includes(platform)) throw new HttpError(400, 'Unknown platform.');
    const id = randomBytes(12).toString('hex');
    this.db.prepare('INSERT INTO sync_runs (id,device_id,platform,account,started_at) VALUES (?,?,?,?,?)').run(id, deviceId, platform, text(account, 100), new Date().toISOString());
    return id;
  }
  run(id, deviceId) { return this.db.prepare('SELECT * FROM sync_runs WHERE id=? AND device_id=?').get(id, deviceId); }
  recordRun(id, result) { this.db.prepare('UPDATE sync_runs SET imported=imported+?,updated=updated+?,rejected=rejected+? WHERE id=?').run(result.imported, result.updated, result.rejected, id); }
  finishRun(id, status, message) {
    this.db.prepare('UPDATE sync_runs SET status=?,message=?,finished_at=? WHERE id=?').run(['completed', 'partial', 'cancelled', 'failed'].includes(status) ? status : 'partial', text(message, 500), new Date().toISOString(), id);
  }
  runs() {
    return this.db.prepare(`SELECT id,platform,account,started_at AS startedAt,finished_at AS finishedAt,
      CASE WHEN status='running' AND julianday(started_at) < julianday('now','-20 minutes') THEN 'interrupted' ELSE status END AS status,
      imported,updated,rejected,message FROM sync_runs ORDER BY started_at DESC LIMIT 30`).all();
  }
  close() { this.db.close(); }
}
