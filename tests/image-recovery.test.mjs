import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { savedImages } from '../server/saved-images.mjs';
import { imageRecovery } from '../server/image-recovery.mjs';
import { setInstagramSaveList } from '../server/instagram-save-lists.mjs';
import { syncQueue } from '../server/sync.mjs';
import { createApp } from '../server/app.mjs';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]), link = name => `https://scontent.cdninstagram.com/${name}.jpg`;
const FAST = { delay: 0, gap: 1, jitter: 0, poll: 1, idle: 5, watch: 1 };
const reel = (name, extra = {}) => ({ url: `https://www.instagram.com/p/${name}/`, thumbnail: link(`${name}-old`), sourceAccount: '@me', ...extra });
async function until(check, message = 'condition') { const end = Date.now() + 3000; while (!check()) { if (Date.now() > end) throw new Error(`Timed out waiting for ${message}.`); await new Promise(resolve => setTimeout(resolve, 2)); } }
const settle = () => new Promise(resolve => setTimeout(resolve, 40));

// A library whose saved links are all dead, as after they expire. Links ending -new work.
async function library(t, saves) {
  const store = new Store(':memory:'), dir = await mkdtemp(join(tmpdir(), 'savex-recovery-'));
  const images = savedImages(store, { dir, download: async url => { if (!url.includes('-new')) throw new Error('Expired.'); return { url, type: 'image/jpeg', bytes: JPEG }; } });
  store.onPostsImported = images.schedule; store.onPostDelete = images.forget;
  store.importPosts(saves); await images.idle();
  const recoveries = [];
  t.after(async () => { await Promise.all(recoveries.map(recovery => recovery.stop())); await images.idle(); images.close(); store.close(); await rm(dir, { recursive: true, force: true, maxRetries: 3 }); });
  const id = name => store.posts({ scope: 'all' }).find(p => p.url.includes(`/${name}/`)).id, name = save => save.url.split('/').at(-2);
  return { store, images, id, name, recoveries };
}
function run(t, lib, visit, options = {}) {
  const recovery = imageRecovery({ store: lib.store, images: lib.images, visit, blocked: () => false, ...FAST, ...options });
  lib.recoveries.push(recovery);
  return recovery;
}
const found = save => ({ status: 'found', post: { url: save.url, text: 'Fuller caption', thumbnail: link(`${save.url.split('/').at(-2)}-new`), media: [], kind: 'image' } });

test('a visit brings a new link, the image is saved, and the post is not visited again', async t => {
  const lib = await library(t, [reel('One')]), visits = [];
  run(t, lib, async save => { visits.push(save); return found(save); });
  await until(() => lib.images.has(lib.id('One')) , 'the image'); await settle();
  assert.equal(visits.length, 1); assert.deepEqual(visits[0].accounts, ['@me']);
  const post = lib.store.post(lib.id('One'));
  assert.equal(post.thumbnail, link('One-new')); assert.equal(post.text, 'Fuller caption'); assert.deepEqual(post.accounts, ['@me']);
});

test('ticked saves come first, then unticked ones, and other saves are left alone', async t => {
  const lib = await library(t, [
    reel('Ticked', { collections: [{ account: '@me', name: 'Ideas', url: 'https://www.instagram.com/me/saved/ideas/1/' }] }),
    reel('Unticked', { collections: [{ account: '@me', name: 'Private', url: 'https://www.instagram.com/me/saved/private/2/' }] }),
    reel('Archived', { archived: true, collections: [{ account: '@me', name: 'Ideas', url: 'https://www.instagram.com/me/saved/ideas/1/' }] }),
    { url: 'https://www.pinterest.com/pin/123/', thumbnail: 'https://i.pinimg.com/old.jpg' },
    { url: 'https://x.com/alice/status/1', text: 'Plain text with no image' }
  ]), visits = [];
  setInstagramSaveList(lib.store, { account: '@me', collectionIds: [lib.store.instagramCollections().find(c => c.name === 'Ideas').id] });
  run(t, lib, async save => { visits.push(lib.name(save)); return found(save); });
  await until(() => visits.length >= 2, 'two visits'); await settle();
  assert.deepEqual(visits, ['Ticked', 'Unticked']);
});

test('nothing is visited while other work runs or new images are still downloading, and it resumes after', async t => {
  const lib = await library(t, [reel('One')]), visits = [];
  let busy = true;
  run(t, lib, async save => { visits.push(save); return found(save); }, { blocked: () => busy });
  await settle(); assert.equal(visits.length, 0, 'waits for a scan, unsave or sign-in');
  busy = false;
  await until(() => visits.length === 1, 'the visit');

  const queued = await library(t, [reel('Two')]), seen = [];
  queued.images.busy = () => true;
  run(t, queued, async save => { seen.push(save); return found(save); });
  await settle(); assert.equal(seen.length, 0, 'saves with working links go first');
});

test('a scan starting mid-visit stops the visit at once without counting it against the save', async t => {
  const lib = await library(t, [reel('One')]);
  let busy = false, visits = 0, aborted = 0;
  run(t, lib, (save, signal) => { visits++; if (visits === 1) { busy = true; return new Promise(resolve => signal.addEventListener('abort', () => { aborted++; resolve({ status: 'missing' }); })); } return Promise.resolve(found(save)); }, { blocked: () => busy });
  await until(() => aborted === 1, 'the visit to stop');
  assert.equal(lib.store.db.prepare('SELECT recovery_attempts AS n FROM post_images').get().n, 0);
  busy = false;
  await until(() => lib.images.has(lib.id('One')), 'the retry');
});

test('recovery never touches the sync queue, so scans and other work can start during a visit', async t => {
  const lib = await library(t, [reel('One')]), sync = syncQueue(lib.store);
  let release, entered = false;
  run(t, lib, save => { entered = true; return new Promise(resolve => { release = () => resolve(found(save)); }); });
  await until(() => entered, 'the visit');
  assert.equal(sync.status().job, null);
  assert.equal(sync.enqueue(['chrome']).status, 'queued');
  release();
});

test('a login or security check stops that site for a day without counting against the save', async t => {
  const lib = await library(t, [reel('One'), { url: 'https://x.com/alice/status/1', thumbnail: 'https://pbs.twimg.com/media/old.jpg' }]), visits = [];
  run(t, lib, async save => { visits.push(save.platform); return save.platform === 'instagram' ? { status: 'check' } : { status: 'missing' }; });
  await until(() => visits.includes('x') && visits.includes('instagram'), 'both sites'); await settle();
  assert.equal(visits.filter(platform => platform === 'instagram').length, 1);
  const until_ = Number(lib.store.get('image_recovery_paused:instagram'));
  assert(until_ > Date.now() + 23 * 3600000 && until_ <= Date.now() + 24 * 3600000);
  assert.equal(lib.store.db.prepare("SELECT recovery_attempts AS n FROM post_images WHERE post_id=?").get(lib.id('One')).n, 0);
});

test('a site with no signed-in account waits, and the save keeps its chances', async t => {
  const lib = await library(t, [reel('One')]);
  let visits = 0;
  run(t, lib, async () => { visits++; return { status: 'unavailable' }; });
  await until(() => visits === 1, 'the visit'); await settle();
  assert.equal(visits, 1);
  assert(Number(lib.store.get('image_recovery_paused:instagram')) > Date.now());
  assert.equal(lib.store.db.prepare('SELECT recovery_attempts AS n FROM post_images').get().n, 0);
});

test('repeated misses pause the site, and a post is dropped after three tries across days', async t => {
  const lib = await library(t, ['One', 'Two', 'Three', 'Four'].map(name => reel(name))), visits = [];
  run(t, lib, async save => { visits.push(lib.name(save)); return { status: 'missing' }; });
  await until(() => visits.length === 3, 'three misses'); await settle();
  assert.equal(visits.length, 3, 'three misses in a row stop it for now');
  assert(Number(lib.store.get('image_recovery_paused:instagram')) > Date.now());
  assert.equal(new Set(visits).size, 3, 'each miss was a different post');

  // Later days: a post that keeps failing is given up on, and a success is never revisited.
  const later = await library(t, [reel('Gone')]);
  const next = () => { later.store.db.prepare('UPDATE post_images SET recovery_at=0').run(); return later.images.nextRecovery(); };
  for (let i = 0; i < 3; i++) {
    const save = next(); assert.ok(save, `try ${i + 1}`); later.images.noteRecovery(save.id);
    // The daily retry of the old link must not wipe the count.
    later.store.db.prepare('UPDATE post_images SET attempted_at=0').run(); later.images.schedule(); await later.images.idle();
  }
  assert.equal(next(), null);
});

test('a success clears earlier misses, so only misses in a row pause the site', async t => {
  const lib = await library(t, ['A', 'B', 'C', 'D', 'E'].map(name => reel(name)));
  let visits = 0;
  run(t, lib, async save => { visits++; return visits === 3 ? found(save) : { status: 'missing' }; });
  await until(() => visits === 5, 'five visits'); await settle();
  assert.equal(Number(lib.store.get('image_recovery_paused:instagram') || 0), 0);
});

test('a post tried today waits until tomorrow, and a paused or disabled recovery visits nothing', async t => {
  const lib = await library(t, [reel('One')]);
  lib.images.noteRecovery(lib.id('One'));
  assert.equal(lib.images.nextRecovery(), null);
  lib.store.db.prepare('UPDATE post_images SET recovery_at=?').run(Date.now() - 86400000);
  assert.ok(lib.images.nextRecovery());
  assert.equal(lib.images.nextRecovery(['instagram']), null);

  const off = await library(t, [reel('Two')]), visits = [];
  off.store.set('image_recovery', 'false');
  run(t, off, async save => { visits.push(save); return found(save); });
  await settle(); assert.equal(visits.length, 0);
  off.store.set('image_recovery', 'true');
  await until(() => visits.length === 1, 'turning it back on');
});

test('turning recovery off stops a visit at once without counting it', async t => {
  const lib = await library(t, [reel('One')]);
  let aborted = 0, entered = false;
  run(t, lib, (save, signal) => { entered = true; return new Promise(resolve => signal.addEventListener('abort', () => { aborted++; resolve({ status: 'missing' }); })); });
  await until(() => entered, 'the visit');
  lib.store.set('image_recovery', 'false');
  await until(() => aborted === 1, 'the visit to stop');
  assert.equal(lib.store.db.prepare('SELECT recovery_attempts AS n FROM post_images').get().n, 0);
});

test('the Settings switch saves the choice, and refuses anything but on or off', async t => {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const { port } = probe.address(); await new Promise(resolve => probe.close(resolve));
  const origin = `http://localhost:${port}`, app = createApp({ origin }); app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await app.mcp.close(); app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); });
  const url = `http://127.0.0.1:${port}/api/image-recovery`, set = (body, headers = { Origin: origin }) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.deepEqual(await (await fetch(url)).json(), { enabled: true }, 'on by default');
  assert.deepEqual(await (await set({ enabled: false })).json(), { enabled: false });
  assert.equal(app.store.get('image_recovery'), 'false');
  assert.deepEqual(await (await fetch(url)).json(), { enabled: false });
  assert.equal((await set({ enabled: 'no' })).status, 400);
  assert.equal((await set({ enabled: true }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal(app.store.get('image_recovery'), 'false');
});

test('a failed visit is reported and recovery carries on, and stopping ends it', async t => {
  const lib = await library(t, [reel('One'), reel('Two')]), errors = [];
  const visited = [];
  let visits = 0;
  const recovery = run(t, lib, async save => { visits++; visited.push(lib.name(save)); if (visits === 1) throw new Error('Window crashed.'); return found(save); }, { onError: error => errors.push(error.message) });
  await until(() => visits >= 2 && errors.length === 1, 'the second visit');
  assert.notEqual(visited[1], visited[0], 'the failed post counts as tried, so it can’t hold up the others');
  await recovery.stop();
  const after = visits; await settle();
  assert.equal(visits, after);
});
