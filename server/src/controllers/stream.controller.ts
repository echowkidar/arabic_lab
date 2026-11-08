import { Response } from 'express';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { isSharedWithCabin } from './media.controller.js';

const JWT_SECRET = process.env.JWT_SECRET || 'arabic_lab_super_secret_jwt_key_2026';

// <audio>/<video> elements can't send an Authorization header, so after a
// normal authenticated permission check we hand out a short-lived signed URL.
type FileType = 'student' | 'media';

function isStaff(role?: string) {
  return role === 'PROFESSOR' || role === 'ADMIN';
}

function learnerIdFromHeader(req: AuthRequest): string | null {
  const token = String(req.headers['x-learner-token'] || '');
  if (!token) return null;
  try {
    const d = jwt.verify(token, JWT_SECRET) as any;
    return d?.kind === 'learner' ? String(d.learnerId) : null;
  } catch {
    return null;
  }
}

export async function signFile(req: AuthRequest, res: Response) {
  try {
    const type = String(req.query.type) as FileType;
    const id = String(req.query.id || '');
    if (!id || (type !== 'student' && type !== 'media')) return res.status(400).json({ error: 'Bad request' });

    if (type === 'student') {
      const rec = await prisma.studentRecording.findUnique({ where: { id }, select: { learnerId: true } });
      if (!rec) return res.status(404).json({ error: 'Not found' });
      if (!isStaff(req.user?.role) && learnerIdFromHeader(req) !== rec.learnerId) {
        return res.status(403).json({ error: 'PIN_REQUIRED', message: 'Only the owner (with PIN) or the professor can play this.' });
      }
    } else {
      const item = await prisma.mediaItem.findUnique({ where: { id }, select: { id: true } });
      if (!item) return res.status(404).json({ error: 'Not found' });
      if (!isStaff(req.user?.role) && !(await isSharedWithCabin(id, Number(req.user?.cabinNumber || 0)))) {
        return res.status(403).json({ error: 'This file is not shared with your cabin.' });
      }
    }

    const t = jwt.sign({ kind: 'file', type, id }, JWT_SECRET, { expiresIn: '2h' });
    return res.json({ url: `/api/files/stream/${type}/${encodeURIComponent(id)}?t=${encodeURIComponent(t)}` });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function streamFile(req: AuthRequest, res: Response) {
  try {
    const type = String(req.params.type) as FileType;
    const id = String(req.params.id);
    let decoded: any;
    try {
      decoded = jwt.verify(String(req.query.t || ''), JWT_SECRET);
    } catch {
      return res.status(403).json({ error: 'Link expired' });
    }
    if (decoded?.kind !== 'file' || decoded.type !== type || decoded.id !== id) {
      return res.status(403).json({ error: 'Invalid link' });
    }

    const row = type === 'student'
      ? await prisma.studentRecording.findUnique({ where: { id }, select: { filePath: true, mimeType: true } })
      : await prisma.mediaItem.findUnique({ where: { id }, select: { filePath: true, mimeType: true } });
    if (!row || !fs.existsSync(row.filePath)) return res.status(404).json({ error: 'File missing' });

    res.setHeader('Cache-Control', 'private, max-age=600');
    res.type(row.mimeType);
    // sendFile handles HTTP Range requests, so seeking works in the players.
    return res.sendFile(row.filePath);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
