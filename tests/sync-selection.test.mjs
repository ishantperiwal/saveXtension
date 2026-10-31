import test from 'node:test';
import assert from 'node:assert/strict';
import { syncAccountOptions, legacySyncSelection, syncSelectionRequest } from '../public/sync-selection.js';
import { syncAge } from '../public/sync-state.js';
import { Store } from '../server/store.mjs';
import { syncQueue } from '../server/sync.mjs';
const catalog = { active: '@alpha', accounts: ['@alpha', '@beta', '@gamma'].map(handle => ({ handle })) };

test('chip selection migrates old choices and queues exactly the chosen accounts', () => {
  assert.deepEqual(legacySyncSelection('x', 'current', null), ['x:current']);
  assert.equal(syncAccountOptions([], null).find(option => option.platform === 'x').value, 'x:current');
  assert.equal(syncSelectionRequest(['x:current'], null).xAccount, 'current');
  assert.deepEqual(legacySyncSelection('both', 'current', catalog), ['instagram:current', 'x:@alpha']);
  assert.deepEqual(syncSelectionRequest(['x:@beta'], catalog), { targets: ['x'], xAccount: '@beta' });
  assert.deepEqual(syncSelectionRequest(['x:@alpha', 'x:@gamma', 'chrome:*'], catalog), { targets: ['chrome', 'x'], xAccount: ['@alpha', '@gamma'] });
  assert.equal(syncSelectionRequest(['x:@alpha', 'x:@beta', 'x:@gamma'], catalog).xAccount, 'all');
  assert.deepEqual(syncSelectionRequest([], catalog).targets, []);
});
test('save counts exclude archives and count a shared save once for each associated account', () => {
  const posts = [{ platform: 'x', accounts: ['@alpha', '@beta'] }, { platform: 'x', accounts: ['@alpha'], archived: true }, { platform: 'instagram', accounts: ['@ig'] }];
  const options = syncAccountOptions(posts, catalog);
  assert.equal(options.find(option => option.value === 'x:@alpha').count, 1);
  assert.equal(options.find(option => option.value === 'x:@beta').count, 1);
  assert.equal(options.find(option => option.value === 'x:@gamma').count, 0);
  assert.equal(options.find(option => option.platform === 'instagram').label, '@ig');
  assert.equal(syncAge('2026-11-01T10:00:00Z', Date.parse('2026-11-01T10:23:00Z'), { long: true }), '23 minutes ago');
});
test('explicit account subsets persist and cannot be claimed by helpers that would import extra accounts', () => {
  const store = new Store(':memory:');
  try {
    const queue = syncQueue(store);
    assert.throws(() => queue.enqueue(['x'], ['all']), /valid X accounts/);
    assert.throws(() => queue.enqueue(['x'], []), /valid X accounts/);
    const job = queue.enqueue(['x'], ['@Alpha', '@gamma', '@ALPHA']);
    assert.deepEqual(job.xAccount, ['@alpha', '@gamma']);
    assert.deepEqual(syncQueue(store).status().job.xAccount, ['@alpha', '@gamma']);
    assert.equal(queue.claim('old-helper', true), null);
    assert.equal(queue.claim('updated-helper', true, { selectedAccounts: true }).id, job.id);
  } finally { store.close(); }
});
