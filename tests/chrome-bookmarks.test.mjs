import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromeUserData, readChromeBookmarks } from '../desktop/chrome-bookmarks.mjs';
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
  assert.equal(chromeUserData({ platform: 'darwin', home: '/Users/a' }), '/Users/a/Library/Application Support/Google/Chrome');
  assert.equal(chromeUserData({ platform: 'win32', env: { LOCALAPPDATA: 'C:/Users/a/AppData/Local' }, home: 'C:/Users/a' }), join('C:/Users/a/AppData/Local', 'Google', 'Chrome', 'User Data'));
  assert.equal(chromeUserData({ platform: 'linux', env: {}, home: '/home/a' }), '/home/a/.config/google-chrome');
});
