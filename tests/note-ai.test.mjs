import test from 'node:test';
import assert from 'node:assert/strict';
import { noteAi } from '../server/note-ai.mjs';
import { readNote, noteArguments, codexNoteArguments } from '../server/ai-search.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { imagesToFiles } from '../server/mcp.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const reply = (note, problem = '') => JSON.stringify({ structured_output: { note, problem } });
function setup({ run, visible = true, notes = 'mine' } = {}) {
  const post = { id: 1, notes, updatedAt: 'then' }, closed = [];
  const store = { post: () => post, updatePost: (id, input) => { Object.assign(post, input, { updatedAt: 'now' }); return post; } };
  const mcp = { forNote: (id, onStep) => { onStep('Reading the post'); return { close: async () => { closed.push(id); }, handle() {} }; } };
  return { post, closed, ai: noteAi({ store, mcp, baseUrl: 'http://127.0.0.1:1', visiblePost: () => visible, tool: () => ({ name: 'Claude Code', model: 'Haiku 5.5' }), run }) };
}
test('the result goes below the note, and the job ends with what was there before', async () => {
  const { ai, post, closed } = setup({ run: async (tool, url, prompt) => { assert.match(url, /\/mcp\/note\//); assert.match(prompt, /names/); assert.match(prompt, /mine/); return reply('added'); } });
  const job = ai.start(1, ' the names ');
  assert.equal(job.state, 'running'); assert.equal(job.request, 'the names');
  await ai.idle();
  assert.equal(post.notes, 'mine\n\nadded');
  const done = ai.current();
  assert.equal(done.state, 'done'); assert.equal(done.before, 'mine'); assert.equal(done.notes, 'mine\n\nadded');
  assert.deepEqual(closed, [1]);
});
test('a rewrite replaces the note, can empty it, and says what was there', async () => {
  const rewrite = note => JSON.stringify({ structured_output: { note, problem: '', replaces: true } });
  const { ai, post } = setup({ run: async () => rewrite('shorter') });
  ai.start(1, 'make it shorter'); await ai.idle();
  assert.equal(post.notes, 'shorter'); assert.equal(ai.current().before, 'mine');
  const emptied = setup({ run: async () => rewrite('') });
  emptied.ai.start(1, 'delete this note'); await emptied.ai.idle();
  assert.equal(emptied.post.notes, ''); assert.equal(emptied.ai.current().state, 'done'); assert.equal(emptied.ai.current().before, 'mine');
});
test('an empty reply never wipes a note unless that was asked for', async () => {
  const empty = (problem = '') => JSON.stringify({ structured_output: { note: '', problem, replaces: true } });
  const rewrite = setup({ run: async () => empty() });
  rewrite.ai.start(1, 'Rewrite this note so it is easy to read.'); await rewrite.ai.idle();
  assert.equal(rewrite.post.notes, 'mine'); assert.equal(rewrite.ai.current().state, 'failed');
  const stuck = setup({ run: async () => empty('The page wouldn’t open.') });
  stuck.ai.start(1, 'delete this note'); await stuck.ai.idle();
  assert.equal(stuck.post.notes, 'mine'); assert.match(stuck.ai.current().error, /wouldn’t open/);
  const asked = setup({ run: async () => empty() });
  asked.ai.start(1, 'Delete this note.'); await asked.ai.idle();
  assert.equal(asked.post.notes, '');
});
test('an empty note just gets the result', async () => {
  const { ai, post } = setup({ notes: '', run: async () => reply('added') });
  ai.start(1, 'x'); await ai.idle();
  assert.equal(post.notes, 'added');
});
test('one at a time, and the token only works while its job runs', async () => {
  let finish; const { ai } = setup({ run: () => new Promise(resolve => { finish = resolve; }) });
  ai.start(1, 'x');
  assert.throws(() => ai.start(1, 'y'), /still being filled/);
  await new Promise(resolve => setImmediate(resolve));
  finish(reply('added')); await ai.idle();
  assert.equal(ai.mcpFor(''), null);
  assert.doesNotThrow(() => ai.start(1, 'y'));
  finish(reply('again')); return ai.idle();
});
test('nothing is written when the AI finds nothing, is cancelled, or the save is hidden', async () => {
  const empty = setup({ run: async () => reply('', 'No names in this post.') });
  empty.ai.start(1, 'x'); await empty.ai.idle();
  assert.equal(empty.post.notes, 'mine'); assert.equal(empty.ai.current().error, 'No names in this post.');
  let finish; const stopped = setup({ run: () => new Promise(resolve => { finish = resolve; }) });
  stopped.ai.start(1, 'x'); stopped.ai.cancel();
  await new Promise(resolve => setImmediate(resolve));
  finish(reply('late')); await stopped.ai.idle();
  assert.equal(stopped.post.notes, 'mine'); assert.equal(stopped.ai.current().state, 'cancelled');
  const hidden = setup({ visible: false, run: async () => reply('added') });
  assert.throws(() => hidden.ai.start(1, 'x'), /isn’t in your library/);
  const tooLong = setup({ run: async () => reply('y'.repeat(10000)) });
  tooLong.ai.start(1, 'x'); await tooLong.ai.idle();
  assert.equal(tooLong.post.notes, 'mine'); assert.match(tooLong.ai.current().error, /more than a note/);
});
test('it says when signed out, and the AI gets only that post\'s tools and web search', () => {
  assert.throws(() => readNote(JSON.stringify({ is_error: true, result: 'Please run login' })), /signed-out/);
  const args = noteArguments('http://127.0.0.1:1/mcp/note/abc');
  assert.equal(args[args.indexOf('--tools') + 1], 'WebSearch,WebFetch');
  assert(args.includes('--strict-mcp-config'));
  assert.doesNotMatch(args[args.indexOf('--allowedTools') + 1], /update|search_saves|Bash|Write|Edit|Read/);
});

test('the chosen model is what runs, and each tool gets only the post\'s tools', async () => {
  let used; const { ai } = setup({ run: async (tool, url, prompt, signal, model) => { used = model; return reply('added'); } });
  ai.start(1, 'x', { id: 'claude-opus-5-5', name: 'Opus 5.5' }); await ai.idle();
  assert.equal(used, 'claude-opus-5-5'); assert.equal(ai.current().model, 'Opus 5.5');
  assert.equal(noteArguments('u')[noteArguments('u').indexOf('--model') + 1], 'claude-haiku-5-5');
  const folder = mkdtempSync(join(tmpdir(), 'savex-note-test-'));
  const args = codexNoteArguments('http://127.0.0.1:1/mcp/note/abc', folder);
  rmSync(folder, { recursive: true, force: true });
  assert.equal(args[args.indexOf('--model') + 1], 'gpt-6-luna');
  assert(args.includes('--ignore-user-config')); assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  assert.equal(readNote('log line\n{"note":"added","problem":""}').note, 'added');
});

test('for Codex, pictures become files it can open, and everything else stays as it was', () => {
  const folder = mkdtempSync(join(tmpdir(), 'savex-note-test-'));
  try {
    const reply = imagesToFiles({ content: [{ type: 'text', text: 'hello' }, { type: 'image', data: Buffer.from('picture').toString('base64'), mimeType: 'image/jpeg' }] }, folder);
    assert.equal(reply.content[0].text, 'hello');
    const path = reply.content[1].text.match(/saved at (\S+\.jpg)\./)[1];
    assert.equal(reply.content[1].type, 'text'); assert.equal(readFileSync(path, 'utf8'), 'picture');
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('Codex runs without the person’s connected apps, a shell or browsers', () => {
  const folder = mkdtempSync(join(tmpdir(), 'savex-note-test-'));
  try {
    const text = codexNoteArguments('http://127.0.0.1:1/mcp/note/abc', folder).join(' ');
    for (const name of ['apps', 'plugins', 'shell_tool', 'unified_exec', 'browser_use', 'computer_use']) assert.match(text, new RegExp(`features\\.${name}=false`));
    assert.match(text, /--ignore-user-config/); assert.match(text, /--sandbox read-only/); assert.doesNotMatch(text, /view_image=false/);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
