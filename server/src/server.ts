import express from 'express';
import http from 'http';
import path from 'path';
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
});

setupSocketServer(io);

// Express Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for recordings
const uploadDir = path.resolve(process.cwd(), process.env.RECORDINGS_DIR || './uploads/recordings');
app.use('/uploads/recordings', express.static(uploadDir));

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', lab: 'Arabic Language Laboratory', timestamp: new Date() });
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

server.listen(PORT, () => {
  console.log(`
  ══════════════════════════════════════════════════════════════════
  🏛️  ARABIC LANGUAGE LAB MANAGEMENT SOFTWARE — BACKEND RUNNING
  📡  API & WebRTC Server listening on port: ${PORT}
  🔗  Health Endpoint: http://localhost:${PORT}/api/health
  ══════════════════════════════════════════════════════════════════
  `);
});
