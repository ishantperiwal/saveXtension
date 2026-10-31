import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('a large already-rendered grid is acknowledged in bounded batches', async () => {
  const dom = new JSDOM('<main></main>', { url: 'https://www.instagram.com/me/saved/all-posts/', runScripts: 'outside-only' });
  const main = dom.window.document.querySelector('main');
  for (let i = 0; i < 205; i++) { const anchor = dom.window.document.createElement('a'); anchor.href = `/p/Test${i}/`; main.append(anchor); }
  const batches = []; let listener, finish;
  const finished = new Promise(resolve => { finish = resolve; });
  dom.window.Element.prototype.scrollTo = () => {};
  dom.window.Element.prototype.scrollBy = () => {};
  dom.window.setTimeout = callback => setTimeout(callback, 0);
  dom.window.chrome = { runtime: { id: 'test-extension', onMessage: { addListener: fn => { listener = fn; } },
    sendMessage: async message => {
      if (message.type === 'SYNC_BATCH') batches.push(message.posts);
      if (message.type === 'SYNC_FINISH') finish(message);
      return { ok: true };
    }
  } };
  dom.window.eval(await readFile(new URL('../extension/extractors.js', import.meta.url), 'utf8'));
  dom.window.eval(await readFile(new URL('../extension/collector.js', import.meta.url), 'utf8'));
  listener({ type: 'START_COLLECT', options: { runId: 'test', platform: 'instagram', maxPosts: 205 } }, { id: 'test-extension' }, response => assert.equal(response.ok, true));
  const final = await finished;
  assert.deepEqual(batches.map(batch => batch.length), [100, 100, 5]); assert.equal(final.seen, 205); assert.equal(final.status, 'partial'); assert.match(final.message, /205-post/);
  dom.window.close();
});

test('scroll events advance virtualized feeds in a hidden collector tab', async () => {
  const dom = new JSDOM('<main><a href="/p/First/"></a></main>', { url: 'https://www.instagram.com/me/saved/all-posts/', runScripts: 'outside-only' });
  dom.window.Element.prototype.scrollTo = () => {}; dom.window.Element.prototype.scrollBy = () => {};
  dom.window.setTimeout = callback => setTimeout(callback, 0);
  let generated = 1, listener, finish; const batches = [];
  const finished = new Promise(resolve => { finish = resolve; });
  dom.window.addEventListener('scroll', () => {
    if (generated < 4) { const link = dom.window.document.createElement('a'); link.href = `/p/Next${generated++}/`; dom.window.document.querySelector('main').append(link); }
  });
  dom.window.chrome = { runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } }, sendMessage: async message => { if (message.type === 'SYNC_BATCH') batches.push(...message.posts); if (message.type === 'SYNC_FINISH') finish(message); return { ok: true }; } } };
  dom.window.eval(await readFile(new URL('../extension/extractors.js', import.meta.url), 'utf8'));
  dom.window.eval(await readFile(new URL('../extension/collector.js', import.meta.url), 'utf8'));
  listener({ type: 'START_COLLECT', options: { runId: 'test', platform: 'instagram', maxPosts: 4 } }, { id: 'test' }, () => {});
  const result = await finished; assert.equal(result.seen, 4); assert.equal(batches.length, 4); dom.window.close();
});

async function runPages(pages, options, batchResponse = {}) {
  const dom = new JSDOM('<main></main>', { url: 'https://www.instagram.com/me/saved/all-posts/', runScripts: 'outside-only' });
  dom.window.Element.prototype.scrollTo = () => {}; dom.window.Element.prototype.scrollBy = () => {};
  dom.window.setTimeout = callback => setTimeout(callback, 0);
  let page = 0, listener, finish; const batches = [];
  const finished = new Promise(resolve => { finish = resolve; });
  dom.window.addEventListener('scroll', () => { page = Math.min(page + 1, pages.length - 1); });
  dom.window.SaveXExtractors = {
    pageInfo: () => ({ valid: true, platform: 'instagram', account: '@me' }),
    extract: () => pages[page].map(id => ({ url: `https://www.instagram.com/p/${id}/` }))
  };
  dom.window.chrome = { runtime: { id: 'test', onMessage: { addListener: fn => { listener = fn; } }, sendMessage: async message => {
    if (message.type === 'SYNC_BATCH') { batches.push(...message.posts); return { ok: true, ...batchResponse }; }
    if (message.type === 'SYNC_FINISH') finish(message);
    return { ok: true };
  } } };
  dom.window.eval(await readFile(new URL('../extension/collector.js', import.meta.url), 'utf8'));
  listener({ type: 'START_COLLECT', options: { runId: 'test', platform: 'instagram', maxPosts: 100000, ...options } }, { id: 'test' }, () => {});
  const result = await finished; dom.window.close(); return { result, batches, page };
}

test('quick sync imports new IDs and stops at a distinct stretch of previously saved IDs', async () => {
  const knownIds = Array.from({ length: 20 }, (_, i) => `Known${i}`);
  const { result, batches, page } = await runPages([['New1', 'New2', ...knownIds], ['OlderMissing']], { mode: 'quick', knownIds });
  assert.equal(result.status, 'completed'); assert.match(result.message, /Older history was not checked/);
  assert.equal(batches.length, 2); assert.equal(page, 0);
});

test('deep scans pass known IDs and discover gaps beyond the old 500-post limit', async () => {
  const knownIds = Array.from({ length: 600 }, (_, i) => `Known${i}`);
  const { result, batches } = await runPages([knownIds, ['OlderMissing']], { mode: 'deep', knownIds });
  assert.equal(result.seen, 601); assert.equal(batches.length, 601);
  assert.equal(result.status, 'partial'); assert.match(result.message, /removals are not verified/);
});

test('repeated viewport content never becomes a false quick-sync boundary', async () => {
  const { result, batches } = await runPages([['Known', 'New']], { mode: 'quick', knownIds: ['Known'] });
  assert.equal(result.status, 'partial'); assert.equal(result.seen, 2); assert.equal(batches.length, 1);
});

test('a rejected new save cannot result in a successful quick boundary', async () => {
  const knownIds = Array.from({ length: 20 }, (_, i) => `Known${i}`);
  const { result } = await runPages([['New', ...knownIds]], { mode: 'quick', knownIds }, { rejected: 1 });
  assert.equal(result.status, 'failed'); assert.match(result.message, /could not be saved/);
});
