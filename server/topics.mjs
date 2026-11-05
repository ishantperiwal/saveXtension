import { randomUUID } from 'node:crypto';
import { HttpError, updatedTime } from './domain.mjs';

export const topicKey = name => name.normalize('NFKC').trim().toLocaleLowerCase('en-US');
export function cleanTopicName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || /[\p{Cc}]/u.test(name)) throw new HttpError(400, 'Use a topic name between 1 and 80 characters.');
  return name.normalize('NFKC').trim();
}
export function ensureTopic(db, name, managed = false) {
  name = cleanTopicName(name); const key = topicKey(name);
  const existing = db.prepare('SELECT t.* FROM topics t LEFT JOIN topic_aliases a ON a.topic_id=t.id WHERE t.name_key=? OR a.name_key=?').get(key, key);
  if (existing) {
    if (managed) db.prepare('UPDATE topics SET managed=1 WHERE id=?').run(existing.id);
    return existing.id;
  }
  const id = randomUUID(), now = new Date().toISOString();
  db.prepare('INSERT INTO topics(id,name,name_key,description,managed,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id, name, key, '', +managed, now, now);
  return id;
}
export function topicNames(db, postId) {
  return db.prepare('SELECT t.name FROM topics t JOIN post_topics m ON t.id=m.topic_id WHERE m.post_id=? ORDER BY t.name_key').all(postId).map(t => t.name);
}
export function writeTopicNames(db, postId, names, curated = false) {
  const ids = [...new Set(names.slice(0, 50).map(name => ensureTopic(db, name)))];
  db.prepare('DELETE FROM post_topics WHERE post_id=?').run(postId);
  for (const id of ids) db.prepare('INSERT INTO post_topics VALUES(?,?)').run(postId, id);
  db.prepare('UPDATE posts SET topics=?,topics_curated=? WHERE id=?').run(JSON.stringify(topicNames(db, postId)), +curated, postId);
}
export function initializeTopics(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,description TEXT NOT NULL DEFAULT '',managed INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS topic_aliases (name_key TEXT PRIMARY KEY,topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS post_topics (post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,PRIMARY KEY(post_id,topic_id));
    CREATE INDEX IF NOT EXISTS post_topics_topic ON post_topics(topic_id);
    CREATE TABLE IF NOT EXISTS mcp_changes (id TEXT PRIMARY KEY,action TEXT NOT NULL,created_at TEXT NOT NULL,changes TEXT NOT NULL,undone INTEGER NOT NULL DEFAULT 0);`);
  if (!db.prepare('PRAGMA table_info(posts)').all().some(c => c.name === 'topics_curated')) db.exec('ALTER TABLE posts ADD COLUMN topics_curated INTEGER NOT NULL DEFAULT 0');
  // Folders nest one level. The hierarchy only organizes topics: a post keeps
  // exactly the memberships it was given, never its parent's implicitly.
  if (!db.prepare('PRAGMA table_info(topics)').all().some(c => c.name === 'parent_id')) db.exec('ALTER TABLE topics ADD COLUMN parent_id TEXT REFERENCES topics(id) ON DELETE SET NULL');
  // A user-arranged order; topics never arranged follow alphabetically.
  if (!db.prepare('PRAGMA table_info(topics)').all().some(c => c.name === 'position')) db.exec('ALTER TABLE topics ADD COLUMN position INTEGER');
  if (!db.prepare("SELECT value FROM settings WHERE key='topics_v1'").get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of db.prepare('SELECT id,topics FROM posts').all()) writeTopicNames(db, row.id, JSON.parse(row.topics));
      db.prepare("INSERT INTO settings(key,value) VALUES('topics_v1','1')").run(); db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}
export function topicCatalog(db, { all = false, hidden = [] } = {}) {
  return db.prepare(`SELECT t.id,t.name,t.description,t.managed,t.parent_id AS parentId,t.created_at AS createdAt,t.updated_at AS updatedAt,
    COUNT(CASE WHEN p.archived=0 AND p.id NOT IN (SELECT value FROM json_each(?)) THEN 1 END) AS count FROM topics t
    LEFT JOIN post_topics m ON m.topic_id=t.id LEFT JOIN posts p ON p.id=m.post_id
    GROUP BY t.id ${all ? '' : 'HAVING count>0 OR t.managed=1 OR EXISTS(SELECT 1 FROM topics c WHERE c.parent_id=t.id)'} ORDER BY t.position IS NULL, t.position, t.name_key`).all(JSON.stringify(hidden)).map(({ managed, ...t }) => all ? { ...t, managed: !!managed, parent: t.parentId ? db.prepare('SELECT name FROM topics WHERE id=?').get(t.parentId)?.name : undefined, aliases: db.prepare('SELECT name_key FROM topic_aliases WHERE topic_id=?').all(t.id).map(a => a.name_key) } : t);
}
export function importTopicCatalog(db, inputs) {
  if (!Array.isArray(inputs) || inputs.length > 2000) throw new HttpError(400, 'Import up to 2,000 topics at a time.');
  const clean = inputs.map(t => {
    if (!t || typeof t.description !== 'string' || t.description.length > 2000 || (t.aliases !== undefined && (!Array.isArray(t.aliases) || t.aliases.length > 200))) throw new HttpError(400, 'Invalid topic metadata.');
    return { name: cleanTopicName(t.name), description: t.description, managed: t.managed !== false, aliases: (t.aliases || []).map(cleanTopicName), parent: typeof t.parent === 'string' && t.parent.trim() ? cleanTopicName(t.parent) : '' };
  });
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const t of clean) {
      const id = ensureTopic(db, t.name, t.managed);
      // Importing a backup does not overwrite a newer local topic description.
      db.prepare("UPDATE topics SET description=CASE WHEN description='' THEN ? ELSE description END WHERE id=?").run(t.description,id);
      for (const alias of t.aliases) if (!db.prepare('SELECT 1 FROM topics WHERE name_key=? UNION SELECT 1 FROM topic_aliases WHERE name_key=?').get(topicKey(alias),topicKey(alias))) db.prepare('INSERT INTO topic_aliases VALUES(?,?)').run(topicKey(alias),id);
    }
    // A local parent choice wins; invalid or deeper nesting from a backup is ignored.
    for (const t of clean.filter(t => t.parent)) {
      const child = db.prepare('SELECT * FROM topics WHERE name_key=?').get(topicKey(t.name)), parent = db.prepare('SELECT * FROM topics WHERE name_key=?').get(topicKey(t.parent));
      if (child && parent && !child.parent_id && child.id !== parent.id && !parent.parent_id && !db.prepare('SELECT 1 FROM topics WHERE parent_id=?').get(child.id)) db.prepare('UPDATE topics SET parent_id=? WHERE id=?').run(parent.id, child.id);
    }
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}
// Snapshot only organization fields. Source content, sessions and sync credentials never enter the journal.
function snapshot(db, noteIds) {
  const map = new Map();
  for (const t of db.prepare('SELECT * FROM topics ORDER BY id').all()) map.set(`topic:${t.id}`, t);
  for (const a of db.prepare('SELECT * FROM topic_aliases ORDER BY name_key').all()) map.set(`alias:${a.name_key}`, a);
  const memberships = new Map();
  for (const m of db.prepare('SELECT post_id,topic_id FROM post_topics ORDER BY post_id,topic_id').all()) {
    if (!memberships.has(m.post_id)) memberships.set(m.post_id, []);
    memberships.get(m.post_id).push(m.topic_id);
  }
  for (const p of db.prepare('SELECT id,topics_curated FROM posts ORDER BY id').all()) {
    const value = { id: p.id, curated: p.topics_curated, topics: memberships.get(p.id) || [] };
    if (noteIds.includes(p.id)) value.notes = db.prepare('SELECT notes FROM posts WHERE id=?').get(p.id).notes;
    map.set(`post:${p.id}`, value);
  }
  return map;
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export class TopicLibrary {
  // hidden lists saves this reader may not see, beyond the archive. The library UI has none.
  constructor(store, { hidden = () => [] } = {}) { this.store = store; this.db = store.db; this.hidden = hidden; }
  catalog() { return topicCatalog(this.db, { hidden: this.hidden() }); }
  requireTopic(id) {
    const t = this.catalog().find(t => t.id === id);
    if (!t) throw new HttpError(404, 'Topic not found in the accessible library.');
    return t;
  }
  requirePosts(ids) {
    const unique = [...new Set(ids)];
    if (!unique.length || unique.length > 200) throw new HttpError(400, 'Choose between 1 and 200 saves.');
    const posts = unique.map(id => this.store.post(id)), hidden = new Set(this.hidden());
    if (posts.some(p => !p || p.archived || hidden.has(p.id))) throw new HttpError(404, 'One or more saves are unavailable. Archived saves are excluded.');
    return posts;
  }
  touchPosts(ids) {
    for (const id of new Set(ids)) {
      const row = this.db.prepare('SELECT updated_at FROM posts WHERE id=? AND archived=0').get(id);
      if (row) this.db.prepare('UPDATE posts SET updated_at=? WHERE id=?').run(updatedTime(row.updated_at),id);
    }
  }
  change(action, apply, noteIds = []) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const before = snapshot(this.db, noteIds), result = apply(), after = snapshot(this.db, noteIds);
      const changes = [...new Set([...before.keys(), ...after.keys()])].filter(k => !equal(before.get(k), after.get(k))).map(key => ({ key, before: before.get(key) ?? null, after: after.get(key) ?? null }));
      const changeId = changes.length ? randomUUID() : null;
      if (changeId) {
        this.db.prepare('INSERT INTO mcp_changes(id,action,created_at,changes) VALUES(?,?,?,?)').run(changeId, action, new Date().toISOString(), JSON.stringify(changes));
        this.db.exec('DELETE FROM mcp_changes WHERE id NOT IN (SELECT id FROM mcp_changes ORDER BY created_at DESC,rowid DESC LIMIT 100)');
      }
      this.db.exec('COMMIT'); return { ...result, changeId };
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  create({ name, description = '' }) {
    name = cleanTopicName(name);
    return this.change('create_topic', () => {
      if (this.db.prepare('SELECT 1 FROM topics WHERE name_key=? UNION SELECT 1 FROM topic_aliases WHERE name_key=?').get(topicKey(name), topicKey(name))) throw new HttpError(409, 'This topic name or a previous name is already in use.');
      const id = ensureTopic(this.db, name, true);
      this.db.prepare('UPDATE topics SET description=? WHERE id=?').run(description, id);
      return { topic: this.requireTopic(id) };
    });
  }
  update({ topicId, name, description }) {
    const topic = this.requireTopic(topicId); name = name === undefined ? topic.name : cleanTopicName(name);
    return this.change('update_topic', () => {
      const collision = this.db.prepare('SELECT id FROM topics WHERE name_key=? UNION SELECT topic_id AS id FROM topic_aliases WHERE name_key=?').all(topicKey(name), topicKey(name));
      if (collision.some(t => t.id !== topicId)) throw new HttpError(409, 'This topic name is already in use. Merge the topics instead.');
      if (topicKey(topic.name) !== topicKey(name)) this.db.prepare('INSERT OR REPLACE INTO topic_aliases VALUES(?,?)').run(topicKey(topic.name), topicId);
      this.db.prepare('UPDATE topics SET name=?,name_key=?,description=?,managed=1,updated_at=? WHERE id=?').run(name, topicKey(name), description ?? topic.description, updatedTime(topic.updatedAt), topicId);
      if (name !== topic.name) this.touchPosts(this.db.prepare('SELECT post_id FROM post_topics WHERE topic_id=?').all(topicId).map(p => p.post_id));
      return { topic: this.requireTopic(topicId) };
    });
  }
  move({ topicId, parentId = null }) {
    const topic = this.requireTopic(topicId), parent = parentId === null ? null : this.requireTopic(parentId);
    if (parent) {
      if (parent.id === topic.id) throw new HttpError(400, 'A folder cannot contain itself.');
      if (parent.parentId) throw new HttpError(400, 'Subfolders cannot contain other folders.');
      if (this.catalog().some(t => t.parentId === topic.id)) throw new HttpError(400, 'Move this folder’s subfolders out before nesting it.');
    }
    return this.change('move_topic', () => {
      this.db.prepare('UPDATE topics SET parent_id=?,managed=1,updated_at=? WHERE id=?').run(parent?.id ?? null, updatedTime(topic.updatedAt), topicId);
      return { topic: this.requireTopic(topicId) };
    });
  }
  // Places folders in the given order and nesting in one undoable change.
  arrange({ layout }) {
    if (!Array.isArray(layout) || !layout.length || layout.length > 2000) throw new HttpError(400, 'Send the folder order to save.');
    const catalog = new Map(this.catalog().map(t => [t.id, t])), placed = new Map();
    for (const item of layout) {
      if (!item || !catalog.has(item.id) || placed.has(item.id) || (item.parentId !== null && typeof item.parentId !== 'string')) throw new HttpError(400, 'Invalid folder order.');
      placed.set(item.id, item.parentId);
    }
    for (const [id, parentId] of placed) {
      const parent = parentId === null ? null : placed.has(parentId) ? placed.get(parentId) : catalog.get(parentId)?.parentId;
      if (parentId !== null && (!catalog.has(parentId) || parentId === id || parent !== null)) throw new HttpError(400, 'Subfolders cannot contain other folders.');
      if (parentId !== null && [...placed].some(([, p]) => p === id)) throw new HttpError(400, 'Move this folder’s subfolders out before nesting it.');
    }
    return this.change('arrange_topics', () => {
      layout.forEach((item, position) => this.db.prepare('UPDATE topics SET parent_id=?,position=?,managed=1 WHERE id=?').run(item.parentId, position, item.id));
      return { arranged: layout.length };
    });
  }
  assign({ postIds, topicIds, mode = 'add' }) {
    this.requirePosts(postIds); for (const id of topicIds) this.requireTopic(id);
    return this.change(`${mode}_topics`, () => {
      for (const postId of new Set(postIds)) {
        if (mode === 'replace') this.db.prepare('DELETE FROM post_topics WHERE post_id=?').run(postId);
        for (const topicId of new Set(topicIds)) this.db.prepare(mode === 'remove' ? 'DELETE FROM post_topics WHERE post_id=? AND topic_id=?' : 'INSERT OR IGNORE INTO post_topics VALUES(?,?)').run(postId, topicId);
        this.db.prepare('UPDATE posts SET topics_curated=1,topics=?,updated_at=? WHERE id=?').run(JSON.stringify(topicNames(this.db, postId)), updatedTime(this.db.prepare('SELECT updated_at FROM posts WHERE id=?').get(postId).updated_at), postId);
      }
      return { updated: new Set(postIds).size };
    });
  }
  addToCollection({ postId, topicId, name }, { allowArchived = false } = {}) {
    const post = this.store.post(postId);
    if (!post || (post.archived && !allowArchived)) throw new HttpError(404, 'Save not found.');
    if ((topicId === undefined) === (name === undefined)) throw new HttpError(400, 'Choose a collection or give a new collection a name.');
    if (topicId !== undefined) this.requireTopic(topicId);
    if (name !== undefined) name = cleanTopicName(name);
    return this.change('add_collection', () => {
      const id = topicId ?? ensureTopic(this.db, name, true);
      this.db.prepare('UPDATE topics SET managed=1 WHERE id=?').run(id);
      this.db.prepare('INSERT OR IGNORE INTO post_topics VALUES(?,?)').run(postId, id);
      this.db.prepare('UPDATE posts SET topics_curated=1,topics=?,updated_at=? WHERE id=?').run(JSON.stringify(topicNames(this.db, postId)), updatedTime(post.updatedAt), postId);
      return { post: this.store.post(postId), topic: this.requireTopic(id) };
    });
  }
  removeFromCollection({ postId, topicId }) {
    const post = this.store.post(postId);
    if (!post) throw new HttpError(404, 'Save not found.');
    this.requireTopic(topicId);
    return this.change('remove_collection', () => {
      this.db.prepare('DELETE FROM post_topics WHERE post_id=? AND topic_id=?').run(postId, topicId);
      this.db.prepare('UPDATE posts SET topics_curated=1,topics=?,updated_at=? WHERE id=?').run(JSON.stringify(topicNames(this.db, postId)), updatedTime(post.updatedAt), postId);
      return { post: this.store.post(postId) };
    });
  }
  merge({ sourceIds, targetId }) {
    this.requireTopic(targetId); for (const id of sourceIds) { this.requireTopic(id); if (id === targetId) throw new HttpError(400, 'The target cannot also be a source.'); }
    return this.change('merge_topics', () => {
      const affected = new Set();
      for (const sourceId of new Set(sourceIds)) {
        const source = this.db.prepare('SELECT * FROM topics WHERE id=?').get(sourceId);
        for (const p of this.db.prepare('SELECT p.id FROM post_topics m JOIN posts p ON p.id=m.post_id WHERE m.topic_id=? AND p.archived=0').all(sourceId)) affected.add(p.id);
        this.db.prepare('INSERT OR IGNORE INTO post_topics SELECT post_id,? FROM post_topics WHERE topic_id=?').run(targetId, sourceId);
        this.db.prepare('UPDATE topic_aliases SET topic_id=? WHERE topic_id=?').run(targetId, sourceId);
        this.db.prepare('INSERT OR REPLACE INTO topic_aliases VALUES(?,?)').run(source.name_key, targetId);
        this.db.prepare('DELETE FROM topics WHERE id=?').run(sourceId);
      }
      this.db.prepare('UPDATE topics SET managed=1,updated_at=? WHERE id=?').run(new Date().toISOString(), targetId);
      this.touchPosts([...affected]);
      return { topic: this.requireTopic(targetId), updated: affected.size };
    });
  }
  delete({ topicId }, { removeMemberships = false } = {}) {
    this.requireTopic(topicId);
    return this.change('delete_topic', () => {
      // Only the library UI's confirmed deletion detaches memberships, including archive.
      // MCP retains its empty-topic-only contract and cannot inspect archived saves.
      const affected = this.db.prepare('SELECT post_id FROM post_topics WHERE topic_id=?').all(topicId);
      if (!removeMemberships && affected.length) throw new HttpError(409, 'This topic still has memberships. Remove its accessible memberships or merge it into another topic.');
      this.db.prepare('DELETE FROM topics WHERE id=?').run(topicId);
      for (const { post_id: id } of affected) {
        const post = this.db.prepare('SELECT updated_at FROM posts WHERE id=?').get(id);
        this.db.prepare('UPDATE posts SET topics=?,topics_curated=1,updated_at=? WHERE id=?').run(JSON.stringify(topicNames(this.db, id)), updatedTime(post.updated_at), id);
      }
      return { deleted: topicId };
    });
  }
  notes({ postId, notes, expectedUpdatedAt }) {
    const [p] = this.requirePosts([postId]);
    if (expectedUpdatedAt !== p.updatedAt) throw new HttpError(409, 'This save changed. Read it again before replacing its note.');
    return this.change('update_note', () => ({ save: this.store.updatePost(postId, { notes }) }), [postId]);
  }
  accessibleChanges() {
    const hidden = new Set(this.hidden());
    return this.db.prepare('SELECT * FROM mcp_changes ORDER BY created_at DESC,rowid DESC LIMIT 100').all().filter(row => {
      return JSON.parse(row.changes).filter(c => c.key.startsWith('post:')).every(c => !hidden.has(Number(c.key.slice(5))) && this.db.prepare('SELECT 1 FROM posts WHERE id=? AND archived=0').get(Number(c.key.slice(5))));
    });
  }
  history(limit = 20) { return this.accessibleChanges().slice(0, limit).map(({ id, action, created_at, undone }) => ({ id, action, createdAt: created_at, undone: !!undone })); }
  undo(id) {
    const row = this.accessibleChanges().find(r => r.id === id && !r.undone);
    if (!row) throw new HttpError(404, 'Change unavailable or already undone.');
    const changes = JSON.parse(row.changes), noteIds = changes.filter(c => c.key.startsWith('post:') && c.after?.notes !== undefined).map(c => c.after.id);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = snapshot(this.db, noteIds);
      if (changes.some(c => !equal(current.get(c.key) ?? null, c.after))) throw new HttpError(409, 'These fields changed again. Undo newer changes first.');
      // Restore catalog before memberships; delete newly-created topics last.
      const restored = changes.filter(c => c.key.startsWith('topic:') && c.before);
      for (const c of restored) {
        const t = c.before;
        this.db.prepare('INSERT INTO topics(id,name,name_key,description,managed,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_key=excluded.name_key,description=excluded.description,managed=excluded.managed,updated_at=excluded.updated_at').run(t.id,t.name,t.name_key,t.description,t.managed,t.created_at,t.updated_at);
      }
      for (const c of restored) this.db.prepare('UPDATE topics SET parent_id=?,position=? WHERE id=?').run(c.before.parent_id ?? null, c.before.position ?? null, c.before.id);
      for (const c of changes.filter(c => c.key.startsWith('post:'))) {
        const p = c.before;
        this.db.prepare('DELETE FROM post_topics WHERE post_id=?').run(p.id);
        for (const t of p.topics) this.db.prepare('INSERT INTO post_topics VALUES(?,?)').run(p.id,t);
        this.db.prepare('UPDATE posts SET topics_curated=?,topics=?,updated_at=? WHERE id=?').run(p.curated,JSON.stringify(topicNames(this.db,p.id)),updatedTime(this.db.prepare('SELECT updated_at FROM posts WHERE id=?').get(p.id).updated_at),p.id);
        if (p.notes !== undefined) this.db.prepare('UPDATE posts SET notes=? WHERE id=?').run(p.notes,p.id);
      }
      for (const c of changes.filter(c => c.key.startsWith('alias:'))) {
        if (c.before) this.db.prepare('INSERT OR REPLACE INTO topic_aliases VALUES(?,?)').run(c.before.name_key,c.before.topic_id);
        else this.db.prepare('DELETE FROM topic_aliases WHERE name_key=?').run(c.key.slice(6));
      }
      for (const c of changes.filter(c => c.key.startsWith('topic:') && !c.before)) {
        if (this.db.prepare('SELECT 1 FROM post_topics WHERE topic_id=? LIMIT 1').get(c.after.id)) throw new HttpError(409, 'This topic has newer memberships. Remove those before undoing its creation.');
        this.db.prepare('DELETE FROM topics WHERE id=?').run(c.after.id);
      }
      const topicChanges = changes.filter(c => c.key.startsWith('topic:'));
      for (const c of topicChanges) this.touchPosts(this.db.prepare('SELECT post_id FROM post_topics WHERE topic_id=?').all(c.before?.id || c.after.id).map(p => p.post_id));
      this.db.prepare('UPDATE mcp_changes SET undone=1 WHERE id=?').run(id); this.db.exec('COMMIT'); return { undone: id };
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
