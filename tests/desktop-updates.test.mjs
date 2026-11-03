import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUpdater, installerName, newerVersion } from '../desktop/updates.mjs';

const bytes = Buffer.from('An installer fixture, never executable');
const digest = createHash('sha256').update(bytes).digest('hex');
function release(overrides = {}, asset = {}) {
  return { tag_name: 'v1.0.2', draft: false, prerelease: false, assets: [{ name: 'saveXtension-1.0.2-mac-arm64.dmg', state: 'uploaded', size: bytes.length, digest: `sha256:${digest}`, browser_download_url: 'https://github.com/ishantperiwal/saveXtension/releases/download/v1.0.2/saveXtension-1.0.2-mac-arm64.dmg', ...asset }], ...overrides };
}
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'savex-updates-'));
  const base = { version: '1.0.1', platform: 'darwin', arch: 'arm64', dataDir: directory, openInstaller: async () => {} };
  try { await run(base, directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('updates compare stable numeric versions and choose an exact platform/architecture installer', () => {
  assert(newerVersion('v1.10.0', '1.9.9')); assert(newerVersion('2.0.0', '1.99.99'));
  for (const value of ['1.0.1', '1.0.0', 'v1.0.2-beta.1', '../1.0.2', '01.0.2']) assert(!newerVersion(value, '1.0.1'));
  assert.equal(installerName('1.0.2', 'win32', 'x64'), 'saveXtension-1.0.2-win-x64.exe');
  assert.equal(installerName('1.0.2', 'darwin', 'x64'), 'saveXtension-1.0.2-mac-x64.dmg');
  assert.equal(installerName('1.0.2', 'win32', 'arm64'), null);
});

test('simultaneous checks download once, expose progress, verify bytes, and reuse a cached download after relaunch', async () => fixture(async (base, directory) => {
  let downloads = 0, opened = 0, finishDownload;
  const remaining = new Promise(resolve => { finishDownload = resolve; });
  const fetchImpl = async url => {
    if (url.includes('api.github.com')) return Response.json(release());
    if (url.includes('github.com/')) return new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/test/installer' } });
    downloads++;
    return new Response(new ReadableStream({ async start(controller) {
      controller.enqueue(bytes.subarray(0, 8));
      await remaining;
      controller.enqueue(bytes.subarray(8)); controller.close();
    } }));
  };
  const updater = createUpdater({ ...base, fetchImpl, openInstaller: async path => { assert.deepEqual(await readFile(path), bytes); opened++; } });
  const checking = Promise.all([updater.check(), updater.check()]);
  try {
    // Hold back the remaining bytes until the updater has consumed the first
    // chunk. Disk setup can exceed a fixed timer on hosted Windows runners.
    const deadline = Date.now() + 5000;
    while (!updater.status().received && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(downloads, 1); assert.equal(updater.status().received, 8);
    assert(updater.status().percent > 0 && updater.status().percent < 100);
  } finally { finishDownload(); await checking; }
  assert.equal(updater.status().phase, 'ready'); assert.equal(opened, 0);
  await updater.install(); assert.equal(opened, 1);
  const next = createUpdater({ ...base, fetchImpl }); await next.check();
  assert.equal(next.status().phase, 'ready'); assert.equal(downloads, 1);
  assert.deepEqual(await readdir(join(directory, 'updates')), ['saveXtension-1.0.2-mac-arm64.dmg']);
  await updater.close(); await next.close();
}));

test('corrupt or truncated packages are removed, cannot install, and can be retried', async () => fixture(async (base, directory) => {
  let corrupt = true;
  const updater = createUpdater({ ...base, fetchImpl: async url => url.includes('api.github.com') ? Response.json(release()) : new Response(corrupt ? Buffer.alloc(bytes.length) : bytes) });
  await updater.check(); assert.equal(updater.status().phase, 'error');
  assert.deepEqual(await readdir(join(directory, 'updates')), []);
  await assert.rejects(updater.install(), /Download and verify/);
  corrupt = false; await updater.check(); assert.equal(updater.status().phase, 'ready');
  await writeFile(join(directory, 'updates', 'saveXtension-1.0.2-mac-arm64.dmg'), 'tampered');
  await assert.rejects(updater.install(), /changed/); assert.equal(updater.status().phase, 'error');
}));

test('unpublished/current releases do not download; malformed, foreign, missing and prerelease installers fail safely', async () => fixture(async base => {
  for (const response of [new Response(null, { status: 404 }), Response.json(release({ tag_name: 'v1.0.1' }))]) {
    let requests = 0;
    const updater = createUpdater({ ...base, fetchImpl: async () => { requests++; return response; } });
    await updater.check(); assert.equal(requests, 1); assert(['unpublished', 'current'].includes(updater.status().phase));
  }
  for (const metadata of [release({ prerelease: true }), release({ assets: [] }), release({}, { digest: null }), release({}, { browser_download_url: 'https://evil.example/update.dmg' }), release({}, { browser_download_url: 'https://github.com/another/repo/releases/download/v1.0.2/saveXtension-1.0.2-mac-arm64.dmg' })]) {
    let requests = 0;
    const updater = createUpdater({ ...base, fetchImpl: async () => { requests++; return Response.json(metadata); } });
    await updater.check(); assert.equal(updater.status().phase, 'error'); assert.equal(requests, 1);
  }
  const updater = createUpdater({ ...base, fetchImpl: async url => url.includes('api.github.com') ? Response.json(release()) : new Response(null, { status: 302, headers: { location: 'https://evil.example/installer' } }) });
  await updater.check(); assert.equal(updater.status().phase, 'error');
}));

test('closing cancels an in-flight update; source development makes no update requests', async () => fixture(async base => {
  const updater = createUpdater({ ...base, fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
  const checking = updater.check(); await updater.close(); await checking;
  assert.equal(updater.status().phase, 'error');
  const development = createUpdater({ ...base, enabled: false, fetchImpl: () => { throw new Error('Must not fetch'); } });
  await development.check(); assert.equal(development.status().phase, 'development');
}));

test('local source checks releases only on an explicit manual request and never downloads or installs them', async () => fixture(async (base, directory) => {
  const requests=[];
  const updater=createUpdater({...base,enabled:false,fetchImpl:async url=>{requests.push(url);assert(url.startsWith('https://api.github.com/'));return Response.json(release());},openInstaller:async()=>{throw new Error('Local source must not install an update.');}});
  await updater.check();assert.equal(requests.length,0);
  await updater.check({manual:true});assert.equal(requests.length,1);
  assert.equal(updater.status().phase,'available');assert.equal(updater.status().availableVersion,'1.0.2');
  assert.equal(updater.status().releaseUrl,'https://github.com/ishantperiwal/saveXtension/releases/tag/v1.0.2');
  assert.deepEqual(await readdir(directory),[]);await assert.rejects(updater.install(),/Download and verify/);
  await updater.check();assert.equal(requests.length,1);await updater.close();
}));
