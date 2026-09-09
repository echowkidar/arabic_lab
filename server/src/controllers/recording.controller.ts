import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { prisma } from '../prisma.js';
import { AuthRequest } from '../middleware/auth.js';

const uploadDir = path.resolve(process.cwd(), process.env.RECORDINGS_DIR || './uploads/recordings');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

export const uploadRecordingMiddleware = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
}).single('video');

export async function uploadRecording(req: AuthRequest, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No recording video file uploaded' });
    }

    const { title, durationSec, studentId, cabinNumber } = req.body;
    const recordedBy = req.user?.id;

    if (!recordedBy) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Resolve studentId from cabinNumber if not direct UUID
    let resolvedStudentId = studentId;
    if (!resolvedStudentId && cabinNumber) {
      const student = await prisma.user.findFirst({
        where: { cabinNumber: Number(cabinNumber) },
      });
      if (student) resolvedStudentId = student.id;
    }

    const recordingTitle =
      title ||
      `Lab Session Recording - ${cabinNumber ? `Cabin ${cabinNumber}` : 'General'} - ${new Date().toLocaleDateString()}`;

    const recording = await prisma.recording.create({
      data: {
        title: recordingTitle,
        studentId: resolvedStudentId || null,
        recordedBy,
        filePath: `/uploads/recordings/${req.file.filename}`,
        durationSec: durationSec ? Number(durationSec) : 0,
        sizeBytes: req.file.size,
        mimeType: req.file.mimetype || 'video/webm',
      },
      include: {
        student: { select: { id: true, name: true, cabinNumber: true } },
        professor: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json({ success: true, recording });
  } catch (error: any) {
    console.error('uploadRecording error:', error);
    return res.status(500).json({ error: error.message });
  }
}

export async function listRecordings(req: AuthRequest, res: Response) {
  try {
    const recordings = await prisma.recording.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { id: true, name: true, cabinNumber: true, username: true } },
        professor: { select: { id: true, name: true } },
      },
    });
    return res.json({ recordings });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function deleteRecording(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const recording = await prisma.recording.findUnique({ where: { id } });
    if (!recording) return res.status(404).json({ error: 'Recording not found' });

    // Remove local file if exists
    const fullPath = path.resolve(process.cwd(), `.${recording.filePath}`);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (e) {
        console.warn('Failed to delete file from disk:', e);
      }
    }

    await prisma.recording.delete({ where: { id } });
    return res.json({ success: true, message: 'Recording deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
