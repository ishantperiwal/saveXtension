import { readFile, mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPDATE_REPO, installerName } from '../desktop/updates.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist/downloads');
const response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
  headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'saveXtension-download-page', ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
  signal: AbortSignal.timeout(15000)
});
if (!response.ok) throw new Error(`Could not read the latest release (${response.status}).`);
const release = await response.json();
if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) throw new Error('Publish a stable versioned release before building the download page.');
const version = release.tag_name.slice(1);
function installer(platform, arch) {
  const name = installerName(version, platform, arch);
  const asset = release.assets.find(asset => asset.name === name && asset.state === 'uploaded');
  const expected = `https://github.com/${UPDATE_REPO}/releases/download/${release.tag_name}/${name}`;
  if (!asset || asset.browser_download_url !== expected) throw new Error(`The latest release is missing its ${platform} installer.`);
  return expected;
}
const values = { MAC_URL: installer('darwin', 'arm64'), WINDOWS_URL: installer('win32', 'x64'), RELEASE_URL: `https://github.com/${UPDATE_REPO}/releases/tag/${release.tag_name}`, VERSION: version };
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const template = await readFile(resolve(root, 'website/index.html'), 'utf8');
const html = template.replace(/\{\{(\w+)\}\}/g, (_match, key) => { if (!(key in values)) throw new Error(`Unknown template field ${key}`); return escape(values[key]); });
await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'index.html'), html);
await cp(resolve(root, 'website/styles.css'), resolve(output, 'styles.css'));
await cp(resolve(root, 'public/favicon.svg'), resolve(output, 'favicon.svg'));
await mkdir(resolve(output, 'fonts'), { recursive: true });
for (const name of ['SpaceGrotesk.ttf', 'SpaceGrotesk-OFL.txt']) await cp(resolve(root, 'public/fonts', name), resolve(output, 'fonts', name));
console.log(`Download page built for v${version}: dist/downloads`);
