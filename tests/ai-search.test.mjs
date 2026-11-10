import test from 'node:test';
import assert from 'node:assert/strict';
import { aiSearch, imageArguments, imageMessage, readImageResults, readMatches, searchArguments, searchChunks } from '../server/ai-search.mjs';

const post = (id, text) => ({ id, platform: 'x', text, topics: [] });
const reply = matches => JSON.stringify({ is_error: false, structured_output: { matches } });
const settings = () => { const values = new Map(); return { get: key => values.get(key), set: (key, value) => values.set(key, value) }; };
const finished = async (search, id) => { for (;;) { const job = search.job(id); if (job.state !== 'running') return job; await new Promise(resolve => setTimeout(resolve, 2)); } };
function setup(posts, run) {
  const search = aiSearch({ store: settings(), visiblePosts: () => posts, find: () => '/fake/claude', isSignedIn: async () => true, run });
  search.choose('claude');
  return search;
}

test('the AI tool gets no tools and none of the person\'s settings', () => {
  const args = searchArguments();
  assert.equal(args[args.indexOf('--tools') + 1], ''); assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.ok(args.includes('--strict-mcp-config')); assert.ok(args.includes('--no-session-persistence')); assert.ok(!args.includes('--mcp-config'));
});

test('every post\'s whole text goes out, in batches under the limit', () => {
  const long = Array.from({ length: 4000 }, (_, index) => `word${index}`).join(' ');
  const chunks = searchChunks([post(1, long), post(2, 'short post')], 3000);
  assert.ok(chunks.length > 2);
  for (const chunk of chunks) assert.ok(chunk.reduce((sum, item) => sum + item.text.length, 0) <= 3000);
  const sent = chunks.flat().map(item => item.text).join(' ');
  for (const word of ['word0', 'word2000', 'word3999', 'short post']) assert.ok(sent.includes(word), word);
});

test('only IDs that were sent, with a real score, are accepted', () => {
  const chunk = [{ id: 1, text: 'a' }, { id: 2, text: 'b' }];
  assert.deepEqual(readMatches(reply([{ id: 1, score: 9 }, { id: 99, score: 10 }, { id: 2, score: 2 }, { id: 2, score: 'high' }, { id: 2, score: 50 }]), chunk), [{ id: 1, score: 9 }]);
  assert.throws(() => readMatches('not json', chunk));
  assert.throws(() => readMatches(JSON.stringify({ is_error: false, result: 'plain text' }), chunk));
  assert.throws(() => readMatches(JSON.stringify({ is_error: true, result: 'Failed to authenticate' }), chunk), /signed-out/);
});

test('a search runs through every batch, and only the posts asked about are sent', async () => {
  const prompts = [], posts = [post(1, 'fonts'), post(2, 'bread'), post(3, 'hidden from this search')];
  const search = setup(posts, async (_path, prompt) => { prompts.push(prompt); return reply([{ id: 1, score: 8 }]); });
  const job = await finished(search, search.start('typography', [1, 2]).id);
  assert.equal(job.state, 'done'); assert.deepEqual(job.matches, [[1, 8]]);
  assert.match(prompts[0], /typography/); assert.ok(!prompts.join().includes('hidden from this search'));
});

test('a signed-out tool says how to fix it, and one bad batch doesn\'t lose the others', async () => {
  const signedOut = setup([post(1, 'a')], async () => JSON.stringify({ is_error: true, result: 'OAuth session expired' }));
  const failed = await finished(signedOut, signedOut.start('x').id);
  assert.equal(failed.state, 'failed'); assert.match(failed.error, /isn’t signed in/);
  const nothing = setup([post(1, 'a')], async () => 'broken');
  const none = await finished(nothing, nothing.start('x').id);
  assert.equal(none.state, 'failed'); assert.match(none.error, /couldn’t run/); assert.equal(none.note, '');
  let tries = 0;
  const flaky = setup([post(1, 'a')], async () => (tries++ ? reply([{ id: 1, score: 7 }]) : 'broken'));
  const recovered = await finished(flaky, flaky.start('x').id);
  assert.deepEqual([recovered.state, recovered.failed, recovered.error, recovered.note, recovered.matches], ['done', 0, '', '', [[1, 7]]]);
  let calls = 0;
  const posts = Array.from({ length: 80 }, (_, index) => post(index + 1, 'y'.repeat(900)));
  const mixed = setup(posts, async (_tool, prompt) => { calls++; return prompt.includes('"id":80,') ? 'broken' : reply([{ id: 1, score: 7 }]); });
  const job = await finished(mixed, mixed.start('x').id);
  assert.equal(job.state, 'done'); assert.equal(job.failed, 1); assert.deepEqual(job.matches, [[1, 7]]);
  assert.equal(job.error, ''); assert.match(job.note, /Searched 2 of 3 batches/);
  assert.equal(calls, 4, 'the failed batch was tried twice');
});

test('install and sign-in run only for listed tools, one at a time, and report failure', async () => {
  const calls = []; let finish, fail, installed = false;
  const search = aiSearch({ store: settings(), visiblePosts: () => [], find: file => (file === 'claude' && installed ? '/fake/claude' : ''), isSignedIn: async () => false, act: (tool, kind) => { calls.push([tool.id, kind]); return new Promise((resolve, reject) => { finish = resolve; fail = reject; }); } });
  let listing = await search.tools();
  assert.equal(listing.tools.find(tool => tool.id === 'claude').installed, false);
  assert.throws(() => search.act('something-else', 'install')); assert.throws(() => search.act('claude', 'rm -rf')); assert.throws(() => search.act('claude', 'login'));
  search.act('claude', 'install');
  assert.throws(() => search.act('codex', 'install'), /Still working/);
  await new Promise(resolve => setTimeout(resolve, 2));
  assert.deepEqual(calls, [['claude', 'install']]);
  assert.equal((await search.tools()).tools.find(tool => tool.id === 'claude').busy, 'install');
  installed = true; finish(); await new Promise(resolve => setTimeout(resolve, 2));
  listing = await search.tools();
  assert.deepEqual([listing.tools[0].installed, listing.tools[0].busy, listing.tools[0].signedIn], [true, '', false]);
  search.act('claude', 'login'); await new Promise(resolve => setTimeout(resolve, 2));
  fail(new Error('no')); await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal((await search.tools()).tools[0].failed, 'login');
});

test('a new search stops the old one', async () => {
  let firstSignal;
  const search = setup([post(1, 'a')], (_path, _prompt, signal) => new Promise((resolve, reject) => { firstSignal ??= signal; signal.addEventListener('abort', () => reject(new Error('stopped'))); }));
  const first = search.start('one');
  await new Promise(resolve => setTimeout(resolve, 5));
  search.start('two');
  assert.equal(firstSignal.aborted, true);
  assert.equal(search.job(first.id), null);
  search.cancel();
});

test('the AI switch is Claude Code, Codex or nothing, because MiniLM is always on', () => {
  const search = aiSearch({ store: settings(), visiblePosts: () => [], find: () => '/fake/tool', isSignedIn: async () => true, hasLocal: () => true });
  assert.equal(search.summary().selected, ''); assert.equal(search.summary().localReady, true);
  search.choose('claude'); assert.equal(search.summary().selected, 'claude');
  search.choose('codex'); assert.equal(search.summary().selected, 'codex');
  assert.throws(() => search.choose('minilm'));
  search.choose(''); assert.equal(search.summary().selected, '');
  const saved = settings(); saved.set('ai-search-tool', 'minilm');
  assert.equal(aiSearch({ store: saved, visiblePosts: () => [], find: () => '/fake/tool' }).summary().selected, '', 'an old MiniLM choice just means no AI tool');
});

test('a running search reports real progress and the exact model', async () => {
  let release;
  const search = setup([{ ...post(1, 'fonts'), author: 'alice' }, { ...post(2, 'bread'), author: 'bob' }], () => new Promise(resolve => { release = () => resolve(reply([{ id: 1, score: 8 }])); }));
  assert.deepEqual([search.summary().name, search.summary().model], ['Claude Code', 'Haiku 5.5']);
  assert.equal(searchArguments()[searchArguments().indexOf('--model') + 1], 'claude-haiku-5-5');
  const { id } = search.start('fonts');
  await new Promise(resolve => setTimeout(resolve, 2));
  const running = search.job(id);
  assert.deepEqual([running.done, running.total, running.reading], [0, 1, ['alice', 'bob']]);
  release();
  const finished_ = await finished(search, id);
  assert.deepEqual([finished_.done, finished_.reading, finished_.matches], [1, [], [[1, 8]]]);
});

const imageReply = results => `${JSON.stringify({ type: 'system' })}\n${JSON.stringify({ type: 'result', is_error: false, structured_output: { results } })}`;
function imageSetup(count, { described = () => '', answerImages = id => ({ id, description: `picture ${id}`, fits: id === 1 }) } = {}) {
  const posts = Array.from({ length: count }, (_, index) => ({ ...post(index + 1, 'some text'), imageDescription: described(index + 1) })), saved = new Map(), sentImages = [];
  const store = { ...settings(), setImageDescription: (id, text) => saved.set(id, text) };
  const search = aiSearch({ store, visiblePosts: () => posts, find: () => '/fake/claude', isSignedIn: async () => true, images: { has: () => true, read: async () => ({ bytes: Buffer.from('jpg'), type: 'image/jpeg' }) }, run: async (_tool, prompt, _signal, images) => {
    if (!images) return reply(posts.filter(item => prompt.includes(`"id":${item.id},`)).map(item => ({ id: item.id, score: 4 })));
    const ids = JSON.parse(prompt).message.content.filter(block => block.type === 'text').flatMap(block => { try { return [JSON.parse(block.text).id]; } catch { return []; } });
    sentImages.push(...ids);
    return imageReply(ids.map(answerImages));
  } });
  search.choose('claude');
  return { search, saved, sentImages };
}
const settled = async (search, id) => { for (;;) { const job = search.job(id); if (!['running'].includes(job.state)) return job; await new Promise(resolve => setTimeout(resolve, 2)); } };

test('unsure posts get an image check, and what\'s seen is saved and decides the result', async () => {
  const { search, saved, sentImages } = imageSetup(8);
  const job = await settled(search, search.start('fonts').id);
  assert.equal(job.state, 'done'); assert.equal(sentImages.length, 8); assert.equal(job.imagesDone, 8);
  assert.deepEqual(job.matches, [[1, 7]]);
  assert.equal(saved.get(1), 'picture 1'); assert.equal(saved.size, 8);
});

test('an image already described is never read again', async () => {
  const { search, sentImages } = imageSetup(5, { described: id => (id <= 3 ? 'seen before' : '') });
  await settled(search, search.start('fonts').id);
  assert.deepEqual(sentImages.sort(), [4, 5]);
});

test('more than 30 images waits for a yes, and no means none are read', async () => {
  const declined = imageSetup(31);
  const asked = await settled(declined.search, declined.search.start('fonts').id);
  assert.equal(asked.state, 'asking'); assert.equal(asked.askImages, 31); assert.equal(declined.sentImages.length, 0);
  declined.search.answer(asked.id, false);
  const finished_ = await settled(declined.search, asked.id);
  assert.equal(finished_.state, 'done'); assert.equal(declined.sentImages.length, 0); assert.equal(declined.saved.size, 0);
  const approved = imageSetup(31);
  const waiting = await settled(approved.search, approved.search.start('fonts').id);
  approved.search.answer(waiting.id, true);
  const done = await settled(approved.search, waiting.id);
  assert.equal(done.state, 'done'); assert.equal(approved.sentImages.length, 31); assert.equal(approved.saved.size, 31);
  assert.throws(() => approved.search.answer(waiting.id, true));
  const thirty = imageSetup(30);
  const job = await settled(thirty.search, thirty.search.start('fonts').id);
  assert.equal(job.state, 'done'); assert.equal(thirty.sentImages.length, 30);
});

test('image replies only count for posts that were sent, and the tool stays without tools', () => {
  const batch = [{ post: post(1, 'a'), image: { bytes: Buffer.from('x'), type: 'image/jpeg' } }];
  assert.deepEqual(readImageResults(imageReply([{ id: 1, description: ' a cat ', fits: true }, { id: 9, description: 'other', fits: true }, { id: 1, description: 5, fits: true }]), batch), [{ id: 1, fits: true, description: 'a cat' }]);
  assert.throws(() => readImageResults('nothing useful', batch));
  const args = imageArguments();
  assert.equal(args[args.indexOf('--tools') + 1], ''); assert.ok(args.includes('--strict-mcp-config')); assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.match(imageMessage('fonts', batch), /"media_type":"image\/jpeg"/);
});

test('scanning one post reads only that image, keeps the description, and needs a tool that can see', async () => {
  const { search, saved, sentImages } = imageSetup(3);
  assert.deepEqual(await search.scanOne(2), { description: 'picture 2', model: 'Haiku 5.5' });
  assert.deepEqual(sentImages, [2]); assert.equal(saved.get(2), 'picture 2');
  await assert.rejects(search.scanOne(99), /isn’t in your library/);
  assert.deepEqual(search.summary().vision, { id: 'claude', name: 'Claude Code', model: 'Haiku 5.5' });
  const none = aiSearch({ store: settings(), visiblePosts: () => [post(1, 'a')], find: () => '' });
  assert.equal(none.summary().vision, null);
  await assert.rejects(none.scanOne(1), /Install Claude Code or Codex/);
});

test('a post with a note keeps its description out of the first pass, and it settles if unsure, with no image read', async () => {
  const prompts = [], sent = [];
  const posts = [{ ...post(1, 'caption one'), notes: 'a note', imageDescription: 'After Effects panel' }, { ...post(2, 'caption two'), notes: 'a note', imageDescription: 'a loaf of bread' }, post(3, 'caption three')];
  const search = aiSearch({ store: settings(), visiblePosts: () => posts, find: () => '/fake/claude', isSignedIn: async () => true, images: { has: () => true, read: async () => ({ bytes: Buffer.from('jpg'), type: 'image/jpeg' }) }, run: async (_tool, prompt, _signal, images) => {
    if (images) { sent.push(1); return imageReply([{ id: 3, description: 'seen', fits: false }]); }
    prompts.push(prompt);
    if (prompt.includes("image shows")) return reply([{ id: 1, score: 8 }, { id: 2, score: 2 }]);
    return reply([{ id: 1, score: 4 }, { id: 2, score: 4 }]);
  } });
  search.choose('claude');
  const job = await settled(search, search.start('after effects', [1, 2, 3], [3]).id);
  assert.ok(!prompts[0].includes('After Effects panel'), 'the first pass leaves descriptions out');
  assert.match(prompts[1], /After Effects panel/);
  assert.deepEqual(job.matches, [[1, 8]]);
  assert.deepEqual([job.settleTotal, job.settleDone], [2, 2]);
  assert.equal(sent.length, 1, 'only the undescribed post MiniLM liked has its image read');
});


test('clearing one description only touches a save the app shows', () => {
  const cleared = [], store = { ...settings(), setImageDescription: (id, description, model) => cleared.push([id, description, model]) };
  const search = aiSearch({ store, visiblePosts: () => [post(1, 'shown')], find: () => '/fake/claude', isSignedIn: async () => true, run: async () => '' });
  assert.throws(() => search.clearOne(2), /isn’t in your library/);
  assert.deepEqual(cleared, []);
  search.clearOne(1);
  assert.deepEqual(cleared, [[1, '', '']]);
});

test('a long description is kept whole', () => {
  const long = 'word '.repeat(200).trim();
  const [result] = readImageResults(JSON.stringify({ type: 'result', structured_output: { results: [{ id: 1, description: long, fits: true }] } }), [{ post: post(1, 'x') }]);
  assert.equal(result.description, long);
});

test('the first pass includes a description unless the post has a note', () => {
  const chunks = searchChunks([{ id: 1, platform: 'pinterest', text: '', topics: [], imageDescription: 'starburst rings' }, { id: 2, platform: 'x', text: 'a caption', topics: [], imageDescription: 'palette cards' }, { id: 3, platform: 'x', text: 'a caption', notes: 'my note', topics: [], imageDescription: 'not sent' }, { id: 4, platform: 'x', text: 'a caption', notes: '   ', topics: [], imageDescription: 'blank note' }, { id: 5, platform: 'pinterest', text: '', topics: [] }]);
  const sent = chunks.flat();
  assert.deepEqual(sent.map(item => item.id), [1, 2, 3, 4]);
  assert.match(sent[0].text, /starburst rings/); assert.match(sent[1].text, /palette cards/); assert.match(sent[1].text, /a caption/);
  assert.doesNotMatch(sent[2].text, /not sent/); assert.match(sent[2].text, /my note/); assert.match(sent[3].text, /blank note/);
});

test('a post whose description was in the first pass isn’t settled again', async () => {
  const prompts = [], posts = [{ ...post(1, 'caption'), imageDescription: 'a panel' }];
  const search = aiSearch({ store: settings(), visiblePosts: () => posts, find: () => '/fake/claude', isSignedIn: async () => true, images: { has: () => true, read: async () => null }, run: async (tool, prompt) => { prompts.push(prompt); return reply([{ id: 1, score: 4 }]); } });
  search.choose('claude');
  const job = await settled(search, search.start('panel', [1]).id);
  assert.equal(prompts.length, 1); assert.match(prompts[0], /a panel/); assert.deepEqual(job.matches, []);
});
