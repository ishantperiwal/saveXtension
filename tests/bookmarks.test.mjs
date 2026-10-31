import test from 'node:test';
import assert from 'node:assert/strict';
import { bookmarkPosts } from '../extension/bookmarks.js';
import { canonicalBookmark } from '../server/domain.mjs';
import { Store } from '../server/store.mjs';
import { syncQueue } from '../server/sync.mjs';
import { syncAvailability } from '../public/sync-state.js';

test('bookmark trees retain folder paths and dates, merge duplicate URLs and skip executable links', () => {
  const result = bookmarkPosts([{ title: '', children: [
    { title: 'Bookmarks bar', children: [{ title: 'Design', children: [{ url: 'https://example.com/guide?q=one#intro', title: 'Design guide', dateAdded: 1700000000000 }, { url: 'javascript:alert(1)', title: 'Bookmarklet' }] }] },
    { title: 'Other bookmarks', children: [{ url: 'https://example.com/guide?q=one#intro', title: 'Again', dateAdded: 1600000000000 }, { url: 'chrome://settings/' }, { url: 'https://user:password@example.com/' }] }
  ] }]);
  assert.equal(result.skipped, 3); assert.equal(result.posts.length, 1);
  assert.deepEqual(result.posts[0].folders, ['Bookmarks bar / Design', 'Other bookmarks']);
  assert.equal(result.posts[0].savedAt, new Date(1600000000000).toISOString());
  assert.equal(result.posts[0].bookmarkTitle, 'Design guide');
  assert.notEqual(canonicalBookmark('https://example.com/?page=1').externalId, canonicalBookmark('https://example.com/?page=2').externalId);
  assert.throws(() => canonicalBookmark('file:///private/test'));
});

test('Chrome refreshes folder/title metadata while preserving user annotations and backup identity', () => {
  const store = new Store(':memory:'); const restored = new Store(':memory:');
  try {
    const post = { platform: 'chrome', url: 'https://example.com/design', bookmarkTitle: 'Old title', folders: ['Bookmarks bar / Old'], savedAt: '2020-01-01' };
    assert.equal(store.importPosts([post]).imported, 1);
    store.updatePost(store.posts()[0].id, { title: 'My own title', notes: 'Keep this context', favorite: true });
    assert.equal(store.importPosts([{ ...post, bookmarkTitle: 'Renamed in Chrome', folders: ['Bookmarks bar / New'] }]).updated, 1);
    const saved = store.posts()[0];
    assert.equal(saved.title, 'My own title'); assert.equal(saved.bookmarkTitle, 'Renamed in Chrome'); assert.equal(saved.notes, 'Keep this context'); assert.equal(saved.favorite, true);
    assert.deepEqual(saved.folders, ['Bookmarks bar / New']);
    restored.importPosts(store.posts()); assert.equal(restored.posts()[0].externalId, saved.externalId); assert.deepEqual(restored.posts()[0].folders, saved.folders);
  } finally { store.close(); restored.close(); }
});

test('Chrome sync needs its own permission and capability, without requiring social access', () => {
  assert.equal(syncAvailability({ online: true, ready: true, bookmarksReady: false }, null, ['chrome']), 'permissions');
  assert.equal(syncAvailability({ online: true, ready: false, bookmarksReady: true }, null, ['chrome']), 'ready');
  assert.equal(syncAvailability({ online: true, ready: false, bookmarksReady: true }, null, ['chrome', 'x']), 'permissions');
  const store = new Store(':memory:');
  try {
    const queue = syncQueue(store); queue.enqueue(['chrome']);
    assert.equal(queue.claim('old-helper', true), null);
    assert.equal(queue.claim('new-helper', true, { bookmarksSupported: true, bookmarksReady: false }), null);
    assert.equal(queue.claim('new-helper', true, { bookmarksSupported: true, bookmarksReady: true, socialReady: false }).status, 'running');
    queue.requestSetup('chrome'); assert.equal(queue.takeSetup('new-helper'), false); assert.equal(queue.takeSetup('new-helper', 'chrome'), true);
  } finally { store.close(); }
});
