const { app, BrowserWindow, ipcMain, desktopCapturer, session, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

const APP_VERSION = '1.1.0';

// Command line switches for WebRTC and Screen Capture
app.commandLine.appendSwitch(
  'unsafely-treat-insecure-origin-as-secure',
  'http://10.0.93.68:8080,http://10.0.93.68:5000,http://localhost:8080,http://localhost:5000,http://localhost:5173'
);
app.commandLine.appendSwitch('allow-http-screen-capture');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('ignore-certificate-errors');

let mainWindow = null;
let tray = null;
let isQuitting = false;

app.on('before-quit', () => {
  isQuitting = true;
});

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

  // Silent Background Auto-Update Check
  setTimeout(() => {
    checkForAppUpdates(defaultServerUrl);
  }, 4000);
  setInterval(() => {
    checkForAppUpdates(defaultServerUrl);
  }, 30 * 60 * 1000);

  // Auto-register in Windows Startup on Boot (Restarts)
  if (app.isPackaged || process.env.ENABLE_AUTO_START === 'true') {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: ['--autostart'],
    });
  }

  // Silent screen capture handler for Arabic Lab (Always 1080p Native HD)
  ipcMain.handle('DESKTOP_CAPTURER_GET_SOURCES', async (_event, opts) => {
    try {
      const defaultOpts = {
        types: ['screen', 'window'],
        thumbnailSize: { width: 1920, height: 1080 },
        fetchWindowIcons: false,
      };
      const finalOpts = { ...defaultOpts, ...(opts || {}) };
      // Guarantee at least 1920x1080 resolution
      if (!finalOpts.thumbnailSize || finalOpts.thumbnailSize.width < 1920) {
        finalOpts.thumbnailSize = { width: 1920, height: 1080 };
      }
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

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  if (tray) return;
  try {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAcSURBVDhPY/wPBAwUACYGhgYGBupgYBgGQAcDAABqEAE9zXh9/wAAAABJRU5ErkJggg==';
    const icon = nativeImage.createFromDataURL('data:image/png;base64,' + pngBase64);
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Arabic Language Lab',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: 'Exit Lab Suite',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setToolTip('Arabic Language Lab (Cabin Surveillance Active)');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    console.warn('Tray init notice:', e);
  }
}

// Silent Background Auto-Updater Engine
function checkForAppUpdates(serverBaseUrl) {
  try {
    if (!serverBaseUrl) return;
    const versionUrl = `${serverBaseUrl}/api/app/version`;
    const client = versionUrl.startsWith('https') ? https : http;

    client.get(versionUrl, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) return;
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          if (info.version && info.version !== APP_VERSION) {
            console.log(`🚀 New ArabicLab version detected on server: ${info.version} (current: ${APP_VERSION})`);
            downloadAndApplyUpdate(serverBaseUrl, info.downloadUrl || '/api/download/setup');
          }
        } catch (e) {
          // ignore parse error
        }
      });
    }).on('error', () => {
      // offline or unreachable, silent skip
    });
  } catch (e) {
    // silent skip
  }
}

function downloadAndApplyUpdate(serverBaseUrl, downloadPath) {
  try {
    const fullUrl = downloadPath.startsWith('http') ? downloadPath : `${serverBaseUrl}${downloadPath}`;
    const tempExe = path.join(app.getPath('temp'), `ArabicLab-Setup-Update-${Date.now()}.exe`);
    const file = fs.createWriteStream(tempExe);
    const client = fullUrl.startsWith('https') ? https : http;

    client.get(fullUrl, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        if (res.headers.location) {
          downloadAndApplyUpdate('', res.headers.location);
        }
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(tempExe, () => {});
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          console.log('✅ ArabicLab update downloaded. Launching silent background installer...');
          const child = spawn(tempExe, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS'], {
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
          isQuitting = true;
          app.quit();
        });
      });
    }).on('error', (err) => {
      console.warn('Update download error:', err);
      file.close();
      fs.unlink(tempExe, () => {});
    });
  } catch (e) {
    console.warn('Apply update error:', e);
  }
}

// Enforce Single Instance: Only 1 ArabicLab instance can run on the computer
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  // Second instance attempt: quit immediately so duplicate processes never stay alive!
  app.quit();
} else {
  app.on('second-instance', () => {
    // If another instance is launched, focus the existing window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
  });

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
}
