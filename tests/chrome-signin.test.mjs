import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { chromeCandidates, electronCookie, extensionCookie, waitForCookieSave } from '../desktop/chrome-signin.mjs';

test('Chrome is looked for in its usual places on each platform', () => {
  assert(chromeCandidates({ platform: 'darwin', home: '/Users/a' }).includes(join('/Applications', 'Google Chrome.app/Contents/MacOS/Google Chrome')));
  assert(chromeCandidates({ platform: 'darwin', home: '/Users/a' }).includes(join('/Users/a', 'Applications', 'Google Chrome.app/Contents/MacOS/Google Chrome')));
  assert(chromeCandidates({ platform: 'win32', env: { PROGRAMFILES: 'C:\\Program Files' } }).some(path => /Google.Chrome.Application.chrome\.exe$/.test(path)));
});
test('Chrome cookies convert to what Electron accepts', () => {
  assert.deepEqual(electronCookie({ name: '_pinterest_sess', value: 'v', domain: '.pinterest.com', path: '/', expires: 1900000000.5, httpOnly: true, secure: true, sameSite: 'None' }), { url: 'https://pinterest.com/', name: '_pinterest_sess', value: 'v', path: '/', httpOnly: true, secure: true, sameSite: 'no_restriction', domain: '.pinterest.com', expirationDate: 1900000000.5 });
  assert.deepEqual(electronCookie({ name: 'csrftoken', value: 'c', domain: 'in.pinterest.com', path: '/', expires: -1, secure: true, sameSite: 'Lax' }), { url: 'https://in.pinterest.com/', name: 'csrftoken', value: 'c', path: '/', httpOnly: false, secure: true, sameSite: 'lax' });
  assert.equal(electronCookie({ name: 'a', value: '', domain: 'x.pinterest.com', expires: -1 }).sameSite, 'unspecified');
});

test('the wait ends on Chrome’s next cookie save, when Chrome closes, or at its limit', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'savex-chrome-save-'));
  try {
    assert.equal(await waitForCookieSave(profile, { limit: 40, step: 5 }), false, 'nothing written');
    await mkdir(join(profile, 'Default'));
    const since = Date.now(); setTimeout(() => void writeFile(join(profile, 'Default', 'Cookies'), 'x'), 20);
    assert.equal(await waitForCookieSave(profile, { since: since - 2000, limit: 3000, step: 5 }), true);
    await utimes(join(profile, 'Default', 'Cookies'), 1, 1);
    const started = Date.now(); assert.equal(await waitForCookieSave(profile, { limit: 5000, step: 5, closed: () => true }), false); assert(Date.now() - started < 1000);
  } finally { await rm(profile, { recursive: true, force: true }); }
});

test('cookies from the helper extension convert to what Electron accepts', () => {
  assert.deepEqual(extensionCookie({ name: '_pinterest_sess', value: 'v', domain: '.pinterest.com', hostOnly: false, path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction', expirationDate: 1900000000 }), { url: 'https://pinterest.com/', name: '_pinterest_sess', value: 'v', path: '/', httpOnly: true, secure: true, sameSite: 'no_restriction', domain: '.pinterest.com', expirationDate: 1900000000 });
  assert.deepEqual(extensionCookie({ name: 'csrftoken', value: 'c', domain: 'in.pinterest.com', hostOnly: true, path: '/', secure: true, httpOnly: false, sameSite: 'unspecified' }), { url: 'https://in.pinterest.com/', name: 'csrftoken', value: 'c', path: '/', httpOnly: false, secure: true, sameSite: 'unspecified' });
});
