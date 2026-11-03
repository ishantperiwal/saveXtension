import { execFile, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { win32 } from 'node:path';
import { promisify } from 'node:util';
const execute = promisify(execFile);

export function windowsBrowsers(env = process.env) {
  const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
  return [...roots.map(root => win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')), ...roots.map(root => win32.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))];
}
async function launch(path, url) {
  const child = spawn(path, [url], { detached: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref();
}

export async function openSyncBrowser(url, { background = false } = {}) {
  if (process.platform === 'darwin') {
    for (const name of ['Google Chrome', 'Microsoft Edge']) {
      try { await execute('/usr/bin/open', [...(background ? ['-g'] : []), '-a', name, url]); return; } catch { /* Try the other supported browser. */ }
    }
  } else if (process.platform === 'win32') {
    for (const path of windowsBrowsers()) {
      try { await access(path); await launch(path, /msedge\.exe$/i.test(path) ? url.replace(/^chrome:/, 'edge:') : url); return; } catch { /* Not installed at this location. */ }
    }
  } else {
    for (const name of ['google-chrome', 'chromium', 'microsoft-edge']) {
      try { await launch(name, url); return; } catch { /* Try the next supported browser. */ }
    }
  }
  throw new Error('Install Google Chrome or Microsoft Edge, then try again. The browser helper uses your social logins there.');
}
