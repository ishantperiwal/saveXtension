import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { noteConversation } from '../server/note-api.mjs';
import { imageRequest } from '../server/ai-search.mjs';

const KEY = 'sk-test-0123456789abcdefghij';
const call = (name, args = {}, id = `${name}-1`) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const say = content => ({ role: 'assistant', content });
const asks = (...calls) => ({ role: 'assistant', content: '', tool_calls: calls });
async function service(t, script, { status = 200 } = {}) {
  const seen = { chats: [], search: [], fetch: [], keys: new Set() };
  const server = createServer((req, res) => { let body = ''; req.on('data', chunk => { body += chunk; }).on('end', () => {
    seen.keys.add(req.headers.authorization); res.setHeader('Content-Type', 'application/json');
    if (status !== 200) { res.statusCode = status; return res.end('{}'); }
    if (req.url === '/models') return res.end('{"data":[]}');
    const sent = body ? JSON.parse(body) : {};
    if (req.url === '/v1/tools/search') { seen.search.push(sent); return res.end(JSON.stringify({ results: [{ title: 'Repo', url: 'https://github.com/a/b', summary: 'A repo', rerank_score: 2, content: 'x' }] })); }
    if (req.url === '/v1/tools/fetch') { seen.fetch.push(sent); return res.end(JSON.stringify({ title: 'README', content: 'It does things.' })); }
    seen.chats.push(JSON.parse(JSON.stringify(sent)));
    res.end(JSON.stringify({ choices: [{ message: script[Math.min(seen.chats.length - 1, script.length - 1)] }] }));
  }); }).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => server.close());
  return { seen, base: `http://127.0.0.1:${server.address().port}` };
}
const tool = base => ({ api: base, apiModel: 'deepseek-flash', key: () => KEY });
const handler = (answers = {}) => ({ calls: [], step() {}, tools: () => [{ name: 'get_post', description: 'The post', parameters: { type: 'object', properties: {} } }, { name: 'read_view_frames', description: 'Frames', parameters: { type: 'object', properties: {} } }], async call(name, args) { this.calls.push([name, args]); return answers[name] || { content: [{ type: 'text', text: 'post text' }] }; } });
const talk = (base, use, prompt = 'What is this?') => noteConversation({ tool: tool(base), handler: use, system: 'Write a note.', shape: '{"note":"","problem":"","replaces":false}', prompt });

test('it runs the post’s tools and the web tools, then returns the note', async t => {
  const { seen, base } = await service(t, [asks(call('get_post'), call('web_search', { query: 'the repo' }), call('web_fetch', { url: 'https://github.com/a/b' })), say('{"note":"A repo.","problem":"","replaces":false}')]);
  const use = handler(), reply = JSON.parse(await talk(base, use));
  assert.equal(reply.note, 'A repo.'); assert.deepEqual(use.calls, [['get_post', {}]]);
  assert.deepEqual(seen.search, [{ query: 'the repo', count: 5 }]); assert.deepEqual(seen.fetch, [{ url: 'https://github.com/a/b' }]);
  const [first, second] = seen.chats;
  assert.equal(first.thinking.type, 'enabled'); assert.equal(first.reasoning_effort, 'high'); assert.deepEqual(first.tools.map(item => item.function.name), ['get_post', 'read_view_frames', 'web_search', 'web_fetch']);
  assert.deepEqual(second.messages.filter(item => item.role === 'tool').map(item => item.tool_call_id), ['get_post-1', 'web_search-1', 'web_fetch-1']);
  assert.match(second.messages.findLast(item => item.role === 'tool').content, /It does things/);
  assert(!JSON.stringify(seen.chats).includes(KEY)); assert.deepEqual([...seen.keys], [`Bearer ${KEY}`]);
});

test('its reasoning goes back with each of its turns, as the service requires', async t => {
  const { seen, base } = await service(t, [{ ...asks(call('get_post')), reasoning_content: 'I should read the post.' }, say('{"note":"Done.","problem":"","replaces":false}')]);
  await talk(base, handler());
  assert.equal(seen.chats[1].messages.find(item => item.role === 'assistant').reasoning_content, 'I should read the post.');
});

test('pictures go in a user message after the tool results, and only the newest are kept', async t => {
  const big = Buffer.alloc(8 * 1024 * 1024, 1).toString('base64'), frames = { content: [{ type: 'text', text: 'frames' }, { type: 'image', mimeType: 'image/jpeg', data: big }, { type: 'image', mimeType: 'image/jpeg', data: big }] };
  const { seen, base } = await service(t, [asks(call('read_view_frames', {}, 'a')), asks(call('read_view_frames', {}, 'b')), asks(call('read_view_frames', {}, 'c')), say('{"note":"Seen.","problem":"","replaces":false}')]);
  await talk(base, handler({ read_view_frames: frames }));
  const second = seen.chats[1].messages, pictures = second.at(-1);
  assert.equal(second.at(-2).role, 'tool'); assert.match(second.at(-2).content, /2 pictures follow/);
  assert.equal(pictures.role, 'user'); assert.deepEqual(pictures.content.map(part => part.type), ['text', 'image_url', 'image_url']);
  assert.match(pictures.content[1].image_url.url, /^data:image\/jpeg;base64,/);
  const last = JSON.stringify(seen.chats.at(-1).messages);
  assert.equal(last.split('data:image').length - 1, 2); assert.match(last, /older picture was removed/);
});

test('a reply that isn’t JSON gets one more go with no tools', async t => {
  const { seen, base } = await service(t, [say('Here is your note!'), say('{"note":"Fixed.","problem":"","replaces":true}')]);
  assert.equal(JSON.parse(await talk(base, handler())).replaces, true);
  assert.equal(seen.chats[1].response_format.type, 'json_object'); assert.equal(seen.chats[1].tools, undefined);
});

test('it can’t run forever, and a tool that doesn’t exist is only an answer', async t => {
  const { seen, base } = await service(t, [asks(call('no_such_tool'))]);
  await assert.rejects(talk(base, { ...handler(), call: async () => ({ content: [{ type: 'text', text: 'There is no tool by that name.' }] }) }));
  assert(seen.chats.length <= 21);
});

test('through the app: the note gets written, with only that post’s tools', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'savex-note-api-')); t.after(() => rmSync(folder, { recursive: true, force: true }));
  const { seen, base } = await service(t, [asks(call('get_post')), say('{"note":"About a thing.","problem":"","replaces":false}')]);
  writeFileSync(join(folder, 'ai-keys.json'), JSON.stringify({ deepseek: Buffer.from(KEY).toString('base64') }));
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening'); const { port } = probe.address(); await new Promise(resolve => probe.close(resolve));
  const app = createApp({ origin: `http://localhost:${port}`, imagesDir: join(folder, 'images'), imageDownload: async () => { throw new Error('none'); }, keyVault: { encrypt: text => Buffer.from(text), decrypt: bytes => bytes.toString() }, aiKeysFile: join(folder, 'ai-keys.json'), aiApiBase: base });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await app.images.idle(); await app.mcp.close(); app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); });
  app.store.importPosts([{ url: 'https://x.com/a/status/1', text: 'a post', sourceAccount: '@one' }]);
  const id = app.store.posts({ scope: 'all' })[0].id, headers = { Origin: `http://localhost:${port}`, 'Content-Type': 'application/json' }, api = (path, method, body) => fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers, body: JSON.stringify(body) });
  await api('/ai-search/tools', 'POST', { tool: 'deepseek' });
  const started = await api('/note-ai', 'POST', { post: id, request: 'What is this?' });
  assert(started.ok, await started.clone().text());
  let job; do { await new Promise(resolve => setTimeout(resolve, 20)); ({ job } = await (await fetch(`http://127.0.0.1:${port}/api/note-ai`, { headers })).json()); } while (job.state === 'running');
  assert.equal(job.state, 'done'); assert.equal(app.store.post(id).notes, 'About a thing.');
  const names = seen.chats[0].tools.map(item => item.function.name);
  assert.deepEqual(names, ['get_post', 'get_saved_image', 'view_post', 'capture_view_frames', 'read_view_frames', 'web_search', 'web_fetch']);
  assert(!seen.chats[0].tools.some(item => item.function.parameters.$schema));
  assert.match(seen.chats[1].messages.find(item => item.role === 'tool').content, /a post/);
});

test('the image request for a key-based AI is plain text, not a tool’s own format', () => {
  const text = imageRequest({ usesFiles: true }, 'cats', [{ post: { id: 1, text: 'hello' } }]);
  assert.match(text, /cats/); assert.match(text, /Image 1 belongs to/);
});
