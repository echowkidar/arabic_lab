// Thin MediaRecorder wrapper for voice recordings (student practice and
// professor material). Produces a single Blob plus the measured duration.

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export interface ActiveRecording {
  stop: () => Promise<{ blob: Blob; durationSec: number }>;
  cancel: () => void;
}

export function startAudioRecording(stream: MediaStream): ActiveRecording {
  const mimeType = pickMimeType();
  const audioOnly = new MediaStream(stream.getAudioTracks());
  const mr = mimeType ? new MediaRecorder(audioOnly, { mimeType, audioBitsPerSecond: 64000 }) : new MediaRecorder(audioOnly);
  const chunks: Blob[] = [];
  const startedAt = performance.now();
  mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  mr.start(1000);

  return {
    stop: () => new Promise((resolve) => {
      const durationSec = Math.max(1, Math.round((performance.now() - startedAt) / 1000));
      mr.onstop = () => resolve({ blob: new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), durationSec });
      if (mr.state !== 'inactive') mr.stop();
      else resolve({ blob: new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), durationSec });
    }),
    cancel: () => {
      mr.ondataavailable = null;
      if (mr.state !== 'inactive') mr.stop();
    },
  };
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(r).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDateTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

export function formatSize(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
