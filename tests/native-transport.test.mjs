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


test('Chrome helper shares its bookmark tree with the desktop app, and the first copy queues an import', async () => {
  const origin = 'http://localhost:3284', transport = { instance: 'native-test', token: 'test-only-native-capability' };
  const app = createApp({ origin, nativeTransport: transport }); app.server.listen(3284, '127.0.0.1'); await once(app.server, 'listening');
  const post = async (path, input, native = false) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(native ? { 'X-SaveX-Native': transport.token } : {}) }, body: JSON.stringify(input) });
    return { status: response.status, data: await response.json() };
  };
  try {
    const tree = [{ title: '', children: [{ title: 'Bookmarks bar', children: [{ title: 'Example', url: 'https://example.com/', dateAdded: 1700000000000 }] }] }];
    assert.equal((await post('/api/extension/jobs', { instance: 'chrome-helper', bookmarksReady: true })).data.chromeBookmarkTreeAt, null);
    assert.equal((await post('/api/extension/bookmark-tree', { tree }, true)).status, 403);
    assert.equal((await post('/api/extension/bookmark-tree', { tree: 'nope' })).status, 400);
    const sent = await post('/api/extension/bookmark-tree', { instance: 'chrome-helper', tree });
    assert.equal(sent.status, 200);
    assert.deepEqual(app.sync.chromeBookmarks(), tree);
    assert.deepEqual(app.sync.status().job.targets, ['chrome']); assert.equal(app.sync.status().job.status, 'queued');
    assert.equal(app.sync.status().chromeBookmarkTreeAt, sent.data.at);
    await post('/api/sync/stop', {});
    await post('/api/extension/bookmark-tree', { instance: 'chrome-helper', tree: [] });
    assert.notEqual(app.sync.status().job.status, 'queued', 'later copies only refresh the stored tree');
  } finally { await app.mcp.close(); app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); }
});

test('Pinterest boards and pins are stored like Instagram collections, and only the desktop app syncs them', async () => {
  const origin = 'http://localhost:3285', transport = { instance: 'native-test', token: 'test-only-native-capability' };
  const app = createApp({ origin, nativeTransport: transport }); app.server.listen(3285, '127.0.0.1'); await once(app.server, 'listening');
  const post = async (path, input, native = false) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(native ? { 'X-SaveX-Native': transport.token } : {}) }, body: JSON.stringify(input) });
    return { status: response.status, data: await response.json() };
  };
  try {
    const account = '@maker.name';
    const boards = await post('/api/extension/instagram-collections', { platform: 'pinterest', account, collections: [{ externalId: 'game-assets', name: 'Game Assets', url: 'https://www.pinterest.com/maker.name/game-assets/' }, { externalId: 'unorganized', name: 'Unorganized', url: 'https://www.pinterest.com/maker.name/_boards/' }] }, true);
    assert.deepEqual(boards.data.collections.map(board => [board.platform, board.externalId]).sort(), [['pinterest', 'game-assets'], ['pinterest', 'unorganized']]);
    assert.equal((await post('/api/extension/instagram-collections', { platform: 'pinterest', account, collections: [{ name: 'Elsewhere', url: 'https://pinterest.evil.com/maker.name/x/' }] }, true)).status, 400);
    assert.equal((await post('/api/extension/instagram-collections', { platform: 'pinterest', account, collections: [{ name: 'Someone else', url: 'https://www.pinterest.com/other/x/' }] }, true)).status, 400);
    const board = boards.data.collections.find(item => item.externalId === 'game-assets');
    assert.throws(() => app.store.startRun('device', 'instagram', account, 'quick', board.id), /collection belonging/);
    const job = await post('/api/sync', { targets: ['pinterest'], pinterestAccount: account, pinterestCollectionId: board.id });
    assert.equal(job.status, 200); assert.equal(job.data.job.pinterestScope.collection.id, board.id); assert.equal(job.data.job.pinterestScope.account, account);
    await post('/api/sync/stop', {});
    assert.equal(app.store.detailCandidates('pinterest', account).length, 0);
    const known = await fetch(`${origin}/api/extension/known?platform=pinterest&account=${encodeURIComponent(account)}&collectionId=${board.id}`, { headers: { Origin: origin, 'X-SaveX-Native': transport.token } });
    assert.equal(known.status, 200, 'a Pinterest scan can ask which pins it already has');
    assert.deepEqual(app.store.importPosts([{ platform: 'pinterest', url: 'https://in.pinterest.com/pin/some-title--555/?utm=1', text: 'A pin', thumbnail: 'https://i.pinimg.com/736x/a/b/c.jpg', sourceAccount: account, accounts: [account], collections: [{ account, externalId: 'game-assets', name: 'Game Assets', url: 'https://www.pinterest.com/maker.name/game-assets/' }] }]).imported, 1);
    const pin = app.store.posts().find(item => item.platform === 'pinterest');
    assert.equal(pin.url, 'https://www.pinterest.com/pin/555/'); assert.equal(pin.kind, 'image'); assert.equal(pin.thumbnail, 'https://i.pinimg.com/736x/a/b/c.jpg');
    assert.deepEqual(pin.collections.map(item => [item.platform, item.name]), [['pinterest', 'Game Assets']]);
  } finally { await app.mcp.close(); app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); }
  const web = createApp({ origin: 'http://localhost:3286' });
  try { assert.throws(() => web.sync.enqueue(['pinterest']), /desktop app/); }
  finally { await web.mcp.close(); web.server.closeAllConnections(); web.store.close(); }
});

test('a Chrome sign-in handoff goes to one extension instance, once, and only from an extension', async () => {
  const origin = 'http://localhost:3287', transport = { instance: 'native-test', token: 'test-only-native-capability' };
  const app = createApp({ origin, nativeTransport: transport }); app.server.listen(3287, '127.0.0.1'); await once(app.server, 'listening');
  const helper = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const post = async (path, input, headers = { Origin: helper }) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input) });
    return { status: response.status, data: await response.json() };
  };
  const checkIn = (instance, extra = {}) => post('/api/extension/jobs', { instance, chromeSession: true, ...extra });
  try {
    assert.equal((await checkIn('chrome-one')).data.chromeSessionRequest, null, 'nothing is asked until a sign-in starts');
    assert.equal((await checkIn('chrome-one')).data.chromeBrowser.chromeSession, true);
    assert.throws(() => app.sync.requestChromeSession('google'), /can’t use a Chrome sign-in/);
    assert.throws(() => app.sync.requestChromeSession('constructor'), /can’t use a Chrome sign-in/);
    const id = app.sync.requestChromeSession('pinterest');
    assert.equal((await checkIn('old-helper', { chromeSession: false })).data.chromeSessionRequest, null, 'a helper that can’t read cookies isn’t asked');
    assert.equal((await post('/api/extension/jobs', { instance: 'library-page', chromeSession: true }, { Origin: origin })).data.chromeSessionRequest, null, 'pages never see the request');
    const request = (await checkIn('chrome-one')).data.chromeSessionRequest;
    assert.equal(request.id, id); assert(request.domains.includes('pinterest.com')); assert(!request.domains.some(domain => /google|x\.com/.test(domain)));
    assert.equal((await checkIn('chrome-two')).data.chromeSessionRequest, null, 'only the instance that picked it up');
    const cookies = [{ name: '_auth', value: '1', domain: '.pinterest.com' }, { name: 'SID', value: 'google', domain: '.google.com' }, { name: 'evil', value: 'x', domain: '.pinterest.evil.com' }];
    assert.equal((await post('/api/extension/chrome-session', { id, instance: 'chrome-one', cookies }, { Origin: 'https://evil.example' })).status, 403, 'websites can’t send a session');
    assert.equal((await post('/api/extension/chrome-session', { id, instance: 'chrome-one', cookies }, {})).status, 403, 'a request with no extension origin can’t');
    assert.equal((await post('/api/extension/chrome-session', { id, instance: 'chrome-one', cookies }, { Origin: origin })).status, 403, 'the library page can’t');
    assert.equal((await post('/api/extension/chrome-session', { id, instance: 'chrome-one', cookies }, { Origin: helper, 'X-SaveX-Native': transport.token })).status, 403);
    assert.equal((await post('/api/extension/chrome-session', { id: 'wrong', instance: 'chrome-one', cookies })).status, 409);
    assert.equal((await post('/api/extension/chrome-session', { id, instance: 'chrome-two', cookies })).status, 409);
    assert.equal(app.sync.takeChromeSession(id), null, 'nothing has arrived yet');
    assert.equal((await post('/api/extension/chrome-session', { id, instance: 'chrome-one', cookies })).status, 200);
    assert.equal((await post('/api/extension/chrome-session', { id, instance: 'chrome-one', cookies })).status, 409, 'it can’t be replaced');
    assert.equal(JSON.stringify(app.sync.status()).includes('chromeSessionRequest'), false);
    assert.deepEqual(app.sync.takeChromeSession(id).map(cookie => cookie.name), ['_auth'], 'other sites’ cookies are dropped');
    assert.equal(app.sync.takeChromeSession(id), null, 'taken once');
    assert.equal(app.store.db.prepare("SELECT COUNT(*) AS n FROM settings WHERE value LIKE '%_auth%'").get().n, 0, 'never written to the library');
    const xId = app.sync.requestChromeSession('x');
    assert.deepEqual((await checkIn('chrome-one')).data.chromeSessionRequest, { id: xId, platform: 'x', domains: ['x.com', 'twitter.com'] });
    await post('/api/extension/chrome-session', { id: xId, instance: 'chrome-one', cookies: [{ name: 'auth_token', value: 'a', domain: '.x.com' }, { name: 'old', value: 'b', domain: '.twitter.com' }, { name: '_auth', value: '1', domain: '.pinterest.com' }, { name: 'trick', value: 'c', domain: 'x.com.evil.net' }, { name: 'sessionid', value: 'd', domain: '.instagram.com' }] });
    assert.deepEqual(app.sync.takeChromeSession(xId).map(cookie => cookie.name), ['auth_token', 'old'], 'each site gets only its own cookies');
    const cancelled = app.sync.requestChromeSession('pinterest'); app.sync.cancelChromeSession(cancelled);
    assert.equal((await checkIn('chrome-one')).data.chromeSessionRequest, null);
  } finally { await app.mcp.close(); app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); }
});
