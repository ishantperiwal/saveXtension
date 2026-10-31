import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('library bridge reports readiness without leaking tokens and tolerates extension reloads', async () => {
  const dom = new JSDOM('<meta name="savex-library" content="local">', { url: 'http://localhost:3210', runScripts: 'outside-only' });
  const sent = [], replies = [];
  dom.window.postMessage = data => replies.push(data);
  dom.window.chrome = { runtime: { sendMessage: async message => { sent.push(message); return { ok: true, ready: true, version: '1.2.0', token: 'must-not-cross-the-bridge' }; } } };
  const script = await readFile(new URL('../extension/bridge.js', import.meta.url), 'utf8');
  dom.window.eval(script); dom.window.eval(script);
  function message(data, origin = 'http://localhost:3210') { dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, source: dom.window, origin })); }
  message({ source: 'savex-library', type: 'PROBE_EXTENSION', requestId: 'probe' });
  message({ source: 'savex-library', type: 'OPEN_SETUP', requestId: 'setup' });
  message({ source: 'savex-library', type: 'OPEN_SETUP', requestId: 'evil' }, 'https://evil.example');
  message({ source: 'savex-library', type: 'DELETE_ALL', requestId: 'unknown' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(sent.length, 3); // One initial heartbeat, one probe, one setup request.
  assert.equal(replies.length, 2); assert.equal(replies[0].ready, true); assert.equal(replies[0].token, undefined);
  dom.window.chrome.runtime.sendMessage = () => { throw new Error('Extension context invalidated'); };
  assert.doesNotThrow(() => message({ source: 'savex-library', type: 'WAKE_SYNC' }));
  await new Promise(resolve => setTimeout(resolve, 0));
  dom.window.close();
});
