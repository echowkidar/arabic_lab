import { User, Cabin, Recording, MonitoringLog } from '../types';

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || (typeof window !== 'undefined' && window.location.port === '5173' ? 'http://localhost:5000' : '');
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
