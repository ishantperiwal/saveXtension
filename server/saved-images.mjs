import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadWebsite } from './website-previews.mjs';
import { hiddenInstagramSaveIds } from './instagram-save-lists.mjs';

// Instagram image links expire within hours or days, so each save's cover image is
// copied beside the library while its link still works. A link that failed is tried
// again when a sync brings a new one, or after a day in case the network was at fault.
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const WORKERS = 3, RETRY_AFTER = 86400000, RECOVERY_ATTEMPTS = 3;
const off = { schedule() {}, forget() {}, close() {}, idle: async () => {}, has: () => false, busy: () => false, nextRecovery: () => null, noteRecovery() {}, read: async () => null, ensure: async () => null, annotate: posts => posts };

export function savedImages(store, { dir, download = downloadWebsite } = {}) {
  if (!dir) return off;
  const db = store.db;
  db.exec('CREATE TABLE IF NOT EXISTS post_images (post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE, link TEXT NOT NULL, file TEXT, type TEXT, attempted_at INTEGER NOT NULL, recovery_attempts INTEGER NOT NULL DEFAULT 0, recovery_at INTEGER NOT NULL DEFAULT 0)');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // A crash can leave a partial download, or a file whose save is gone.
  const known = new Set(db.prepare('SELECT file FROM post_images WHERE file IS NOT NULL').all().map(row => row.file));
  for (const name of readdirSync(dir)) if (!known.has(name)) rmSync(join(dir, name), { force: true });

  let running = null, again = false, closed = false;
  const links = row => [row.thumbnail, ...JSON.parse(row.media)].filter(Boolean).slice(0, 2);
  const exists = id => !!db.prepare('SELECT 1 FROM posts WHERE id=?').get(id);
  const record = (id, link, file, type) => db.prepare('INSERT INTO post_images(post_id,link,file,type,attempted_at) VALUES(?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET link=excluded.link,file=excluded.file,type=excluded.type,attempted_at=excluded.attempted_at').run(id, link, file, type, Date.now());
  const saved = id => db.prepare('SELECT file,type FROM post_images WHERE post_id=? AND file IS NOT NULL').get(id);

  async function save(row) {
    const candidates = links(row);
    let image = null;
    for (const link of candidates) {
      try { const result = await download(link, 'image'); if (EXTENSIONS[result.type] && result.bytes.length) { image = result; break; } } catch { /* The next link, or a later attempt, may work. */ }
    }
    if (closed || !exists(row.id)) return null;
    if (!image) { if (candidates.length) record(row.id, candidates[0], null, null); return null; }
    const file = `${row.id}.${EXTENSIONS[image.type]}`, path = join(dir, file);
    await writeFile(`${path}.tmp`, image.bytes, { mode: 0o600 });
    await rename(`${path}.tmp`, path);
    if (closed || !exists(row.id)) { await rm(path, { force: true }); return null; }
    record(row.id, candidates[0], file, image.type);
    return { bytes: image.bytes, type: image.type };
  }
  const due = () => db.prepare("SELECT p.id,p.thumbnail,p.media,i.link,i.attempted_at FROM posts p LEFT JOIN post_images i ON i.post_id=p.id WHERE i.file IS NULL AND (p.thumbnail<>'' OR p.media<>'[]')").all()
    .filter(row => row.link !== links(row)[0] || Date.now() - row.attempted_at >= RETRY_AFTER);
  async function drain() {
    do {
      again = false;
      const rows = due();
      await Promise.all(Array.from({ length: WORKERS }, async () => { while (rows.length && !closed) await save(rows.shift()); }));
    } while (again && !closed);
  }
  function schedule() {
    if (closed) return;
    if (running) { again = true; return; }
    running = drain().catch(error => { if (!closed) console.error('Saving images failed.', error); }).finally(() => {
      running = null;
      // A sync can arrive after the last pass checked, while this one was finishing.
      if (again) schedule();
    });
  }
  async function read(id) {
    const row = saved(id);
    if (!row) return null;
    try { return { bytes: await readFile(join(dir, row.file)), type: row.type }; }
    catch { if (!closed) db.prepare('DELETE FROM post_images WHERE post_id=?').run(id); return null; }
  }
  return {
    schedule,
    // A synced download can take a moment, so an agent asking now tries the link itself.
    async ensure(id) {
      const existing = await read(id);
      if (existing) return existing;
      const row = db.prepare('SELECT id,thumbnail,media FROM posts WHERE id=?').get(id);
      return row ? save(row) : null;
    },
    forget(id) { const row = saved(id); if (row) rmSync(join(dir, row.file), { force: true }); },
    annotate(posts) {
      const ids = new Set(db.prepare('SELECT post_id FROM post_images WHERE file IS NOT NULL').all().map(row => row.post_id));
      return posts.map(post => ids.has(post.id) ? { ...post, localImage: `/api/posts/${post.id}/image` } : post);
    },
    has: id => !!saved(id),
    busy: () => !!running,
    // A save whose download failed, ticked saves first. Posts with no image link never get here.
    nextRecovery(skipPlatforms = []) {
      const hidden = new Set(hiddenInstagramSaveIds(store)), now = Date.now();
      const rows = db.prepare("SELECT p.id,p.platform,p.url,p.accounts,i.recovery_attempts AS attempts FROM post_images i JOIN posts p ON p.id=i.post_id WHERE i.file IS NULL AND p.archived=0 AND p.platform IN ('instagram','x') AND i.recovery_attempts<? AND i.recovery_at<=?").all(RECOVERY_ATTEMPTS, now - RETRY_AFTER)
        .filter(row => !skipPlatforms.includes(row.platform));
      rows.sort((a, b) => hidden.has(a.id) - hidden.has(b.id) || a.attempts - b.attempts || b.id - a.id);
      return rows[0] ? { ...rows[0], accounts: JSON.parse(rows[0].accounts) } : null;
    },
    noteRecovery(id) { db.prepare('UPDATE post_images SET recovery_attempts=recovery_attempts+1,recovery_at=? WHERE post_id=?').run(Date.now(), id); },
    read,
    async idle() { while (running) await running; },
    close() { closed = true; }
  };
}
