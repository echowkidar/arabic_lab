import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth.js';

// Practice media (audio/video the professor pushes to students for listening drills).
const mediaDir = path.resolve(process.cwd(), process.env.MEDIA_DIR || './uploads/media');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, mediaDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

export const uploadMediaMiddleware = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
}).single('media');

export async function uploadMedia(req: AuthRequest, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No media file uploaded' });
    const url = `/uploads/media/${req.file.filename}`;
    return res.status(201).json({
      success: true,
      url,
      name: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function listMedia(_req: AuthRequest, res: Response) {
  try {
    const files = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : [];
    const media = files
      .filter((f) => !f.startsWith('.'))
      .map((f) => {
        const stat = fs.statSync(path.join(mediaDir, f));
        return {
          url: `/uploads/media/${f}`,
          name: f.replace(/^\d+-/, ''),
          sizeBytes: stat.size,
          createdAt: stat.mtime,
        };
      })
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return res.json({ media });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function deleteMedia(req: AuthRequest, res: Response) {
  try {
    const name = path.basename(String(req.query.file || ''));
    const full = path.join(mediaDir, name);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
