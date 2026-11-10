import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../server/app.mjs';

async function setup(t) {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const { port } = probe.address(); await new Promise(resolve => probe.close(resolve));
  const dir = await mkdtemp(join(tmpdir(), 'savex-view-')), origin = `http://localhost:${port}`, url = `http://127.0.0.1:${port}`;
  const app = createApp({ origin, imagesDir: dir, imageDownload: async () => { throw new Error('No images here.'); } });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  await fetch(`${url}/api/mcp`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"enabled":true}' });
  const client = new Client({ name: 'savex-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
  t.after(async () => { await client.close(); await app.images.idle(); await app.mcp.close(); app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve)); app.store.close(); await rm(dir, { recursive: true, force: true }); });
  app.store.importPosts([{ url: 'https://x.com/alice/status/1', text: 'one' }, { url: 'https://example.com/page', platform: 'chrome', text: 'a bookmark' }]);
  const posts = app.store.db.prepare('SELECT id,platform FROM posts').all();
  return { app, client, view: args => client.callTool({ name: 'view_save', arguments: args }), x: posts.find(post => post.platform === 'x').id, chrome: posts.find(post => post.platform === 'chrome')?.id };
}
const page = { account: '@alice', title: 'A post', text: 'Post text', images: [Buffer.from([0xff, 0xd8, 0xff, 0xd9])] };

test('view_save returns the page text and pictures, and refuses when the desktop app is not there', async t => {
  const { app, view, x } = await setup(t);
  assert.equal((await view({ postId: x })).isError, true);
  const seen = [];
  app.mcp.setPostViewer(async post => { seen.push(post.id); return page; });
  const result = await view({ postId: x });
  assert.deepEqual(seen, [x]);
  assert.equal(JSON.parse(result.content[0].text).text, 'Post text');
  assert.deepEqual(result.content.slice(1).map(item => [item.type, item.mimeType]), [['image', 'image/jpeg']]);
});

test('a video\'s frames are held for read_view_frames, in small batches, until the next view', async t => {
  const { app, client, view, x } = await setup(t);
  const read = args => client.callTool({ name: 'read_view_frames', arguments: args });
  const frames = Array.from({ length: 12 }, (_, index) => ({ second: index, bytes: Buffer.from([0xff, 0xd8, index, 0xd9]) }));
  const video = { number: 1, frames, started: false, expected: null, perSecond: null, seconds: 12, finished: false, endedEarly: null, tookSeconds: null };
  const held = { videos: [video], waitSeconds: 60, closed: false, done: new Promise(() => {}), stop() {}, start(number, perSecond) { Object.assign(video, { started: true, finished: true, expected: 12, perSecond, tookSeconds: 1 }); } };
  app.mcp.setPostViewer(async () => ({ ...page, view: held }));
  const shown = await view({ postId: x });
  const { videoFrames } = JSON.parse(shown.content[0].text);
  assert.equal(videoFrames.videos[0].capturing, false); assert.equal(videoFrames.videos[0].videoSeconds, 12); assert.equal(shown.content.length, 2);
  assert.equal((await read({ viewId: videoFrames.viewId, frames: [1] })).isError, true);
  const captureFrames = args => client.callTool({ name: 'capture_view_frames', arguments: args });
  assert(!(await captureFrames({ viewId: videoFrames.viewId, framesPerSecond: 2 })).isError);
  assert.equal((await captureFrames({ viewId: videoFrames.viewId, framesPerSecond: 2 })).isError, true);
  const batch = await read({ viewId: videoFrames.viewId, frames: [1, 6, 12] });
  const status = JSON.parse(batch.content[0].text);
  assert.deepEqual(status.frames, [{ frame: 1, second: 0 }, { frame: 6, second: 5 }, { frame: 12, second: 11 }]);
  assert.equal(status.framesRead, 3); assert.equal(status.capturing, false);
  assert.equal(batch.content.length, 4);
  assert.equal((await read({ viewId: videoFrames.viewId, frames: [13] })).isError, true);
  assert.equal((await read({ viewId: videoFrames.viewId, frames: Array.from({ length: 11 }, (_, index) => index + 1) })).isError, true);
  await view({ postId: x });
  assert.equal((await read({ viewId: videoFrames.viewId, frames: [1] })).isError, true);
});

test('each video in a carousel is captured and read on its own, and none is assumed', async t => {
  const { app, client, view, x } = await setup(t);
  const call = (name, args) => client.callTool({ name, arguments: args });
  const make = (number, count) => ({ number, frames: Array.from({ length: count }, (_, index) => ({ second: index, bytes: Buffer.from([0xff, 0xd8, number, index, 0xd9]) })), started: false, expected: null, perSecond: null, seconds: 8, finished: false, endedEarly: null, tookSeconds: null });
  const videos = [make(1, 3), make(2, 5)];
  const held = { videos, waitSeconds: 300, closed: false, done: new Promise(() => {}), stop() {}, start(number, perSecond) { Object.assign(videos[number - 1], { started: true, finished: true, expected: videos[number - 1].frames.length, perSecond, tookSeconds: 1 }); } };
  app.mcp.setPostViewer(async () => ({ ...page, view: held }));
  const { videoFrames } = JSON.parse((await view({ postId: x })).content[0].text);
  assert.equal(videoFrames.videos.length, 2); assert.equal(videoFrames.pageOpenForSeconds, 300); assert.match(videoFrames.howToCapture, /ask/);
  const viewId = videoFrames.viewId;
  assert.match((await call('capture_view_frames', { viewId, framesPerSecond: 1 })).content[0].text, /2 videos/);
  assert.equal((await call('capture_view_frames', { viewId, video: 3, framesPerSecond: 1 })).isError, true);
  assert(!(await call('capture_view_frames', { viewId, video: 2, framesPerSecond: 1 })).isError);
  assert.equal(videos[0].started, false);
  assert.equal((await call('read_view_frames', { viewId, video: 1, frames: [1] })).isError, true);
  assert.match((await call('read_view_frames', { viewId, frames: [1] })).content[0].text, /2 videos/);
  const status = JSON.parse((await call('read_view_frames', { viewId, video: 2, frames: [5] })).content[0].text);
  assert.equal(status.video, 2); assert.equal(status.captured, 5);
});

test('a quoted post\'s video counts as one of the post\'s videos, so none is assumed', async t => {
  const { app, client, view, x } = await setup(t);
  const call = (name, args) => client.callTool({ name, arguments: args });
  const make = (number, quotedIndex) => ({ number, quotedIndex, frames: [{ second: 1, bytes: Buffer.from([0xff, 0xd8, number, 0xd9]) }], started: false, expected: null, perSecond: null, seconds: 8, finished: false, endedEarly: null, tookSeconds: null });
  const videos = [make(1, null), make(2, 0)];
  const held = { videos, waitSeconds: 300, closed: false, done: new Promise(() => {}), stop() {}, start(number, perSecond) { Object.assign(videos[number - 1], { started: true, finished: true, expected: 1, perSecond, tookSeconds: 1 }); } };
  app.mcp.setPostViewer(async () => ({ ...page, view: held }));
  const { videoFrames } = JSON.parse((await view({ postId: x })).content[0].text);
  assert.equal(videoFrames.videos[0].fromQuotedPost, undefined); assert.equal(videoFrames.videos[1].fromQuotedPost, true);
  assert.match(videoFrames.howToCapture, /fromQuotedPost/); assert.match(videoFrames.howToCapture, /ask/);
  const viewId = videoFrames.viewId;
  assert.match((await call('capture_view_frames', { viewId, framesPerSecond: 1 })).content[0].text, /2 videos/);
  assert.equal(videos[0].started, false);
  assert.equal(JSON.parse((await call('capture_view_frames', { viewId, video: 2, framesPerSecond: 1 })).content[0].text).fromQuotedPost, true);
});

test('view_save takes a save ID only, and a Chrome bookmark has no signed-in page to read', async t => {
  const { app, view, chrome } = await setup(t);
  app.mcp.setPostViewer(async () => { throw new Error('should not open'); });
  assert.equal((await view({ url: 'https://example.com' })).isError, true);
  if (chrome) assert.equal((await view({ postId: chrome })).isError, true);
});

test('view_save runs one at a time, and stops after 5 until the user has agreed', async t => {
  const { app, view, x } = await setup(t);
  let open;
  app.mcp.setPostViewer(() => new Promise(resolve => { open = () => resolve(page); }));
  const first = view({ postId: x });
  while (!open) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await view({ postId: x })).isError, true);
  open(); assert(!(await first).isError);
  app.mcp.setPostViewer(async () => page);
  for (let count = 0; count < 4; count++) assert(!(await view({ postId: x })).isError);
  const stopped = await view({ postId: x });
  assert.equal(stopped.isError, true); assert.match(stopped.content[0].text, /ask the user/i);
  assert(!(await view({ postId: x, userApproved: true })).isError);
});
