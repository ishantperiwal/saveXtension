import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { TopicLibrary } from '../server/topics.mjs';
import { aiOrganize, planPrompt, readPlan } from '../server/ai-organize.mjs';

const step = fields => ({ topic: null, name: null, parent: null, sources: null, find: null, within: null, ...fields });
function setup(t, steps, { message = '', matches = {}, hidden = [] } = {}) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  store.importPosts([1, 2, 3, 4].map(n => ({ url: `https://x.com/alice/status/${n}`, text: `post ${n}`, sourceAccount: '@one' })));
  const ids = store.posts({ scope: 'all' }).map(post => post.id).sort((a, b) => a - b);
  const topics = new TopicLibrary(store, { hidden: () => hidden.map(index => ids[index]) }), searched = [];
  const search = {
    tool: () => ({ id: 'claude', name: 'Claude Code', model: 'Haiku 5.5' }),
    start(query, postIds) { searched.push({ query, postIds }); return { id: searched.length }; },
    job: id => { const { query, postIds } = searched[id - 1]; return { state: 'done', phase: 'text', done: 1, total: 1, matches: (matches[query] || []).map(index => [ids[index], 8]).filter(([post]) => postIds.includes(post)) }; },
    cancel() {},
  };
  const organize = aiOrganize({ search, topics, visibleIds: () => ids.filter((_, index) => !hidden.includes(index)), run: async () => JSON.stringify({ structured_output: { message, steps } }) });
  const finished = async () => { organize.start('do the thing'); for (;;) { const job = organize.current(); if (job.state !== 'running') return job; await new Promise(resolve => setTimeout(resolve, 5)); } };
  return { store, topics, organize, finished, ids, searched, names: () => topics.catalog().map(topic => topic.name), inTopic: name => store.post(ids[0]) && store.posts({ scope: 'all' }).filter(post => post.topics.includes(name)).map(post => post.id) };
}

test('a new topic with matching saves is one change, and one undo takes it all back', async t => {
  const { finished, names, inTopic, ids, organize, store } = setup(t, [step({ type: 'create_topic', name: 'AI in AE' }), step({ type: 'add_saves', topic: 'AI in AE', find: 'after effects' })], { matches: { 'after effects': [0, 2] } });
  const job = await finished();
  assert.equal(job.state, 'done'); assert.equal(job.open, 'AI in AE');
  assert.deepEqual(job.summary, ['Created AI in AE', 'Added 2 saves to AI in AE']);
  assert.deepEqual(inTopic('AI in AE').sort(), [ids[0], ids[2]].sort());
  assert.equal(store.db.prepare('SELECT count(*) c FROM mcp_changes').get().c, 1);
  organize.undo(job.changeId);
  assert.deepEqual(names(), []); assert.deepEqual(inTopic('AI in AE'), []);
});

test('deleting a topic never deletes a save, and undo brings it back with its saves', async t => {
  const { finished, topics, names, inTopic, ids, organize, store } = setup(t, [step({ type: 'delete_topic', topic: 'Old' })]);
  const { topic } = topics.create({ name: 'Old' }); topics.assign({ postIds: [ids[0], ids[1]], topicIds: [topic.id] });
  store.db.prepare('UPDATE posts SET archived=1 WHERE id=?').run(ids[1]);
  const job = await finished();
  assert.deepEqual(names(), []); assert.equal(store.db.prepare('SELECT count(*) c FROM posts').get().c, 4);
  organize.undo(job.changeId);
  assert.deepEqual(names(), ['Old']); assert.deepEqual(inTopic('Old').sort(), [ids[0], ids[1]].sort());
});

test('a request it can’t do changes nothing and says why', async t => {
  const { finished, store } = setup(t, [], { message: 'Saves can’t be deleted.' });
  const job = await finished();
  assert.equal(job.message, 'Saves can’t be deleted.'); assert.equal(job.changeId, null); assert.equal(store.db.prepare('SELECT count(*) c FROM mcp_changes').get().c, 0);
  assert.throws(() => readPlan(JSON.stringify({ structured_output: { message: '', steps: [{ type: 'delete_save' }] } })), /isn’t one this can do/);
});

test('saves the app hides are never searched or added', async t => {
  const { finished, searched, inTopic, ids } = setup(t, [step({ type: 'create_topic', name: 'New' }), step({ type: 'add_saves', topic: 'New', find: 'x' })], { matches: { x: [0, 1] }, hidden: [1] });
  await finished();
  assert(!searched[0].postIds.includes(ids[1])); assert.deepEqual(inTopic('New'), [ids[0]]);
});

test('if one step can’t be done, nothing is changed', async t => {
  const { finished, topics, names } = setup(t, [step({ type: 'create_topic', name: 'Fresh' }), step({ type: 'rename_topic', topic: 'A', name: 'B' })]);
  topics.create({ name: 'A' }); topics.create({ name: 'B' });
  const job = await finished();
  assert.equal(job.state, 'failed'); assert.match(job.error, /already in use/); assert.deepEqual(names().sort(), ['A', 'B']);
});

test('a new topic nothing matches isn’t created', async t => {
  const { finished, names } = setup(t, [step({ type: 'create_topic', name: 'Empty' }), step({ type: 'add_saves', topic: 'Empty', find: 'nothing' })]);
  const job = await finished();
  assert.deepEqual(names(), []); assert.match(job.message, /nothing changed/);
});

test('moving saves only looks inside that topic, and an empty new topic can still be asked for', async t => {
  const { finished, topics, inTopic, ids, searched, names } = setup(t, [step({ type: 'create_topic', name: 'Later' }), step({ type: 'create_topic', name: 'Target' }), step({ type: 'move_saves', topic: 'Target', within: 'Source', find: 'x' })], { matches: { x: [0, 3] } });
  const { topic } = topics.create({ name: 'Source' }); topics.assign({ postIds: [ids[0], ids[1]], topicIds: [topic.id] });
  await finished();
  assert.deepEqual(searched[0].postIds.sort(), [ids[0], ids[1]].sort());
  assert.deepEqual(inTopic('Target'), [ids[0]]); assert.deepEqual(inTopic('Source'), [ids[1]]); assert(names().includes('Later'));
});

test('too many whole-library reads are refused before any are made', async t => {
  const finding = Array.from({ length: 6 }, (_, index) => step({ type: 'add_saves', topic: 'T', find: `f${index}` }));
  const { finished, searched, topics } = setup(t, finding);
  topics.create({ name: 'T' });
  const job = await finished();
  assert.equal(job.state, 'failed'); assert.match(job.error, /6 times/); assert.equal(searched.length, 0);
});

test('the planning prompt holds the request and topics, and no post text', () => {
  const prompt = planPrompt('tidy up', [{ name: 'Tech', count: 3, parent: '', description: '' }]);
  assert.match(prompt, /tidy up/); assert.match(prompt, /Tech/); assert.doesNotMatch(prompt, /text/);
});

test('many changes of one kind read as one line, and a few stay as they are', async () => {
  const { shortSummary } = await import('../public/organize.js');
  const deleted = ['A', 'B', 'C'].map(name => `Deleted the topic ${name}. Its saves are still in your library`);
  assert.deepEqual(shortSummary(['Created Fonts', 'Added 13 saves to Fonts', ...deleted]), ['Created Fonts', 'Added 13 saves to Fonts', 'Deleted 3 topics. Their saves are still in your library']);
  assert.deepEqual(shortSummary(['Created A', 'Created B', 'Renamed C to D']), ['Created A', 'Created B', 'Renamed C to D']);
  assert.deepEqual(shortSummary(['Moved A into B', 'Moved C into B', 'Moved D to the top level', 'Moved 2 saves from E to F']), ['Moved 3 topics', 'Moved 2 saves from E to F']);
});

test('it can see and delete a topic whose saves are all hidden, as the app shows it, at 0', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  store.importPosts([{ url: 'https://x.com/a/status/1', text: 'one' }, { url: 'https://x.com/a/status/2', text: 'two' }]);
  const ids = store.posts({ scope: 'all' }).map(post => post.id), topics = new TopicLibrary(store), { topic } = topics.create({ name: 'Business' });
  topics.assign({ postIds: [ids[0]], topicIds: [topic.id], mode: 'add' });
  let prompt = '';
  const organize = aiOrganize({ search: { tool: () => ({ id: 'claude', name: 'Claude Code', model: 'Haiku 5.5' }), cancel() {} }, topics, visibleIds: () => [ids[1]], run: async (tool, request) => { prompt = request.prompt; return JSON.stringify({ structured_output: { message: '', steps: [step({ type: 'delete_topic', topic: 'Business' })] } }); } });
  const job = organize.start('Delete Business');
  for (let tries = 0; organize.current().state === 'running' && tries < 200; tries++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(organize.current().state, 'done', organize.current().error); assert.equal(job.id, organize.current().id);
  assert.match(prompt, /Business/); assert.match(prompt, /"saves":0/);
  assert.equal(store.db.prepare("SELECT count(*) c FROM topics WHERE name='Business'").get().c, 0);
  assert.deepEqual(store.post(ids[0]).topics, []);
});
