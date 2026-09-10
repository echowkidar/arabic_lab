import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';

dotenv.config();

import { setupSocketServer } from './socket.js';
import { authenticateToken, requireRole } from './middleware/auth.js';
import * as authController from './controllers/auth.controller.js';
import * as cabinController from './controllers/cabin.controller.js';
import * as userController from './controllers/user.controller.js';
import * as recordingController from './controllers/recording.controller.js';
import * as auditController from './controllers/audit.controller.js';

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Setup Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 5000,
  pingInterval: 10000,
});

setupSocketServer(io);

// Express Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for recordings
// Static file serving for recordings and downloads
const uploadDir = path.resolve(process.cwd(), process.env.RECORDINGS_DIR || './uploads/recordings');
app.use('/uploads/recordings', express.static(uploadDir));

const downloadsDir = path.resolve(process.cwd(), './downloads');
app.use('/downloads', express.static(downloadsDir));

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', lab: 'Arabic Language Laboratory', timestamp: new Date() });
});

// --- ELECTRON DESKTOP INSTALLER (.exe - Single Standalone Installer) ---
app.get('/api/download/electron-installer', (_req, res) => {
  const candidateDirs = [
    path.resolve(process.cwd(), './downloads'),
    path.resolve('/app/downloads'),
    path.resolve(__dirname, '../../downloads'),
    path.resolve(__dirname, '../downloads')
  ];

  console.log('📥 [Download] Electron installer requested. Scanning directories...');
  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        console.log(`📁 Scanning dir [${dir}], files found:`, files);
        // Look for ArabicLab-Setup.exe or any .exe
        const setupExe = files.find(f => f.toLowerCase() === 'arabiclab-setup.exe') ||
                         files.find(f => f.toLowerCase().endsWith('.exe'));
        if (setupExe) {
          const fullPath = path.join(dir, setupExe);
          console.log(`✅ Serving installer binary: ${fullPath}`);
          return res.download(fullPath, 'ArabicLab-Setup.exe');
        }
      } catch (e) {
        console.warn(`Error reading dir [${dir}]:`, e);
      }
    }
  }

  // Fallback to zip if exe not found
  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      const zipPath = path.join(dir, 'ArabicLab-Windows-Desktop.zip');
      if (fs.existsSync(zipPath)) {
        console.log(`✅ Serving zip fallback: ${zipPath}`);
        return res.download(zipPath, 'ArabicLab-Windows-Desktop.zip');
      }
    }
  }

  console.error('❌ [Download] No installer (.exe or .zip) found in candidate directories!');
  res.status(404).json({ error: 'Installer file is not available on server.' });
});

// --- DESKTOP APP AUTO-UPDATE MANIFEST ---
app.get('/api/app/version', (_req, res) => {
  res.json({
    version: '1.3.0',
    downloadUrl: '/api/download/setup',
    releaseDate: '2026-09-10',
    name: 'Arabic Language Lab Suite',
    mandatory: false,
    features: [
      'Native 1080p HD Screen Surveillance',
      'Zero-Freeze Background Stealth Surveillance',
      'Admin PIN 123456 Protected Exit',
      '25 FPS Real-Time Single View',
      'Silent Tray Persistence on Close',
      'Fullscreen Edge-to-Edge Monitor'
    ]
  });
});

// --- ELECTRON DESKTOP APPLICATION DOWNLOAD (.zip with ArabicLab.exe) ---
app.get('/api/download/electron-desktop', (req, res) => {
  // Delegate directly to the main installer endpoint
  const candidateDirs = [
    path.resolve(process.cwd(), './downloads'),
    path.resolve('/app/downloads'),
    path.resolve(__dirname, '../../downloads'),
    path.resolve(__dirname, '../downloads')
  ];

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        const setupExe = files.find(f => f.toLowerCase() === 'arabiclab-setup.exe') ||
                         files.find(f => f.toLowerCase().endsWith('.exe'));
        if (setupExe) {
          return res.download(path.join(dir, setupExe), 'ArabicLab-Setup.exe');
        }
      } catch (e) {
        // ignore
      }
    }
  }

  res.status(404).json({ error: 'Desktop application package is not available on server.' });
});

// --- CABIN CLIENT DOWNLOAD (No pen drive needed) ---
app.get('/api/download/cabin-setup', (req, res) => {
  let clientUrl = (req.query.clientUrl as string) || '';

  if (!clientUrl) {
    const forwardedHost = req.headers['x-forwarded-host'] as string;
    const hostHeader = forwardedHost || req.get('host') || `${req.hostname}:8080`;
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    clientUrl = `${protocol}://${hostHeader}`;
  }

  // If host has no port, Docker host runs Arabic Lab on port 8080 (port 80 has Nginx Proxy Manager)
  if (!clientUrl.includes(':8080') && !clientUrl.includes(':5173') && !clientUrl.includes(':5000')) {
    clientUrl = clientUrl.replace(/(https?:\/\/[^\/:]+)(\/|$)/, '$1:8080$2');
  }

  const batScript = `@echo off
title AMU Arabic Language Lab - Cabin Workstation Setup
color 0A
echo ===================================================================
echo   ALIGARH MUSLIM UNIVERSITY (AMU) - DEPARTMENT OF ARABIC
echo   ARABIC LANGUAGE LAB CLIENT SETUP (CABIN WORKSTATION)
echo ===================================================================
echo.
echo Connecting Cabin to Lab Server at: ${clientUrl}
echo.

:: 1. Launch in Fullscreen App Mode
start msedge --app="${clientUrl}" --kiosk --start-fullscreen --unsafely-treat-insecure-origin-as-secure="${clientUrl}" 2>nul
if errorlevel 1 (
    start chrome --app="${clientUrl}" --kiosk --start-fullscreen --unsafely-treat-insecure-origin-as-secure="${clientUrl}" 2>nul
)

:: 2. Create Windows Startup Shortcut for Auto-Launch on Boot
set "STARTUP_FOLDER=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\\ArabicLabCabin.bat"

echo Configuring auto-start in Windows Startup...
(
  echo @echo off
  echo start msedge --app="${clientUrl}" --kiosk --start-fullscreen --unsafely-treat-insecure-origin-as-secure="${clientUrl}" 2^^^>nul
  echo if errorlevel 1 start chrome --app="${clientUrl}" --kiosk --start-fullscreen --unsafely-treat-insecure-origin-as-secure="${clientUrl}" 2^^^>nul
) > "%SHORTCUT_PATH%"

echo.
echo [SUCCESS] Cabin Workstation configured successfully!
echo This computer will now automatically open the Arabic Language Lab
echo in Fullscreen Mode whenever Windows boots up.
echo.
timeout /t 5
`;

  res.setHeader('Content-Type', 'application/x-bat');
  res.setHeader('Content-Disposition', 'attachment; filename="Setup-ArabicLab-Cabin.bat"');
  res.send(batScript);
});

// --- AUTH ROUTES ---
app.post('/api/auth/login', authController.login);
app.get('/api/auth/me', authenticateToken, authController.me);
app.post('/api/auth/consent', authenticateToken, authController.giveConsent);
app.post('/api/auth/change-password', authenticateToken, authController.changePassword);

// --- CABIN ROUTES ---
app.get('/api/cabins', authenticateToken, cabinController.listCabins);

// --- USER MANAGEMENT ROUTES (Professor / Admin) ---
app.get('/api/users', authenticateToken, requireRole('PROFESSOR', 'ADMIN'), userController.listUsers);
app.post('/api/users/reset-password', authenticateToken, requireRole('PROFESSOR', 'ADMIN'), userController.resetPassword);
app.patch('/api/users/:userId/toggle-active', authenticateToken, requireRole('PROFESSOR', 'ADMIN'), userController.toggleActive);
app.patch('/api/users/update-cabin', authenticateToken, requireRole('PROFESSOR', 'ADMIN'), userController.updateCabin);

// --- RECORDINGS ROUTES ---
app.post(
  '/api/recordings/upload',
  authenticateToken,
  requireRole('PROFESSOR', 'ADMIN'),
  recordingController.uploadRecordingMiddleware,
  recordingController.uploadRecording
);
app.get('/api/recordings', authenticateToken, requireRole('PROFESSOR', 'ADMIN'), recordingController.listRecordings);
app.delete('/api/recordings/:id', authenticateToken, requireRole('PROFESSOR', 'ADMIN'), recordingController.deleteRecording);

// --- AUDIT LOG ROUTES ---
app.get('/api/audit', authenticateToken, requireRole('PROFESSOR', 'ADMIN'), auditController.listAuditLogs);
app.post('/api/audit/log', authenticateToken, requireRole('PROFESSOR', 'ADMIN'), auditController.createAuditLog);

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`
  ══════════════════════════════════════════════════════════════════
  🏛️  ARABIC LANGUAGE LAB MANAGEMENT SOFTWARE — BACKEND RUNNING
  📡  API & WebRTC Server listening on: 0.0.0.0:${PORT} (LAN & Localhost)
  🔗  Health Endpoint: http://localhost:${PORT}/api/health
  ══════════════════════════════════════════════════════════════════
  `);
});
