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

// Returns the same shape as chrome.bookmarks.getTree(), merged across profiles.
export async function readChromeBookmarks(dir = chromeUserData()) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const profiles = entries.filter(entry => entry.isDirectory() && (entry.name === 'Default' || /^Profile \d+$/.test(entry.name)));
  const roots = [];
  for (const profile of profiles) {
    let file;
    try { file = JSON.parse(await readFile(join(dir, profile.name, 'Bookmarks'), 'utf8')); } catch { continue; }
    roots.push(...['bookmark_bar', 'other', 'synced'].map(key => file.roots?.[key]).filter(Boolean).map(treeNode));
  }
  if (!roots.length) throw new Error('No Chrome bookmarks were found on this computer.');
  return [{ title: '', children: roots }];
}
