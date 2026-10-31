import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';

test('authenticated library → pair → incremental sync → revoke, with origin and device isolation', async () => {
  const app = createApp({ origin: 'http://localhost:3219', setupCode: 'known-test-code' });
  app.server.listen(3219, '127.0.0.1'); await once(app.server, 'listening');
  let cookie;
  async function req(path, body, extra = {}) {
    const response = await fetch(`http://127.0.0.1:3219/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'http://localhost:3219', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  try {
    assert.equal((await req('/posts')).status, 401);
    assert.equal((await req('/setup', { code: 'wrong', password: 'a long secure password' })).status, 401);
    assert.equal((await req('/setup', { code: 'known-test-code', password: 'a long secure password', name: 'My saves' })).status, 200);
    assert.equal((await req('/posts/import', { posts: [{ url: 'https://x.com/a/status/123' }] }, { Origin: 'https://evil.example' })).status, 403);
    const { data: pairing } = await req('/pairing', {});
    const extensionHeaders = { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' };
    const { data: paired } = await req('/extension/pair', { code: pairing.code, name: 'Test browser' }, extensionHeaders);
    assert.ok(paired.token); assert.equal((await req('/extension/pair', { code: pairing.code }, extensionHeaders)).status, 401);
    const deviceHeaders = { ...extensionHeaders, Authorization: `Bearer ${paired.token}` };
    const { data: run } = await req('/extension/runs', { platform: 'x', account: '@personal' }, deviceHeaders);
    const batch = await req(`/extension/runs/${run.runId}`, { posts: [{ url: 'https://x.com/alice/status/123', text: 'An AI coding tool' }] }, deviceHeaders);
    assert.equal(batch.data.imported, 1); assert.equal((await req('/posts')).data.posts[0].accounts[0], '@personal');
    // A paired device cannot read the library or patch existing notes using its token.
    const savedCookie = cookie; cookie = undefined; assert.equal((await req('/posts', undefined, deviceHeaders)).status, 401); cookie = savedCookie;
    const other = app.store.pair(app.store.pairCode(), 'Other');
    assert.equal((await req(`/extension/runs/${run.runId}`, { posts: [] }, { ...extensionHeaders, Authorization: `Bearer ${other.token}` })).status, 404);
    assert.equal((await req(`/extension/runs/${run.runId}/finish`, { status: 'partial', message: 'Only visible posts' }, deviceHeaders)).status, 200);
    assert.equal((await req(`/extension/runs/${run.runId}`, { posts: [] }, deviceHeaders)).status, 409);
    assert.equal((await req('/export')).data.posts.length, 1);
    app.store.revoke(paired.deviceId); assert.equal((await req('/extension/status', undefined, deviceHeaders)).status, 401);
    assert.equal((await req('/login', null)).status, 400);
    assert.equal((await req('/logout', {})).status, 200); assert.equal((await req('/posts')).status, 401);
    assert.equal((await req('/login', { password: 'wrong' })).status, 401);
    assert.equal((await req('/login', { password: 'a long secure password' })).status, 200);
  } finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); }
});
