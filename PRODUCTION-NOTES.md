# Arabic Lab — Production Rebuild Notes (what changed & how to test)

Yeh rebuild aapke bataye saare issues + report ke bugs theek karta hai. Media ab
**real WebRTC** par hai (Socket.IO sirf signaling), isliye audio/video me lag
na ke barabar hai.

## Bade badlav (summary)
- **Transport:** monitoring (single-view), 1:1 calls, aur broadcast ab WebRTC
  peer connections par (perfect-negotiation). Grid me 25-cabin overview ke liye
  halka JPEG thumbnail (~1 fps) rehta hai — yeh overview ke liye hai, lag ka
  source nahi.
- **Desktop/system audio:** Electron ab `getDisplayMedia` par
  `audio:'loopback'` deta hai, aur client mic + system audio ko ek track me mix
  karta hai. Ab student/professor jo file ya video desktop par bajaye, uski
  awaaz doosri taraf sunai deti hai (calls, monitoring, broadcast — teeno me).
- **Webcam continuous:** student login par mic + webcam auto-on; professor ko
  monitoring/broadcast me webcam PiP track milta hai (alag se chaalu karne ki
  zaroorat nahi).
- **Auto-receive:** professor student ko call kare to student side **apne-aap
  receive** ho jata hai.
- **Non-intrusive incoming call:** student professor ko call kare to professor
  ko ek chhota corner toast (accept/reject) milta hai — desktop block nahi hota.
- **Practice media:** professor audio/video file push kar sakta hai; student
  apne PC par play/pause/repeat/seek/speed control karta hai (student-paced) ya
  professor sabke liye sync play/pause kare (teacher-led).
- **Security:** Socket.IO par ab **JWT auth** — role/cabin token se, client se
  nahi. Cabin frames sirf us cabin ka owner bhej sakta hai.
- **Fixed bugs:** "ek call khatam hone par sabki calls katna" theek; recording
  ab asli live stream + audio capture karti hai (blank nahi); fake random audio
  levels hata diye; 40ms CPU-spike loop hata diya.

## Nayi/badli files
- Client services: `rtcConfig.ts`, `mediaCapture.ts`, `rtcEngine.ts` (naye),
  `socket.ts` (JWT auth), `api.ts` (+practice media).
- Client components: `App.tsx`, `Navbar.tsx`, `CallModal.tsx`,
  `IncomingCallToast.tsx` (naya), `StudentCabinView.tsx`, `SilentMonitorModal.tsx`,
  `BroadcastStudioModal.tsx`, `BroadcastViewerModal.tsx`,
  `PracticePlayer.tsx` (naya), `PracticeMediaModal.tsx` (naya).
- Server: `socket.ts` (auth + WebRTC relay + control + fixes),
  `controllers/media.controller.ts` (naya), `server.ts` (media routes/static).
- Electron: `main.cjs` (loopback audio, configurable LAN origins).

## Naye optional env vars
Client (`.env` ya build-time):
- `VITE_STUN_URLS` — comma list (default Google STUN).
- `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_PASSWORD` — agar cabins
  alag subnet/VLAN par ho to self-hosted coturn (infra me pehle se defined).
Electron:
- `LAB_LAN_ORIGINS` — insecure-origin whitelist (default me LAN IP + localhost).
Server:
- `MEDIA_DIR` — practice media folder (default `./uploads/media`).

## Build (aapki Windows machine par)
```
cd client && npm run build
cd ../server && npm run build
npm run dist:win   # (root) Electron installer banane ke liye
```
(Is Linux bridge me vite ka `rollup` native binary missing tha, isliye yahan
bundle verification alternate folder me chalayi — Windows par seedha chalega.
TypeScript dono taraf clean compile hota hai.)

## Lab hardware test checklist (zaroori — live A/V yahीं validate hoga)
1. Professor + 2 student cabins (Electron app) login karein.
2. **Monitoring:** professor kisi cabin ka Monitor khole → live screen + webcam
   PiP + awaaz aani chahiye. Student apne desktop par koi video chalaye → uski
   awaaz professor ko aani chahiye.
3. **Auto-receive:** professor student ko call kare → student side bina click
   ke connect ho jaye.
4. **Non-intrusive:** student professor ko call kare → professor ko corner toast
   mile, grid chalta rahe.
5. **Screen share in call:** call me professor screen share + file play kare →
   student ko screen + awaaz dono.
6. **Broadcast:** "Class Broadcast" → selected/all cabins me professor screen +
   voice + desktop audio + webcam PiP.
7. **Practice media:** "Practice Media" se audio upload → push → student side
   player me play/pause/repeat. "Teacher-led" me professor ka play/pause sab par.
8. **Recording:** monitor me Record → ruk kar Recordings me screen+audio ke saath
   save hona chahiye (blank nahi).

## Known limitations / recommendations
- **Mesh scaling:** live WebRTC monitoring single-cabin focus ke liye hai (grid
  thumbnails se continuous overview). Agar aapko ek saath **25 cabins ka live HD
  A/V** chahiye, to self-hosted **LiveKit SFU** (infra/ me pehle se defined)
  adopt karein — mesh me ek professor PC par 25 live inbound+outbound streams
  bhaari pad sakte hain. Current design production LAN ke liye theek hai.
- **TURN:** flat LAN par zaroorat nahi; multi-subnet/VLAN par coturn set karein
  aur `VITE_TURN_*` dein.
- **Electron 22 (EOL):** latest LTS par upgrade recommended (behtar loopback-audio
  + WebRTC support).
- Secrets (`JWT_SECRET`, DB/MinIO passwords) git se hata kar rotate karein.
