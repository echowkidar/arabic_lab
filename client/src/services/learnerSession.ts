import { useEffect, useState } from 'react';
import { Learner } from '../types';

// The unlocked Roll No + PIN session lives in memory only (never localStorage),
// so nothing is left behind on a shared cabin PC. It also auto-locks after
// a few idle minutes and whenever the cabin user logs out.
const IDLE_LOCK_MS = 5 * 60 * 1000;

interface Session { token: string; learner: Learner }

let session: Session | null = null;
let idleTimer: number | null = null;
const listeners = new Set<(s: Session | null) => void>();

function notify() {
  listeners.forEach((l) => l(session));
}

function armIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => lockLearner(), IDLE_LOCK_MS);
}

export function getLearnerSession(): Session | null {
  return session;
}

export function setLearnerSession(token: string, learner: Learner) {
  session = { token, learner };
  armIdleTimer();
  notify();
}

export function lockLearner() {
  session = null;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  notify();
}

// Call on any learner activity to push the auto-lock back.
export function touchLearner() {
  if (session) armIdleTimer();
}

export function onLearnerSession(cb: (s: Session | null) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useLearnerSession(): Session | null {
  const [s, setS] = useState<Session | null>(session);
  useEffect(() => onLearnerSession(setS), []);
  return s;
}
