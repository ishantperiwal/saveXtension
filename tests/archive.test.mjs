import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';

test('archive excludes saves from default reads, survives sync and backup, and restores their original metadata', async () => {
  const app = createApp({ origin: 'http://localhost:3232' });
  app.server.listen(3232, '127.0.0.1'); await once(app.server, 'listening');
  async function request(path, method = 'GET', body) {
    const response = await fetch(`http://localhost:3232/api${path}`, { method, headers: { Origin: 'http://localhost:3232', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }
  try {
    const input = { platform: 'chrome', url: 'https://archive.example/reference', bookmarkTitle: 'A useful reference', folders: ['Bookmarks bar / Design'], notes: 'Keep this context', savedAt: '2025-05-01T00:00:00Z' };
    await request('/posts/import', 'POST', { posts: [input, { url: 'https://x.com/i/status/101' }] });
    const original = app.store.posts().find(p => p.platform === 'chrome');
    await request(`/posts/${original.id}`, 'PATCH', { archived: true });
    assert.equal(app.store.posts().length, 1);
    assert.deepEqual((await request('/posts')).data.posts.map(p => p.platform), ['x']);
    assert.equal((await request('/posts?scope=archive')).data.posts[0].id, original.id);
    assert.equal((await request('/posts?scope=all')).data.posts.length, 2);
    assert.equal((await request('/posts?scope=invalid')).status, 400);
    await request('/posts/import', 'POST', { posts: [{ ...input, bookmarkTitle: 'Updated in Chrome', notes: '', archived: false }] });
    assert.equal((await request('/posts')).data.posts.length, 1);
    const archived = (await request('/posts?scope=archive')).data.posts[0];
    assert.equal(archived.archived, true); assert.equal(archived.notes, original.notes);
    assert.equal(archived.bookmarkTitle, 'Updated in Chrome');
    const backup = (await request('/export')).data;
    assert.equal(backup.posts.length, 2); assert(backup.posts.some(p => p.archived));
    await request(`/posts/${original.id}`, 'PATCH', { archived: false });
    const restored = (await request('/posts')).data.posts.find(p => p.id === original.id);
    assert.equal(restored.savedAt, original.savedAt); assert.equal(restored.notes, original.notes);
    assert.deepEqual(restored.folders, original.folders); assert.deepEqual(restored.topics, original.topics);
    assert.equal((await request('/posts?scope=archive')).data.posts.length, 0);
  } finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); }
});
