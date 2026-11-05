// Google refuses sign-in inside embedded app windows, so "Continue with Google" happens in real
// Chrome, in its own profile that this app owns (never the person's everyday Chrome profile).
// Chrome runs untouched during sign-in. Only afterwards does a brief hidden launch of that same
// profile hand over the site's own cookies, through a private pipe rather than a network port.
import { execFile, spawn } from 'node:child_process';
import { access, readlink, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, win32 } from 'node:path';

const FLAGS = ['--no-first-run', '--no-default-browser-check'];

export function chromeCandidates({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (platform === 'darwin') return ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].flatMap(app => [join('/Applications', app), join(home, 'Applications', app)]);
  if (platform === 'win32') return [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean).flatMap(root => [win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'), win32.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]);
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge'];
}
export async function findChrome(options) {
  for (const path of chromeCandidates(options)) { try { await access(path); return path; } catch { /* Not installed here. */ } }
  return null;
}
export function openChrome(executable, profile, url) {
  return spawn(executable, [`--user-data-dir=${profile}`, ...FLAGS, '--new-window', url], { stdio: 'ignore' });
}
// Chrome writes cookies to disk about every 30 seconds, and quitting from outside exits without
// saving, so a sign-in just made would be lost. Wait for the next write before quitting. A write
// after this point covers everything before it; none within the limit means nothing was pending.
export async function waitForCookieSave(profile, { limit = 35000, step = 500, since = Date.now(), closed = () => false } = {}) {
  const file = join(profile, 'Default', 'Cookies'), end = since + limit;
  while (Date.now() < end && !closed()) {
    const written = await stat(file).then(info => info.mtimeMs, () => 0);
    if (written >= since) return true;
    await new Promise(resolve => setTimeout(resolve, step));
  }
  return false;
}
export function quitChrome(child, timeout = 8000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, timeout);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill();
  });
}
const run = (file, args) => new Promise(resolve => execFile(file, args, (error, stdout) => resolve(error ? '' : String(stdout))));
// A Chrome from an earlier attempt can still hold this profile: on a Mac it stays running after
// its window closes, and it outlives an app restart. Only a process that names this exact
// profile on its command line is ever stopped, so a recycled process ID can't be hit.
async function profileChromePid(profile) {
  const pid = Number((await readlink(join(profile, 'SingletonLock')).catch(() => '')).split('-').pop());
  return Number.isSafeInteger(pid) && pid > 0 && (await run('ps', ['-p', String(pid), '-o', 'command='])).includes(`--user-data-dir=${profile}`) ? pid : null;
}
export async function quitProfileChrome(profile, timeout = 8000) {
  if (process.platform === 'win32') {
    const path = profile.replaceAll("'", "''");
    await run('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${path}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]);
    return;
  }
  const pid = await profileChromePid(profile); if (!pid) return;
  process.kill(pid, 'SIGTERM');
  for (const end = Date.now() + timeout; Date.now() < end; await new Promise(resolve => setTimeout(resolve, 100))) if (!await profileChromePid(profile)) return;
  process.kill(pid, 'SIGKILL');
}
// Chrome answers over file descriptors 3 and 4, with messages ending in a NUL.
export function readChromeCookies(executable, profile, keep, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-pipe', ...FLAGS, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    let buffer = '', cookies = null;
    const finish = error => { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); if (error) reject(error); else resolve(cookies.filter(cookie => keep(cookie.domain.replace(/^\./, '')))); };
    const timer = setTimeout(() => finish(new Error('Chrome did not hand over the sign-in in time.')), timeout);
    const send = (id, method) => child.stdio[3].write(`${JSON.stringify({ id, method })}\0`);
    child.once('error', finish);
    child.stdio[3].on('error', () => {}); child.stdio[4].on('error', () => {});
    child.once('exit', () => { if (cookies) finish(); else finish(new Error('Chrome closed before handing over the sign-in.')); });
    child.stdio[4].setEncoding('utf8');
    child.stdio[4].on('data', chunk => {
      buffer += chunk;
      for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
        const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        if (message.id !== 1) continue;
        if (!Array.isArray(message.result?.cookies)) return finish(new Error('Chrome did not return its cookies.'));
        cookies = message.result.cookies; send(2, 'Browser.close');
      }
    });
    send(1, 'Storage.getCookies');
  });
}
// The helper extension already reports cookies in nearly Electron's format.
export function extensionCookie({ name, value, domain, hostOnly, path, secure, httpOnly, sameSite, expirationDate }) {
  const host = domain.replace(/^\./, '');
  return { url: `https://${host}${path || '/'}`, name, value, path: path || '/', httpOnly: !!httpOnly, secure: !!secure, sameSite: ['strict', 'lax', 'no_restriction'].includes(sameSite) ? sameSite : 'unspecified', ...(hostOnly ? {} : { domain: domain.startsWith('.') ? domain : `.${domain}` }), ...(expirationDate ? { expirationDate } : {}) };
}
const SAME_SITE = { Strict: 'strict', Lax: 'lax', None: 'no_restriction' };
// From Chrome's cookie format to Electron's. A cookie without a leading dot belongs to one host.
export function electronCookie({ name, value, domain, path, expires, httpOnly, secure, sameSite }) {
  return { url: `https://${domain.replace(/^\./, '')}${path || '/'}`, name, value, path: path || '/', httpOnly: !!httpOnly, secure: !!secure, sameSite: SAME_SITE[sameSite] || 'unspecified', ...(domain.startsWith('.') ? { domain } : {}), ...(expires > 0 ? { expirationDate: expires } : {}) };
}
