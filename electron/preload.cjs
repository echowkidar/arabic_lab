const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDesktopSources: (opts) => ipcRenderer.invoke('DESKTOP_CAPTURER_GET_SOURCES', opts),
  getAutoStart: () => ipcRenderer.invoke('GET_AUTO_START'),
  setAutoStart: (enable) => ipcRenderer.invoke('SET_AUTO_START', enable),
  isElectron: true,
});
