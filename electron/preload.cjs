const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDesktopSources: (opts) => ipcRenderer.invoke('DESKTOP_CAPTURER_GET_SOURCES', opts),
  isElectron: true,
});
