import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundChecks } from '../server/background-checks.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function setup(t, options = {}) {
  const calls = []; let clock = 1000;
  const checks = backgroundChecks({ check: async request => { calls.push(request); return options.answer ? options.answer(calls.length) : true; }, every: 100000, jitter: 0, returnAfter: 600, retry: 1, retries: 3, now: () => clock, ...options.settings });
  t.after(() => checks.stop());
  return { checks, calls, advance: ms => { clock += ms; } };
}

test('checks repeat on a timer', async t => {
  const { calls } = setup(t, { settings: { every: 5 } });
  await wait(40);
  assert.ok(calls.length >= 2, `${calls.length} checks`);
});
test('coming back checks only after enough time has passed', async t => {
  const { checks, calls, advance } = setup(t);
  checks.returned(); await wait(1);
  assert.equal(calls.length, 0, 'not straight after the last check');
  advance(600); checks.returned(); await wait(1);
  assert.equal(calls.length, 1);
  checks.returned(); await wait(1);
  assert.equal(calls.length, 1, 'that check resets the wait');
});
test('a save in the panel checks that platform at once, and waits its turn behind a running scan', async t => {
  const { checks, calls } = setup(t, { answer: count => count > 2 });
  checks.saved({ targets: ['x'] }); await wait(30);
  assert.equal(calls.length, 3); assert.deepEqual(calls.at(-1), { targets: ['x'] });
});
test('a save gives up after its retries, a failed check is reported, and stop ends everything', async t => {
  const errors = [];
  const stuck = setup(t, { answer: () => false });
  stuck.checks.saved({ targets: ['x'] }); await wait(30);
  assert.equal(stuck.calls.length, 4);
  const failing = backgroundChecks({ check: async () => { throw new Error('nope'); }, onError: error => errors.push(error.message), every: 100000, jitter: 0, returnAfter: 0, now: () => 1 });
  failing.returned(); await wait(1);
  assert.deepEqual(errors, ['nope']);
  failing.stop(); failing.returned(); await wait(1);
  assert.equal(errors.length, 1);
});
