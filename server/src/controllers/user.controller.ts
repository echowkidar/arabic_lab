import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { AuthRequest } from '../middleware/auth.js';

export async function listUsers(req: AuthRequest, res: Response) {
  try {
    const users = await prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { cabinNumber: 'asc' }],
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        cabinNumber: true,
        isActive: true,
        consentGivenAt: true,
        createdAt: true,
      },
    });
    return res.json({ users });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function resetPassword(req: AuthRequest, res: Response) {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'User ID and minimum 6-character password required' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: { id: true, username: true, name: true },
    });

    return res.json({ success: true, message: `Password reset successfully for ${updated.name}` });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function toggleActive(req: AuthRequest, res: Response) {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
      select: { id: true, username: true, isActive: true },
    });

    return res.json({ success: true, user: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function updateCabin(req: AuthRequest, res: Response) {
  try {
    const { userId, cabinNumber } = req.body;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { cabinNumber: cabinNumber ? Number(cabinNumber) : null },
      select: { id: true, username: true, cabinNumber: true },
    });
    return res.json({ success: true, user: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
