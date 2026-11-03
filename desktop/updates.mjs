import { createHash } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';

export const UPDATE_REPO = 'ishantperiwal/saveXtension';
const API = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
const MAX_PACKAGE = 1024 * 1024 * 1024;
const stableVersion = value => typeof value === 'string' && /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) ? value.replace(/^v/, '') : null;
export function newerVersion(candidate, current) {
  const a = stableVersion(candidate), b = stableVersion(current);
  if (!a || !b) return false;
  const parts = b.split('.').map(BigInt), next = a.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (next[i] !== parts[i]) return next[i] > parts[i];
  return false;
}
export function installerName(version, platform, arch) {
  if (!stableVersion(version) || !['arm64', 'x64'].includes(arch)) return null;
  if (platform === 'darwin') return `saveXtension-${version}-mac-${arch}.dmg`;
  if (platform === 'win32' && arch === 'x64') return `saveXtension-${version}-win-x64.exe`;
  return null;
}
function downloadAddress(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com'].includes(url.hostname)) throw new Error('The update download is not hosted by GitHub.');
  return url.href;
}
async function digestFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function createUpdater({ version, dataDir, platform = process.platform, arch = process.arch, enabled = true, fetchImpl = fetch, openInstaller }) {
  let state = { phase: enabled ? 'idle' : 'development', currentVersion: version, availableVersion: null, received: 0, total: 0, percent: 0, message: enabled ? 'Checks GitHub when the app opens. New installers download automatically; you choose when to install.' : 'Running local source. Installer updates are available in the installed desktop app.' };
  let operation, controller, ready, disposed = false;
  const status = () => ({ ...state });
  const set = values => { state = { ...state, ...values }; };
  async function request(url, signal, accept = 'application/octet-stream') {
    return fetchImpl(url, { signal, redirect: 'manual', headers: { Accept: accept, 'User-Agent': `saveXtension/${version}`, 'X-GitHub-Api-Version': '2022-11-28' } });
  }
  async function check({ manual = false } = {}) {
    if ((!enabled && !manual) || disposed) return status();
    if (operation) return operation;
    if (ready) return status();
    controller = new AbortController();
    operation = (async () => {
      let partial;
      try {
        set({ phase: 'checking', message: 'Checking GitHub for updates…', availableVersion: null, releaseUrl: null, percent: 0, received: 0, total: 0 });
        const response = await request(API, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), 'application/vnd.github+json');
        if (response.status === 404) { set({ phase: 'unpublished', message: 'No installer release has been published yet. Check again after the first GitHub release.' }); return status(); }
        if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub is limiting update checks. Please try again later.' : 'Could not check GitHub. Please try again.');
        // Bound metadata too: a release description must not consume unbounded memory.
        const metadata = []; let metadataSize = 0;
        for await (const chunk of response.body) { metadataSize += chunk.length; if (metadataSize > 2 * 1024 * 1024) throw new Error('GitHub returned too much update metadata.'); metadata.push(Buffer.from(chunk)); }
        const release = JSON.parse(Buffer.concat(metadata).toString('utf8')), next = stableVersion(release.tag_name);
        if (release.draft || release.prerelease || !next) throw new Error('The latest release is not a supported stable version.');
        if (!newerVersion(next, version)) { set({ phase: 'current', message: `You’re up to date. Version ${version}.` }); return status(); }
        if (!enabled) {
          // A manual check is useful in local source runs, but must never
          // download/install over unpublished work or start automatic checks.
          set({ phase: 'available', availableVersion: next, releaseUrl: `https://github.com/${UPDATE_REPO}/releases/tag/${encodeURIComponent(release.tag_name)}`, message: `Version ${next} is available.` });
          return status();
        }
        const name = installerName(next, platform, arch);
        const asset = name && release.assets?.find(a => a.name === name && a.state === 'uploaded');
        if (!asset) throw new Error('This release does not have an installer for your computer yet. Please check again later.');
        const expected = asset.digest?.match(/^sha256:([a-f0-9]{64})$/i)?.[1]?.toLowerCase();
        if (!expected) throw new Error('This release has no verified download checksum. Please try a newer release.');
        if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_PACKAGE) throw new Error('The installer size is invalid.');
        const initial = new URL(downloadAddress(asset.browser_download_url));
        if (initial.hostname !== 'github.com' || initial.pathname !== `/${UPDATE_REPO}/releases/download/${release.tag_name}/${name}`) throw new Error('The installer does not belong to this repository release.');
        const directory = join(dataDir, 'updates'), destination = join(directory, name);
        await mkdir(directory, { recursive: true });
        // Reuse an already verified download after relaunch, avoiding another large transfer.
        try {
          if (await digestFile(destination) === expected) {
            ready = { path: destination, digest: expected }; set({ phase: 'ready', availableVersion: next, received: asset.size, total: asset.size, percent: 100, message: `Version ${next} is downloaded and verified. Ready to install.` }); return status();
          }
        } catch { /* No cached installer. */ }
        partial = `${destination}.partial`; await rm(partial, { force: true });
        set({ phase: 'downloading', availableVersion: next, total: asset.size, message: `Downloading version ${next}…` });
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60 * 1000)]);
        let address = initial.href, download;
        for (let redirects = 0; redirects <= 5; redirects++) {
          download = await request(downloadAddress(address), signal);
          if (![301, 302, 303, 307, 308].includes(download.status)) break;
          const location = download.headers.get('location'); await download.body?.cancel();
          if (!location || redirects === 5) throw new Error('GitHub returned an invalid download redirect.');
          address = downloadAddress(new URL(location, address).href);
        }
        if (!download.ok || !download.body) throw new Error('The installer download failed. Please try again.');
        const file = await open(partial, 'w', 0o600), hash = createHash('sha256'); let received = 0;
        try {
          for await (const chunk of download.body) {
            received += chunk.length;
            if (received > asset.size) throw new Error('The downloaded installer is larger than expected.');
            hash.update(chunk); await file.writeFile(chunk);
            set({ received, percent: Math.floor(received / asset.size * 100) });
          }
        } finally { await file.close(); }
        if (received !== asset.size || hash.digest('hex') !== expected) throw new Error('The installer failed verification. It was discarded; please retry.');
        await rm(destination, { force: true }); await rename(partial, destination); partial = null;
        ready = { path: destination, digest: expected };
        set({ phase: 'ready', percent: 100, message: `Version ${next} is downloaded and verified. Ready to install.` });
      } catch (error) {
        if (partial) await rm(partial, { force: true }).catch(() => {});
        set({ phase: 'error', message: controller.signal.aborted ? 'The download was stopped. You can try again.' : error.message });
      } finally { operation = null; }
      return status();
    })();
    return operation;
  }
  return { status, check, async install() {
    if (!ready || state.phase !== 'ready') throw new Error('Download and verify an update first.');
    let valid = false;
    try { valid = await digestFile(ready.path) === ready.digest; } catch { /* The cached file may have been removed. */ }
    if (!valid) { ready = null; set({ phase: 'error', message: 'The downloaded installer is missing or changed. Please download it again.' }); throw new Error(state.message); }
    await openInstaller(ready.path);
  }, async close() { disposed = true; controller?.abort(); await operation; } };
}
