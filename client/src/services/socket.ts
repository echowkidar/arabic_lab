import { io, Socket } from 'socket.io-client';
import { SERVER_URL } from './api';

const SOCKET_URL = SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export function connectSocket(user: { id: string; role: string; cabinNumber?: number | null; name: string }) {
  if (!socket.connected) {
    socket.connect();
    socket.emit('register-session', {
      userId: user.id,
      role: user.role,
      cabinNumber: user.cabinNumber,
      name: user.name,
    });
  }
}

export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}
