import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromeUserData, readChromeBookmarks, countChromeBookmarks } from '../desktop/chrome-bookmarks.mjs';
import { deleteBookmark, matchingBookmarks } from '../extension/bookmark-delete.js';
import { bookmarkPosts } from '../extension/bookmarks.js';

const chromeTime = ms => String((ms + 11644473600000) * 1000);
const profile = (bar, other = []) => JSON.stringify({ roots: { bookmark_bar: { type: 'folder', name: 'Bookmarks bar', children: bar }, other: { type: 'folder', name: 'Other bookmarks', children: other } } });

test('reads every Chrome profile file into the bookmarks tree shape', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-chrome-'));
  try {
    for (const name of ['Default', 'Profile 2', 'Guest Profile']) await mkdir(join(dir, name));
    await writeFile(join(dir, 'Default', 'Bookmarks'), profile([{ type: 'folder', name: 'Work', children: [{ type: 'url', name: 'Example', url: 'https://example.com/', date_added: chromeTime(Date.UTC(2024, 0, 2)) }] }]));
    await writeFile(join(dir, 'Profile 2', 'Bookmarks'), profile([], [{ type: 'url', name: 'Example again', url: 'https://example.com/', date_added: chromeTime(Date.UTC(2023, 5, 1)) }, { type: 'url', name: 'Script', url: 'javascript:void 0', date_added: '0' }]));
    await writeFile(join(dir, 'Guest Profile', 'Bookmarks'), profile([{ type: 'url', name: 'Guest', url: 'https://guest.example/' }]));
    const { posts, skipped } = bookmarkPosts(await readChromeBookmarks(dir));
    assert.equal(skipped, 1);
    assert.deepEqual(posts, [{ platform: 'chrome', url: 'https://example.com/', bookmarkTitle: 'Example', folders: ['Bookmarks bar / Work', 'Other bookmarks'], savedAt: '2023-06-01T00:00:00.000Z' }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('reports a clear error when Chrome has no bookmark files', async () => {
  await assert.rejects(readChromeBookmarks(join(tmpdir(), 'savex-no-chrome-here')), /No Chrome bookmarks were found/);
});

test('locates Chrome user data on each platform', () => {
  assert.equal(chromeUserData({ platform: 'darwin', home: '/Users/a' }), join('/Users/a', 'Library', 'Application Support', 'Google', 'Chrome'));
  assert.equal(chromeUserData({ platform: 'win32', env: { LOCALAPPDATA: 'C:/Users/a/AppData/Local' }, home: 'C:/Users/a' }), join('C:/Users/a/AppData/Local', 'Google', 'Chrome', 'User Data'));
  assert.equal(chromeUserData({ platform: 'linux', env: {}, home: '/home/a' }), join('/home/a', '.config', 'google-chrome'));
});

test('counts one address across every profile file, and never guesses past a file it can’t read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savex-chrome-'));
  try {
    assert.equal(await countChromeBookmarks('https://example.com/', dir), null);
    for (const name of ['Default', 'Profile 2', 'Profile 3']) await mkdir(join(dir, name));
    await writeFile(join(dir, 'Default', 'Bookmarks'), profile([{ type: 'folder', name: 'Work', children: [{ type: 'url', name: 'A', url: 'https://example.com' }, { type: 'url', name: 'B', url: 'https://example.com/other' }] }]));
    await writeFile(join(dir, 'Profile 2', 'Bookmarks'), profile([], [{ type: 'url', name: 'C', url: 'https://example.com/' }]));
    assert.equal(await countChromeBookmarks('https://example.com/', dir), 2);
    assert.equal(await countChromeBookmarks('https://example.com/missing', dir), 0);
    await writeFile(join(dir, 'Profile 3', 'Bookmarks'), '{ half written');
    await assert.rejects(countChromeBookmarks('https://example.com/', dir));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

function bookmarkChrome(tree, { removable = true } = {}) {
  const removed = [];
  const prune = nodes => nodes.filter(node => !removed.includes(node.id)).map(node => node.children ? { ...node, children: prune(node.children) } : node);
  globalThis.chrome = { bookmarks: { getTree: async () => prune(structuredClone(tree)), remove: async id => { if (removable) removed.push(id); } } };
  return removed;
}
const deleteJob = { id: 'fixture', platform: 'chrome', url: 'https://example.com/guide', external_id: 'hash', account: 'Chrome' };
const tree = () => [{ id: '0', title: '', children: [
  { id: '1', title: 'Bookmarks bar', children: [{ id: '10', title: 'Guide', url: 'https://example.com/guide' }, { id: '11', title: 'Near miss', url: 'https://example.com/guide?x=1' }] },
  { id: '2', title: 'Other bookmarks', children: [{ id: '20', title: 'Guide again', url: 'https://EXAMPLE.com/guide' }] }
] }];
const run = async job => { const calls = []; await deleteBookmark(job, { instance: 'chrome', sleep: async () => {}, request: async (path, body) => { calls.push({ path, body }); return {}; } }); return calls; };

test('deletes every exact copy of the address in this profile, then reports two reads without it', async () => {
  assert.deepEqual(matchingBookmarks(tree(), deleteJob.url).map(node => node.id), ['10', '20']);
  const removed = bookmarkChrome(tree());
  const calls = await run(deleteJob);
  assert.deepEqual(removed, ['10', '20']);
  assert.deepEqual(calls[0], { path: '/unsaves/fixture/act', body: { instance: 'chrome', found: 2 } });
  const finish = calls.at(-1).body;
  assert.equal(finish.status, 'succeeded'); assert.equal(finish.removed, 2); assert.equal(finish.observations.length, 2);
  assert.ok(finish.observations.every(o => o.state === 'unsaved' && o.account === 'Chrome' && o.externalId === 'hash'));
});

test('a delete Chrome didn’t carry out, or a bookmark set by an organization, never reports success', async () => {
  bookmarkChrome(tree(), { removable: false });
  let calls = await run(deleteJob);
  assert.equal(calls.at(-1).body.status, 'uncertain'); assert.match(calls.at(-1).body.message, /still in Chrome/);
  const managed = tree(); managed[0].children[0].children[0].unmodifiable = 'managed';
  const removed = bookmarkChrome(managed);
  calls = await run(deleteJob);
  assert.deepEqual(removed, []); assert.equal(calls.length, 1);
  assert.equal(calls[0].body.status, 'failed'); assert.match(calls[0].body.message, /organization/);
});
