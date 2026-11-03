import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';

test('desktop owns social and mixed jobs; a Chrome helper cannot claim desktop work or overwriting native accounts', async () => {
  const origin = 'http://localhost:3283', transport = { instance: 'native-test', token: 'test-only-native-capability' };
  const app = createApp({ origin, nativeTransport: transport }); app.server.listen(3283, '127.0.0.1'); await once(app.server, 'listening');
  const post = async (path, input, native = false) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(native ? { 'X-SaveX-Native': transport.token } : {}) }, body: JSON.stringify(input) });
    return { status: response.status, data: await response.json() };
  };
  try {
    app.sync.configureNativeAccounts([{ id: 'profile-one', platform: 'x', handle: '@one', status: 'connected' }]);
    const capabilities = { ready: true, bookmarksSupported: true, bookmarksReady: true, claim: true, accountSwitching: true, selectedAccounts: true, syncModes: true, instagramCollections: true, instagramSaveLists: true, unsave: true };
    await post('/api/extension/jobs', { ...capabilities, instance: 'chrome-helper' });
    await post('/api/sync', { targets: ['x', 'chrome'], xAccount: '@one' });
    const chrome = await post('/api/extension/jobs', { ...capabilities, instance: 'chrome-helper' });
    assert.equal(chrome.data.desktopSocial, true); assert.equal(chrome.data.claimed, null); assert.equal(chrome.data.claimedUnsave, null);
    const impostor = await post('/api/extension/jobs', { ...capabilities, instance: transport.instance }); assert.equal(impostor.data.claimed, null);
    const native = await post('/api/extension/jobs', { ...capabilities, instance: transport.instance }, true);
    assert.deepEqual(native.data.claimed.targets, ['x', 'chrome']);
    assert.equal(native.data.nativeSocial.accounts[0].handle, '@one');
    assert.equal(native.data.browser.bookmarksReady, true);
    await post('/api/extension/accounts', { accounts: [{ handle: '@wrong' }], active: '@wrong' });
    assert.notEqual(app.sync.status().xAccounts?.active, '@wrong');
    await post('/api/sync/stop', {});
  } finally { await app.mcp.close(); app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); }
});

