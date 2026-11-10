import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../server/app.mjs';
import { Store } from '../server/store.mjs';
import { savedImages } from '../server/saved-images.mjs';
import { setInstagramSaveList } from '../server/instagram-save-lists.mjs';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]), link = name => `https://pbs.twimg.com/media/${name}.jpg`;
// Links work until they are removed from the map, like an expired one.
function fakeCdn(entries = {}) {
  const live = new Map(Object.entries(entries)), calls = [];
  return { live, calls, download: async url => { calls.push(url); if (!live.has(url)) throw new Error('Website did not provide a preview.'); return { url, type: 'image/jpeg', bytes: JPEG, ...live.get(url) }; } };
}
async function folder(t) { const dir = await mkdtemp(join(tmpdir(), 'savex-images-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
async function library(t, cdn) {
  const store = new Store(':memory:'), dir = await folder(t), images = savedImages(store, { dir, download: cdn.download });
  store.onPostsImported = images.schedule; store.onPostDelete = images.forget;
  t.after(() => { images.close(); store.close(); });
  return { store, images, dir };
}
async function serve(t, cdn) {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const { port } = probe.address(); await new Promise(resolve => probe.close(resolve));
  const origin = `http://localhost:${port}`, app = createApp({ origin, imagesDir: await folder(t), imageDownload: cdn.download });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await app.images.idle(); await app.mcp.close(); app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); });
  return { ...app, url: `http://127.0.0.1:${port}`, origin };
}
async function connect(t, app) {
  assert.equal((await fetch(`${app.url}/api/mcp`, { method: 'POST', headers: { Origin: app.origin, 'Content-Type': 'application/json' }, body: '{"enabled":true}' })).status, 200);
  const client = new Client({ name: 'savex-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${app.url}/mcp`)));
  return (postIds) => client.callTool({ name: 'get_save_images', arguments: { postIds } });
}

test('a save keeps its image after the link expires, the app uses the copy, and backups leave it out', async t => {
  const cdn = fakeCdn({ [link('one')]: {} }), app = await serve(t, cdn);
  app.store.importPosts([{ url: 'https://x.com/alice/status/1', text: 'one', thumbnail: link('one') }, { url: 'https://x.com/alice/status/2', text: 'plain text' }]);
  await app.images.idle();
  cdn.live.clear();
  const { posts } = await (await fetch(`${app.url}/api/posts?scope=all`)).json(), withImage = posts.find(p => p.url.endsWith('/1')), plain = posts.find(p => p.url.endsWith('/2'));
  assert.match(withImage.localImage, new RegExp(`^/api/posts/${withImage.id}/image\\?v=\\d+$`)); assert.equal(plain.localImage, undefined);
  const response = await fetch(`${app.url}${withImage.localImage}`);
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), JPEG);
  assert.equal((await fetch(`${app.url}/api/posts/${plain.id}/image`)).status, 404);
  assert.equal((await fetch(`${app.url}${withImage.localImage}`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const backup = await (await fetch(`${app.url}/api/export`)).text();
  assert(!backup.includes('localImage')); assert(backup.includes(link('one')));
});

test('the first media link stands in for a dead thumbnail, and only non-image answers are refused', async t => {
  const cdn = fakeCdn({ [link('media')]: {}, [link('page')]: { type: 'image/svg+xml' } }), { store, images, dir } = await library(t, cdn);
  store.importPosts([
    { url: 'https://x.com/alice/status/1', thumbnail: link('dead'), media: [link('media'), link('never')] },
    { url: 'https://x.com/alice/status/2', thumbnail: link('page') },
    { url: 'https://x.com/alice/status/3', thumbnail: link('gone'), media: [link('gone-too'), link('not-tried')] }
  ]);
  await images.idle();
  const [fallback] = store.posts().filter(p => p.url.endsWith('/1')), [refused] = store.posts().filter(p => p.url.endsWith('/2'));
  assert.equal(images.has(fallback.id), true); assert.equal(images.has(refused.id), false);
  assert(!cdn.calls.includes(link('never')));
  assert(cdn.calls.includes(link('gone-too'))); assert(!cdn.calls.includes(link('not-tried')), 'only the cover image is wanted, so at most two links are tried');
  assert.deepEqual(await readdir(dir), [`${fallback.id}.jpg`]);
});

test('the second link tried is a different image when the first media link repeats the thumbnail', async t => {
  const cdn = fakeCdn({ [link('two')]: {} }), { store, images } = await library(t, cdn);
  store.importPosts([{ url: 'https://x.com/alice/status/1', thumbnail: link('one'), media: [link('one'), link('two')] }]);
  await images.idle();
  assert.equal(images.has(store.posts()[0].id), true);
});
test('a profile picture saved by an earlier version is removed from the post and its copy replaced', async t => {
  const dir = await folder(t), path = join(dir, 'library.sqlite'), imagesDir = join(dir, 'images');
  const avatar = 'https://pbs.twimg.com/profile_images/1/a_normal.jpg', photo = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
  const cdn = fakeCdn({ [avatar]: {}, [link('photo')]: { bytes: photo } });
  let store = new Store(path);
  store.importPosts([{ url: 'https://x.com/alice/status/1', thumbnail: link('photo') }]);
  const id = store.posts()[0].id;
  store.db.prepare('UPDATE posts SET thumbnail=?,media=? WHERE id=?').run(avatar, JSON.stringify([avatar, link('photo'), link('second')]), id);
  let images = savedImages(store, { dir: imagesDir, download: cdn.download });
  images.schedule(); await images.idle();
  assert.deepEqual((await images.read(id)).bytes, JPEG, 'starts with the avatar as its copy');
  store.db.prepare('UPDATE post_images SET attempted_at=1 WHERE post_id=?').run(id);
  const oldAddress = images.annotate(store.posts())[0].localImage;
  images.close(); store.close();

  store = new Store(path); images = savedImages(store, { dir: imagesDir, download: cdn.download });
  t.after(() => { images.close(); store.close(); });
  const [post] = store.posts();
  assert.equal(post.thumbnail, link('photo')); assert.deepEqual(post.media, [link('photo'), link('second')]);
  images.schedule(); await images.idle();
  assert.deepEqual((await images.read(id)).bytes, photo);
  assert.notEqual(images.annotate(store.posts())[0].localImage, oldAddress, 'a replaced copy gets a new address, so the browser cache can\'t show the old one');
});
test('a failed link waits for a new link or a day, instead of being retried on every sync', async t => {
  const cdn = fakeCdn(), { store, images } = await library(t, cdn);
  store.importPosts([{ url: 'https://x.com/alice/status/1', thumbnail: link('expired') }]);
  await images.idle();
  const { id } = store.posts()[0];
  assert.equal(cdn.calls.length, 1); assert.equal(images.has(id), false);
  store.importPosts([{ url: 'https://x.com/alice/status/2', text: 'another save' }]);
  await images.idle();
  assert.equal(cdn.calls.length, 1, 'the same dead link is not tried again');
  store.db.prepare('UPDATE post_images SET attempted_at=0').run();
  images.schedule(); await images.idle();
  assert.equal(cdn.calls.length, 2, 'a day later it is tried again');
  cdn.live.set(link('fresh'), {});
  store.importPosts([{ url: 'https://x.com/alice/status/1', thumbnail: link('fresh') }]);
  await images.idle();
  assert.equal(images.has(id), true);
  const copy = await images.read(id);
  cdn.live.clear(); cdn.calls.length = 0;
  store.importPosts([{ url: 'https://x.com/alice/status/1', thumbnail: link('newer') }]);
  await images.idle();
  assert.deepEqual(cdn.calls, [], 'a saved image is kept when a later sync changes the link');
  assert.deepEqual(await images.read(id), copy);
});

test('deleting a save removes its image, and a restart clears leftovers', async t => {
  const cdn = fakeCdn({ [link('one')]: {}, [link('two')]: {} }), { store, images, dir } = await library(t, cdn);
  store.importPosts([{ url: 'https://x.com/alice/status/1', thumbnail: link('one') }, { url: 'https://x.com/alice/status/2', thumbnail: link('two') }]);
  await images.idle();
  const [first, second] = store.posts();
  assert.equal((await readdir(dir)).length, 2);
  store.deletePost(first.id);
  assert.deepEqual(await readdir(dir), [`${second.id}.jpg`]);
  assert.equal(await images.read(first.id), null);
  await writeFile(join(dir, 'leftover.jpg.tmp'), JPEG);
  const restarted = savedImages(store, { dir, download: cdn.download });
  assert.deepEqual(await readdir(dir), [`${second.id}.jpg`]);
  assert.deepEqual((await restarted.read(second.id)).bytes, JPEG);
  await rm(join(dir, `${second.id}.jpg`));
  assert.equal(await restarted.read(second.id), null, 'a missing file reads as no image');
  assert.equal(restarted.has(second.id), false);
  restarted.close();
});

test('a save deleted during its download leaves no file behind', async t => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const cdn = fakeCdn({ [link('one')]: {} }), slow = { download: async url => { await gate; return cdn.download(url); } }, { store, images, dir } = await library(t, slow);
  store.importPosts([{ url: 'https://x.com/alice/status/1', thumbnail: link('one') }]);
  store.deletePost(store.posts()[0].id);
  release(); await images.idle();
  assert.deepEqual(await readdir(dir), []);
});

test('a save deleted while its download fails is not recorded', async t => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const { store, images } = await library(t, { download: async () => { await gate; throw new Error('Link expired.'); } });
  store.onPostsImported = null;
  store.importPosts([{ url: 'https://x.com/alice/status/1', thumbnail: link('one') }]);
  const { id } = store.posts()[0], attempt = images.ensure(id);
  await new Promise(setImmediate);
  store.deletePost(id);
  release();
  assert.equal(await attempt, null);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM post_images').get().n, 0);
});

test('without an images folder nothing is downloaded', async t => {
  const cdn = fakeCdn({ [link('one')]: {} }), store = new Store(':memory:'), images = savedImages(store, { download: cdn.download });
  t.after(() => store.close());
  images.schedule(); await images.idle();
  assert.deepEqual(cdn.calls, []); assert.equal(images.has(1), false); assert.equal(await images.ensure(1), null);
  const posts = [{ id: 1 }]; assert.equal(images.annotate(posts), posts);
  assert.equal(existsSync(join(tmpdir(), 'undefined')), false);
});

test('MCP sends saved images to the LLM, reports saves without one, and never reaches deselected saves', async t => {
  const cdn = fakeCdn({ [link('shown')]: {}, [link('late')]: {} }), app = await serve(t, cdn), images = app.images;
  app.store.importPosts([
    { url: 'https://www.instagram.com/reel/Shown/', thumbnail: link('shown'), kind: 'video', sourceAccount: '@one', collections: [{ account: '@one', name: 'Ideas', url: 'https://www.instagram.com/one/saved/ideas/1/' }] },
    { url: 'https://www.instagram.com/reel/Unseen/', thumbnail: link('hidden'), text: 'SECRET', sourceAccount: '@one', collections: [{ account: '@one', name: 'Private', url: 'https://www.instagram.com/one/saved/private/2/' }] },
    { url: 'https://x.com/alice/status/1', text: 'no image at all' }
  ]);
  await images.idle();
  setInstagramSaveList(app.store, { account: '@one', collectionIds: [app.store.instagramCollections().find(c => c.name === 'Ideas').id] });
  const posts = app.store.posts(), id = end => posts.find(p => p.url.includes(end)).id, get = await connect(t, app);
  const shown = await get([id('Shown'), id('status/1')]);
  assert.equal(shown.isError, undefined); assert.equal(shown.structuredContent, undefined, 'clients that prefer structured data would drop the images');
  assert.deepEqual(shown.content.map(block => block.type), ['text', 'image', 'text']);
  assert.equal(shown.content[1].data, JPEG.toString('base64')); assert.equal(shown.content[1].mimeType, 'image/jpeg');
  const localLink = `${app.origin}/api/posts/${id('Shown')}/image`;
  assert.deepEqual(JSON.parse(shown.content[0].text), { id: id('Shown'), platform: 'instagram', url: 'https://www.instagram.com/reel/Shown/', kind: 'video', image: 'attached', savedImageUrl: localLink });
  assert.deepEqual(JSON.parse(shown.content[2].text), { id: id('status/1'), platform: 'x', url: posts.find(p => p.url.includes('status/1')).url, kind: 'text', image: 'unavailable', savedImageUrl: null });
  // get_saves gives a link that outlives the platform's, and search rows stay small.
  const client = new Client({ name: 'savex-link-test', version: '1.0.0' }); t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${app.url}/mcp`)));
  const full = (await client.callTool({ name: 'get_saves', arguments: { postIds: [id('Shown'), id('status/1')] } })).structuredContent.saves;
  assert.equal(full[0].savedImageUrl, localLink); assert.equal(full[0].contentAvailability.savedImage, true);
  assert.equal(full[1].savedImageUrl, null); assert.equal(full[1].contentAvailability.savedImage, false);
  cdn.live.clear();
  const opened = await fetch(localLink); assert.equal(opened.status, 200); assert.equal(opened.headers.get('content-type'), 'image/jpeg');
  const row = (await client.callTool({ name: 'search_saves', arguments: { limit: 5 } })).structuredContent.saves.find(save => save.id === id('Shown'));
  assert.equal(row.contentAvailability.savedImage, true); assert.equal(row.savedImageUrl, undefined);
  const hidden = await get([id('Shown'), id('Unseen')]);
  assert.equal(hidden.isError, true); assert(!JSON.stringify(hidden).includes('SECRET')); assert(!JSON.stringify(hidden).includes('base64'));
  // The tool list advertises the limit, and summaries say which saves have a copy.
  assert.equal((await get(Array(8).fill(id('Shown')))).isError, undefined);
  assert.equal((await get(Array(9).fill(id('Shown')))).isError, true);
  assert.equal(JSON.stringify((await get([id('status/1')])).content).includes('"type":"image"'), false);
});

test('MCP downloads a missing image on request, and holds back images a model could not take or a batch too large', async t => {
  const big = Buffer.alloc(3 * 1024 * 1024, 1), cdn = fakeCdn({ [link('avif')]: { type: 'image/avif' }, [link('a')]: { bytes: big }, [link('b')]: { bytes: big }, [link('c')]: { bytes: big } }), app = await serve(t, cdn);
  app.store.importPosts(['avif', 'a', 'b', 'c'].map((name, i) => ({ url: `https://x.com/alice/status/${i + 1}`, thumbnail: link(name) })));
  await app.images.idle();
  const ordered = [1, 2, 3, 4].map(n => app.store.posts().find(p => p.url.endsWith(`/${n}`)).id), get = await connect(t, app);
  const batch = await get(ordered);
  assert.deepEqual(batch.content.filter(block => block.type === 'text').map(block => JSON.parse(block.text).image), ['omitted, request it separately', 'attached', 'attached', 'omitted, request it separately']);
  const row = app.store.posts().find(p => p.url.endsWith('/2'));
  app.store.db.prepare('UPDATE post_images SET file=NULL,type=NULL WHERE post_id=?').run(row.id);
  const before = cdn.calls.length, again = await get([row.id]);
  assert.equal(cdn.calls.length, before + 1); assert.equal(again.content[1].type, 'image');
  assert.equal(app.store.posts().length, 4);
});
