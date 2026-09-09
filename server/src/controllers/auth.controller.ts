import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { AuthRequest } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'arabic_lab_super_secret_jwt_key_2026';

export async function login(req: AuthRequest, res: Response) {
  try {
    const { username, password, consent } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'This account has been disabled by the administrator' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Update consent if provided and not yet stored
    let consentGivenAt = user.consentGivenAt;
    if (consent && !consentGivenAt) {
      consentGivenAt = new Date();
      await prisma.user.update({
        where: { id: user.id },
        data: { consentGivenAt },
      });
    }

    // Log session
    await prisma.session.create({
      data: {
        userId: user.id,
        deviceInfo: req.headers['user-agent'] || 'Web Client',
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        cabinNumber: user.cabinNumber,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        cabinNumber: user.cabinNumber,
        hasConsented: Boolean(consentGivenAt),
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function giveConsent(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { consentGivenAt: new Date() },
    });
    return res.json({ success: true, consentGivenAt: user.consentGivenAt });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function me(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
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
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user, hasConsented: Boolean(user.consentGivenAt) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function changePassword(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
