import test from 'node:test';
import assert from 'node:assert/strict';
import { syncRetryRequest } from '../public/sync-report.js';

test('report retry keeps the original X account selection and targets only the failed platform', () => {
  const job = { targets: ['x', 'instagram', 'chrome'], xAccount: ['@one', '@two'], status: 'partial', results: [{ platform: 'x', account: '@two', status: 'failed' }, { platform: 'chrome', status: 'completed' }] };
  assert.deepEqual(syncRetryRequest(job, 'x').targets, ['x']);
  assert.deepEqual(syncRetryRequest(job, 'x').xAccount, ['@one', '@two']);
  assert.equal(syncRetryRequest(job, 'chrome'), null);
  assert.equal(syncRetryRequest(job, 'unknown'), null);
  assert.equal(syncRetryRequest({ ...job, xAccount: 'current' }, 'x').xAccount, '@two');
});

test('report retry keeps an Instagram collection-only scan scoped to its account and collection', () => {
  const job = { targets: ['instagram'], status: 'partial', instagramScope: { account: '@collector', selections: { '@collector': [42] } }, results: [{ platform: 'instagram', account: '@collector', status: 'partial' }] };
  const request = syncRetryRequest(job, 'instagram');
  assert.deepEqual(request.targets, ['instagram']);
  assert.equal(request.instagramAccount, '@collector');
  assert.equal(request.instagramCollectionId, 42);
  assert.equal(syncRetryRequest({ ...job, instagramScope: null }, 'instagram').instagramAccount, '@collector');
});
