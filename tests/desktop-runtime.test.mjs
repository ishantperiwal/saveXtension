import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { startDesktopLibrary, readDatabaseSnapshot, importSnapshot, isLibraryFrame, isWebLink, instagramPost } from '../desktop/runtime.mjs';
import { windowsBrowsers } from '../desktop/browser.mjs';

test('desktop navigation and browser candidates do not expose arbitrary protocols or credentials', () => {
  assert.equal(isLibraryFrame('http://localhost:3217/', 'http://localhost:3217'), true);
  assert.equal(isLibraryFrame('http://localhost:3210/', 'http://localhost:3217'), false);
  assert.equal(isLibraryFrame('https://evil.example/', 'http://localhost:3217'), false);
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:secret@example.com']) assert.equal(isWebLink(url), false);
  assert.equal(isWebLink('https://x.com/i/status/123'), true);
  assert.equal(instagramPost('https://www.instagram.com/reel/DQ8x_ab-1/?utm_source=ig_embed&ig_rid=1'), 'https://www.instagram.com/reel/DQ8x_ab-1/');
  assert.equal(instagramPost('https://instagram.com/fra_motion_design/p/ABC123'), 'https://www.instagram.com/fra_motion_design/p/ABC123/');
  for (const url of ['https://www.instagram.com/fra_motion_design/', 'https://evil.example/reel/ABC/', 'http://www.instagram.com/reel/ABC/', 'https://www.instagram.com.evil.example/reel/ABC/']) assert.equal(instagramPost(url), '');
  assert.deepEqual(windowsBrowsers({ PROGRAMFILES: 'C:\\Program Files' }), ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']);
});

test('desktop copies an existing library without modifying it or copying its queued jobs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-desktop-runtime-'));
  const old = createApp({ origin: 'http://localhost:3257' });
  old.store.importPosts([{ url: 'https://x.com/a/status/777', notes: 'Keep this note', accounts: ['@a'] }]);
  old.store.set('name', 'Existing library');
  old.server.listen(3257, '127.0.0.1'); await once(old.server, 'listening');
  await fetch('http://localhost:3257/api/sync', { method: 'POST', headers: { Origin: 'http://localhost:3257', 'Content-Type': 'application/json' }, body: JSON.stringify({ targets: ['x'], mode: 'deep' }) });
  let desktop;
  try {
    desktop = await startDesktopLibrary({ dataDir: dir, helperSource: resolve('extension'), preferredPort: 3258, legacyOrigin: 'http://localhost:3257' });
    assert.equal(desktop.store.posts()[0].notes, 'Keep this note');
    assert.equal(desktop.store.get('name'), 'Existing library');
    assert.equal((await (await fetch(`${desktop.origin}/api/sync`)).json()).job, null);
    assert.equal(old.store.posts()[0].notes, 'Keep this note');
    const helper = await readFile(join(desktop.helperPath, 'background.js'), 'utf8');
    assert(helper.includes(`const DEFAULT_ORIGIN = '${desktop.origin}'`));
    assert((await readFile(join(desktop.helperPath, 'options.js'), 'utf8')).includes(desktop.origin));
    const post = desktop.store.posts()[0]; desktop.store.updatePost(post.id, { notes: 'New desktop note' });
    const origin = desktop.origin; await desktop.close();
    desktop = await startDesktopLibrary({ dataDir: dir, helperSource: resolve('extension'), preferredPort: 3260, legacyOrigin: 'http://localhost:3257' });
    assert.equal(desktop.origin, origin); assert.equal(desktop.store.posts()[0].notes, 'New desktop note');
  } finally {
    await desktop?.close(); old.server.closeAllConnections(); await new Promise(resolve => old.server.close(resolve)); old.store.close(); await rm(dir, { recursive: true, force: true });
  }
});

test('readonly database import preserves collection membership and notes without mutating its source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-desktop-import-'));
  const path = join(dir, 'old.sqlite'), source = new Store(path), destination = new Store(':memory:');
  try {
    const collection = source.upsertInstagramCollections('@me', [{ name: 'Design', url: 'https://www.instagram.com/me/saved/design/123/' }])[0];
    const post = { url: 'https://www.instagram.com/p/Test/', sourceAccount: '@me', notes: 'My note' };
    source.importPosts([post]); const id = source.startRun('local', 'instagram', '@me', 'quick', collection.id); source.recordDiscoveries(source.run(id, 'local'), [post]);
    source.set('password', 'Never copy authentication settings');
    importSnapshot(destination, readDatabaseSnapshot(path));
    assert.equal(destination.posts()[0].collections[0].name, 'Design');
    assert.equal(destination.posts()[0].notes, 'My note'); assert.equal(destination.get('password'), undefined);
    assert.equal(source.posts()[0].notes, 'My note');
  } finally { source.close(); destination.close(); await rm(dir, { recursive: true, force: true }); }
});
