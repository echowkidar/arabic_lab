const { app, BrowserWindow, ipcMain, desktopCapturer, session, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

const APP_VERSION = '1.3.0';

// Command line switches for WebRTC and Screen Capture
app.commandLine.appendSwitch(
  'unsafely-treat-insecure-origin-as-secure',
  'http://10.0.93.68:8080,http://10.0.93.68:5000,http://localhost:8080,http://localhost:5000,http://localhost:5173'
);
app.commandLine.appendSwitch('allow-http-screen-capture');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

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
      backgroundThrottling: false,
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

let pinPromptWindow = null;

function promptAdminPinToExit() {
  if (pinPromptWindow) {
    pinPromptWindow.focus();
    return;
  }

  pinPromptWindow = new BrowserWindow({
    width: 380,
    height: 250,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    center: true,
    title: 'Admin Verification — Arabic Language Lab',
    backgroundColor: '#06110d',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const pinHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Admin Authorization</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      body { background: #06110d; color: #f1f5f9; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 18px; text-align: center; }
      .icon { font-size: 26px; margin-bottom: 6px; color: #10b981; }
      h3 { font-size: 15px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px; }
      p { font-size: 11px; color: #94a3b8; margin-bottom: 14px; }
      input { width: 85%; padding: 8px 12px; font-size: 20px; letter-spacing: 8px; text-align: center; border: 1.5px solid #059669; border-radius: 8px; background: #022c22; color: #fff; outline: none; margin-bottom: 6px; }
      input:focus { border-color: #34d399; box-shadow: 0 0 12px rgba(52, 211, 153, 0.4); }
      .err { color: #f87171; font-size: 11px; font-weight: 600; min-height: 16px; margin-bottom: 12px; }
      .btns { display: flex; gap: 10px; width: 85%; justify-content: center; }
      button { flex: 1; padding: 9px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; transition: 0.2s; }
      .btn-exit { background: #dc2626; color: white; }
      .btn-exit:hover { background: #ef4444; }
      .btn-cancel { background: #1e293b; color: #cbd5e1; }
      .btn-cancel:hover { background: #334155; }
    </style>
  </head>
  <body>
    <div class="icon">🔒</div>
    <h3>Professor / Admin Authorization</h3>
    <p>Enter 6-digit Admin PIN to exit laboratory suite:</p>
    <input type="password" id="pin" maxlength="6" autofocus placeholder="••••••" />
    <div id="err" class="err"></div>
    <div class="btns">
      <button class="btn-cancel" onclick="window.close()">Cancel</button>
      <button class="btn-exit" onclick="checkPin()">Exit Lab</button>
    </div>
    <script>
      const ADMIN_PIN = '123456';
      const input = document.getElementById('pin');
      const err = document.getElementById('err');
      function checkPin() {
        if (input.value === ADMIN_PIN) {
          window.location.href = 'arabiclab://exit-confirmed';
        } else {
          err.innerText = 'Incorrect PIN! Access Denied.';
          input.value = '';
          input.focus();
        }
      }
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') checkPin();
        if (e.key === 'Escape') window.close();
      });
      setTimeout(() => input.focus(), 150);
    </script>
  </body>
  </html>
  `;

  pinPromptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pinHtml)}`);

  pinPromptWindow.webContents.on('will-navigate', (event, url) => {
    if (url.includes('exit-confirmed')) {
      event.preventDefault();
      isQuitting = true;
      if (pinPromptWindow) pinPromptWindow.destroy();
      app.quit();
    }
  });

  pinPromptWindow.on('closed', () => {
    pinPromptWindow = null;
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
        label: 'Exit Lab Suite (Admin PIN Required)',
        click: () => {
          promptAdminPinToExit();
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
    try {
      globalShortcut.register('CommandOrControl+Alt+Shift+Q', () => {
        promptAdminPinToExit();
      });
    } catch (e) {
      console.warn('Global shortcut registration notice:', e);
    }
  });

  app.on('will-quit', () => {
    try {
      globalShortcut.unregisterAll();
    } catch (e) {}
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
