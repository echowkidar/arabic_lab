import { Server as SocketIOServer, Socket } from 'socket.io';

export interface CabinLiveState {
  online: boolean;
  socketId: string | null;
  userId: string | null;
  studentName: string | null;
  cabinNumber: number;
  audioLevel: number; // 0 to 100
  inCall: boolean;
  handRaised: boolean;
  isScreenShared: boolean;
  isWebcamActive: boolean;
  screenData?: string | null;
  lastActive: Date | null;
}

// In-memory state of all 25 cabins
const cabinStates: Record<number, CabinLiveState> = {};
for (let i = 1; i <= 25; i++) {
  cabinStates[i] = {
    online: false,
    socketId: null,
    userId: null,
    studentName: null,
    cabinNumber: i,
    audioLevel: 0,
    inCall: false,
    handRaised: false,
    isScreenShared: false,
    isWebcamActive: false,
    screenData: null,
    lastActive: null,
  };
}

// Map socket.id -> session info
const socketSessionMap = new Map<
  string,
  {
    userId: string;
    role: string;
    cabinNumber?: number | null;
    name: string;
  }
>();

export function getConnectedCabinsState() {
  return cabinStates;
}

export function setupSocketServer(io: SocketIOServer) {
  console.log('⚡ WebRTC & Classroom Signaling Engine initialized');

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Register User Session
    socket.on('register-session', (data: { userId: string; role: string; cabinNumber?: number; name: string }) => {
      const { userId, role, cabinNumber, name } = data;
      socketSessionMap.set(socket.id, { userId, role, cabinNumber, name });

      if (role === 'PROFESSOR' || role === 'ADMIN') {
        socket.join('professors');
        // Send initial full cabin snapshot
        socket.emit('cabin-snapshot', cabinStates);
      }

      if (role === 'STUDENT' && cabinNumber && cabinNumber >= 1 && cabinNumber <= 25) {
        socket.join(`cabin-${cabinNumber}`);
        socket.join('students');

        cabinStates[cabinNumber] = {
          ...cabinStates[cabinNumber],
          online: true,
          socketId: socket.id,
          userId,
          studentName: name,
          lastActive: new Date(),
        };

        // Notify professors of student presence
        io.to('professors').emit('cabin-updated', cabinStates[cabinNumber]);
        console.log(`💻 Cabin ${cabinNumber} (${name}) registered online`);
      }
    });

    // Real-Time Audio Level VU Update
    socket.on('audio-level-update', (data: { cabinNumber: number; level: number }) => {
      const { cabinNumber, level } = data;
      if (cabinStates[cabinNumber]) {
        cabinStates[cabinNumber].audioLevel = Math.min(100, Math.max(0, level));
        // Broadcast audio level to all professors
        io.to('professors').emit('cabin-audio-level', { cabinNumber, level });
      }
    });

    // Raise / Lower Hand
    socket.on('raise-hand', (data: { cabinNumber: number; studentName?: string }) => {
      const { cabinNumber, studentName } = data;
      if (cabinStates[cabinNumber]) {
        cabinStates[cabinNumber].handRaised = true;
        io.to('professors').emit('hand-raised', {
          cabinNumber,
          studentName: studentName || cabinStates[cabinNumber].studentName,
          timestamp: new Date().toISOString(),
        });
        io.to('professors').emit('cabin-updated', cabinStates[cabinNumber]);
      }
    });

    socket.on('lower-hand', (data: { cabinNumber: number }) => {
      const { cabinNumber } = data;
      if (cabinStates[cabinNumber]) {
        cabinStates[cabinNumber].handRaised = false;
        io.to('professors').emit('hand-lowered', { cabinNumber });
        io.to('professors').emit('cabin-updated', cabinStates[cabinNumber]);
      }
    });

    // Silent Monitoring Request (Professor -> Student)
    socket.on('request-silent-monitor', (data: { cabinNumber: number }) => {
      const { cabinNumber } = data;
      const cabin = cabinStates[cabinNumber];
      if (cabin && cabin.online && cabin.socketId) {
        console.log(`👀 Professor ${socket.id} requested silent monitor of Cabin ${cabinNumber}`);
        // Send to student to initiate WebRTC stream directly to this professor
        io.to(cabin.socketId).emit('start-silent-stream-to-prof', {
          professorSocketId: socket.id,
          cabinNumber,
        });
      }
    });

    // Stop Silent Monitoring
    socket.on('stop-silent-monitor', (data: { cabinNumber: number }) => {
      const { cabinNumber } = data;
      const cabin = cabinStates[cabinNumber];
      if (cabin && cabin.socketId) {
        io.to(cabin.socketId).emit('stop-silent-stream-to-prof', {
          professorSocketId: socket.id,
        });
      }
    });

    // Real-Time Student Desktop Screen Frame Update
    socket.on('cabin-screen-frame', (data: { cabinNumber: number; screenData: string }) => {
      const { cabinNumber, screenData } = data;
      if (cabinStates[cabinNumber]) {
        cabinStates[cabinNumber].screenData = screenData;
        cabinStates[cabinNumber].isScreenShared = true;
        // Broadcast screen frame to all professors
        io.to('professors').emit('cabin-screen-update', { cabinNumber, screenData });
      }
    });

    // High-Resolution Screen Request for Fullscreen Monitor
    socket.on('request-high-res-screen', (data: { cabinNumber: number }) => {
      const { cabinNumber } = data;
      const cabin = cabinStates[cabinNumber];
      if (cabin && cabin.online && cabin.socketId) {
        io.to(cabin.socketId).emit('capture-high-res-frame');
      }
    });

    // Professor toggles Student Webcam Stream
    socket.on('toggle-student-webcam', (data: { cabinNumber: number; enabled: boolean }) => {
      const { cabinNumber, enabled } = data;
      const cabin = cabinStates[cabinNumber];
      if (cabin) {
        cabin.isWebcamActive = enabled;
        if (cabin.socketId) {
          io.to(cabin.socketId).emit('set-webcam-enabled', { enabled });
        }
        io.to('professors').emit('cabin-updated', cabin);
      }
    });

    // 1:1 Video/Audio Call Management
    socket.on('call-user-request', (data: {
      fromRole: string;
      fromName: string;
      fromCabin?: number;
      targetCabin?: number;
      targetSocketId?: string;
      callType: 'VIDEO' | 'AUDIO';
      roomId: string;
    }) => {
      const { fromRole, fromName, fromCabin, targetCabin, targetSocketId, callType, roomId } = data;
      let recipientSocketId = targetSocketId;

      if (!recipientSocketId && targetCabin && cabinStates[targetCabin]?.socketId) {
        recipientSocketId = cabinStates[targetCabin].socketId!;
      }

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('incoming-call', {
          fromSocketId: socket.id,
          fromRole,
          fromName,
          fromCabin,
          callType,
          roomId,
        });
      }
    });

    socket.on('call-response', (data: {
      accepted: boolean;
      callerSocketId: string;
      roomId: string;
      responderName: string;
      responderCabin?: number;
    }) => {
      const { accepted, callerSocketId, roomId, responderName, responderCabin } = data;
      io.to(callerSocketId).emit('call-response-received', {
        accepted,
        responderSocketId: socket.id,
        roomId,
        responderName,
        responderCabin,
      });

      if (accepted) {
        if (responderCabin && cabinStates[responderCabin]) {
          cabinStates[responderCabin].inCall = true;
          io.to('professors').emit('cabin-updated', cabinStates[responderCabin]);
        }
      }
    });

    socket.on('call-ended', (data: { targetSocketId?: string; cabinNumber?: number }) => {
      const { targetSocketId, cabinNumber } = data;
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-ended-by-peer');
      }
      if (cabinNumber && cabinStates[cabinNumber]) {
        cabinStates[cabinNumber].inCall = false;
        io.to('professors').emit('cabin-updated', cabinStates[cabinNumber]);
      }
    });

    // Classroom Broadcast (Professor -> All Cabins or Selected)
    socket.on('broadcast-start', (data: {
      type: 'ALL' | 'SELECTED';
      selectedCabins?: number[];
      hasScreenShare: boolean;
      hasWebcamPiP: boolean;
      hasAudio: boolean;
      title: string;
    }) => {
      console.log('📢 Professor started classroom broadcast');
      io.to('students').emit('incoming-broadcast', {
        professorSocketId: socket.id,
        ...data,
      });
    });

    socket.on('broadcast-stop', () => {
      console.log('📢 Professor stopped classroom broadcast');
      io.to('students').emit('broadcast-ended');
    });

    // WebRTC Signaling Relay (SDP Offer / Answer / ICE Candidates)
    socket.on('webrtc-signal', (data: {
      targetSocketId: string;
      signal: any;
      type: 'offer' | 'answer' | 'candidate';
      streamPurpose: 'monitor' | 'call' | 'broadcast' | 'peer';
    }) => {
      const { targetSocketId, signal, type, streamPurpose } = data;
      if (targetSocketId) {
        io.to(targetSocketId).emit('webrtc-signal', {
          senderSocketId: socket.id,
          signal,
          type,
          streamPurpose,
        });
      }
    });

    // Peer Dialogue Connect (Student Cabin to Student Cabin Arabic Drill)
    socket.on('peer-dialogue-request', (data: { fromCabin: number; targetCabin: number }) => {
      const { fromCabin, targetCabin } = data;
      const target = cabinStates[targetCabin];
      if (target && target.online && target.socketId) {
        io.to(target.socketId).emit('incoming-peer-dialogue', {
          fromCabin,
          fromSocketId: socket.id,
        });
      }
    });

    // Disconnect Handler
    socket.on('disconnect', () => {
      const session = socketSessionMap.get(socket.id);
      if (session) {
        const { cabinNumber, name } = session;
        if (cabinNumber && cabinStates[cabinNumber]) {
          cabinStates[cabinNumber] = {
            ...cabinStates[cabinNumber],
            online: false,
            socketId: null,
            audioLevel: 0,
            inCall: false,
            handRaised: false,
            isScreenShared: false,
            isWebcamActive: false,
            screenData: null,
          };
          io.to('professors').emit('cabin-updated', cabinStates[cabinNumber]);
          console.log(`🔌 Cabin ${cabinNumber} (${name}) went offline`);
        }
        socketSessionMap.delete(socket.id);
      }
    });
  });
}
