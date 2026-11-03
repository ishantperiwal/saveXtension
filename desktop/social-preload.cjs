const { ipcRenderer } = require('electron');
// This bridge exists only in Electron's isolated preload world, never on the
// social website's window. It can send collector events, not arbitrary IPC.
const listeners = [];
globalThis.chrome = Object.freeze({ runtime: Object.freeze({
  id: 'savex-native',
  onMessage: Object.freeze({ addListener: listener => listeners.push(listener) }),
  sendMessage: message => {
    if (!['SYNC_BATCH', 'SYNC_PROGRESS', 'SYNC_FINISH'].includes(message?.type)) return Promise.reject(new Error('Unsupported collector message.'));
    return ipcRenderer.invoke('savex-social-collector', message);
  }
}) });
globalThis.__savexSocialDispatch = message => new Promise(resolve => {
  for (const listener of listeners) listener(message, { id: 'savex-native' }, resolve);
});
