import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aiKeys } from '../server/ai-keys.mjs';
import { aiSearch } from '../server/ai-search.mjs';

const vault = { encrypt: text => Buffer.from(`locked:${text}`), decrypt: bytes => bytes.toString().replace(/^locked:/, '') };
const GOOD = 'sk-0123456789abcdefghij';
async function setup(t, answer) {
  const folder = mkdtempSync(join(tmpdir(), 'savex-keys-')), file = join(folder, 'ai-keys.json'), asked = [];
  const service = createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += chunk; }).on('end', () => {
      if (req.headers.authorization !== `Bearer ${GOOD}`) { res.writeHead(401); return res.end('{}'); }
      if (req.url === '/models') { res.writeHead(200); return res.end('{"data":[]}'); }
      const sent = JSON.parse(body); asked.push(sent);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer(sent)) } }] }));
    });
  }).listen(0, '127.0.0.1');
  await once(service, 'listening');
  t.after(() => { service.close(); rmSync(folder, { recursive: true, force: true }); });
  const values = new Map(), store = { get: key => values.get(key), set: (key, value) => values.set(key, value), setImageDescription() {} };
  const posts = [{ id: 1, platform: 'x', text: 'first post', topics: [] }, { id: 2, platform: 'x', text: 'second post', topics: [] }];
  const search = aiSearch({ store, visiblePosts: () => posts, find: () => '', keys: aiKeys({ file, vault }), apiBase: `http://127.0.0.1:${service.address().port}`, images: { has: () => true, read: async () => ({ type: 'image/jpeg', bytes: Buffer.from('pic') }) } });
  return { search, file, asked, row: async () => (await search.tools()).tools.find(tool => tool.id === 'deepseek') };
}
const finished = async (search, id) => { for (;;) { const job = search.job(id); if (job.state !== 'running') return job; await new Promise(resolve => setTimeout(resolve, 5)); } };

test('a key is only kept once the service accepts it, encrypted, and removing it turns the tool off', async t => {
  const { search, file, row } = await setup(t, () => ({}));
  assert.equal((await row()).installed, false);
  assert.throws(() => search.choose('deepseek'));
  await assert.rejects(search.saveKey('deepseek', 'short'), /look like/);
  await assert.rejects(search.saveKey('deepseek', 'sk-this-key-is-wrong-000000'), /accept/);
  assert.equal(existsSync(file), false);
  await search.saveKey('deepseek', `  ${GOOD}  `);
  assert.equal((await row()).installed, true);
  assert(!JSON.stringify(await search.tools()).includes(GOOD));
  assert.equal(readFileSync(file, 'utf8').includes(GOOD), false);
  search.choose('deepseek'); assert.equal(search.summary().name, 'DeepSeek');
  search.removeKey('deepseek');
  assert.equal(existsSync(file), false); assert.equal(search.summary().selected, '');
});

test('AI search runs through the service with no thinking, and the key stays in the header', async t => {
  const { search, asked } = await setup(t, () => ({ matches: [{ id: 2, score: 8 }] }));
  await search.saveKey('deepseek', GOOD); search.choose('deepseek');
  const job = await finished(search, search.start('second', [1, 2]).id);
  assert.equal(job.state, 'done'); assert.deepEqual(job.matches, [[2, 8]]);
  assert.equal(asked[0].model, 'deepseek-flash'); assert.equal(asked[0].thinking.type, 'enabled'); assert.equal(asked[0].reasoning_effort, 'high'); assert.equal(asked[0].response_format.type, 'json_object');
  assert.match(asked[0].messages[0].content, /JSON/); assert(!JSON.stringify(asked).includes(GOOD));
});

test('an image goes in the user message, and its description comes back', async t => {
  const { search, asked } = await setup(t, () => ({ results: [{ id: 1, description: 'a palette card', fits: true }] }));
  await search.saveKey('deepseek', GOOD); search.choose('deepseek');
  assert.deepEqual(await search.scanOne(1), { description: 'a palette card', model: 'V4.1 Flash' });
  const parts = asked[0].messages[1].content;
  assert.equal(parts[1].type, 'image_url'); assert.match(parts[1].image_url.url, /^data:image\/jpeg;base64,/);
});

test('a key that stops working says so', async t => {
  const { search, file } = await setup(t, () => ({}));
  await search.saveKey('deepseek', GOOD); search.choose('deepseek');
  assert.equal(search.noteTool().id, 'deepseek');
  const saved = JSON.parse(readFileSync(file, 'utf8')); saved.deepseek = Buffer.from('locked:sk-this-key-stopped-working').toString('base64');
  (await import('node:fs')).writeFileSync(file, JSON.stringify(saved));
  const job = await finished(search, search.start('second', [1, 2]).id);
  assert.equal(job.state, 'failed'); assert.match(job.error, /didn’t accept your API key/);
});
