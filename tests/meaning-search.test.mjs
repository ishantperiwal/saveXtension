import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { meaningSearch } from '../server/meaning-search.mjs';
import { applyFilters, defaultFilters } from '../public/filters.js';
import { meaningParts } from '../public/meaning-search.js';

const body = 'pinned file contents', file = { path: 'models/one.bin', url: 'https://example.test/one.bin', size: body.length, sha256: createHash('sha256').update(body).digest('hex') };
const respond = text => async () => new Response(text);
const finished = async search => { while (search.status().state === 'downloading') await new Promise(resolve => setTimeout(resolve, 5)); return search.status(); };
async function folder(t) { const dir = await mkdtemp(join(tmpdir(), 'savex-meaning-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }

test('a pinned file is kept and served, and nothing else is', async t => {
  const dir = await folder(t), search = meaningSearch({ dir, files: [file], request: respond(body) });
  assert.equal(search.status().state, 'absent'); assert.equal(search.file(file.path), null);
  search.download();
  assert.equal((await finished(search)).state, 'ready');
  assert.equal(await readFile(join(dir, file.path), 'utf8'), body);
  assert.ok(search.file(file.path));
  assert.equal(search.file('../savextension.sqlite'), null);
  await search.remove();
  assert.equal(search.status().state, 'absent');
  await assert.rejects(stat(dir));
});

test('a file that fails its check is thrown away, and the feature stays off', async t => {
  const dir = await folder(t), search = meaningSearch({ dir, files: [file], request: respond('tampered file contents'.slice(0, body.length)) });
  search.download();
  const status = await finished(search);
  assert.equal(status.state, 'failed'); assert.match(status.error, /safety check/);
  await assert.rejects(stat(join(dir, file.path)));
  await assert.rejects(stat(join(dir, `${file.path}.partial`)));
});

test('a download larger than promised is stopped', async t => {
  const search = meaningSearch({ dir: await folder(t), files: [file], request: respond(`${body} and much more`) });
  search.download();
  assert.equal((await finished(search)).state, 'failed');
});

test('the most likely posts come first, ties keep the usual order, and filters still apply', () => {
  const post = (id, text, platform = 'x') => ({ id, text, platform, url: `https://x.com/a/status/${id}`, accounts: [], topics: [], tags: [], folders: [], addedAt: `2026-01-0${id}T00:00:00.000Z` });
  const posts = [post(1, 'typefaces I like'), post(2, 'all about fonts'), post(3, 'lettering guide'), post(4, 'unrelated'), post(5, 'more fonts'), post(6, 'fonts again')];
  const meaning = new Map([[3, .7], [1, .5]]);
  assert.deepEqual(applyFilters(posts, defaultFilters(), { query: 'fonts', meaning }).map(p => p.id), [6, 5, 2, 3, 1]);
  assert.deepEqual(applyFilters(posts, defaultFilters(), { query: 'fonts', meaning: new Map([...meaning, [2, .6]]) }).map(p => p.id), [2, 6, 5, 3, 1]);
  assert.deepEqual(applyFilters(posts, defaultFilters(), { query: 'fonts' }).map(p => p.id), [6, 5, 2]);
  assert.deepEqual(applyFilters(posts, { ...defaultFilters(), sources: ['instagram'] }, { query: 'fonts', meaning }), []);
});

test('a long post is read to its very end, in overlapping parts, with notes and topics first', () => {
  const words = Array.from({ length: 900 }, (_, index) => `word${index}`), parts = meaningParts({ platform: 'x', text: words.join(' '), notes: 'my note', topics: ['Design'], author: 'alice' });
  assert.ok(parts.length > 3); assert.ok(parts.every(part => part.length <= 1000));
  assert.ok(parts[0].startsWith('my note\nDesign\nalice\n'));
  for (const word of words) assert.ok(parts.some(part => part.split(/\s+/).includes(word)), word);
  assert.ok(parts[0].includes(parts[1].split(' ')[0]), 'the next part overlaps this one');
  assert.deepEqual(meaningParts({ platform: 'x', text: 'short' }), ['short']);
  assert.deepEqual(meaningParts({ platform: 'x' }), []);
  assert.ok(!meaningParts({ platform: 'x', text: 'caption', imageDescription: 'panel' }, { description: false })[0].includes('panel'));
  assert.ok(meaningParts({ platform: 'x', text: 'caption', imageDescription: 'After Effects panel' })[0].includes('After Effects panel'));
  assert.deepEqual(applyFilters([{ id: 1, platform: 'x', url: 'https://x.com/a/status/1', text: 'cute', imageDescription: 'After Effects panel', accounts: [], topics: [], tags: [], folders: [], addedAt: '2026-01-01T00:00:00.000Z' }], defaultFilters(), { query: 'after effects' }).map(p => p.id), [1]);
});
