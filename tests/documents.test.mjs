import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../server/app.mjs';
import { Store } from '../server/store.mjs';
import { mcpLibrary } from '../server/mcp.mjs';
import { Documents, documentFonts } from '../server/documents.mjs';
import { storedMarkdown, editorMarkdown } from '../public/document-markdown.js';

test('an AI edits documents in small steps, refuses stale edits, and undo takes each step back', () => {
  const store = new Store(':memory:');
  try {
    const lib = mcpLibrary(store), app = new Documents(store.db);
    assert.throws(() => lib.documents.create({ title: 'Repos', body: '- one' }), /what this document is for/);
    const made = lib.documents.create({ title: 'Repos', description: 'GitHub repos worth using, nothing else.', body: '# Repos\n\n- one' });
    assert.equal(lib.documents.list().documents[0].description, 'GitHub repos worth using, nothing else.');
    let doc = lib.documents.read({ documentId: made.document.id });
    const edited = lib.documents.edit({ documentId: doc.id, expectedUpdatedAt: doc.updatedAt, replacements: [{ find: '- one', replace: '- one\n- two' }], append: '## Fonts\n\n- Inter' });
    assert.equal(lib.documents.read({ documentId: doc.id }).body, '# Repos\n\n- one\n- two\n\n## Fonts\n\n- Inter');
    assert.throws(() => lib.documents.edit({ documentId: doc.id, expectedUpdatedAt: doc.updatedAt, append: 'x' }), /changed since you read it/);
    doc = lib.documents.read({ documentId: doc.id });
    assert.throws(() => lib.documents.edit({ documentId: doc.id, expectedUpdatedAt: doc.updatedAt, replacements: [{ find: 'missing', replace: 'x' }] }), /isn’t in the document/);
    assert.throws(() => lib.documents.edit({ documentId: doc.id, expectedUpdatedAt: doc.updatedAt, replacements: [{ find: '- ', replace: '* ' }] }), /more than once/);
    assert.deepEqual(lib.documents.list().documents[0].headings, ['# Repos', '## Fonts']);
    lib.topics.undo(edited.changeId);
    assert.equal(lib.documents.read({ documentId: doc.id }).body, '# Repos\n\n- one');
    // Once the person edits it, the AI's creation can't be undone out from under them.
    doc = app.get(doc.id); app.save(doc.id, { body: `${doc.body}\n\nmine`, expectedUpdatedAt: doc.updatedAt });
    assert.throws(() => lib.topics.undo(made.changeId), /changed again/);
    const temporary = lib.documents.create({ title: 'Temp', description: 'Scratch.' }); lib.topics.undo(temporary.changeId);
    assert.deepEqual(lib.documents.list().documents.map(d => d.title), ['Repos']);
    // Deleting a document drops its undo entries, so nothing can bring it back by accident.
    app.delete(doc.id);
    assert.equal(lib.topics.history(10).filter(c => !c.undone).length, 0);
  } finally { store.close(); }
});

test('documents are stored as plain Markdown, whatever the editor writes', () => {
  const fromEditor = '# T\n\n<br />\n\n![1.00](images/a.png "Fraunces \\"sample\\"")\n\n![0.50](images/b.png)\n\n```\nkeep\n\n\n<br />\n```\n\nInline ![x](y.png) here\n';
  const stored = storedMarkdown(fromEditor);
  assert.equal(stored, '# T\n\n![Fraunces "sample"](images/a.png)\n\n![](images/b.png "size 0.5")\n\n```\nkeep\n\n\n<br />\n```\n\nInline ![x](y.png) here\n');
  assert.equal(storedMarkdown(editorMarkdown(stored)), stored);
});

async function freePort() { const s = createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const port = s.address().port; await new Promise(r => s.close(r)); return port; }
test('documents through the app and through MCP, with pictures', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-docs-')), port = await freePort(), origin = `http://localhost:${port}`;
  const app = createApp({ origin, imagesDir: join(dir, 'images') }); app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  t.after(async () => { await app.mcp.close(); app.server.closeAllConnections(); await new Promise(r => app.server.close(r)); app.store.close(); await rm(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${port}`, send = (path, method, body) => fetch(`${url}/api${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const { src } = await (await send('/documents/images', 'POST', { data: png.toString('base64') })).json();
  assert.match(src, /^images\/[a-f0-9]{32}\.png$/);
  const picture = await fetch(`${url}/api/documents/${src}`); assert.equal(picture.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await picture.arrayBuffer()), png);
  assert.equal((await send('/documents/images', 'POST', { data: Buffer.from('<svg/>').toString('base64') })).status, 415);
  const doc = await (await send('/documents', 'POST', { title: 'Fonts', description: 'Fonts only.', body: `![Sample](${src})` })).json();
  assert.equal((await send('/documents', 'POST', { title: 'No scope' })).status, 400);
  assert.equal((await send(`/documents/${doc.id}`, 'PATCH', { body: 'x', expectedUpdatedAt: '2000-01-01T00:00:00.000Z' })).status, 409);
  assert.equal((await send('/documents', 'POST', { title: ' ' })).status, 400);

  assert.equal((await send('/mcp', 'POST', { enabled: true })).status, 200);
  const client = new Client({ name: 'savex-docs-test', version: '1.0.0' }); t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
  const names = (await client.listTools()).tools.map(tool => tool.name);
  for (const name of ['list_documents', 'read_document', 'create_document', 'edit_document']) assert(names.includes(name), name);
  const call = async (name, args = {}) => { const result = await client.callTool({ name, arguments: args }); return result.isError ? { error: result.content[0].text } : result.structuredContent || JSON.parse(result.content[0].text); };
  assert.deepEqual((await call('list_documents')).documents.map(d => d.title), ['Fonts']);
  const read = await call('read_document', { documentId: doc.id });
  assert.match((await call('edit_document', { documentId: doc.id, expectedUpdatedAt: read.updatedAt })).error, /Say what to change/);
  const edit = await call('edit_document', { documentId: doc.id, expectedUpdatedAt: read.updatedAt, append: '- Fraunces' });
  assert(edit.changeId);
  assert.equal((await (await fetch(`${url}/api/documents/${doc.id}`)).json()).body, `![Sample](${src})\n\n- Fraunces`);
  assert.equal((await call('list_changes')).changes[0].action, 'edit_document');
  await call('undo_change', { changeId: edit.changeId });
  assert.equal((await (await fetch(`${url}/api/documents/${doc.id}`)).json()).body, `![Sample](${src})`);
  const exported = await (await fetch(`${url}/api/export`)).json();
  assert.equal(exported.documents[0].title, 'Fonts');
});

test('an AI adds a free font by link; only real font files are kept', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-fonts-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const files = { 'https://fonts.example/a.woff2': Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(40, 1)]), 'https://fonts.example/page': Buffer.from('<html>') };
  const fonts = documentFonts(dir, { download: async url => ({ url, bytes: files[url] }) });
  const added = await fonts.add({ family: 'Clash Display', url: 'https://fonts.example/a.woff2' });
  assert.equal(added.markdown, '[Clash Display](font:Clash%20Display)');
  assert.deepEqual((await fonts.list()).map(f => f.family), ['Clash Display']);
  assert.equal((await fonts.read(added.file)).type, 'font/woff2');
  await assert.rejects(fonts.add({ family: 'Page', url: 'https://fonts.example/page' }), /isn’t a font file/);
  await assert.rejects(fonts.add({ family: '<script>', url: 'https://fonts.example/a.woff2' }), /family name/);
  await fonts.add({ family: 'clash display', url: 'https://fonts.example/a.woff2' });
  assert.equal((await fonts.list()).length, 1);
});
