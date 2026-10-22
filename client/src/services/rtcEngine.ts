// Lightweight multi-peer WebRTC manager built on the existing Socket.IO relay.
// Implements the "perfect negotiation" pattern so simultaneous offers (glare)
// never deadlock. One engine instance per browser; peers are keyed by a logical
// sessionId (e.g. "monitor:7:<profSocket>", "call:<roomId>", "bcast:<cab>").
import { socket } from './socket';
import { rtcConfiguration } from './rtcConfig';

export type RtcPurpose = 'call' | 'monitor' | 'broadcast';

interface PeerEntry {
  pc: RTCPeerConnection;
  sessionId: string;
  remoteSocketId: string;
  purpose: RtcPurpose;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  onTrack?: (stream: MediaStream) => void;
  onState?: (state: RTCPeerConnectionState) => void;
}

interface SignalMsg {
  fromSocketId: string;
  sessionId: string;
  purpose: RtcPurpose;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const peers = new Map<string, PeerEntry>();
let listenerBound = false;

function ensureListener(): void {
  if (listenerBound) return;
  listenerBound = true;
  socket.on('rtc:signal', handleSignal);
}

function emitSignal(entry: PeerEntry, data: { description?: any; candidate?: any }): void {
  socket.emit('rtc:signal', {
    toSocketId: entry.remoteSocketId,
    sessionId: entry.sessionId,
    purpose: entry.purpose,
    ...data,
  });
}

async function handleSignal(msg: SignalMsg): Promise<void> {
  const entry = peers.get(msg.sessionId);
  if (!entry) return;
  if (msg.fromSocketId) entry.remoteSocketId = msg.fromSocketId;
  const { pc } = entry;
  try {
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
  onTrack?: (stream: MediaStream) => void;
  onState?: (state: RTCPeerConnectionState) => void;
}

export function createPeer(opts: CreatePeerOpts): RTCPeerConnection {
  ensureListener();
  closePeer(opts.sessionId);

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
    onTrack: opts.onTrack,
    onState: opts.onState,
  };
  peers.set(opts.sessionId, entry);

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) emitSignal(entry, { candidate: candidate.toJSON() });
  };
  pc.ontrack = (ev) => {
    const stream = ev.streams[0];
    if (stream && entry.onTrack) entry.onTrack(stream);
  };
  pc.onconnectionstatechange = () => entry.onState?.(pc.connectionState);
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
  return pc;
}

// Add or replace tracks on an existing peer (triggers renegotiation when needed).
export function syncTracks(sessionId: string, stream: MediaStream): void {
  const entry = peers.get(sessionId);
  if (!entry) return;
  const senders = entry.pc.getSenders();
  stream.getTracks().forEach((track) => {
    const sender = senders.find((s) => s.track?.kind === track.kind);
    if (sender) sender.replaceTrack(track).catch(() => {});
    else entry.pc.addTrack(track, stream);
  });
}

export function addMediaTrack(sessionId: string, track: MediaStreamTrack, stream: MediaStream): void {
  const entry = peers.get(sessionId);
  if (!entry) return;
  entry.pc.addTrack(track, stream);
}

export function replaceVideoTrack(sessionId: string, track: MediaStreamTrack | null): void {
  const entry = peers.get(sessionId);
  if (!entry) return;
  const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'video');
  if (sender) sender.replaceTrack(track).catch(() => {});
}

export function replaceAudioTrack(sessionId: string, track: MediaStreamTrack | null): void {
  const entry = peers.get(sessionId);
  if (!entry) return;
  const sender = entry.pc.getSenders().find((s) => s.track?.kind === 'audio');
  if (sender) sender.replaceTrack(track).catch(() => {});
}

export function closePeer(sessionId: string): void {
  const entry = peers.get(sessionId);
  if (!entry) return;
  try {
    entry.pc.ontrack = null;
    entry.pc.onicecandidate = null;
    entry.pc.onnegotiationneeded = null;
    entry.pc.close();
  } catch { /* noop */ }
  peers.delete(sessionId);
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
