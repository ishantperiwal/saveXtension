import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { syncQueue } from '../server/sync.mjs';
import { syncAvailability, lastSyncTime, syncAge } from '../public/sync-state.js';

test('sync checks the current browser and the connected Chrome helper before offering a download', () => {
  assert.equal(syncAvailability(null, null), 'missing');
  assert.equal(syncAvailability({ online: false, ready: true }), 'offline');
  assert.equal(syncAvailability({ online: true, ready: false }), 'permissions');
  assert.equal(syncAvailability({ online: true, ready: true }), 'ready');
  assert.equal(syncAvailability(null, { ready: false }), 'permissions');
  assert.equal(syncAvailability({ online: false }, { ready: true }), 'ready');
  assert.equal(syncAvailability({ online: true, ready: true }, { ready: false }), 'ready');
});

test('remembers installed Chrome across server restarts and opens setup only once for its browser', () => {
  const store = new Store(':memory:');
  try {
    const queue = syncQueue(store);
    queue.heartbeat({ instance: 'my-chrome', ready: false, version: '1.2.0' });
    const restarted = syncQueue(store);
    assert.equal(restarted.status().browser.instance, 'my-chrome');
    assert.equal(restarted.status().browser.version, '1.2.0');
    restarted.requestSetup();
    assert.equal(restarted.takeSetup('another-chrome'), false);
    assert.equal(restarted.takeSetup('my-chrome'), true);
    assert.equal(restarted.takeSetup('my-chrome'), false);
    store.set('sync_browser', JSON.stringify({ instance: 'my-chrome', ready: true, seenAt: Date.now() - 100000 }));
    assert.equal(syncAvailability(syncQueue(store).status().browser), 'offline');
  } finally { store.close(); }
});

test('sync ages use compact recent times and estimated older periods', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  const age = minutes => syncAge(new Date(now - minutes * 60000).toISOString(), now);
  assert.equal(age(0), 'just now'); assert.equal(age(.5), 'just now');
  assert.equal(age(8), '8m ago'); assert.equal(age(95), '1h ago');
  assert.equal(age(24 * 60), '1d ago'); assert.equal(age(2.5 * 24 * 60), '2d ago');
  assert.equal(age(9 * 24 * 60), '1w ago'); assert.equal(age(22 * 24 * 60), '3w ago');
  assert.equal(age(40 * 24 * 60), '1mo ago'); assert.equal(age(90 * 24 * 60), '3mo ago');
  assert.equal(age(400 * 24 * 60), '1y ago');
  assert.equal(age(-5), 'just now'); assert.equal(syncAge(null, now), null);
});

test('failed attempts do not replace the persisted last successful sync time', () => {
  const store = new Store(':memory:');
  try {
    const queue = syncQueue(store), instance = 'chrome';
    assert.equal(queue.status().lastSyncedAt, null);
    const job = queue.enqueue(['x']); queue.claim(instance); queue.update(job.id, instance, { status: 'partial' });
    const earlier = new Date(Date.now() - 3600000).toISOString();
    store.db.prepare('UPDATE sync_jobs SET updated_at=? WHERE id=?').run(earlier, job.id);
    const failed = queue.enqueue(['x']); queue.claim(instance); queue.update(failed.id, instance, { status: 'failed' });
    assert.equal(queue.status().lastSyncedAt, earlier);
    assert.equal(syncQueue(store).status().lastSyncedAt, earlier);
    assert.equal(lastSyncTime(queue.status()), earlier);
    assert.equal(lastSyncTime({ job: { status: 'failed', updated_at: new Date().toISOString() } }, [{ status: 'partial', finishedAt: earlier }]), earlier);
    const cancelled = queue.enqueue(['x']); queue.cancel();
    assert.equal(queue.status().job.id, cancelled.id); assert.equal(queue.status().lastSyncedAt, earlier);
  } finally { store.close(); }
});
