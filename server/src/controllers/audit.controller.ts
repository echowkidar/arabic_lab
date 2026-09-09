import { Response } from 'express';
import { prisma } from '../prisma.js';
import { AuthRequest } from '../middleware/auth.js';

export async function listAuditLogs(req: AuthRequest, res: Response) {
  try {
    const logs = await prisma.monitoringLog.findMany({
      take: 100,
      orderBy: { startedAt: 'desc' },
      include: {
        professor: { select: { id: true, name: true, username: true } },
        student: { select: { id: true, name: true, username: true, cabinNumber: true } },
      },
    });
    return res.json({ logs });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function createAuditLog(req: AuthRequest, res: Response) {
  try {
    const { studentId, cabinNumber, action } = req.body;
    const professorId = req.user?.id;

    if (!professorId) return res.status(401).json({ error: 'Unauthorized' });

    let resolvedStudentId = studentId;
    if (!resolvedStudentId && cabinNumber) {
      const student = await prisma.user.findFirst({
        where: { cabinNumber: Number(cabinNumber) },
      });
      if (student) resolvedStudentId = student.id;
    }

    if (!resolvedStudentId) {
      return res.status(400).json({ error: 'Valid student ID or cabin number required' });
    }

    const log = await prisma.monitoringLog.create({
      data: {
        professorId,
        studentId: resolvedStudentId,
        action: action || 'SCREEN_VIEW',
        startedAt: new Date(),
      },
      include: {
        professor: { select: { name: true } },
        student: { select: { name: true, cabinNumber: true } },
      },
    });

    return res.status(201).json({ success: true, log });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
