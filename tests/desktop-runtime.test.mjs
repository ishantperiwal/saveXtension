import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { expandShortLinks, pageLinks, panelAccount, postExternalId, panelRequestKind, panelRequestPost, instagramShortcode, startDesktopLibrary, readDatabaseSnapshot, importSnapshot, isLibraryFrame, isWebLink, instagramPost, pinterestPost, xPost } from '../desktop/runtime.mjs';
import { windowsBrowsers } from '../desktop/browser.mjs';

test('desktop navigation and browser candidates do not expose arbitrary protocols or credentials', () => {
  assert.equal(isLibraryFrame('http://localhost:3217/', 'http://localhost:3217'), true);
  assert.equal(isLibraryFrame('http://localhost:3210/', 'http://localhost:3217'), false);
  assert.equal(isLibraryFrame('https://evil.example/', 'http://localhost:3217'), false);
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:secret@example.com']) assert.equal(isWebLink(url), false);
  assert.equal(isWebLink('https://x.com/i/status/123'), true);
  assert.equal(instagramPost('https://www.instagram.com/reel/DQ8x_ab-1/?utm_source=ig_embed&ig_rid=1'), 'https://www.instagram.com/reel/DQ8x_ab-1/');
  assert.equal(instagramPost('https://instagram.com/fra_motion_design/p/ABC123'), 'https://www.instagram.com/fra_motion_design/p/ABC123/');
  for (const url of ['https://x.com/i/status/123', 'https://x.com/writer/status/123/photo/1?s=20', 'https://twitter.com/writer/status/123', 'https://mobile.x.com/i/web/status/123']) assert.equal(xPost(url), 'https://x.com/i/status/123', url);
  for (const url of ['https://x.com/writer', 'https://x.com/i/bookmarks', 'http://x.com/i/status/123', 'https://x.com.evil.com/i/status/123', 'https://evil.example/i/status/123', 'https://x.com:444/i/status/123']) assert.equal(xPost(url), '', url);
  assert.equal(pinterestPost('https://in.pinterest.com/pin/891220213759928481/?utm=1'), 'https://www.pinterest.com/pin/891220213759928481/');
  assert.equal(pinterestPost('https://www.pinterest.co.uk/pin/a-title--123/'), 'https://www.pinterest.com/pin/123/');
  for (const url of ['https://in.pinterest.com/maker/board/', 'https://pinterest.evil.com/pin/123/', 'http://www.pinterest.com/pin/123/']) assert.equal(pinterestPost(url), '');
  for (const url of ['https://www.instagram.com/fra_motion_design/', 'https://evil.example/reel/ABC/', 'http://www.instagram.com/reel/ABC/', 'https://www.instagram.com.evil.example/reel/ABC/']) assert.equal(instagramPost(url), '');
  assert.deepEqual(windowsBrowsers({ PROGRAMFILES: 'C:\\Program Files' }), ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']);
});

test('the post panel tells a site\'s save and unsave requests from everything else', () => {
  const kind = (platform, url, name, method = 'POST') => panelRequestKind(platform, { method, url, body: name ? `av=1&fb_api_req_friendly_name=${name}&variables=%7B%7D` : '' });
  assert.equal(kind('x', 'https://x.com/i/api/graphql/abc123/CreateBookmark'), 'save');
  assert.equal(kind('x', 'https://x.com/i/api/graphql/abc123/DeleteBookmark'), 'unsave');
  assert.equal(kind('x', 'https://x.com/i/api/graphql/abc123/FavoriteTweet'), null);
  assert.equal(kind('x', 'https://x.com/i/api/graphql/abc123/DeleteBookmark', '', 'GET'), null);
  assert.equal(kind('instagram', 'https://www.instagram.com/api/v1/web/save/123/save/'), 'save');
  assert.equal(kind('instagram', 'https://www.instagram.com/api/v1/web/save/123/unsave/'), 'unsave');
  assert.equal(kind('instagram', 'https://www.instagram.com/graphql/query', 'usePolarisSaveMediaSaveMutation'), 'save');
  assert.equal(kind('instagram', 'https://www.instagram.com/graphql/query', 'usePolarisSaveMediaUnsaveMutation'), 'unsave');
  assert.equal(kind('instagram', 'https://www.instagram.com/graphql/query', 'usePolarisLikeMediaLikeMutation'), null);
  assert.equal(kind('pinterest', 'https://www.pinterest.com/resource/RepinResource/create/'), 'save');
  assert.equal(kind('pinterest', 'https://www.pinterest.com/resource/RepinResource/delete/'), null);
  assert.equal(kind('pinterest', 'https://www.pinterest.com/resource/PinResource/delete/'), 'unsave');
  assert.equal(kind('pinterest', 'https://www.pinterest.com/resource/UserSessionResource/create/'), null);
});

test('a post opens as the account that saved it, and only then is its Save button worth reading', () => {
  const one = { handle: '@One' }, two = { handle: '@two' }, handle = result => [result.profile?.handle, result.owner];
  assert.deepEqual(handle(panelAccount([one, two], ['@two'])), ['@two', true], 'not simply the first connected account');
  assert.deepEqual(handle(panelAccount([one, two], ['@one', '@two'])), ['@One', true], 'case does not matter');
  assert.deepEqual(handle(panelAccount([one, two], ['@one', '@two'], ['@TWO'])), ['@two', true], 'the account being browsed comes first');
  assert.deepEqual(handle(panelAccount([one, two], ['@two'], ['@one'])), ['@two', true], 'but never one that did not save it');
  assert.deepEqual(handle(panelAccount([one, two], ['@gone'])), ['@One', false], 'an owner no longer connected falls back, without counting as the owner');
  assert.deepEqual(handle(panelAccount([one, two], undefined)), ['@One', false], 'a post not in the library');
  assert.deepEqual(handle(panelAccount([], ['@one'])), [undefined, false]);
  assert.equal(postExternalId('x', 'https://x.com/i/status/123'), '123');
  assert.equal(postExternalId('instagram', 'https://www.instagram.com/reel/Ab_1/'), 'Ab_1');
  assert.equal(postExternalId('pinterest', 'https://www.pinterest.com/pin/456/'), '456');
});

test('a panel unsave names its post from the request, or else from the page on screen', () => {
  assert.equal(instagramShortcode('12345'), 'DA5');
  assert.equal(instagramShortcode('2913458931290851234').length, 11);
  const post = (platform, input) => panelRequestPost(platform, input);
  assert.equal(post('x', { url: 'https://x.com/i/api/graphql/a/DeleteBookmark', body: '{"variables":{"tweet_id":"777"},"queryId":"a"}', pageUrl: 'https://x.com/i/status/111' }), '777', 'the request wins, since a feed shows many posts');
  assert.equal(post('x', { url: 'https://x.com/i/api/graphql/a/DeleteBookmark', pageUrl: 'https://x.com/a/status/111' }), '111');
  assert.equal(post('x', { url: 'https://x.com/i/api/graphql/a/DeleteBookmark', pageUrl: 'https://x.com/home' }), null);
  assert.equal(post('instagram', { url: 'https://www.instagram.com/api/v1/web/save/12345/unsave/' }), 'DA5');
  assert.equal(post('instagram', { url: 'https://www.instagram.com/graphql/query', body: 'variables=%7B%22media_id%22%3A%2212345%22%7D' }), 'DA5');
  assert.equal(post('instagram', { url: 'https://www.instagram.com/graphql/query', pageUrl: 'https://www.instagram.com/reel/AbC_1/' }), 'AbC_1');
});

test('desktop copies an existing library without modifying it or copying its queued jobs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-desktop-runtime-'));
  const old = createApp({ origin: 'http://localhost:3257' });
  old.store.importPosts([{ url: 'https://x.com/a/status/777', notes: 'Keep this note', accounts: ['@a'] }]);
  old.store.set('name', 'Existing library');
  old.server.listen(3257, '127.0.0.1'); await once(old.server, 'listening');
  await fetch('http://localhost:3257/api/sync', { method: 'POST', headers: { Origin: 'http://localhost:3257', 'Content-Type': 'application/json' }, body: JSON.stringify({ targets: ['x'], mode: 'deep' }) });
  let desktop;
  try {
    desktop = await startDesktopLibrary({ dataDir: dir, helperSource: resolve('extension'), preferredPort: 3258, legacyOrigin: 'http://localhost:3257' });
    assert.equal(desktop.store.posts()[0].notes, 'Keep this note');
    assert.equal(desktop.store.get('name'), 'Existing library');
    assert.equal((await (await fetch(`${desktop.origin}/api/sync`)).json()).job, null);
    assert.equal(old.store.posts()[0].notes, 'Keep this note');
    const helper = await readFile(join(desktop.helperPath, 'background.js'), 'utf8');
    assert(helper.includes(`const DEFAULT_ORIGIN = '${desktop.origin}'`));
    assert((await readFile(join(desktop.helperPath, 'options.js'), 'utf8')).includes(desktop.origin));
    const helperManifest = JSON.parse(await readFile(join(desktop.helperPath, 'manifest.json'), 'utf8'));
    assert(helperManifest.permissions.includes('cookies')); for (const host of ['pinterest.com', 'x.com', 'instagram.com']) assert(helperManifest.host_permissions.includes(`https://*.${host}/*`)); assert.equal(helperManifest.optional_host_permissions, undefined, 'Chrome warns when optional permissions repeat required ones'); assert(!helperManifest.host_permissions.some(host => /google/.test(host)), 'the helper can’t read Google’s cookies');
    assert(!JSON.parse(await readFile(resolve('extension/manifest.json'), 'utf8')).permissions.includes('cookies'), 'the store extension doesn’t ask for cookies');
    assert(helperManifest.permissions.includes('bookmarks')); assert(!helperManifest.optional_permissions?.includes('bookmarks'));
    assert(JSON.parse(await readFile(resolve('extension/manifest.json'), 'utf8')).optional_permissions.includes('bookmarks'), 'the store extension still asks separately');
    const post = desktop.store.posts()[0]; desktop.store.updatePost(post.id, { notes: 'New desktop note' });
    const origin = desktop.origin; await desktop.close();
    desktop = await startDesktopLibrary({ dataDir: dir, helperSource: resolve('extension'), preferredPort: 3260, legacyOrigin: 'http://localhost:3257' });
    assert.equal(desktop.origin, origin); assert.equal(desktop.store.posts()[0].notes, 'New desktop note');
  } finally {
    await desktop?.close(); old.server.closeAllConnections(); await new Promise(resolve => old.server.close(resolve)); old.store.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('readonly database import preserves collection membership and notes without mutating its source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-desktop-import-'));
  const path = join(dir, 'old.sqlite'), source = new Store(path), destination = new Store(':memory:');
  try {
    const collection = source.upsertInstagramCollections('@me', [{ name: 'Design', url: 'https://www.instagram.com/me/saved/design/123/' }])[0];
    const post = { url: 'https://www.instagram.com/p/Test/', sourceAccount: '@me', notes: 'My note' };
    source.importPosts([post]); const id = source.startRun('local', 'instagram', '@me', 'quick', collection.id); source.recordDiscoveries(source.run(id, 'local'), [post]);
    source.set('password', 'Never copy authentication settings');
    importSnapshot(destination, readDatabaseSnapshot(path));
    assert.equal(destination.posts()[0].collections[0].name, 'Design');
    assert.equal(destination.posts()[0].notes, 'My note'); assert.equal(destination.get('password'), undefined);
    assert.equal(source.posts()[0].notes, 'My note');
  } finally { source.close(); destination.close(); await rm(dir, { recursive: true, force: true }); }
});

test('a post page gives the real addresses of its links, not the site’s own or its redirects', () => {
  assert.deepEqual(pageLinks([
    ['https://github.com/a/b…', 'https://t.co/abc'],
    ['github.com/c/d/tree/main…', 'https://t.co/def'],
    ['pic.x.com/xyz', 'https://t.co/ghi'],
    ['Read this', 'https://t.co/jkl'],
    ['From github.com', 'https://t.co/card'],
    ['github.com', 'https://t.co/bare'],
    ['alice', 'https://x.com/alice'],
    ['Profile', 'https://www.instagram.com/alice/'],
    ['site', 'https://l.instagram.com/?u=https%3A%2F%2Fexample.com%2Fpage&e=1'],
    ['Visit site', 'https://www.pinterest.com/offsite/?url=https%3A%2F%2Fshop.example%2Fitem&token=1'],
    ['same', 'https://example.com/page#top'],
    ['mail', 'mailto:a@b.com'],
    ['broken', 'not a url'],
  ]), ['https://github.com/a/b', 'https://github.com/c/d/tree/main', 'https://t.co/jkl', 'https://t.co/card', 'https://t.co/bare', 'https://example.com/page', 'https://shop.example/item']);
  assert.equal(pageLinks(Array.from({ length: 150 }, (_, index) => ['x', `https://example.com/${index}`])).length, 100);
});

test('short links left over are asked about once, on t.co only, and failures keep the short link', async () => {
  const asked = [], answers = { 'https://t.co/repo': 'https://github.com/a/b', 'https://t.co/same': 'https://github.com/a/b', 'https://t.co/own': 'https://x.com/a/status/1', 'https://t.co/bad': 'not a url' };
  const ask = async (url, options) => { asked.push(url); assert.equal(options.redirect, 'manual'); if (url.endsWith('down')) throw new Error('offline'); return { headers: new Headers(answers[url] ? { location: answers[url] } : {}) }; };
  assert.deepEqual(await expandShortLinks(['https://t.co/repo', 'https://t.co/same', 'https://t.co/own', 'https://t.co/down', 'https://t.co/bad', 'https://t.co/none', 'https://example.com/page'], ask), ['https://github.com/a/b', 'https://t.co/down', 'https://t.co/bad', 'https://t.co/none', 'https://example.com/page']);
  assert.equal(asked.includes('https://example.com/page'), false);
  assert.equal((await expandShortLinks(['https://t.co/a', 'https://t.co/b', 'https://t.co/c'], async () => ({ headers: new Headers({ location: 'https://example.com/' }) }), 1)).length, 3);
});
