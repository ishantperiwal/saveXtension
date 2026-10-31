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
