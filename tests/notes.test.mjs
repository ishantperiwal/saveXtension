import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createNoteAutosave } from '../public/notes.js';
import { Store } from '../server/store.mjs';

const post = { id: 1, url: 'https://x.com/i/status/123', notes: '' };
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('autosave serializes writes and keeps newer typing over an older response', async () => {
  const storage = memoryStorage(), calls = [], gates = [], states = [];
  let controller;
  controller = createNoteAutosave({ storage, delay: 60000,
    save: (id, notes) => { const gate = deferred(); gates.push(gate); calls.push({ id, notes }); return gate.promise; },
    onState: (_, state) => states.push(state),
    onSaved: saved => { if (saved.notes === 'First') assert.equal(controller.overlay([saved])[0].notes, 'Latest'); }
  });
  try {
    controller.edit(post, 'First'); const saving = controller.flush(post);
    controller.edit(post, 'Latest');
    assert.deepEqual(calls.map(c => c.notes), ['First']);
    gates[0].resolve({ ...post, notes: 'First' }); await setImmediate();
    assert.deepEqual(calls.map(c => c.notes), ['First', 'Latest']);
    gates[1].resolve({ ...post, notes: 'Latest' }); await saving;
    assert.equal(storage.getItem('savex-note-drafts'), '[]'); assert.equal(states.at(-1), 'saved');
  } finally { controller.dispose(); }
});

test('a failed save retains its draft through reload and resumes only for the matching post', async () => {
  const storage = memoryStorage();
  const offline = createNoteAutosave({ storage, delay: 60000, save: async () => { throw new Error('Offline'); } });
  offline.edit(post, 'Recover this note'); await offline.flush(post); offline.dispose();
  const calls = [], recovered = createNoteAutosave({ storage, delay: 60000, save: async (id, notes) => { calls.push({ id, notes }); return { ...post, notes }; } });
  try {
    assert.equal(recovered.value(post), 'Recover this note');
    await recovered.resume([{ ...post, url: 'https://x.com/i/status/456' }]); await recovered.flushAll(); assert.equal(calls.length, 0);
    await recovered.resume([post]); assert.equal(calls[0].notes, 'Recover this note');
    assert.equal(storage.getItem('savex-note-drafts'), '[]');
  } finally { recovered.dispose(); }
});

test('empty notes and edits to different saves remain independent', async () => {
  const storage = memoryStorage(), calls = [];
  const controller = createNoteAutosave({ storage, delay: 60000, save: async (id, notes) => { calls.push({ id, notes }); return { ...post, id, notes }; } });
  try {
    controller.edit(post, ''); controller.edit({ ...post, id: 2 }, 'Another save');
    assert.equal(controller.value({ ...post, notes: 'Old value' }), '');
    await controller.flushAll();
    assert.deepEqual(calls, [{ id: 1, notes: '' }, { id: 2, notes: 'Another save' }]);
  } finally { controller.dispose(); }
});

test('freeform note whitespace survives updates and backup restoration', () => {
  const store = new Store(':memory:'), restored = new Store(':memory:');
  try {
    store.importPosts([{ url: post.url, title: 'Existing metadata', tags: ['legacy'] }]);
    const value = '  indented note\n\n'; store.updatePost(1, { notes: value });
    assert.equal(store.post(1).notes, value); assert.equal(store.post(1).title, 'Existing metadata'); assert.deepEqual(store.post(1).tags, ['legacy']);
    restored.importPosts(store.posts()); assert.equal(restored.post(1).notes, value);
    store.updatePost(1, { notes: '' }); assert.equal(store.post(1).notes, '');
  } finally { store.close(); restored.close(); }
});
