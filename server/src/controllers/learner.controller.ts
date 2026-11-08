import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { AuthRequest } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'arabic_lab_super_secret_jwt_key_2026';
const LEARNER_TOKEN_TTL = '30m';
const MAX_FAILED = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export interface LearnerRequest extends AuthRequest {
  learnerId?: string;
}

const PIN_RE = /^\d{4,6}$/;

function normalizeRoll(rollNo: unknown): string {
  return String(rollNo || '').trim().toUpperCase();
}

function issueLearnerToken(learnerId: string) {
  return jwt.sign({ learnerId, kind: 'learner' }, JWT_SECRET, { expiresIn: LEARNER_TOKEN_TTL });
}

function publicLearner(l: { id: string; rollNo: string; name: string }) {
  return { id: l.id, rollNo: l.rollNo, name: l.name };
}

// Student-side: verify the X-Learner-Token header (issued after Roll No + PIN).
// The learner id always comes from this token, never from the request body.
export function requireLearner(req: LearnerRequest, res: Response, next: NextFunction) {
  const token = String(req.headers['x-learner-token'] || '');
  if (!token) return res.status(401).json({ error: 'PIN_REQUIRED', message: 'Enter your Roll No and PIN first.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded?.kind !== 'learner' || !decoded.learnerId) throw new Error('bad token');
    req.learnerId = decoded.learnerId;
    next();
  } catch {
    return res.status(401).json({ error: 'PIN_EXPIRED', message: 'Session expired. Please enter your PIN again.' });
  }
}

export async function register(req: AuthRequest, res: Response) {
  try {
    const rollNo = normalizeRoll(req.body?.rollNo);
    const name = String(req.body?.name || '').trim();
    const pin = String(req.body?.pin || '');
    if (!rollNo || rollNo.length > 30) return res.status(400).json({ error: 'Please enter a valid Roll No.' });
    if (!name || name.length > 80) return res.status(400).json({ error: 'Please enter your name.' });
    if (!PIN_RE.test(pin)) return res.status(400).json({ error: 'PIN must be 4 to 6 digits.' });

    const existing = await prisma.learner.findUnique({ where: { rollNo } });
    if (existing) {
      return res.status(409).json({ error: 'This Roll No is already registered. Use "I already have a PIN" to unlock, or ask the professor to reset your PIN.' });
    }
    const learner = await prisma.learner.create({
      data: { rollNo, name, pinHash: await bcrypt.hash(pin, 10) },
    });
    return res.status(201).json({ learner: publicLearner(learner), learnerToken: issueLearnerToken(learner.id) });
  } catch (error: any) {
    console.error('learner register error:', error);
    return res.status(500).json({ error: 'Could not register. Please try again.' });
  }
}

export async function unlock(req: AuthRequest, res: Response) {
  try {
    const rollNo = normalizeRoll(req.body?.rollNo);
    const pin = String(req.body?.pin || '');
    const learner = await prisma.learner.findUnique({ where: { rollNo } });
    if (!learner) return res.status(404).json({ error: 'Roll No not found. Register first.' });

    if (learner.lockedUntil && learner.lockedUntil > new Date()) {
      const mins = Math.ceil((learner.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(423).json({ error: `Too many wrong PINs. Try again in ${mins} minute(s) or ask the professor.` });
    }

    const ok = await bcrypt.compare(pin, learner.pinHash);
    if (!ok) {
      const failed = learner.failedAttempts + 1;
      await prisma.learner.update({
        where: { id: learner.id },
        data: failed >= MAX_FAILED
          ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) }
          : { failedAttempts: failed },
      });
      const left = MAX_FAILED - failed;
      return res.status(401).json({
        error: left > 0 ? `Wrong PIN. ${left} attempt(s) left.` : 'Too many wrong PINs. Locked for 5 minutes.',
      });
    }

    if (learner.failedAttempts || learner.lockedUntil) {
      await prisma.learner.update({ where: { id: learner.id }, data: { failedAttempts: 0, lockedUntil: null } });
    }
    return res.json({ learner: publicLearner(learner), learnerToken: issueLearnerToken(learner.id) });
  } catch (error: any) {
    console.error('learner unlock error:', error);
    return res.status(500).json({ error: 'Could not unlock. Please try again.' });
  }
}

// Professor / Admin
export async function listLearners(_req: AuthRequest, res: Response) {
  try {
    const learners = await prisma.learner.findMany({
      orderBy: { rollNo: 'asc' },
      select: {
        id: true, rollNo: true, name: true, createdAt: true, lockedUntil: true,
        _count: { select: { recordings: true } },
      },
    });
    return res.json({ learners });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function resetPin(req: AuthRequest, res: Response) {
  try {
    const pin = String(req.body?.pin || '');
    if (!PIN_RE.test(pin)) return res.status(400).json({ error: 'PIN must be 4 to 6 digits.' });
    await prisma.learner.update({
      where: { id: String(req.params.id) },
      data: { pinHash: await bcrypt.hash(pin, 10), failedAttempts: 0, lockedUntil: null },
    });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(404).json({ error: 'Student not found' });
  }
}
