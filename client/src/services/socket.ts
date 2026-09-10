import { io, Socket } from 'socket.io-client';
import { SERVER_URL } from './api';

const SOCKET_URL = SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

let activeUserSession: { id: string; role: string; cabinNumber?: number | null; name: string } | null = null;

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,
});

// Auto-register session whenever socket connects or reconnects!
socket.on('connect', () => {
  console.log('⚡ WebRTC & Classroom Socket connected:', socket.id);
  if (activeUserSession) {
    console.log('📡 Auto-registering session on connect:', activeUserSession.name, activeUserSession.role, activeUserSession.cabinNumber);
    socket.emit('register-session', {
      userId: activeUserSession.id,
      role: activeUserSession.role,
      cabinNumber: activeUserSession.cabinNumber,
      name: activeUserSession.name,
    });
  }
});

export function connectSocket(user: { id: string; role: string; cabinNumber?: number | null; name: string }) {
  activeUserSession = user;
  if (!socket.connected) {
    socket.connect();
  } else {
    socket.emit('register-session', {
      userId: user.id,
      role: user.role,
      cabinNumber: user.cabinNumber,
      name: user.name,
    });
  }
}

export function disconnectSocket() {
  activeUserSession = null;
  if (socket.connected) {
    socket.disconnect();
  }
}
