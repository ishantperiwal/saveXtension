import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

test('local library has no authentication, queues one sync, claims once and cancels without losing saves', async () => {
  const app = createApp({ origin: 'http://localhost:3222' });
  app.store.set('password', 'existing-password-is-preserved');
  app.store.importPosts([{ url: 'https://x.com/a/status/123', title: 'Keep this', notes: 'Personal note' }]);
  app.server.listen(3222, '127.0.0.1'); await once(app.server, 'listening');
  async function req(path, input, origin = 'http://localhost:3222') {
    const res = await fetch(`http://127.0.0.1:3222/api${path}`, { method: input === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input) });
    return { status: res.status, data: await res.json() };
  }
  try {
    assert.equal((await req('/session')).data.authenticated, true);
    assert.equal((await req('/session')).data.setupRequired, false);
    const previewOrigin = (await req('/session')).data.embedOrigin;
    assert.equal((await req('/posts')).data.embedOrigin, previewOrigin);
    assert.notEqual(previewOrigin, 'http://localhost:3222');
    assert.equal((await fetch(`${previewOrigin}/api/posts`)).status, 404);
    const native = await fetch(`${previewOrigin}/embed/x/123`);
    assert.equal(native.status, 200);
    assert.match(native.headers.get('content-security-policy'), /frame-ancestors http:\/\/localhost:3222/);
    assert.equal(native.headers.get('access-control-allow-origin'), null);
    assert.equal((await req('/posts')).data.posts[0].notes, 'Personal note');
    assert.equal((await req('/library', { name: 'My inspiration' })).data.name, 'My inspiration');
    assert.equal((await req('/library', { name: 'Bad' }, 'https://evil.example')).status, 403);
    assert.equal((await req('/sync', { targets: ['invalid'] })).status, 400);
    const { data: { job } } = await req('/sync', { targets: ['x', 'instagram'] });
    assert.equal((await req('/sync', { targets: ['x'] })).data.job.id, job.id);
    const ext = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    assert.equal((await req('/extension/details?platform=x', undefined, ext)).data.posts.length, 1);
    const { data: run } = await req('/extension/runs', { platform: 'x', account: '' }, ext);
    await req(`/extension/runs/${run.runId}`, { posts: [{ url: 'https://x.com/a/status/123', text: 'A richer captured caption' }], details: true }, ext);
    assert.equal((await req('/extension/details?platform=x', undefined, ext)).data.posts.length, 0);
    await req(`/extension/runs/${run.runId}/finish`, { status: 'completed', message: 'Details refreshed' }, ext);
    const browser = { instance: 'test-browser', name: 'Chrome', ready: true, instagramCollections: true, claim: true };
    const claimed = (await req('/extension/jobs', browser, ext)).data;
    assert.equal(claimed.claimed.id, job.id);
    assert.equal((await req('/extension/jobs', { ...browser, instance: 'other' }, ext)).data.claimed, null);
    assert.equal((await req(`/extension/jobs/${job.id}`, { instance: 'other', status: 'completed' }, ext)).status, 404);
    assert.equal((await req(`/extension/jobs/${job.id}`, { instance: 'test-browser', message: '10 posts found' }, ext)).status, 200);
    assert.equal((await req('/sync/stop', {})).data.job.status, 'cancelled');
    assert.equal((await req(`/extension/jobs/${job.id}`, { instance: 'test-browser', status: 'completed' }, ext)).data.job.status, 'cancelled');
    assert.equal((await req('/export')).data.posts[0].title, 'Keep this');
    assert.equal(app.store.get('password'), 'existing-password-is-preserved');
    assert.notEqual((await req('/sync', { targets: ['x'] })).data.job.id, job.id);
  } finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); }
});

test('live-only previews discard the generated image cache and retain links and annotations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-live-only-'));
  const dataPath = join(dir, 'library.sqlite');
  const old = new Store(dataPath);
  old.importPosts([{ url: 'https://x.com/a/status/123', notes: 'Keep my note', title: 'My title' }]);
  old.db.exec('CREATE TABLE media_cache (id TEXT PRIMARY KEY, url TEXT, mime TEXT, bytes BLOB)');
  old.db.prepare('INSERT INTO media_cache VALUES (?,?,?,?)').run('old-image', 'https://pbs.twimg.com/media/old.png', 'image/png', Buffer.from([1, 2, 3]));
  old.close();
  const realFetch = globalThis.fetch; let imageRequests = 0;
  globalThis.fetch = (input, options) => {
    if (/pbs\.twimg\.com|cdninstagram\.com/.test(String(input))) { imageRequests++; throw new Error('Images must stay on the platform.'); }
    return realFetch(input, options);
  };
  const app = createApp({ dataPath, origin: 'http://localhost:3223' });
  app.server.listen(3223, '127.0.0.1'); await once(app.server, 'listening');
  try {
    assert.equal(app.store.db.prepare("SELECT name FROM sqlite_master WHERE name='media_cache'").get(), undefined);
    const response = await fetch('http://localhost:3223/api/posts/import', { method: 'POST', headers: { Origin: 'http://localhost:3223', 'Content-Type': 'application/json' }, body: JSON.stringify({ posts: [{ url: 'https://x.com/a/status/123', thumbnail: 'https://pbs.twimg.com/media/fixture.png', media: ['https://pbs.twimg.com/media/second.png'] }] }) });
    assert.equal(response.status, 200);
    const { posts } = await (await fetch('http://localhost:3223/api/posts')).json();
    assert.equal(posts[0].thumbnail, 'https://pbs.twimg.com/media/fixture.png');
    assert.equal(posts[0].notes, 'Keep my note'); assert.equal(posts[0].title, 'My title');
    assert.equal(imageRequests, 0);
    assert.equal((await fetch('http://localhost:3223/media/old-image')).status, 404);
  } finally { globalThis.fetch = realFetch; app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); await rm(dir, { recursive: true, force: true }); }
});
