import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { exportBackup, importBackup } from '../server/backup.mjs';
import { topicNames, writeTopicNames } from '../server/topics.mjs';

const ACCOUNT = { id: '41ab4ccf-9296-48ea-9c37-aa71449dfbb3', platform: 'instagram', handle: '@me', name: '', status: 'connected' };
function library() {
  const dir = mkdtempSync(join(tmpdir(), 'savex-backup-'));
  const app = createApp({ dataPath: join(dir, 'library.sqlite'), imagesDir: join(dir, 'images') });
  const dirs = { imagesDir: join(dir, 'images'), documentImagesDir: join(dir, 'document-images'), documentFontsDir: join(dir, 'document-fonts') };
  return { app, store: app.store, db: app.store.db, dir, dirs, close() { app.images.close(); app.store.db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
const post = (code, extra = {}) => ({ platform: 'instagram', url: `https://www.instagram.com/p/${code}/`, text: `Post ${code}`, author: 'someone', thumbnail: 'https://scontent.cdninstagram.com/a.jpg', sourceAccount: '@me', ...extra });
const byCode = (db, code) => db.prepare("SELECT * FROM posts WHERE platform='instagram' AND external_id=?").get(code);
async function backupOf(source) {
  const file = await exportBackup({ store: source.store, ...source.dirs });
  const bytes = await readFile(file); await rm(file, { force: true });
  return bytes;
}

function fill(source) {
  source.store.importPosts([post('One'), post('Two')]);
  const one = byCode(source.db, 'One');
  source.db.prepare("UPDATE posts SET notes='my note', image_description='a chart' WHERE id=?").run(one.id);
  writeTopicNames(source.db, one.id, ['Design'], true);
  source.db.prepare("INSERT INTO documents (id, title, body, created_at, updated_at) VALUES ('doc-1', 'Fonts', '# Fonts', '2026-11-01', '2026-11-01')").run();
  // A collection, which posts are in it, which collections the account shows, and its site order.
  const collection = Number(source.db.prepare("INSERT INTO instagram_collections (account, external_id, name, url, updated_at, platform) VALUES ('@me', '1790', 'Type', 'https://www.instagram.com/me/saved/type/1790/', '2026-11-01', 'instagram')").run().lastInsertRowid);
  source.db.prepare('INSERT INTO instagram_collection_posts VALUES (?,?)').run(collection, one.id);
  source.store.set('instagram_save_lists', JSON.stringify({ '@me': [collection] }));
  source.store.set(`list-order:instagram:@me:${collection}`, JSON.stringify(['One']));
  source.store.set('desktop_social_accounts', JSON.stringify([ACCOUNT]));
  source.store.set('mcp_enabled', 'true');
  // A saved cover image and a document font, as files.
  mkdirSync(source.dirs.imagesDir, { recursive: true }); writeFileSync(join(source.dirs.imagesDir, `${one.id}.jpg`), 'jpeg bytes');
  source.db.prepare("INSERT INTO post_images (post_id, link, file, type, attempted_at) VALUES (?, 'https://scontent.cdninstagram.com/a.jpg', ?, 'image/jpeg', 1)").run(one.id, `${one.id}.jpg`);
  mkdirSync(source.dirs.documentFontsDir, { recursive: true }); writeFileSync(join(source.dirs.documentFontsDir, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.woff2'), 'font bytes');
  writeFileSync(join(source.dirs.documentFontsDir, 'fonts.json'), JSON.stringify([{ family: 'Satoshi', file: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.woff2', source: 'x', addedAt: '2026-11-01' }]));
}

test('a backup carries the whole library into an empty one, accounts waiting for sign-in, and importing again changes nothing', async () => {
  const source = library(), target = library();
  try {
    fill(source);
    const bytes = await backupOf(source);
    const summary = await importBackup({ store: target.store, bytes, ...target.dirs });
    assert.deepEqual({ ...summary, accounts: summary.accounts.length }, { added: 2, merged: 0, documents: 1, images: 1, accounts: 1 });
    const one = byCode(target.db, 'One');
    assert.equal(one.notes, 'my note'); assert.equal(one.image_description, 'a chart');
    assert.deepEqual(topicNames(target.db, one.id), ['Design']);
    assert.equal(target.db.prepare('SELECT title FROM documents WHERE id=?').get('doc-1').title, 'Fonts');
    // Collection numbers are this library's own, so the choices and site order follow the collection.
    const collection = target.db.prepare("SELECT id FROM instagram_collections WHERE external_id='1790'").get().id;
    assert.ok(target.db.prepare('SELECT 1 FROM instagram_collection_posts WHERE collection_id=? AND post_id=?').get(collection, one.id));
    assert.deepEqual(JSON.parse(target.store.get('instagram_save_lists')), { '@me': [collection] });
    assert.deepEqual(JSON.parse(target.store.get(`list-order:instagram:@me:${collection}`)), ['One']);
    // The picture is renamed after the post's number here.
    const image = target.db.prepare('SELECT file FROM post_images WHERE post_id=?').get(one.id).file;
    assert.equal(readFileSync(join(target.dirs.imagesDir, image), 'utf8'), 'jpeg bytes');
    assert.equal(JSON.parse(readFileSync(join(target.dirs.documentFontsDir, 'fonts.json'), 'utf8'))[0].family, 'Satoshi');
    // Sign-ins stay behind: the account arrives needing one, and MCP access isn't switched on.
    assert.deepEqual(JSON.parse(target.store.get('desktop_social_accounts')), [{ ...ACCOUNT, status: 'needs-login' }]);
    assert.equal(target.store.get('mcp_enabled'), undefined);
    const again = await importBackup({ store: target.store, bytes, ...target.dirs });
    assert.deepEqual({ ...again, accounts: again.accounts.length }, { added: 0, merged: 0, documents: 0, images: 0, accounts: 0 });
  } finally { source.close(); target.close(); }
});

test('importing into a library that has some of the saves keeps its own notes and fills what it lacks', async () => {
  const source = library(), target = library();
  try {
    fill(source);
    target.store.importPosts([post('One', { text: '' }), post('Two')]);
    target.db.prepare("UPDATE posts SET notes='newer note' WHERE external_id='Two'").run();
    target.store.set('desktop_social_accounts', JSON.stringify([{ ...ACCOUNT, id: '99999999-9296-48ea-9c37-aa71449dfbb3' }]));
    const summary = await importBackup({ store: target.store, bytes: await backupOf(source), ...target.dirs });
    assert.equal(summary.added, 0);
    assert.equal(byCode(target.db, 'One').notes, 'my note', 'an empty note is filled');
    assert.equal(byCode(target.db, 'Two').notes, 'newer note', 'a note already here is kept');
    // The same handle, already connected here, isn't added twice.
    assert.equal(JSON.parse(target.store.get('desktop_social_accounts')).length, 1);
    assert.deepEqual(summary.accounts, []);
  } finally { source.close(); target.close(); }
});

test('a plain copy of the library file imports too, and anything else is refused', async () => {
  const source = library(), target = library();
  try {
    fill(source);
    source.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const summary = await importBackup({ store: target.store, bytes: readFileSync(join(source.dir, 'library.sqlite')), ...target.dirs });
    assert.equal(summary.added, 2); assert.equal(summary.images, 0, 'pictures download again from their links');
    await assert.rejects(importBackup({ store: target.store, bytes: Buffer.from('not a database'), ...target.dirs }), /isn’t a saveXtension backup/);
    assert.ok(!existsSync(join(target.dirs.imagesDir, 'missing')));
  } finally { source.close(); target.close(); }
});
