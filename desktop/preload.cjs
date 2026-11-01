const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('saveXDesktop', Object.freeze({
  connect: type => ipcRenderer.invoke('savex-desktop', { action: 'connect', type }),
  helperInfo: () => ipcRenderer.invoke('savex-desktop', { action: 'helperInfo' }),
  showHelper: () => ipcRenderer.invoke('savex-desktop', { action: 'showHelper' }),
  copyHelperPath: () => ipcRenderer.invoke('savex-desktop', { action: 'copyHelperPath' }),
  openExtensions: () => ipcRenderer.invoke('savex-desktop', { action: 'openExtensions' }),
  updateStatus: () => ipcRenderer.invoke('savex-desktop', { action: 'updateStatus' }),
  checkForUpdates: () => ipcRenderer.invoke('savex-desktop', { action: 'checkForUpdates' }),
  installUpdate: () => ipcRenderer.invoke('savex-desktop', { action: 'installUpdate' })
}));
