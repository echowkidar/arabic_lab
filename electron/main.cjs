const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: 'مختبر اللغة العربية — Arabic Language Lab Suite',
    backgroundColor: '#06110d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  const isDev = process.env.NODE_ENV === 'development' && !app.isPackaged;
  const defaultServerUrl = process.env.LAB_URL || (isDev ? 'http://localhost:5173' : 'http://10.0.93.68:8080');

  mainWindow.loadURL(defaultServerUrl).catch(() => {
    console.log('Central server not reachable, falling back to local client bundle');
    mainWindow.loadFile(path.join(__dirname, '../client/dist/index.html')).catch(console.error);
  });

  // Auto-register in Windows Startup on Boot (Restarts)
  if (app.isPackaged || process.env.ENABLE_AUTO_START === 'true') {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: ['--autostart'],
    });
  }

  // Silent screen capture handler for Arabic Lab
  ipcMain.handle('DESKTOP_CAPTURER_GET_SOURCES', async (_event, opts) => {
    try {
      const sources = await desktopCapturer.getSources(opts || { types: ['screen', 'window'] });
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : null,
      }));
    } catch (e) {
      console.error('Failed to get desktop sources:', e);
      return [];
    }
  });

  // Check & Toggle Windows Auto-Start
  ipcMain.handle('GET_AUTO_START', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('SET_AUTO_START', (_event, enable) => {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enable),
      path: process.execPath,
    });
    return app.getLoginItemSettings().openAtLogin;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
