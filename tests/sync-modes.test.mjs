import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Store } from '../server/store.mjs';
import { syncQueue } from '../server/sync.mjs';
import { createApp } from '../server/app.mjs';

test('sync defaults to quick; deep scans require an explicit request and a capable helper', () => {
  const store = new Store(':memory:');
  try {
    const queue = syncQueue(store);
    assert.equal(queue.status().job, null);
    const quick = queue.enqueue(['x']); assert.equal(quick.mode, 'quick'); queue.cancel();
    const deep = queue.enqueue(['x'], 'current', 'deep'); assert.equal(deep.mode, 'deep');
    assert.equal(queue.claim('old-helper', true), null);
    assert.equal(queue.claim('new-helper', true, { syncModes: true }).mode, 'deep');
    queue.update(deep.id, 'new-helper', { status: 'partial' });
    assert.equal(syncQueue(store).status().job.status, 'partial');
    assert.equal(syncQueue(store).claim('new-helper', true, { syncModes: true }), null);
    assert.throws(() => queue.enqueue(['x'], 'current', 'automatic'), /quick check/);
  } finally { store.close(); }
});

test('a background check stays out of sight unless it finds new saves, and gives way to anything a person starts', () => {
  const store = new Store(':memory:');
  try {
    const queue = syncQueue(store);
    const finish = (job, status, results) => store.db.prepare('UPDATE sync_jobs SET status=?,results=? WHERE id=?').run(status, JSON.stringify(results), job.id);
    const mine = queue.enqueue(['x', 'instagram']); finish(mine, 'partial', []);
    const check = queue.enqueue(['x'], 'all', 'quick', 'current', null, 'current', null, true);
    assert.equal(check.quiet, true); assert.equal(queue.status().job.id, check.id);
    assert.equal(queue.presented().job.id, mine.id, 'hidden while it runs');
    assert.equal(queue.chosenJob().id, mine.id, 'and it never becomes the scan to repeat');
    finish(check, 'partial', [{ platform: 'x', imported: 0, status: 'partial', message: 'stalled' }]);
    assert.equal(queue.presented().job.id, mine.id, 'hidden when it found nothing, even with a problem');
    finish(check, 'partial', [{ platform: 'x', imported: 2, status: 'partial' }, { platform: 'instagram', imported: 0, status: 'completed' }]);
    const shown = queue.presented().job;
    assert.equal(shown.id, check.id); assert.equal(shown.status, 'completed'); assert.deepEqual(shown.targets, ['x']); assert.deepEqual(shown.results.map(result => result.platform), ['x']);
    const again = queue.enqueue(['x'], 'all', 'quick', 'current', null, 'current', null, true);
    queue.giveWay();
    assert.equal(queue.status().job.id, again.id); assert.equal(queue.status().job.status, 'cancelled');
    const person = queue.enqueue(['x']); queue.giveWay();
    assert.equal(queue.status().job.id, person.id); assert.equal(queue.status().job.status, 'queued', 'a scan someone asked for is left alone');
  } finally { store.close(); }
});

test('discovery markers are scoped by source account and survive archive, but not deletion', () => {
  const store = new Store(':memory:');
  try {
    const runId = store.startRun('local', 'x', '@Alpha');
    const run = store.run(runId, 'local');
    const input = [{ url: 'https://x.com/writer/status/10', sourceAccount: '@Alpha' }];
    store.importPosts(input); store.recordDiscoveries(run, input);
    store.importPosts([{ url: 'https://x.com/writer/status/20', sourceAccount: '@Beta' }]);
    assert.deepEqual(store.knownPostIds('x', '@alpha'), ['10']);
    assert.deepEqual(store.knownPostIds('x', '@Beta'), ['20']);
    assert.deepEqual(store.knownPostIds('instagram', '@alpha'), []);
    const p = store.posts().find(p => p.externalId === '10');
    store.updatePost(p.id, { archived: true });
    assert.deepEqual(store.knownPostIds('x', '@alpha'), ['10']);
    store.deletePost(p.id); assert.deepEqual(store.knownPostIds('x', '@alpha'), []);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM sync_discoveries').get().n, 0);
  } finally { store.close(); }
});

test('complete list metadata and successful details do not expire; failures have a retry delay', () => {
  const store = new Store(':memory:');
  try {
    const runId = store.startRun('local', 'x', '@alpha'); const run = store.run(runId, 'local');
    const inputs = [
      { url: 'https://x.com/a/status/1', text: 'Already captured', author: 'a', sourceAccount: '@alpha' },
      { url: 'https://x.com/a/status/2', sourceAccount: '@alpha' },
      { url: 'https://x.com/a/status/3', sourceAccount: '@alpha' }
    ];
    store.importPosts(inputs); store.recordDiscoveries(run, inputs);
    store.set('detail:https://x.com/i/status/2', String(Date.now() - 10 * 86400000));
    store.set('detail-attempt:https://x.com/i/status/3', String(Date.now()));
    assert.equal(store.detailCandidates('x', '@alpha', runId).length, 0);
    store.set('detail-attempt:https://x.com/i/status/3', String(Date.now() - 2 * 86400000));
    assert.deepEqual(store.detailCandidates('x', '@alpha', runId).map(p => p.externalId), ['3']);
    const next = store.startRun('local', 'x', '@alpha');
    assert.equal(store.detailCandidates('x', '@alpha', next).length, 0);
  } finally { store.close(); }
});

test('missing posts stay saved unless a manual deep scan supplies two matching explicit unsaved states', async () => {
  const app = createApp({ origin: 'http://localhost:3233' });
  app.server.listen(3233, '127.0.0.1'); await once(app.server, 'listening');
  async function request(path, input) {
    const response = await fetch(`http://localhost:3233/api/extension${path}`, { method: input === undefined ? 'GET' : 'POST', headers: { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'Content-Type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input) });
    return { status: response.status, data: await response.json() };
  }
  try {
    app.store.importPosts([
      { url: 'https://x.com/a/status/1', accounts: ['@alpha', '@beta'], notes: 'Shared note' },
      { url: 'https://x.com/a/status/2', accounts: ['@alpha'] },
      { url: 'https://x.com/a/status/3', accounts: ['@alpha'] }
    ]);
    const quick = (await request('/runs', { platform: 'x', account: '@alpha' })).data.runId;
    assert.equal((await request(`/runs/${quick}/missing`)).status, 409);
    const deep = (await request('/runs', { platform: 'x', account: '@alpha', mode: 'deep' })).data.runId;
    assert.equal((await request(`/runs/${deep}`, { posts: [{ url: 'https://x.com/a/status/3' }] })).status, 200);
    assert.deepEqual((await request(`/runs/${deep}/missing`)).data.posts.map(p => p.externalId), ['1', '2']);
    const observation = (id, account = '@alpha') => ({ state: 'unsaved', externalId: id, account });
    const url = 'https://x.com/a/status/1';
    assert.equal((await request(`/runs/${deep}/missing`, { url })).data.removed, false);
    assert.equal(app.store.posts().length, 3);
    assert.equal((await request(`/runs/${deep}/missing`, { url, observations: [observation('1')] })).status, 400);
    assert.equal((await request(`/runs/${deep}/missing`, { url, observations: [observation('1'), observation('1', '@beta')] })).status, 400);
    assert.equal((await request(`/runs/${deep}/missing`, { url, observations: [observation('1'), observation('1')] })).data.removed, true);
    const shared = app.store.posts().find(p => p.externalId === '1');
    assert.deepEqual(shared.accounts, ['@beta']); assert.equal(shared.notes, 'Shared note');
    assert.equal((await request(`/runs/${deep}/missing`, { url: 'https://x.com/a/status/2', observations: [observation('2'), observation('2')] })).data.removed, true);
    assert.equal(app.store.posts().some(p => p.externalId === '2'), false);
    assert.equal((await request(`/runs/${deep}/missing`, { url: 'https://x.com/a/status/3', observations: [observation('3'), observation('3')] })).status, 409);
    assert.equal(app.store.posts().some(p => p.externalId === '3'), true);
  } finally { app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); }
});
