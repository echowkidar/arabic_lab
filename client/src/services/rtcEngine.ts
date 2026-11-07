// Lightweight multi-peer WebRTC manager built on the existing Socket.IO relay.
// Implements the "perfect negotiation" pattern so simultaneous offers (glare)
// never deadlock. One engine instance per browser; peers are keyed by a logical
// sessionId (e.g. "monitor:7:<profSocket>", "call:<roomId>", "bcast:<cab>").
import { socket } from './socket';
import { rtcConfiguration } from './rtcConfig';

export type RtcPurpose = 'call' | 'monitor' | 'broadcast';

// Small side-channel the sender uses to tell the receiver which inbound
// MediaStream is which (e.g. main screen vs. webcam PiP).
export type RtcMeta = Record<string, string | undefined>;

interface PeerEntry {
  pc: RTCPeerConnection;
  sessionId: string;
  remoteSocketId: string;
  purpose: RtcPurpose;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  meta: RtcMeta;
  onTrack?: (stream: MediaStream, track: MediaStreamTrack) => void;
  onState?: (state: RTCPeerConnectionState) => void;
  onMeta?: (meta: RtcMeta) => void;
}

interface SignalMsg {
  fromSocketId: string;
  sessionId: string;
  purpose: RtcPurpose;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  meta?: RtcMeta;
}

const peers = new Map<string, PeerEntry>();
// Signals that arrive before the local peer for that session exists (e.g. the
// remote side offered faster than our React effect ran). Replayed on createPeer.
const pending = new Map<string, { at: number; msgs: SignalMsg[] }>();
const PENDING_TTL_MS = 20000;
// Late signals for a session we just closed must not be replayed into a new one.
const recentlyClosed = new Map<string, number>();
let listenerBound = false;

function ensureListener(): void {
  if (listenerBound) return;
  listenerBound = true;
  socket.on('rtc:signal', (msg: SignalMsg) => { void handleSignal(msg); });
}

function emitSignal(entry: PeerEntry, data: { description?: any; candidate?: any; meta?: RtcMeta }): void {
  socket.emit('rtc:signal', {
    toSocketId: entry.remoteSocketId,
    sessionId: entry.sessionId,
    purpose: entry.purpose,
    ...data,
  });
}

function bufferSignal(msg: SignalMsg): void {
  const now = Date.now();
  pending.forEach((v, k) => { if (now - v.at > PENDING_TTL_MS) pending.delete(k); });
  recentlyClosed.forEach((t, k) => { if (now - t > PENDING_TTL_MS) recentlyClosed.delete(k); });
  if (recentlyClosed.has(msg.sessionId)) return;
  const slot = pending.get(msg.sessionId) || { at: now, msgs: [] };
  slot.msgs.push(msg);
  pending.set(msg.sessionId, slot);
}

async function handleSignal(msg: SignalMsg): Promise<void> {
  if (!msg?.sessionId) return;
  const entry = peers.get(msg.sessionId);
  if (!entry) { bufferSignal(msg); return; }
  if (msg.fromSocketId) entry.remoteSocketId = msg.fromSocketId;
  const { pc } = entry;
  try {
    if (msg.meta) {
      entry.meta = { ...entry.meta, ...msg.meta };
      entry.onMeta?.(entry.meta);
    }
    if (msg.description) {
      const desc = msg.description;
      const readyForOffer =
        !entry.makingOffer &&
        (pc.signalingState === 'stable' || entry.isSettingRemoteAnswerPending);
      const offerCollision = desc.type === 'offer' && !readyForOffer;
      entry.ignoreOffer = !entry.polite && offerCollision;
      if (entry.ignoreOffer) return;
      entry.isSettingRemoteAnswerPending = desc.type === 'answer';
      await pc.setRemoteDescription(desc);
      entry.isSettingRemoteAnswerPending = false;
      if (desc.type === 'offer') {
        await pc.setLocalDescription();
        emitSignal(entry, { description: pc.localDescription?.toJSON() });
      }
    } else if (msg.candidate) {
      try {
        await pc.addIceCandidate(msg.candidate);
      } catch (e) {
        if (!entry.ignoreOffer) console.warn('addIceCandidate failed', e);
      }
    }
  } catch (e) {
    console.warn('rtc handleSignal error', e);
  }
}

export interface CreatePeerOpts {
  sessionId: string;
  remoteSocketId: string;
  purpose: RtcPurpose;
  polite: boolean;
  localStream?: MediaStream | null;
  onTrack?: (stream: MediaStream, track: MediaStreamTrack) => void;
  onState?: (state: RTCPeerConnectionState) => void;
  onMeta?: (meta: RtcMeta) => void;
}

export function createPeer(opts: CreatePeerOpts): RTCPeerConnection {
  ensureListener();
  const queued = pending.get(opts.sessionId);
  closePeer(opts.sessionId);
  recentlyClosed.delete(opts.sessionId);

  const pc = new RTCPeerConnection(rtcConfiguration);
  const entry: PeerEntry = {
    pc,
    sessionId: opts.sessionId,
    remoteSocketId: opts.remoteSocketId,
    purpose: opts.purpose,
    polite: opts.polite,
    makingOffer: false,
    ignoreOffer: false,
    isSettingRemoteAnswerPending: false,
    meta: {},
    onTrack: opts.onTrack,
    onState: opts.onState,
    onMeta: opts.onMeta,
  };
  peers.set(opts.sessionId, entry);

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) emitSignal(entry, { candidate: candidate.toJSON() });
  };
  pc.ontrack = (ev) => {
    const stream = ev.streams[0] || new MediaStream([ev.track]);
    entry.onTrack?.(stream, ev.track);
  };
  pc.onconnectionstatechange = () => {
    // Network blip / NAT rebinding: ask for fresh ICE instead of giving up.
    if (pc.connectionState === 'failed') {
      try { pc.restartIce(); } catch { /* noop */ }
    }
    entry.onState?.(pc.connectionState);
  };
  pc.onnegotiationneeded = async () => {
    try {
      entry.makingOffer = true;
      await pc.setLocalDescription();
      emitSignal(entry, { description: pc.localDescription?.toJSON() });
    } catch (e) {
      console.warn('negotiationneeded error', e);
    } finally {
      entry.makingOffer = false;
    }
  };

  if (opts.localStream) {
    opts.localStream.getTracks().forEach((t) => pc.addTrack(t, opts.localStream as MediaStream));
  }

  // Replay anything the remote sent before this peer existed.
  if (queued) {
    if (Date.now() - queued.at <= PENDING_TTL_MS) {
      void (async () => { for (const m of queued.msgs) await handleSignal(m); })();
    }
  }
  return pc;
}

// Tell the remote peer which of our streams is which (see RtcMeta).
export function sendMeta(sessionId: string, meta: RtcMeta): void {
  const entry = peers.get(sessionId);
  if (entry) emitSignal(entry, { meta });
}

// Add a track and return its sender so callers can swap it later
// (replaceTrack) without guessing which sender belongs to which stream.
export function addMediaTrack(sessionId: string, track: MediaStreamTrack, stream: MediaStream): RTCRtpSender | null {
  const entry = peers.get(sessionId);
  if (!entry || entry.pc.signalingState === 'closed') return null;
  try {
    return entry.pc.addTrack(track, stream);
  } catch (e) {
    console.warn('addTrack failed', e);
    return null;
  }
}

export function getSender(sessionId: string, track: MediaStreamTrack): RTCRtpSender | null {
  const entry = peers.get(sessionId);
  if (!entry) return null;
  return entry.pc.getSenders().find((s) => s.track === track) || null;
}

// Swap the track on a known sender, or add it as a new track (renegotiates)
// when there is no sender yet - e.g. screen share during an audio-only call.
export function setOutgoingTrack(
  sessionId: string,
  sender: RTCRtpSender | null,
  track: MediaStreamTrack | null,
  stream: MediaStream,
): RTCRtpSender | null {
  if (sender) {
    sender.replaceTrack(track).catch(() => {});
    return sender;
  }
  if (!track) return null;
  return addMediaTrack(sessionId, track, stream);
}

export function closePeer(sessionId: string): void {
  pending.delete(sessionId);
  const entry = peers.get(sessionId);
  if (!entry) return;
  try {
    entry.pc.ontrack = null;
    entry.pc.onicecandidate = null;
    entry.pc.onnegotiationneeded = null;
    entry.pc.onconnectionstatechange = null;
    entry.pc.close();
  } catch { /* noop */ }
  peers.delete(sessionId);
  recentlyClosed.set(sessionId, Date.now());
}

export function closePeersByPurpose(purpose: RtcPurpose): void {
  Array.from(peers.values())
    .filter((e) => e.purpose === purpose)
    .forEach((e) => closePeer(e.sessionId));
}

export function closeAllPeers(): void {
  Array.from(peers.keys()).forEach(closePeer);
}

export function hasPeer(sessionId: string): boolean {
  return peers.has(sessionId);
}
