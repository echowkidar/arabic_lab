// Media capture helpers shared by calls, monitoring and broadcast.
// In the Electron desktop app, getDisplayMedia is auto-granted by the main
// process (electron/main.cjs) which also attaches *system/loopback audio*, so
// desktop/video playback sound is captured - not just the microphone.

export async function getMicStream(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: deviceId
      ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
}

export async function getWebcamStream(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } }
      : { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
    audio: false,
  });
}

// Screen (+ system audio where supported). Electron main returns audio:'loopback'.
export async function getScreenStream(withSystemAudio = true): Promise<MediaStream> {
  const md: any = navigator.mediaDevices;
  if (!md || !md.getDisplayMedia) {
    throw new Error('SCREEN_CAPTURE_UNSUPPORTED');
  }
  return md.getDisplayMedia({
    video: { frameRate: { ideal: 15, max: 30 } },
    audio: withSystemAudio,
  });
}

// Desktop app (EXE): capture the whole screen with no picker. Uses the
// main-process display-media handler first; if that fails, falls back to a
// desktopCapturer screen source via getUserMedia. In a plain browser the
// browser always shows its own picker (that can't be bypassed), so callers
// should only use this when isElectron() is true.
export async function getAutoScreenStream(withSystemAudio = true): Promise<MediaStream> {
  try {
    return await getScreenStream(withSystemAudio);
  } catch { /* fall through to desktopCapturer */ }
  const api = (window as any).electronAPI;
  if (!api?.getDesktopSources) throw new Error('SCREEN_CAPTURE_UNSUPPORTED');
  const sources = await api.getDesktopSources({ types: ['screen'] });
  const id = sources?.[0]?.id;
  if (!id) throw new Error('NO_SCREEN_SOURCE');
  const video = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 15 } };
  if (withSystemAudio) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video } as any);
    } catch { /* no loopback audio on this PC - video only */ }
  }
  return navigator.mediaDevices.getUserMedia({ audio: false, video } as any);
}

export function isLiveStream(stream?: MediaStream | null): boolean {
  return Boolean(stream && stream.getVideoTracks().some((t) => t.readyState === 'live'));
}

export async function enumerate(kind: MediaDeviceKind): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const list = await navigator.mediaDevices.enumerateDevices();
  return list.filter((d) => d.kind === kind);
}

export function combineStreams(...streams: Array<MediaStream | null | undefined>): MediaStream {
  const out = new MediaStream();
  streams.forEach((s) => s?.getTracks().forEach((t) => out.addTrack(t)));
  return out;
}

export function stopStream(stream?: MediaStream | null): void {
  stream?.getTracks().forEach((t) => {
    try { t.stop(); } catch { /* noop */ }
  });
}

export function isElectron(): boolean {
  return Boolean((window as any).electronAPI?.isElectron);
}


// Mix several audio tracks (e.g. microphone + system/desktop audio) into ONE
// track so a single WebRTC audio sender carries both the teacher's voice and
// whatever file/video is playing on their desktop.
export interface MixedAudio {
  track: MediaStreamTrack;
  stop: () => void;
}

export function mixAudioTracks(tracks: MediaStreamTrack[]): MixedAudio | null {
  const live = tracks.filter(Boolean);
  if (live.length === 0) return null;
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new Ctx();
  const dest = ctx.createMediaStreamDestination();
  const sources: MediaStreamAudioSourceNode[] = [];
  live.forEach((t) => {
    try {
      const src = ctx.createMediaStreamSource(new MediaStream([t]));
      src.connect(dest);
      sources.push(src);
    } catch { /* noop */ }
  });
  return {
    track: dest.stream.getAudioTracks()[0],
    stop: () => {
      sources.forEach((s) => { try { s.disconnect(); } catch { /* noop */ } });
      ctx.close().catch(() => {});
    },
  };
}
