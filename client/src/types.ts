export type Role = 'ADMIN' | 'PROFESSOR' | 'STUDENT';
export type Language = 'en' | 'ar' | 'ur';

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  cabinNumber?: number | null;
  isActive: boolean;
  hasConsented?: boolean;
  consentGivenAt?: string | null;
  createdAt?: string;
}

export interface Cabin {
  cabinNumber: number;
  student: {
    id: string;
    name: string;
    username: string;
    cabinNumber: number;
    isActive: boolean;
    consentGivenAt?: string | null;
  } | null;
  status: 'ONLINE' | 'OFFLINE' | 'IN_CALL' | 'DISABLED';
  online: boolean;
  socketId: string | null;
  audioLevel: number; // 0..100
  inCall: boolean;
  handRaised: boolean;
  isScreenShared: boolean;
  isWebcamActive: boolean;
}

export interface Recording {
  id: string;
  title: string;
  relatedCallId?: string | null;
  studentId?: string | null;
  student?: {
    id: string;
    name: string;
    cabinNumber: number;
    username: string;
  } | null;
  recordedBy: string;
  professor: {
    id: string;
    name: string;
  };
  filePath: string;
  durationSec: number;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
}

export interface MonitoringLog {
  id: string;
  professorId: string;
  professor: {
    name: string;
    username: string;
  };
  studentId: string;
  student: {
    name: string;
    username: string;
    cabinNumber: number;
  };
  action: 'SCREEN_VIEW' | 'AUDIO_LISTEN' | 'WEBCAM_VIEW';
  startedAt: string;
}

export interface ActiveCall {
  roomId: string;
  peerSocketId: string;
  peerName: string;
  peerCabin?: number;
  peerRole: string;
  callType: 'VIDEO' | 'AUDIO';
  isCaller: boolean;
}
