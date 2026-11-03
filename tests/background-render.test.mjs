import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const script = await readFile(new URL('../extension/background-render.js', import.meta.url), 'utf8');

test('dedicated hidden tabs run layout callbacks without painting and cancelled callbacks stay cancelled', async () => {
  const dom = new JSDOM('<main></main>', { url: 'https://x.com/i/bookmarks#savex-sync', runScripts: 'outside-only' });
  const frames = new Map(); let next = 0, calls = 0;
  dom.window.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
  dom.window.cancelAnimationFrame = id => frames.delete(id);
  dom.window.eval(script);
  const pending = new Promise(resolve => dom.window.requestAnimationFrame(time => { calls++; assert.equal(typeof time, 'number'); resolve(); }));
  const cancelled = dom.window.requestAnimationFrame(() => { calls += 100; }); dom.window.cancelAnimationFrame(cancelled);
  await pending;
  assert.equal(calls, 1); assert.equal(frames.size, 0);
  dom.window.close();
});

test('hidden unsave tabs keep rendering after the permalink drops its marker and across verification reloads', async () => {
  for (const url of ['https://x.com/i/status/12345#savex-unsave','https://www.instagram.com/p/ExactPost/#savex-unsave']) {
    const first = new JSDOM('', { url, runScripts:'outside-only' });
    first.window.requestAnimationFrame = () => 1; first.window.cancelAnimationFrame = () => {};
    try {
      first.window.eval(script);
      const marker = first.window.sessionStorage.getItem('savex-background-render'); assert.equal(marker,'1');
      first.window.history.replaceState(null,'',first.window.location.pathname);
      await new Promise(resolve => first.window.requestAnimationFrame(resolve));
      const reloaded = new JSDOM('', {url:first.window.location.href,runScripts:'outside-only'});
      try {
        reloaded.window.sessionStorage.setItem('savex-background-render',marker);
        reloaded.window.requestAnimationFrame = () => 1; reloaded.window.cancelAnimationFrame = () => {};
        reloaded.window.eval(script);
        await new Promise(resolve => reloaded.window.requestAnimationFrame(resolve));
        assert.equal(reloaded.window.__savexBackgroundFrames,true);
      } finally { reloaded.window.close(); }
    } finally { first.window.close(); }
  }
});

test('ordinary social-media tabs keep their native animation scheduling', () => {
  const dom=new JSDOM('',{url:'https://x.com/writer/status/12345',runScripts:'outside-only'});
  try {
    const native=()=>1;dom.window.requestAnimationFrame=native;dom.window.eval(script);
    assert.equal(dom.window.requestAnimationFrame,native);assert.equal(dom.window.sessionStorage.getItem('savex-background-render'),null);
    assert.equal(dom.window.__savexBackgroundFrames,undefined);
  } finally {dom.window.close();}
});
