import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'arabic_lab_super_secret_jwt_key_2026';

export interface CabinLiveState {
  online: boolean;
  socketId: string | null;
  userId: string | null;
  studentName: string | null;
  cabinNumber: number;
  audioLevel: number; // 0..100
  inCall: boolean;
  handRaised: boolean;
  isScreenShared: boolean;
  isWebcamActive: boolean;
  screenData?: string | null; // lightweight JPEG thumbnail for the grid overview
  lastActive: Date | null;
}

interface SocketUser {
  id: string;
  role: 'ADMIN' | 'PROFESSOR' | 'STUDENT' | string;
  cabinNumber?: number | null;
  name: string;
}

const cabinStates: Record<number, CabinLiveState> = {};
for (let i = 1; i <= 25; i++) {
  cabinStates[i] = {
    online: false, socketId: null, userId: null, studentName: null,
    cabinNumber: i, audioLevel: 0, inCall: false, handRaised: false,
    isScreenShared: false, isWebcamActive: false, screenData: null, lastActive: null,
  };
}

const socketSessionMap = new Map<string, SocketUser>();
const activeBroadcasts = new Map<string, { type: 'ALL' | 'SELECTED'; selectedCabins: number[] }>();

export function getConnectedCabinsState() {
  return cabinStates;
}

function cabinOwnedBy(socket: Socket): number | null {
  const u = socketSessionMap.get(socket.id);
  if (u && u.role === 'STUDENT' && u.cabinNumber) return Number(u.cabinNumber);
  return null;
}

export function setupSocketServer(io: SocketIOServer) {
  console.log('⚡ WebRTC & Classroom Signaling Engine initialized');

  // ---- AUTH: verify JWT on every socket handshake ----
  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth && (socket.handshake.auth as any).token) ||
        (socket.handshake.query && (socket.handshake.query as any).token);
      if (!token) return next(new Error('AUTH_REQUIRED'));
      const decoded = jwt.verify(String(token), JWT_SECRET) as any;
      (socket.data as any).auth = {
        id: decoded.id,
        role: decoded.role,
        cabinNumber: decoded.cabinNumber ?? null,
      };
      next();
    } catch {
      next(new Error('AUTH_INVALID'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const auth = (socket.data as any).auth as { id: string; role: string; cabinNumber?: number | null };
    console.log(`🔌 Client connected: ${socket.id} (${auth?.role})`);

    // Register session using the TRUSTED token identity (role/cabin from JWT).
    socket.on('register-session', (data: { name?: string }) => {
      const role = auth.role;
      const cabinNumber = auth.cabinNumber ?? null;
      const name = (data && data.name) || 'User';
      socketSessionMap.set(socket.id, { id: auth.id, role, cabinNumber, name });

      if (role === 'PROFESSOR' || role === 'ADMIN') {
        socket.join('professors');
        socket.emit('cabin-snapshot', cabinStates);
      }

      if (role === 'STUDENT') {
        socket.join('students');
        const cabNum = cabinNumber ? Number(cabinNumber) : undefined;
        if (cabNum && cabNum >= 1 && cabNum <= 25) {
          socket.join(`cabin-${cabNum}`);
          cabinStates[cabNum] = {
            ...cabinStates[cabNum],
            online: true, socketId: socket.id, userId: auth.id,
            studentName: name, lastActive: new Date(),
          };
          io.to('professors').emit('cabin-updated', cabinStates[cabNum]);
          console.log(`💻 Cabin ${cabNum} (${name}) online`);
        }
      }
    });

    // ---- Grid thumbnail (lightweight JPEG, ~1 fps). Ownership enforced. ----
    socket.on('cabin-screen-frame', (data: { screenData: string }) => {
      const cab = cabinOwnedBy(socket);
      if (!cab) return;
      const wasOffline = !cabinStates[cab].online;
      cabinStates[cab].screenData = data.screenData;
      cabinStates[cab].isScreenShared = true;
      cabinStates[cab].online = true;
      cabinStates[cab].socketId = socket.id;
      if (wasOffline) io.to('professors').emit('cabin-updated', cabinStates[cab]);
      io.to('professors').emit('cabin-screen-update', { cabinNumber: cab, screenData: data.screenData });
    });

    socket.on('audio-level-update', (data: { level: number }) => {
      const cab = cabinOwnedBy(socket);
      if (!cab) return;
      cabinStates[cab].audioLevel = Math.min(100, Math.max(0, data.level));
      cabinStates[cab].online = true;
      cabinStates[cab].socketId = socket.id;
      io.to('professors').emit('cabin-audio-level', { cabinNumber: cab, level: cabinStates[cab].audioLevel });
    });

    socket.on('webcam-active', (data: { active: boolean }) => {
      const cab = cabinOwnedBy(socket);
      if (!cab) return;
      cabinStates[cab].isWebcamActive = Boolean(data.active);
      io.to('professors').emit('cabin-updated', cabinStates[cab]);
    });

    // ---- Hand raise ----
    socket.on('raise-hand', (data: { studentName?: string }) => {
      const cab = cabinOwnedBy(socket);
      if (!cab) return;
      cabinStates[cab].handRaised = true;
      io.to('professors').emit('hand-raised', {
        cabinNumber: cab,
        studentName: data?.studentName || cabinStates[cab].studentName || `Cabin ${cab}`,
        timestamp: new Date().toISOString(),
      });
      io.to('professors').emit('cabin-updated', cabinStates[cab]);
    });

    socket.on('lower-hand', () => {
      const cab = cabinOwnedBy(socket);
      if (!cab) return;
      cabinStates[cab].handRaised = false;
      io.to('professors').emit('cabin-updated', cabinStates[cab]);
      io.to('professors').emit('hand-lowered', { cabinNumber: cab });
    });

    // ---- Generic WebRTC signaling relay (offer/answer/ICE) ----
    socket.on('rtc:signal', (data: {
      toSocketId: string;
      sessionId: string;
      purpose: 'call' | 'monitor' | 'broadcast';
      description?: any;
      candidate?: any;
    }) => {
      if (!data?.toSocketId) return;
      io.to(data.toSocketId).emit('rtc:signal', {
        fromSocketId: socket.id,
        sessionId: data.sessionId,
        purpose: data.purpose,
        description: data.description,
        candidate: data.candidate,
      });
    });

    // ---- Silent monitoring (professor subscribes to a cabin's live A/V) ----
    socket.on('monitor:request', (data: { cabinNumber: number; sessionId: string }) => {
      if (auth.role !== 'PROFESSOR' && auth.role !== 'ADMIN') return;
      const cab = cabinStates[Number(data.cabinNumber)];
      if (cab?.online && cab.socketId) {
        io.to(cab.socketId).emit('monitor:start', {
          professorSocketId: socket.id,
          sessionId: data.sessionId,
          cabinNumber: Number(data.cabinNumber),
        });
      }
    });

    socket.on('monitor:stop', (data: { cabinNumber: number; sessionId: string }) => {
      const cab = cabinStates[Number(data.cabinNumber)];
      if (cab?.socketId) {
        io.to(cab.socketId).emit('monitor:stop', {
          professorSocketId: socket.id,
          sessionId: data.sessionId,
        });
      }
    });

    // ---- Classroom broadcast (professor -> all / selected cabins) ----
    socket.on('broadcast:start', (data: {
      type: 'ALL' | 'SELECTED';
      selectedCabins?: number[];
      options: { hasScreen: boolean; hasWebcam: boolean; hasAudio: boolean };
      title: string;
    }) => {
      if (auth.role !== 'PROFESSOR' && auth.role !== 'ADMIN') return;
      const selected = data.selectedCabins || [];
      activeBroadcasts.set(socket.id, { type: data.type, selectedCabins: selected });

      const targetNums =
        data.type === 'SELECTED' && selected.length > 0
          ? selected
          : Object.values(cabinStates).filter((c) => c.online).map((c) => c.cabinNumber);

      const targets = targetNums
        .map((n) => ({ cabinNumber: n, socketId: cabinStates[n]?.socketId }))
        .filter((t) => Boolean(t.socketId)) as { cabinNumber: number; socketId: string }[];

      // Tell professor who to connect to
      socket.emit('broadcast:targets', { professorSocketId: socket.id, targets, title: data.title, options: data.options });
      // Tell each student to open the viewer and expect a WebRTC offer
      targets.forEach((t) => {
        io.to(t.socketId).emit('broadcast:incoming', {
          professorSocketId: socket.id,
          cabinNumber: t.cabinNumber,
          title: data.title,
          options: data.options,
        });
      });
    });

    // Student viewer announces it is ready -> professor creates the sendonly peer + offer
    socket.on('broadcast:viewer-ready', (data: { professorSocketId: string; cabinNumber: number }) => {
      if (!data?.professorSocketId) return;
      io.to(data.professorSocketId).emit('broadcast:viewer-ready', {
        cabinNumber: Number(data.cabinNumber),
        studentSocketId: socket.id,
      });
    });

    socket.on('broadcast:stop', () => {
      activeBroadcasts.delete(socket.id);
      io.to('students').emit('broadcast:ended', { professorSocketId: socket.id });
    });

    // ---- Shared practice media (professor pushes a file students control) ----
    socket.on('media:push', (data: { targets: 'ALL' | number[]; url: string; name: string; mode: 'student' | 'synced' }) => {
      if (auth.role !== 'PROFESSOR' && auth.role !== 'ADMIN') return;
      const payload = { url: data.url, name: data.name, mode: data.mode, professorSocketId: socket.id };
      if (data.targets === 'ALL') {
        io.to('students').emit('media:push', payload);
      } else {
        data.targets.forEach((n) => io.to(`cabin-${n}`).emit('media:push', payload));
      }
    });

    socket.on('media:control', (data: { targets: 'ALL' | number[]; action: 'play' | 'pause' | 'seek' | 'stop'; time?: number }) => {
      if (auth.role !== 'PROFESSOR' && auth.role !== 'ADMIN') return;
      const payload = { action: data.action, time: data.time };
      if (data.targets === 'ALL') io.to('students').emit('media:control', payload);
      else data.targets.forEach((n) => io.to(`cabin-${n}`).emit('media:control', payload));
    });

    socket.on('media:clear', (data: { targets: 'ALL' | number[] }) => {
      if (data.targets === 'ALL') io.to('students').emit('media:clear');
      else data.targets.forEach((n) => io.to(`cabin-${n}`).emit('media:clear'));
    });

    // ---- 1:1 Calls ----
    socket.on('call-user-request', (data: {
      fromRole: string; fromName: string; fromCabin?: number;
      targetCabin?: number; targetSocketId?: string;
      callType: 'VIDEO' | 'AUDIO'; roomId: string;
    }) => {
      const base = {
        fromSocketId: socket.id,
        fromRole: data.fromRole,
        fromName: data.fromName,
        fromCabin: data.fromCabin ? Number(data.fromCabin) : undefined,
        callType: data.callType,
        roomId: data.roomId,
      };

      // Student -> professor (no specific target): ring all professors
      if (data.fromRole === 'STUDENT' && !data.targetCabin) {
        io.to('professors').emit('incoming-call', base);
        return;
      }

      let recipient = data.targetSocketId;
      if (!recipient && data.targetCabin && cabinStates[Number(data.targetCabin)]?.socketId) {
        recipient = cabinStates[Number(data.targetCabin)].socketId!;
      }
      if (recipient) io.to(recipient).emit('incoming-call', base);
      else console.warn(`Call target unreachable: cabin=${data.targetCabin}`);
    });

    socket.on('call-response', (data: {
      accepted: boolean; callerSocketId: string; roomId: string;
      responderName: string; responderCabin?: number;
    }) => {
      io.to(data.callerSocketId).emit('call-response-received', {
        accepted: data.accepted,
        responderSocketId: socket.id,
        roomId: data.roomId,
        responderName: data.responderName,
        responderCabin: data.responderCabin,
      });
      if (data.accepted && data.responderCabin && cabinStates[Number(data.responderCabin)]) {
        cabinStates[Number(data.responderCabin)].inCall = true;
        io.to('professors').emit('cabin-updated', cabinStates[Number(data.responderCabin)]);
      }
    });

    // FIXED: notify ONLY the peer, never broadcast to everyone.
    socket.on('call-ended', (data: { targetSocketId?: string; cabinNumber?: number; roomId?: string }) => {
      if (data.targetSocketId) {
        io.to(data.targetSocketId).emit('call-ended-by-peer', { roomId: data.roomId });
      }
      if (data.cabinNumber && cabinStates[Number(data.cabinNumber)]) {
        cabinStates[Number(data.cabinNumber)].inCall = false;
        io.to('professors').emit('cabin-updated', cabinStates[Number(data.cabinNumber)]);
      }
    });

    // ---- Disconnect cleanup ----
    socket.on('disconnect', () => {
      if (activeBroadcasts.has(socket.id)) {
        activeBroadcasts.delete(socket.id);
        io.to('students').emit('broadcast:ended', { professorSocketId: socket.id });
      }
      const session = socketSessionMap.get(socket.id);
      if (session?.cabinNumber && cabinStates[session.cabinNumber]) {
        cabinStates[session.cabinNumber] = {
          ...cabinStates[session.cabinNumber],
          online: false, socketId: null, audioLevel: 0, inCall: false,
          handRaised: false, isScreenShared: false, isWebcamActive: false, screenData: null,
        };
        io.to('professors').emit('cabin-updated', cabinStates[session.cabinNumber]);
        console.log(`🔌 Cabin ${session.cabinNumber} (${session.name}) offline`);
      }
      socketSessionMap.delete(socket.id);
    });
  });
}
