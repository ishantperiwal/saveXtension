const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('saveXDesktop', Object.freeze({
  connect: type => ipcRenderer.invoke('savex-desktop', { action: 'connect', type }),
  socialAccounts: () => ipcRenderer.invoke('savex-desktop', { action: 'socialAccounts' }),
  connectSocial: options => ipcRenderer.invoke('savex-desktop', { action: 'connectSocial', options }),
  disconnectSocial: id => ipcRenderer.invoke('savex-desktop', { action: 'disconnectSocial', id }),
  wakeSocial: () => ipcRenderer.invoke('savex-desktop', { action: 'wakeSocial' }),
  returnAfterUnsave: id => ipcRenderer.invoke('savex-desktop', { action: 'returnAfterUnsave', id }),
  helperInfo: () => ipcRenderer.invoke('savex-desktop', { action: 'helperInfo' }),
  showHelper: () => ipcRenderer.invoke('savex-desktop', { action: 'showHelper' }),
  copyHelperPath: () => ipcRenderer.invoke('savex-desktop', { action: 'copyHelperPath' }),
  copyText: text => ipcRenderer.invoke('savex-desktop', { action: 'copyText', text }),
  openExtensions: () => ipcRenderer.invoke('savex-desktop', { action: 'openExtensions' }),
  chromeBookmarksFound: () => ipcRenderer.invoke('savex-desktop', { action: 'chromeBookmarksFound' }),
  saveHelper: () => ipcRenderer.invoke('savex-desktop', { action: 'saveHelper' }),
  updateStatus: () => ipcRenderer.invoke('savex-desktop', { action: 'updateStatus' }),
  checkForUpdates: () => ipcRenderer.invoke('savex-desktop', { action: 'checkForUpdates' }),
  viewUpdateRelease: () => ipcRenderer.invoke('savex-desktop', { action: 'viewUpdateRelease' }),
  installUpdate: () => ipcRenderer.invoke('savex-desktop', { action: 'installUpdate' })
}));
