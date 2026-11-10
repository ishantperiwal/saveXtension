import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { listReadSoFar, listScanFinished, missingFromList, savedListGate } from '../server/list-changes.mjs';
import { orderLibraryPosts } from '../public/source-order.js';

const url = id => `https://www.instagram.com/p/${id}/`;
const FILTERS = { accounts: ['instagram:@me'] };
function library(t) {
  const store = new Store(':memory:'); t.after(() => store.close());
  const shown = () => orderLibraryPosts(store.posts(), FILTERS).map(post => post.externalId);
  const run = id => ({ id, platform: 'instagram', account: '@me', collection_id: null, mode: 'quick' });
  // What a real batch does: adds the posts, then notes where they were read.
  const batch = (scan, ...ids) => { const posts = ids.map(id => ({ url: url(id), text: id, sourceAccount: '@me' })); store.importPosts(posts); listReadSoFar(store, scan, posts); };
  const finish = (scan, status, seenIds) => { listScanFinished(store, scan, status); missingFromList(store, scan, { status, seenIds }); };
  return { store, shown, run, batch, finish };
}

test('posts show newest first while a scan is still adding them, batch after batch', t => {
  const { shown, run, batch } = library(t), scan = run('one');
  batch(scan, 'a', 'b'); assert.deepEqual(shown(), ['a', 'b']);
  batch(scan, 'c', 'd', 'e'); assert.deepEqual(shown(), ['a', 'b', 'c', 'd', 'e']);
});

test('a later quick scan puts its new posts above, in their order', t => {
  const { shown, run, batch, finish } = library(t), first = run('one');
  batch(first, 'c', 'd', 'e'); finish(first, 'completed', ['c', 'd', 'e']);
  const second = run('two');
  batch(second, 'a', 'b'); assert.deepEqual(shown(), ['a', 'b', 'c', 'd', 'e']);
  finish(second, 'completed', ['a', 'b', 'c', 'd', 'e']); assert.deepEqual(shown(), ['a', 'b', 'c', 'd', 'e']);
});

test('a scan that stops partway keeps its order, and so does one the app closed during', t => {
  const { store, shown, run, batch, finish } = library(t), first = run('one');
  batch(first, 'c', 'd'); finish(first, 'completed', ['c', 'd']);
  const stopped = run('two');
  batch(stopped, 'a', 'b'); finish(stopped, 'partial');
  assert.deepEqual(shown(), ['a', 'b', 'c', 'd']);
  assert.ok(!store.get('list-reading:instagram:@me:all'));
  const closed = run('three');
  batch(closed, 'y', 'z'); // The app closes here, so this scan never finishes.
  batch(run('four'), 'x');
  assert.deepEqual(shown(), ['x', 'y', 'z', 'a', 'b', 'c', 'd']);
});

test('the finished read decides the order, so a post that moved up shows there', t => {
  const { shown, run, batch, finish } = library(t), first = run('one');
  batch(first, 'a', 'b', 'c'); finish(first, 'completed', ['a', 'b', 'c']);
  finish(run('two'), 'completed', ['c', 'a', 'b']);
  assert.deepEqual(shown(), ['c', 'a', 'b']);
});

const pinGate = (store, seenIds, extra = {}) => savedListGate(store, { id: 'gate', platform: 'pinterest', account: '@me', collection_id: null }, { status: 'completed', seenIds, ...extra });
const pinRemember = (store, seenIds) => missingFromList(store, { id: 'gate', platform: 'pinterest', account: '@me', collection_id: null, mode: 'quick' }, { status: 'completed', seenIds });

test('All pins skips the boards only when nothing changed', t => {
  const { store } = library(t);
  assert.equal(pinGate(store, ['1', '2', '3']), true, 'nothing remembered yet');
  pinRemember(store, ['1', '2', '3']);
  store.db.prepare(`DELETE FROM settings WHERE key='pinterest-collections-pending:@me'`).run();
  assert.equal(pinGate(store, ['1', '2', '3'], { reachedEnd: true }), false);
  assert.equal(pinGate(store, ['9', '1', '2', '3']), true, 'a new pin');
});

test('a pin gone from All pins means reading the boards, including for its second read', t => {
  const { store } = library(t);
  pinRemember(store, ['1', '2', '3']);
  const clear = () => store.db.prepare(`DELETE FROM settings WHERE key='pinterest-collections-pending:@me'`).run();
  clear(); assert.equal(pinGate(store, ['1', '3']), true, 'gone from the middle');
  clear(); assert.equal(pinGate(store, ['1', '2'], { reachedEnd: true }), true, 'gone from the end');
  clear(); pinRemember(store, ['1', '2']); store.set('pin-missing:4:3', String(Date.now()));
  assert.equal(pinGate(store, ['1', '2'], { reachedEnd: true }), true, 'waiting on its second board read');
});
