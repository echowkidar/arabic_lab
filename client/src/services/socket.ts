import { io, Socket } from 'socket.io-client';
import { SERVER_URL } from './api';

const SOCKET_URL = SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

let activeUserSession: { id: string; role: string; cabinNumber?: number | null; name: string } | null = null;

function authToken(): string {
  try {
    return localStorage.getItem('arabic_lab_token') || '';
  } catch {
    return '';
  }
}

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,
  // JWT is verified server-side (socket middleware). Role/cabin are taken from
  // the token, never trusted from the client - this protects monitoring data.
  auth: (cb) => cb({ token: authToken() }),
});

socket.on('connect', () => {
  console.log('⚡ Classroom signaling socket connected:', socket.id);
  if (activeUserSession) {
    socket.emit('register-session', {
      userId: activeUserSession.id,
      role: activeUserSession.role,
      cabinNumber: activeUserSession.cabinNumber,
      name: activeUserSession.name,
    });
  }
});

socket.on('connect_error', (err) => {
  console.warn('Signaling socket connect error:', err?.message || err);
});

export function connectSocket(user: { id: string; role: string; cabinNumber?: number | null; name: string }) {
  activeUserSession = user;
  // Refresh auth token on (re)connect
  (socket.auth as any) = (cb: (d: any) => void) => cb({ token: authToken() });
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
