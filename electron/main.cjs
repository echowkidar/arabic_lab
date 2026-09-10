const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');

// Treat plain HTTP LAN IP as a secure context to unlock getDisplayMedia and getUserMedia
app.commandLine.appendSwitch(
  'unsafely-treat-insecure-origin-as-secure',
  'http://10.0.93.68:8080,http://10.0.93.68:5000,http://localhost:8080,http://localhost:5000,http://localhost:5173'
);
app.commandLine.appendSwitch('allow-http-screen-capture');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('ignore-certificate-errors');

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

  // Auto-grant media and screen capture permissions
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  mainWindow.webContents.session.setPermissionCheckHandler(() => true);

  // Handle native getDisplayMedia requests automatically
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      if (sources && sources.length > 0) {
        callback({ video: sources[0] });
      } else {
        callback({});
      }
    }).catch((err) => {
      console.error('Error in setDisplayMediaRequestHandler:', err);
      callback({});
    });
  });

  const isDev = process.env.NODE_ENV === 'development' && !app.isPackaged;
  const defaultServerUrl = process.env.LAB_URL || (isDev ? 'http://localhost:5173' : 'https://arabic.echowkidar.in');

  mainWindow.loadURL(defaultServerUrl).catch(() => {
    console.log('Primary domain not reachable, falling back to LAN IP: http://10.0.93.68:8080');
    mainWindow.loadURL('http://10.0.93.68:8080').catch(() => {
      console.log('Central server not reachable, falling back to local client bundle');
      mainWindow.loadFile(path.join(__dirname, '../client/dist/index.html')).catch(console.error);
    });
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
      const defaultOpts = {
        types: ['screen', 'window'],
        thumbnailSize: { width: 1920, height: 1080 },
        fetchWindowIcons: false,
      };
      const finalOpts = { ...defaultOpts, ...(opts || {}) };
      const sources = await desktopCapturer.getSources(finalOpts);
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
