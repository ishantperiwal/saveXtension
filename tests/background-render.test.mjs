import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('dedicated hidden tabs run layout callbacks without painting and cancelled callbacks stay cancelled', async () => {
  const dom = new JSDOM('<main></main>', { url: 'https://x.com/i/bookmarks#savex-sync', runScripts: 'outside-only' });
  const frames = new Map(); let next = 0, calls = 0;
  dom.window.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
  dom.window.cancelAnimationFrame = id => frames.delete(id);
  dom.window.eval(await readFile(new URL('../extension/background-render.js', import.meta.url), 'utf8'));
  const pending = new Promise(resolve => dom.window.requestAnimationFrame(time => { calls++; assert.equal(typeof time, 'number'); resolve(); }));
  const cancelled = dom.window.requestAnimationFrame(() => { calls += 100; }); dom.window.cancelAnimationFrame(cancelled);
  await pending;
  assert.equal(calls, 1); assert.equal(frames.size, 0);
  dom.window.close();
});
