// Centralised WebRTC ICE configuration.
// On a closed LAN, host candidates connect directly (sub-30ms). STUN helps if
// cabins sit on different subnets; TURN (self-hosted coturn) is the reliable
// fallback across VLANs / when UDP is blocked. All configurable via Vite env.
const env: Record<string, string | undefined> =
  (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};

const stunUrls = (env.VITE_STUN_URLS ||
  'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const iceServers: RTCIceServer[] = [{ urls: stunUrls }];

if (env.VITE_TURN_URL) {
  iceServers.push({
    urls: env.VITE_TURN_URL.split(',').map((s) => s.trim()).filter(Boolean),
    username: env.VITE_TURN_USERNAME || '',
    credential: env.VITE_TURN_PASSWORD || '',
  });
}

export const rtcConfiguration: RTCConfiguration = {
  iceServers,
  iceCandidatePoolSize: 4,
  bundlePolicy: 'max-bundle',
};
