import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { prisma } from '../prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { emitTo, cabinRoom } from '../realtime.js';

// Class material (audio/video) the professor uploads or records.
// Served only through the signed /api/files/stream endpoint.
export const mediaDir = path.resolve(process.cwd(), process.env.MEDIA_DIR || './uploads/media');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

export const uploadMediaMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mediaDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      cb(null, `${Date.now()}-${safe || 'media.webm'}`);
    },
  }),
  limits: { fileSize: 240 * 1024 * 1024 }, // nginx allows 250m
  fileFilter: (_req, file, cb) => cb(null, /^(audio|video)\//.test(file.mimetype)),
}).single('media');

function view(m: any) {
  const { filePath, ...rest } = m;
  return rest;
}

function parseCabins(s: string): number[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(Number).filter((n) => n >= 1 && n <= 25) : [];
  } catch {
    return [];
  }
}

function shareRooms(share: { targetType: string; cabins: string }): string[] {
  return share.targetType === 'ALL' ? ['students'] : parseCabins(share.cabins).map(cabinRoom);
}

export async function uploadMedia(req: AuthRequest, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Only audio or video files are allowed.' });
    const title = String(req.body?.title || '').trim().slice(0, 120)
      || req.file.originalname.replace(/\.[^.]+$/, '') || 'Untitled';
    const item = await prisma.mediaItem.create({
      data: {
        title,
        filePath: req.file.path,
        mimeType: req.file.mimetype,
        kind: req.file.mimetype.startsWith('video/') ? 'VIDEO' : 'AUDIO',
        source: req.body?.source === 'PROF_RECORDING' ? 'PROF_RECORDING' : 'UPLOAD',
        durationSec: Math.max(0, Math.round(Number(req.body?.durationSec) || 0)),
        sizeBytes: req.file.size,
        createdById: req.user!.id,
      },
    });
    return res.status(201).json({ media: view(item) });
  } catch (error: any) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* noop */ } }
    return res.status(500).json({ error: error.message });
  }
}

export async function listMedia(_req: AuthRequest, res: Response) {
  try {
    const items = await prisma.mediaItem.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { shares: { where: { active: true } } } } },
    });
    return res.json({ media: items.map(view) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function renameMedia(req: AuthRequest, res: Response) {
  try {
    const title = String(req.body?.title || '').trim().slice(0, 120);
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    const item = await prisma.mediaItem.update({ where: { id: String(req.params.id) }, data: { title } });
    return res.json({ media: view(item) });
  } catch {
    return res.status(404).json({ error: 'Not found' });
  }
}

export async function deleteMedia(req: AuthRequest, res: Response) {
  try {
    const item = await prisma.mediaItem.findUnique({ where: { id: String(req.params.id) }, include: { shares: true } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    await prisma.mediaItem.delete({ where: { id: item.id } }); // cascades shares
    try { if (fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath); } catch { /* noop */ }
    const rooms = new Set<string>();
    item.shares.filter((s) => s.active).forEach((s) => shareRooms(s).forEach((r) => rooms.add(r)));
    if (rooms.size) emitTo([...rooms], 'media:shares-updated', {});
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function shareMedia(req: AuthRequest, res: Response) {
  try {
    const mediaIds: string[] = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.map(String) : [];
    const targetType = req.body?.targetType === 'CABINS' ? 'CABINS' : 'ALL';
    const cabins = targetType === 'CABINS'
      ? [...new Set((Array.isArray(req.body?.cabins) ? req.body.cabins : []).map(Number).filter((n: number) => n >= 1 && n <= 25))]
      : [];
    const mode = req.body?.mode === 'synced' ? 'synced' : 'student';
    if (!mediaIds.length) return res.status(400).json({ error: 'Select at least one file.' });
    if (targetType === 'CABINS' && !cabins.length) return res.status(400).json({ error: 'Select at least one cabin.' });

    const existing = await prisma.mediaItem.findMany({ where: { id: { in: mediaIds } }, select: { id: true } });
    const created = await prisma.$transaction(existing.map((m) => prisma.mediaShare.create({
      data: { mediaId: m.id, targetType, cabins: JSON.stringify(cabins), mode, createdById: req.user!.id },
    })));
    const rooms = targetType === 'ALL' ? ['students'] : cabins.map((n) => cabinRoom(n as number));
    emitTo(rooms, 'media:shares-updated', { added: created.length });
    return res.status(201).json({ shares: created });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function listShares(_req: AuthRequest, res: Response) {
  try {
    const shares = await prisma.mediaShare.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      include: { media: true },
    });
    return res.json({
      shares: shares.map((s) => ({ ...s, cabins: parseCabins(s.cabins), media: view(s.media) })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function revokeShare(req: AuthRequest, res: Response) {
  try {
    const share = await prisma.mediaShare.update({ where: { id: String(req.params.id) }, data: { active: false } });
    emitTo(shareRooms(share), 'media:shares-updated', {});
    return res.json({ success: true });
  } catch {
    return res.status(404).json({ error: 'Not found' });
  }
}

// Student: everything currently shared with this cabin (persists across logins).
export async function mySharedMedia(req: AuthRequest, res: Response) {
  try {
    const cabin = Number(req.user?.cabinNumber || 0);
    const shares = await prisma.mediaShare.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      include: { media: true },
    });
    const seen = new Set<string>();
    const items = shares
      .filter((s) => s.targetType === 'ALL' || parseCabins(s.cabins).includes(cabin))
      .filter((s) => (seen.has(s.mediaId) ? false : (seen.add(s.mediaId), true)))
      .map((s) => ({ shareId: s.id, mode: s.mode, sharedAt: s.createdAt, media: view(s.media) }));
    return res.json({ items });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// Used by the stream controller to decide if a student may play an item.
export async function isSharedWithCabin(mediaId: string, cabin: number): Promise<boolean> {
  const shares = await prisma.mediaShare.findMany({ where: { mediaId, active: true } });
  return shares.some((s) => s.targetType === 'ALL' || parseCabins(s.cabins).includes(cabin));
}
