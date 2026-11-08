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
  screenData?: string | null;
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

export interface Learner {
  id: string;
  rollNo: string;
  name: string;
}

export type StudentRecordingStatus = 'DRAFT' | 'SUBMITTED' | 'GRADED';

export interface StudentRecording {
  id: string;
  learnerId: string;
  learner?: Learner;
  cabinNumber?: number | null;
  title: string;
  mimeType: string;
  durationSec: number;
  sizeBytes: number;
  recordedAt: string;
  status: StudentRecordingStatus;
  submittedAt?: string | null;
  marks?: number | null;
  maxMarks: number;
  remark?: string | null;
  gradedAt?: string | null;
  locked: boolean;
}

export interface MediaItem {
  id: string;
  title: string;
  mimeType: string;
  kind: 'AUDIO' | 'VIDEO';
  source: 'UPLOAD' | 'PROF_RECORDING';
  durationSec: number;
  sizeBytes: number;
  createdAt: string;
  _count?: { shares: number };
}

export interface MediaShare {
  id: string;
  mediaId: string;
  targetType: 'ALL' | 'CABINS';
  cabins: number[];
  mode: 'student' | 'synced';
  createdAt: string;
  media: MediaItem;
}

export interface SharedMaterial {
  shareId: string;
  mode: 'student' | 'synced';
  sharedAt: string;
  media: MediaItem;
}

export interface ActiveCall {
  roomId: string;
  peerSocketId: string;
  peerName: string;
  peerCabin?: number;
  peerRole: string;
  callType: 'VIDEO' | 'AUDIO';
  isCaller: boolean;
  accepted?: boolean;
}
