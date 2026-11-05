import { app, BrowserWindow, Menu, dialog, shell, ipcMain, clipboard, session } from 'electron';
import { mkdir, readFile, appendFile, cp } from 'node:fs/promises';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDesktopLibrary, isLibraryFrame, isWebLink, instagramPost, pinterestPost, importSnapshot, readDatabaseSnapshot } from './runtime.mjs';
import { openSyncBrowser, focusSyncBrowser } from './browser.mjs';
import { createUpdater } from './updates.mjs';
import { createNativeSocial } from './social.mjs';
import { BUSY } from '../public/busy-messages.js';
import { readChromeBookmarks } from './chrome-bookmarks.mjs';
import { randomBytes, randomUUID } from 'node:crypto';

// Google's sign-in buttons prefer the browser's FedCM feature when it exists, but Electron has
// no interface for it, so the click silently fails. Without it they ask for a popup, which is
// the signal the sign-in window uses to continue in real Chrome.
app.commandLine.appendSwitch('disable-features', 'FedCm');
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const userData = process.env.SAVEX_DESKTOP_DATA_DIR || join(app.getPath('appData'), 'saveXtension');
mkdirSync(userData, { recursive: true });
app.setName('saveXtension'); app.setPath('userData', userData);
let library, updater, social, window, starting, quitting = false, quitReady = false, connecting;
const nativeTransport = { instance: `native-${randomUUID()}`, token: randomBytes(32).toString('hex') };
const unsaveReturns=new Set();
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } else void starting?.then(createWindow); });
  app.on('activate', () => { if (library) createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', event => {
    if (quitReady) return;
    event.preventDefault(); if (quitting) return; quitting = true;
    void (async () => { try { await updater?.close(); await social?.close(); await library?.close(); } catch (error) { await log(error); } finally { quitReady = true; app.quit(); } })();
  });
  app.whenReady().then(() => { starting = start(); return starting; }).catch(async error => {
    await log(error); dialog.showErrorBox('saveXtension could not open', `${error.message}\n\nYour library is kept in:\n${userData}`); app.quit();
  });
}

const helperFolder = () => join(app.getPath('downloads'), 'saveXtension Chrome helper');
async function log(error) {
  try { await mkdir(userData, { recursive: true }); await appendFile(join(userData, 'desktop.log'), `${new Date().toISOString()} ${error?.stack || error}\n`); } catch { /* Keep the startup error visible even if the log cannot be written. */ }
}

async function start() {
  library = await startDesktopLibrary({
    dataDir: userData, helperSource: app.isPackaged ? join(process.resourcesPath, 'extension') : join(root, 'extension'),
    legacyOrigin: process.env.SAVEX_DESKTOP_LEGACY_ORIGIN || 'http://localhost:3210',
    legacyDatabasePath: app.isPackaged ? undefined : join(root, 'data', 'savextension.sqlite'), nativeTransport
  });
  // A saved helper copy is refreshed so Chrome's next reload loads this version.
  const saved = helperFolder();
  if (existsSync(join(saved, 'manifest.json'))) await cp(library.helperPath, saved, { recursive: true, force: true }).catch(log);
  social = await createNativeSocial({ library, transport: nativeTransport, extensionRoot: library.helperPath, version: JSON.parse(await readFile(join(library.helperPath, 'manifest.json'), 'utf8')).version, onError: log });
  updater = createUpdater({ version: app.getVersion(), dataDir: userData, enabled: app.isPackaged && !process.env.SAVEX_DESKTOP_DISABLE_UPDATES, openInstaller: async path => { const error = await shell.openPath(path); if (error) throw new Error(error); } });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.on('will-download', (_event, item, contents) => {
    if (contents !== window?.webContents) return;
    item.setSaveDialogOptions({ title: 'Save from saveXtension', defaultPath: join(app.getPath('downloads'), item.getFilename()) });
  });
  ipcMain.handle('savex-desktop', async (event, message) => {
    if (event.sender !== window?.webContents || !isLibraryFrame(event.senderFrame?.url, library.origin)) throw new Error('This action is available only in your library.');
    switch (message?.action) {
      case 'helperInfo': return { path: library.helperPath, version: JSON.parse(await readFile(join(library.helperPath, 'manifest.json'), 'utf8')).version };
      case 'showHelper': { const error = await shell.openPath(library.helperPath); if (error) throw new Error(error); return true; }
      case 'copyHelperPath': clipboard.writeText(library.helperPath); return true;
      case 'copyText':
        if (typeof message.text !== 'string' || message.text.length > 100000) throw new Error('Invalid clipboard text.');
        clipboard.writeText(message.text); return true;
      case 'openExtensions': await openSyncBrowser('chrome://extensions/'); return true;
      case 'chromeBookmarksFound': return readChromeBookmarks().then(() => true, () => false);
      case 'openDownloads': { const error = await shell.openPath(app.getPath('downloads')); if (error) throw new Error(error); return true; }
      case 'saveHelper': {
        const destination = helperFolder();
        await cp(library.helperPath, destination, { recursive: true, force: true });
        return { path: destination };
      }
      case 'connect': return connect(message.type);
      case 'socialAccounts': return social.status();
      case 'connectSocial': return social.connect(message.options);
      case 'browseSocial': return social.browse(message.id);
      case 'disconnectSocial': return social.disconnect(message.id);
      case 'wakeSocial': social.wake(); return true;
      case 'returnAfterUnsave': {
        const status=await api('/sync'),id=message.id;
        if(!/^[a-f0-9]{24}$/.test(id||'')||status.unsave?.id!==id&&!status.unsaveDiagnostics?.some(job=>job.id===id&&Date.now()-job.finishedAt<10000))throw new Error('Unsave request not found.');
        if (status.nativeSocial?.enabled) { social.wake(); return true; }
        if(!unsaveReturns.has(id)){
          unsaveReturns.add(id);
          await focusSyncBrowser(status.browser?.name).catch(log);
          void returnAfterUnsave(id).catch(log);
        }
        return true;
      }
      case 'updateStatus': return updater.status();
      case 'checkForUpdates': return updater.check({ manual: true });
      case 'viewUpdateRelease': {
        const status = updater.status();
        if (status.phase !== 'available' || !status.releaseUrl) throw new Error('Check for an available release first.');
        await shell.openExternal(status.releaseUrl); return true;
      }
      case 'installUpdate': {
        if (updater.status().phase !== 'ready') throw new Error('Download and verify an update first.');
        if (['queued', 'running'].includes((await api('/sync')).job?.status)) throw new Error(BUSY.update.title);
        const result = await dialog.showMessageBox(window, { type: 'info', message: 'Open the installer and quit saveXtension?', detail: process.platform === 'darwin' ? 'Drag the new app into Applications and replace the existing copy. Your library and notes stay on this computer. Open saveXtension again after installation.' : 'Follow the installer to update saveXtension, then open it again. Your library and notes stay on this computer.', buttons: ['Open installer and quit', 'Cancel'], defaultId: 0, cancelId: 1 });
        if (result.response !== 0) return false;
        await updater.install(); app.quit(); return true;
      }
      default: throw new Error('Unsupported desktop action.');
    }
  });
  installMenu(); await createWindow();
  void updater.check().catch(log);
  // Keep looking while the app stays open, so a new release shows up without a restart.
  setInterval(() => void updater.check().catch(log), 4 * 60 * 60 * 1000);
  // Only a previously chosen set of accounts may sync on launch. Deep scans are never automatic.
  if (library.store.get('desktop_auto_sync') !== 'false' && !process.env.SAVEX_DESKTOP_DISABLE_AUTO_SYNC) {
    const previous = (await api('/sync')).job;
    if (previous?.targets?.length) void autoQuickSync(previous).catch(log);
  }
}

async function returnAfterUnsave(id){
  try{
    const deadline=Date.now()+210000;
    while(!quitting&&Date.now()<deadline){
      const status=await api('/sync');
      const finished=status.unsave?.id===id&&!['queued','running'].includes(status.unsave.status)||status.unsaveDiagnostics?.some(job=>job.id===id);
      if(finished){
        if(window&&!window.isDestroyed()){
          if(window.isMinimized())window.restore();
          app.focus({steal:true});window.show();window.focus();
        }
        return;
      }
      await new Promise(resolve=>setTimeout(resolve,300));
    }
  }finally{unsaveReturns.delete(id);}
}

async function api(path, body) {
  const response = await fetch(`${library.origin}/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: library.origin, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The library request failed.'); return result;
}

async function autoQuickSync(previous) {
  let status = await api('/sync');
  for (let attempt = 0; !status.browser?.online && attempt < 15 && !quitting; attempt++) { await new Promise(resolve => setTimeout(resolve, 200)); status = await api('/sync'); }
  const browser = status.browser;
  if (!browser || previous.targets.some(t => t === 'chrome' ? !browser.bookmarksReady : !browser.ready)) return;
  const connected = status.nativeSocial?.accounts.filter(account => account.status === 'connected') || [];
  for (const platform of previous.targets.filter(target => target !== 'chrome')) {
    const available = connected.filter(account => account.platform === platform), selected = platform === 'x' ? previous.xAccount : previous.instagramScope?.account;
    const requested = Array.isArray(selected) ? selected : selected?.startsWith('@') ? [selected] : [];
    if (!available.length || requested.some(handle => !available.some(account => account.handle.toLowerCase() === handle.toLowerCase()))) return;
  }
  const instagramAccount = previous.instagramScope?.account || 'current', selected = previous.instagramScope?.selections?.[instagramAccount.toLowerCase()];
  await api('/sync', { targets: previous.targets, xAccount: previous.xAccount || 'current', instagramAccount, ...(previous.targets.length === 1 && previous.targets[0] === 'instagram' && selected?.length === 1 ? { instagramCollectionId: selected[0] } : {}), mode: 'quick' });
  await connect('WAKE_SYNC');
}

async function connect(type = 'PROBE_EXTENSION') {
  if (!['PROBE_EXTENSION', 'WAKE_SYNC', 'OPEN_SETUP', 'OPEN_BOOKMARK_SETUP'].includes(type)) throw new Error('Unsupported browser action.');
  if (type === 'WAKE_SYNC') { social.wake(); return (await api('/sync')).browser; }
  if (type === 'PROBE_EXTENSION') { social.wake(); return (await api('/sync')).browser; }
  if (type === 'OPEN_SETUP') return social.status();
  const permission = type === 'OPEN_SETUP' || type === 'OPEN_BOOKMARK_SETUP';
  if (permission) await api('/sync/setup', { kind: type === 'OPEN_BOOKMARK_SETUP' ? 'chrome' : 'social' });
  const current = (await api('/sync')).chromeBrowser;
  if (!permission && current?.online) return current;
  if (connecting) return connecting;
  connecting = (async () => {
    const query = new URLSearchParams({ desktop: '1', action: type });
    await openSyncBrowser(`${library.origin}/desktop-connect.html?${query}`, { background: !permission });
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline && !quitting) {
      const browser = (await api('/sync')).chromeBrowser;
      if (browser?.online) return browser;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return null;
  })();
  try { return await connecting; } finally { connecting = null; }
}

async function createWindow() {
  if (quitting) return;
  if (window && !window.isDestroyed()) { window.show(); window.focus(); return; }
  window = new BrowserWindow({ title: 'saveXtension', width: 1280, height: 900, minWidth: 760, minHeight: 560, show: false, backgroundColor: '#f7f8f3', icon: join(root, 'desktop', 'assets', 'icon.png'),
    webPreferences: { preload: join(root, 'desktop', 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false }
  });
  // Instagram and Pinterest posts open in saveXtension's own small viewer; every other link opens in the browser.
  window.webContents.setWindowOpenHandler(({ url }) => { const post = instagramPost(url), pin = pinterestPost(url); if (post) social.openPost(post); else if (pin) social.openPost(pin, 'pinterest'); else if (isWebLink(url)) void shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (!isLibraryFrame(url, library.origin)) { event.preventDefault(); if (isWebLink(url)) void shell.openExternal(url); } });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('closed', () => { window = null; });
  window.once('ready-to-show', () => window?.show());
  await window.loadURL(library.origin);
}

async function importLibrary() {
  const result = await dialog.showOpenDialog(window, { title: 'Import an existing saveXtension library', properties: ['openFile'], filters: [{ name: 'saveXtension backups', extensions: ['json', 'sqlite', 'db'] }] });
  if (result.canceled || !result.filePaths[0]) return;
  try {
    const path = result.filePaths[0];
    const snapshot = path.toLowerCase().endsWith('.json') ? JSON.parse(await readFile(path, 'utf8')) : readDatabaseSnapshot(path);
    const imported = importSnapshot(library.store, snapshot);
    await window?.reload();
    await dialog.showMessageBox(window, { type: 'info', message: 'Library imported', detail: `${imported.imported} new saves. ${imported.updated} existing saves refreshed. The original file was kept.` });
  } catch (error) { await dialog.showMessageBox(window, { type: 'error', message: 'Could not import this library', detail: error.message }); }
}

function installMenu() {
  const safe = callback => () => Promise.resolve().then(callback).catch(error => { void log(error); dialog.showErrorBox('saveXtension', error.message); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'saveXtension', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'Library', submenu: [{ label: 'Open library', accelerator: 'CmdOrCtrl+Shift+L', click: safe(createWindow) }, { label: 'Import existing library…', click: safe(importLibrary) }, { label: 'Show library folder', click: safe(() => shell.openPath(userData)) }, { type: 'separator' },
      { label: 'Quick sync when app opens', type: 'checkbox', checked: library.store.get('desktop_auto_sync') !== 'false', click: item => library.store.set('desktop_auto_sync', String(item.checked)) },
      { label: 'Recover expired images in the background', type: 'checkbox', checked: library.store.get('image_recovery') !== 'false', click: item => library.store.set('image_recovery', String(item.checked)) },
      ...(process.platform === 'darwin' ? [] : [{ type: 'separator' }, { role: 'quit' }]) ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
  ]));
}
