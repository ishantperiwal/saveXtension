import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Chrome keeps each profile's bookmarks in a JSON file. Reading it needs no
// extension, works while Chrome is closed and never changes a bookmark.
export function chromeUserData({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (env.SAVEX_CHROME_DATA_DIR) return env.SAVEX_CHROME_DATA_DIR;
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Google', 'Chrome', 'User Data');
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'google-chrome');
}

// Chrome stores dates as microseconds since 1601-01-01.
const windowsEpoch = 11644473600000;
function treeNode(item) {
  if (item.type === 'url') {
    const dateAdded = Number(item.date_added) / 1000 - windowsEpoch;
    return { title: item.name || '', url: item.url, dateAdded: dateAdded > 0 ? dateAdded : undefined };
  }
  return { title: item.name || '', children: (item.children || []).map(treeNode) };
}

async function profileNames(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter(entry => entry.isDirectory() && (entry.name === 'Default' || /^Profile \d+$/.test(entry.name))).map(entry => entry.name);
}
const fileRoots = file => ['bookmark_bar', 'other', 'synced'].map(key => file.roots?.[key]).filter(Boolean);

// Returns the same shape as chrome.bookmarks.getTree(), merged across profiles.
export async function readChromeBookmarks(dir = chromeUserData()) {
  const roots = [];
  for (const profile of await profileNames(dir)) {
    let file;
    try { file = JSON.parse(await readFile(join(dir, profile, 'Bookmarks'), 'utf8')); } catch { continue; }
    roots.push(...fileRoots(file).map(treeNode));
  }
  if (!roots.length) throw new Error('No Chrome bookmarks were found on this computer. Open Chrome bookmarks in saveXtension to connect Chrome.');
  return [{ title: '', children: roots }];
}

// How many bookmarks hold exactly this address, across every profile, before one is deleted.
// No bookmark files at all gives null: the library then knows only the extension's own profile.
// A file that's there but can't be read throws, so a copy can't be missed.
export async function countChromeBookmarks(url, dir = chromeUserData()) {
  let count = 0, read = false;
  const walk = node => { if (node.type === 'url') { try { if (new URL(node.url).href === url) count++; } catch { /* Not a web address. */ } } else (node.children || []).forEach(walk); };
  for (const profile of await profileNames(dir)) {
    let raw;
    try { raw = await readFile(join(dir, profile, 'Bookmarks'), 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    fileRoots(JSON.parse(raw)).forEach(walk); read = true;
  }
  return read ? count : null;
}

// Folders Chrome has loaded the saveXtension helper from with Load unpacked, in any profile. Chrome records
// each unpacked extension's folder in the profile's preferences. Only folders whose manifest names saveXtension
// count, so the app never writes anywhere else.
export async function loadedHelperFolders(dir = chromeUserData()) {
  const found = new Set();
  for (const profile of await profileNames(dir)) {
    for (const name of ['Secure Preferences', 'Preferences']) {
      let prefs;
      try { prefs = JSON.parse(await readFile(join(dir, profile, name), 'utf8')); } catch { continue; }
      for (const extension of Object.values(prefs.extensions?.settings || {})) {
        if (extension?.location !== 4 || typeof extension.path !== 'string' || !extension.path.startsWith('/') && !/^[A-Z]:\\/i.test(extension.path)) continue;
        try { if (JSON.parse(await readFile(join(extension.path, 'manifest.json'), 'utf8')).name?.startsWith('saveXtension')) found.add(extension.path); } catch { /* Folder gone or not ours. */ }
      }
    }
  }
  return [...found];
}
