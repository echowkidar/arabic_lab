import { Response } from 'express';
import { prisma } from '../prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { getConnectedCabinsState } from '../socket.js';

export async function listCabins(req: AuthRequest, res: Response) {
  try {
    const students = await prisma.user.findMany({
      where: { role: 'STUDENT', cabinNumber: { not: null } },
      orderBy: { cabinNumber: 'asc' },
      select: {
        id: true,
        name: true,
        username: true,
        cabinNumber: true,
        isActive: true,
        consentGivenAt: true,
      },
    });

    const liveStates = getConnectedCabinsState();

    // Map 25 cabins
    const cabins = [];
    for (let i = 1; i <= 25; i++) {
      const student = students.find((s) => s.cabinNumber === i);
      const live = liveStates[i] || {
        online: false,
        socketId: null,
        audioLevel: 0,
        inCall: false,
        handRaised: false,
        isScreenShared: false,
        isWebcamActive: false,
        lastActive: null,
      };

      cabins.push({
        cabinNumber: i,
        student: student || null,
        status: !student?.isActive
          ? 'DISABLED'
          : live.online
          ? live.inCall
            ? 'IN_CALL'
            : 'ONLINE'
          : 'OFFLINE',
        online: live.online,
        socketId: live.socketId,
        audioLevel: live.audioLevel,
        inCall: live.inCall,
        handRaised: live.handRaised,
        isScreenShared: live.isScreenShared,
        isWebcamActive: live.isWebcamActive,
      });
    }

    return res.json({ cabins });
  } catch (error: any) {
    console.error('listCabins error:', error);
    return res.status(500).json({ error: error.message });
  }
}
