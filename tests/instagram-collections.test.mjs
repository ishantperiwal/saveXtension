import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { cleanInstagramCollection } from '../server/domain.mjs';
import { syncQueue } from '../server/sync.mjs';
import { applyFilters, defaultFilters } from '../public/filters.js';

const folder = (id, name, account = 'me') => ({ externalId: id, name, url: `https://www.instagram.com/${account}/saved/folder/${id}/` });

test('Instagram discovers named collection links, preserves emoji, and excludes built-ins and other accounts', async () => {
  const dom = new JSDOM(`<main>
    <a href="/me/saved/all-posts/">All Posts</a><a href="/me/saved/audio/">Audio</a>
    <a href="/me/saved/design/123/" aria-label="Design notes">Image</a>
    <a href="https://www.instagram.com/me/saved/_/456/" aria-label="❤️">Heart</a>
    <a href="/me/saved/design/123/">Duplicate</a><a href="/other/saved/no/789/">Other account</a>
    <a href="https://evil.example/me/saved/no/999/">Other site</a><a href="/p/Abc/">Post</a>
  </main>`, { url: 'https://www.instagram.com/me/saved/', runScripts: 'outside-only' });
  dom.window.eval(await readFile(new URL('../extension/extractors.js', import.meta.url), 'utf8'));
  const result = dom.window.SaveXExtractors.instagramCollections(dom.window.document, dom.window.location);
  assert.equal(result.ready, true); assert.equal(result.account, '@me');
  assert.deepEqual(Array.from(result.collections, c => c.externalId), ['123', '456']);
  assert.equal(result.collections[0].name, 'Design notes'); assert.equal(result.collections[1].name, '❤️');
  assert.equal(dom.window.SaveXExtractors.pageInfo(dom.window.document, new URL('https://www.instagram.com/me/saved/all-posts/')).collection, false);
  assert.equal(dom.window.SaveXExtractors.pageInfo(dom.window.document, new URL('https://www.instagram.com/me/saved/design/123/')).collectionId, '123');
  dom.window.close();
});

test('collection identities validate host, account and IDs and survive renames', () => {
  assert.equal(cleanInstagramCollection('@me', folder('123', 'Design')).externalId, '123');
  for (const value of [folder('123', ''), folder('123', 'Other', 'other'), { ...folder('123', 'No'), url: 'https://evil.example/me/saved/x/123/' }, { ...folder('123', 'No'), externalId: '456' }]) assert.throws(() => cleanInstagramCollection('@me', value));
  const store = new Store(':memory:');
  try {
    const original = store.upsertInstagramCollections('@me', [folder('123', 'Design')])[0];
    const renamed = store.upsertInstagramCollections('@ME', [{ ...folder('123', 'New name'), url: 'https://www.instagram.com/me/saved/new-name/123/' }])[0];
    assert.equal(renamed.id, original.id); assert.equal(renamed.name, 'New name');
    store.upsertInstagramCollections('@me', []); assert.equal(store.instagramCollections().length, 1);
    assert.throws(() => store.upsertInstagramCollections(undefined, []));
  } finally { store.close(); }
});

test('existing posts acquire independent folder memberships without duplicates; archive and backups preserve them', () => {
  const store = new Store(':memory:'), restored = new Store(':memory:');
  try {
    const [a, b] = store.upsertInstagramCollections('@me', [folder('100', 'Design'), folder('200', 'Recipes')]);
    const post = { url: 'https://www.instagram.com/p/Shared/', sourceAccount: '@me', notes: 'Keep my note' };
    store.importPosts([post]);
    assert.deepEqual(store.knownPostIds('instagram', '@me'), ['Shared']);
    assert.deepEqual(store.knownPostIds('instagram', '@me', a.id), []);
    for (const collection of [a, b]) {
      const runId = store.startRun('local', 'instagram', '@me', 'quick', collection.id);
      store.importPosts([post]); store.recordDiscoveries(store.run(runId, 'local'), [post]);
    }
    assert.equal(store.posts().length, 1); assert.equal(store.posts()[0].collections.length, 2);
    assert.deepEqual(store.knownPostIds('instagram', '@me', a.id), ['Shared']);
    assert.deepEqual(store.knownPostIds('instagram', '@other', a.id), []);
    assert.throws(() => store.startRun('local', 'instagram', '@other', 'quick', a.id));
    assert.throws(() => store.startRun('local', 'x', '@me', 'quick', a.id));
    for (const collection of [a, b]) assert.equal(applyFilters(store.posts(), { ...defaultFilters(), collection: String(collection.id) }).length, 1);
    store.updatePost(store.posts()[0].id, { archived: true });
    assert.equal(store.instagramCollections()[0].count, 0);
    restored.importPosts(store.posts({ scope: 'all' }));
    const saved = restored.posts({ scope: 'all' })[0];
    assert.equal(saved.collections.length, 2); assert.equal(saved.notes, 'Keep my note'); assert.equal(saved.archived, true);
    store.deletePost(saved.id); assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM instagram_collection_posts').get().n, 0);
  } finally { store.close(); restored.close(); }
});

test('Instagram jobs require a collection-capable helper', () => {
  const store = new Store(':memory:');
  try {
    const queue = syncQueue(store); queue.enqueue(['instagram']);
    assert.equal(queue.claim('old-helper', true), null);
    assert.equal(queue.claim('new-helper', true, { instagramCollections: true }).status, 'running');
  } finally { store.close(); }
});

test('extension catalog and collection runs appear in library reads and isolate source accounts', async () => {
  const app = createApp({ origin: 'http://localhost:3236' });
  app.server.listen(3236, '127.0.0.1'); await once(app.server, 'listening');
  async function request(path, input) {
    const response = await fetch(`http://localhost:3236/api${path}`, { method: input === undefined ? 'GET' : 'POST', headers: { Origin: path.startsWith('/extension') ? 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' : 'http://localhost:3236', 'Content-Type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input) });
    return { status: response.status, data: await response.json() };
  }
  try {
    const collections = (await request('/extension/instagram-collections', { account: '@me', collections: [folder('100', 'Design')] })).data.collections;
    assert.equal((await request('/posts')).data.instagramCollections[0].name, 'Design');
    const collectionId = collections[0].id;
    assert.equal((await request('/extension/runs', { platform: 'instagram', account: '@other', collectionId })).status, 400);
    const run = (await request('/extension/runs', { platform: 'instagram', account: '@me', collectionId })).data;
    await request(`/extension/runs/${run.runId}`, { posts: [{ url: 'https://www.instagram.com/p/Shared/' }] });
    const result = (await request('/posts')).data;
    assert.equal(result.posts[0].collections[0].id, collectionId); assert.equal(result.instagramCollections[0].count, 1);
    assert.deepEqual((await request(`/extension/known?platform=instagram&account=@me&collectionId=${collectionId}`)).data.ids, ['Shared']);
    assert.equal((await request('/export')).data.posts[0].collections[0].name, 'Design');
  } finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); }
});
