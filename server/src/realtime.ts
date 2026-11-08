import type { Server as SocketIOServer } from 'socket.io';

// Lets REST controllers push live notifications (new submission, grade,
// new shared material) without importing the whole socket module.
let io: SocketIOServer | null = null;

export function setRealtime(server: SocketIOServer) {
  io = server;
}

export function emitTo(room: string | string[], event: string, data: unknown) {
  if (!io) return;
  io.to(room).emit(event, data);
}

export function cabinRoom(cabinNumber: number) {
  return `cabin-${cabinNumber}`;
}
