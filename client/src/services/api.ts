import { User, Cabin, Recording, MonitoringLog, Learner, StudentRecording, MediaItem, MediaShare, SharedMaterial } from '../types';
import { getLearnerSession, lockLearner } from './learnerSession';

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  (typeof window !== 'undefined'
    ? window.location.port === '5173'
      ? `${window.location.protocol}//${window.location.hostname}:5000`
      : ''
    : '');
const API_BASE = `${SERVER_URL}/api`;

function getAuthHeader(): HeadersInit {
  const token = localStorage.getItem('arabic_lab_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function login(username: string, password: string, consent = false) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, consent }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(error.error || 'Login failed');
  }
  return res.json() as Promise<{ token: string; user: User }>;
}

export async function getMe() {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json() as Promise<{ user: User; hasConsented: boolean }>;
}

export async function giveConsent() {
  const res = await fetch(`${API_BASE}/auth/consent`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to submit consent');
  return res.json();
}

export async function fetchCabins(): Promise<Cabin[]> {
  const res = await fetch(`${API_BASE}/cabins`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to fetch cabins');
  const data = await res.json();
  return data.cabins;
}

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/users`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to fetch users');
  const data = await res.json();
  return data.users;
}

export async function resetPassword(userId: string, newPassword: string) {
  const res = await fetch(`${API_BASE}/users/reset-password`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify({ userId, newPassword }),
  });
  if (!res.ok) throw new Error('Failed to reset password');
  return res.json();
}

export async function toggleUserActive(userId: string) {
  const res = await fetch(`${API_BASE}/users/${userId}/toggle-active`, {
    method: 'PATCH',
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to toggle active status');
  return res.json();
}

export async function fetchRecordings(): Promise<Recording[]> {
  const res = await fetch(`${API_BASE}/recordings`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to fetch recordings');
  const data = await res.json();
  return data.recordings;
}

export async function uploadRecording(formData: FormData) {
  const token = localStorage.getItem('arabic_lab_token');
  const res = await fetch(`${API_BASE}/recordings/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload recording');
  return res.json();
}

export async function deleteRecording(id: string) {
  const res = await fetch(`${API_BASE}/recordings/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to delete recording');
  return res.json();
}

export async function fetchAuditLogs(): Promise<MonitoringLog[]> {
  const res = await fetch(`${API_BASE}/audit`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  const data = await res.json();
  return data.logs;
}

export async function logAudit(cabinNumber: number, action: 'SCREEN_VIEW' | 'AUDIO_LISTEN' | 'WEBCAM_VIEW') {
  const res = await fetch(`${API_BASE}/audit/log`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify({ cabinNumber, action }),
  });
  if (!res.ok) console.warn('Failed to record audit log');
  return res.json();
}


// ---- Shared request helper for the newer endpoints ----
// Throws an Error whose message is the server's user-friendly `error` text,
// with `.code` (e.g. PIN_REQUIRED / PIN_EXPIRED) and `.status` attached.
async function request<T>(path: string, init: RequestInit & { learner?: boolean; json?: unknown } = {}): Promise<T> {
  const token = localStorage.getItem('arabic_lab_token');
  const headers: Record<string, string> = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (init.learner) {
    const s = getLearnerSession();
    if (s) headers['X-Learner-Token'] = s.token;
  }
  let body = init.body;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as any) }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data.message || data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.error;
    if (res.status === 401 && init.learner && (data.error === 'PIN_EXPIRED' || data.error === 'PIN_REQUIRED')) lockLearner();
    throw err;
  }
  return data as T;
}

// ---- Learner (Roll No + PIN) ----
export const registerLearner = (rollNo: string, name: string, pin: string) =>
  request<{ learner: Learner; learnerToken: string }>('/learners/register', { method: 'POST', json: { rollNo, name, pin } });
export const unlockLearner = (rollNo: string, pin: string) =>
  request<{ learner: Learner; learnerToken: string }>('/learners/unlock', { method: 'POST', json: { rollNo, pin } });
export const listLearners = () =>
  request<{ learners: (Learner & { createdAt: string; lockedUntil?: string | null; _count: { recordings: number } })[] }>('/learners').then((d) => d.learners);
export const resetLearnerPin = (id: string, pin: string) =>
  request<{ success: boolean }>(`/learners/${id}/reset-pin`, { method: 'POST', json: { pin } });

// ---- Student voice recordings ----
export function uploadStudentRecording(blob: Blob, title: string, durationSec: number) {
  const fd = new FormData();
  const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
  fd.append('audio', blob, `voice-${Date.now()}.${ext}`);
  fd.append('title', title);
  fd.append('durationSec', String(durationSec));
  return request<{ recording: StudentRecording }>('/student-recordings', { method: 'POST', body: fd, learner: true }).then((d) => d.recording);
}
export const listMyRecordings = () =>
  request<{ recordings: StudentRecording[] }>('/student-recordings/mine', { learner: true }).then((d) => d.recordings);
export const submitRecording = (id: string) =>
  request<{ recording: StudentRecording }>(`/student-recordings/${id}/submit`, { method: 'POST', learner: true }).then((d) => d.recording);
export const deleteMyRecording = (id: string) =>
  request<{ success: boolean }>(`/student-recordings/mine/${id}`, { method: 'DELETE', learner: true });

export const listSubmissions = (status: 'PENDING' | 'GRADED' | 'ALL') =>
  request<{ recordings: StudentRecording[] }>(`/student-recordings?status=${status}`).then((d) => d.recordings);
export const gradeRecording = (id: string, marks: number, maxMarks: number, remark: string) =>
  request<{ recording: StudentRecording }>(`/student-recordings/${id}/grade`, { method: 'PATCH', json: { marks, maxMarks, remark } }).then((d) => d.recording);
export const setRecordingLock = (id: string, locked: boolean) =>
  request<{ recording: StudentRecording }>(`/student-recordings/${id}/lock`, { method: 'PATCH', json: { locked } }).then((d) => d.recording);
export const deleteSubmission = (id: string) =>
  request<{ success: boolean }>(`/student-recordings/${id}`, { method: 'DELETE' });

// ---- Media library & sharing ----
export function uploadMediaItem(file: Blob, opts: { title?: string; durationSec?: number; source?: 'UPLOAD' | 'PROF_RECORDING'; filename?: string } = {}) {
  const fd = new FormData();
  fd.append('media', file, opts.filename || (file as File).name || `recording-${Date.now()}.webm`);
  if (opts.title) fd.append('title', opts.title);
  if (opts.durationSec) fd.append('durationSec', String(opts.durationSec));
  if (opts.source) fd.append('source', opts.source);
  return request<{ media: MediaItem }>('/media', { method: 'POST', body: fd }).then((d) => d.media);
}
export const listMediaItems = () => request<{ media: MediaItem[] }>('/media').then((d) => d.media);
export const renameMediaItem = (id: string, title: string) =>
  request<{ media: MediaItem }>(`/media/${id}`, { method: 'PATCH', json: { title } }).then((d) => d.media);
export const deleteMediaItem = (id: string) => request<{ success: boolean }>(`/media/${id}`, { method: 'DELETE' });

export const shareMediaItems = (mediaIds: string[], targetType: 'ALL' | 'CABINS', cabins: number[], mode: 'student' | 'synced') =>
  request<{ shares: unknown[] }>('/media-shares', { method: 'POST', json: { mediaIds, targetType, cabins, mode } });
export const listMediaShares = () => request<{ shares: MediaShare[] }>('/media-shares').then((d) => d.shares);
export const revokeMediaShare = (id: string) => request<{ success: boolean }>(`/media-shares/${id}`, { method: 'DELETE' });
export const listMySharedMedia = () => request<{ items: SharedMaterial[] }>('/media-shares/mine').then((d) => d.items);

// ---- Signed playback URLs (audio/video elements can't send auth headers) ----
export async function getPlaybackUrl(type: 'student' | 'media', id: string): Promise<string> {
  const d = await request<{ url: string }>(`/files/sign?type=${type}&id=${encodeURIComponent(id)}`, { learner: type === 'student' });
  return `${SERVER_URL}${d.url}`;
}
