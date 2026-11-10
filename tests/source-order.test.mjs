import test from 'node:test';
import assert from 'node:assert/strict';
import { orderLibraryPosts, showsSiteList } from '../public/source-order.js';

const FAR = '9999-01-01T00:00:00.000Z', ADDED = '2026-11-06T10:00:00.000Z';
const post = (id, platform, lists = []) => ({ id, platform, accounts: ['@me'], addedAt: ADDED, sourceOrder: lists.map(([collection, position]) => ({ account: '@me', collection, position, observedAt: FAR })) });
const ids = (posts, filters) => orderLibraryPosts(posts, filters).map(item => item.id);

test('one Instagram account follows All posts, and a post not in it goes below', () => {
  // A scan adds a first, so the last added, c, would otherwise be on top.
  const posts = [post(1, 'instagram', [[null, 0]]), post(2, 'instagram', [[null, 1]]), post(3, 'instagram', [[null, 2]]), post(4, 'instagram', [[7, 0]])];
  assert.deepEqual(ids(posts, { accounts: ['instagram:@me'] }), [1, 2, 3, 4]);
});

test('a collection follows its own list, not All posts', () => {
  const posts = [post(1, 'instagram', [[null, 0], [7, 1]]), post(2, 'instagram', [[null, 1], [7, 0]])];
  assert.deepEqual(ids(posts, { accounts: [], collection: '7' }), [2, 1]);
});

test('one board follows its list, and the whole library keeps other platforms in their slots', () => {
  assert.deepEqual(ids([post(1, 'pinterest', [[9, 0]]), post(2, 'pinterest', [[9, 1]])], { accounts: [], collection: '9' }), [1, 2]);
  assert.deepEqual(ids([post(5, 'chrome'), post(1, 'instagram', [[null, 0]]), post(2, 'instagram', [[null, 1]])], { accounts: [] }), [5, 1, 2]);
});

test('date headings only go away when one list is on show', () => {
  assert.equal(showsSiteList({ accounts: ['instagram:@a.b'] }), true);
  assert.equal(showsSiteList({ accounts: [], collection: '7' }), true);
  assert.equal(showsSiteList({ accounts: ['instagram:@a', 'x:@b'] }), false);
  assert.equal(showsSiteList({ accounts: [] }), false);
});
