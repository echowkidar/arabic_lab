import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { prisma } from '../prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { LearnerRequest } from './learner.controller.js';
import { emitTo, cabinRoom } from '../realtime.js';

// Stored outside any static route: files are only reachable through the
// signed /api/files/stream endpoint (owner learner or professor).
export const studentRecDir = path.resolve(process.cwd(), process.env.STUDENT_REC_DIR || './uploads/student');
if (!fs.existsSync(studentRecDir)) fs.mkdirSync(studentRecDir, { recursive: true });

export const uploadStudentAudio = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, studentRecDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.webm';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^(audio|video)\//.test(file.mimetype)),
}).single('audio');

const learnerSelect = { id: true, rollNo: true, name: true };

function view(r: any) {
  // Never expose the on-disk path to clients.
  const { filePath, ...rest } = r;
  return rest;
}

function removeFile(p: string) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { console.warn('file delete failed', e); }
}

// ---------- Student (requires X-Learner-Token) ----------

export async function create(req: LearnerRequest, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio received.' });
    const title = String(req.body?.title || '').trim().slice(0, 120) || 'Voice practice';
    const durationSec = Math.max(0, Math.round(Number(req.body?.durationSec) || 0));
    const rec = await prisma.studentRecording.create({
      data: {
        learnerId: req.learnerId!,
        cabinNumber: req.user?.cabinNumber ?? null,
        title,
        filePath: req.file.path,
        mimeType: req.file.mimetype || 'audio/webm',
        durationSec,
        sizeBytes: req.file.size,
      },
      include: { learner: { select: learnerSelect } },
    });
    return res.status(201).json({ recording: view(rec) });
  } catch (error: any) {
    if (req.file) removeFile(req.file.path);
    console.error('student recording create error:', error);
    return res.status(500).json({ error: 'Could not save the recording.' });
  }
}

export async function listMine(req: LearnerRequest, res: Response) {
  try {
    const rows = await prisma.studentRecording.findMany({
      where: { learnerId: req.learnerId! },
      orderBy: { recordedAt: 'desc' },
    });
    return res.json({ recordings: rows.map(view) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function submit(req: LearnerRequest, res: Response) {
  try {
    const rec = await prisma.studentRecording.findUnique({ where: { id: String(req.params.id) }, include: { learner: { select: learnerSelect } } });
    if (!rec || rec.learnerId !== req.learnerId) return res.status(404).json({ error: 'Recording not found.' });
    if (rec.status === 'GRADED') return res.status(409).json({ error: 'Already graded.' });
    const updated = await prisma.studentRecording.update({
      where: { id: rec.id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), cabinNumber: req.user?.cabinNumber ?? rec.cabinNumber },
      include: { learner: { select: learnerSelect } },
    });
    emitTo('professors', 'submission:new', { recording: view(updated) });
    return res.json({ recording: view(updated) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function removeMine(req: LearnerRequest, res: Response) {
  try {
    const rec = await prisma.studentRecording.findUnique({ where: { id: String(req.params.id) } });
    if (!rec || rec.learnerId !== req.learnerId) return res.status(404).json({ error: 'Recording not found.' });
    // Grading locks a file automatically; the professor can unlock it again.
    if (rec.locked) {
      return res.status(403).json({
        error: rec.status === 'GRADED' ? 'Graded recordings are locked by the professor.' : 'This recording is locked by the professor.',
      });
    }
    await prisma.studentRecording.delete({ where: { id: rec.id } });
    removeFile(rec.filePath);
    if (rec.status === 'SUBMITTED') emitTo('professors', 'submission:removed', { id: rec.id });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// ---------- Professor / Admin ----------

export async function listAll(req: AuthRequest, res: Response) {
  try {
    const status = String(req.query.status || '');
    const where: any = {};
    if (status === 'PENDING') where.status = 'SUBMITTED';
    else if (status === 'GRADED') where.status = 'GRADED';
    else if (status === 'ALL') where.status = { in: ['SUBMITTED', 'GRADED'] };
    // DRAFTs are private to the student until they submit.
    else where.status = { in: ['SUBMITTED', 'GRADED'] };
    const rows = await prisma.studentRecording.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { recordedAt: 'desc' }],
      include: { learner: { select: learnerSelect } },
      take: 500,
    });
    return res.json({ recordings: rows.map(view) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

async function notifyStudent(rec: any) {
  if (rec.cabinNumber) emitTo(cabinRoom(rec.cabinNumber), 'recording:updated', { recording: view(rec) });
}

export async function grade(req: AuthRequest, res: Response) {
  try {
    const maxMarks = Math.max(1, Math.min(100, Math.round(Number(req.body?.maxMarks) || 10)));
    const marks = Number(req.body?.marks);
    if (!Number.isFinite(marks) || marks < 0 || marks > maxMarks) {
      return res.status(400).json({ error: `Marks must be between 0 and ${maxMarks}.` });
    }
    const remark = req.body?.remark ? String(req.body.remark).slice(0, 500) : null;
    const rec = await prisma.studentRecording.update({
      where: { id: String(req.params.id) },
      data: {
        marks: Math.round(marks * 10) / 10, maxMarks, remark,
        status: 'GRADED', gradedAt: new Date(), gradedById: req.user!.id,
        locked: true, // graded work is protected from deletion
      },
      include: { learner: { select: learnerSelect } },
    });
    notifyStudent(rec);
    return res.json({ recording: view(rec) });
  } catch (error: any) {
    return res.status(404).json({ error: 'Recording not found' });
  }
}

export async function setLock(req: AuthRequest, res: Response) {
  try {
    const rec = await prisma.studentRecording.update({
      where: { id: String(req.params.id) },
      data: { locked: Boolean(req.body?.locked) },
      include: { learner: { select: learnerSelect } },
    });
    notifyStudent(rec);
    return res.json({ recording: view(rec) });
  } catch {
    return res.status(404).json({ error: 'Recording not found' });
  }
}

export async function removeAny(req: AuthRequest, res: Response) {
  try {
    const rec = await prisma.studentRecording.delete({ where: { id: String(req.params.id) } });
    removeFile(rec.filePath);
    if (rec.cabinNumber) emitTo(cabinRoom(rec.cabinNumber), 'recording:removed', { id: rec.id });
    return res.json({ success: true });
  } catch {
    return res.status(404).json({ error: 'Recording not found' });
  }
}
