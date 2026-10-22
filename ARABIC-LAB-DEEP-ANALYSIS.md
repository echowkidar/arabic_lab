# Arabic Language Lab — Deep Analysis, Root-Cause Report & Recommendations
**Taiyar kiya:** full source code review (client + server + electron + infra) ke baad
**Version analyzed:** v1.5.1 (commit `0e5ec6c`)
**Scope:** University ke sabhi language labs ke liye production-grade banana

---

## 0. App ka Purpose (mera samajh — code se)

Ye ek **Language Lab / Classroom Management Software** hai (industry me Sanako, NetSupport School, Robotel, Impero jaisa). Aligarh Muslim University (AMU) Department of Arabic ke 25-cabin lab ke liye bana hai. 3 roles:

- **Student (cabin01..25):** har PC par Electron app background me chalti hai. Login ke baad apna desktop screen + mic continuously professor tak bhejta hai, hand-raise, professor/peer ko call, broadcast dekh sakta hai.
- **Professor:** 25-cabin grid dashboard, kisi bhi cabin ko silent monitor (screen+audio+webcam), 1:1 video/audio call, poori class ya selected cabins ko broadcast (screen+mic+webcam PiP), recording, admin.
- **Admin:** user management, password reset, enable/disable, audit logs.

**Core design intent (architecture doc se):** On-prem LAN, ultra-low latency, WebRTC + self-hosted LiveKit SFU, PostgreSQL + Redis + MinIO, continuous silent monitoring + calls + broadcast + recording.

---

## 1. SABSE BADA FINDING — Design vs Reality ka Gap

Aapke architecture doc (`arabic-lab-software-architecture.md`) aur `infra/docker-compose.yml` me ek **poora professional stack** design hua hai:
LiveKit SFU + PostgreSQL + Redis + MinIO + coturn (TURN/STUN).

**Lekin asli chalne wali app me ye stack use HI NAHI ho raha.** Root `docker-compose.yml` sirf 2 cheezein chalata hai: `server` (SQLite) + `client` (nginx). LiveKit, Redis, MinIO, coturn, Postgres — sab **dead/unused** hain.

Iske bajaye actual implementation ye kar rahi hai:
- **Monitoring (screen):** student `desktopCapturer` se har 1.5s me ek **JPEG screenshot** banata hai → base64 string Socket.IO par bhejta hai. Ye "live video" nahi, slideshow hai.
- **Monitoring (webcam):** base64 JPEG frames har 300ms Socket.IO par.
- **Monitoring/broadcast audio:** `MediaRecorder` ke WebM chunks base64 me Socket.IO par.
- **1:1 calls:** raw WebRTC peer-to-peer (public Google STUN se), bina TURN.

> **Yahi gap aapke 70% media problems ki jad hai.** Socket.IO par JPEG-frames + MediaRecorder-chunks real-time audio/video ke liye **galat transport** hai. Audio is tarah reliably decode hi nahi hota (neeche §3 me detail), aur video choppy + CPU-heavy + non-scalable hai.

**Sabse high-leverage fix:** jo LiveKit/WebRTC SFU aapne pehle se design kiya hua hai, usko actually adopt karein — monitor, broadcast, aur calls teeno ke liye. Isse audio, webcam, smoothness, 25-cabin scalability aur recording ek saath theek ho jata hai. (Detail §6)

---

## 2. Aapke Reported Issues — ek-ek ka Root Cause + Fix

### Issue A — Student desktop par video play kare to uski awaaz Professor ko nahi aati
**Root cause (do alag bugs):**
1. **Desktop/system audio kabhi capture hi nahi hota.** Student side par sirf **microphone** uthaya jata hai:
   - `StudentCabinView.tsx:225` → auto `getUserMedia({ audio: true })` = sirf mic.
   - "Listen" feature (`silent-audio-chunk`) `MediaRecorder(hardwareStream)` use karta hai = wahi mic.
   - System/loopback audio (jo video/file play karne par aata hai) kisi bhi stream me nahi hai.
2. **Mic audio bhi theek se nahi bajta** — Professor side (`SilentMonitorModal.tsx:141`) har 600ms MediaRecorder chunk par alag se `decodeAudioData()` karta hai. WebM/Opus me **sirf pehle chunk me header hota hai**; baaki chunks akele decode nahi hote → silent fail (`() => {}`). Isliye listening glitchy/band rehti hai.

**Fix:**
- Electron me **system/loopback audio** capture karein: `setDisplayMediaRequestHandler` me `audio: 'loopback'` (Windows par supported), ya `chromeMediaSource: 'desktop'` ke saath audio. Fir mic + system audio ko mix karke bhejein.
- Audio transport badlein: **WebRTC/LiveKit audio track** use karein (sabse accha). Agar MediaRecorder hi rakhna hai to receiver par **MediaSource Extensions (`SourceBuffer.appendBuffer`)** se chunks ko ek continuous stream me jodein — `decodeAudioData` per-chunk kabhi nahi.

---

### Issue B — Student ka camera Professor ko nahi dikhta jab call na ho rahi ho
**Root cause:** Webcam `<video>` element (`webcamVideoRef`) ko stream sirf tab milta hai jab student **manually** "Connect Windows Headphone & Webcam" button dabaye (`handleToggleHardware`). Auto-effect (`:222`) sirf `{audio:true}` leta hai — **video nahi**. Aur webcam frames tab hi jaate hain jab professor webcam toggle kare *aur* video element me stream ho (`videoWidth>0`). Dono conditions normally false → grid/monitor me camera kabhi nahi dikhta.

**Fix:**
- Student login par webcam **auto-acquire** karein (audio+video), ek hidden `<video>` hamesha feed rahe.
- Webcam ko continuously (ya professor ke demand par) stream karein — behtar: **WebRTC video track** jo hamesha monitor-room me publish ho. Grid me webcam thumbnail dikhayein.

---

### Issue C — Jab Professor call kare to Student side auto-receive ho
**Root cause:** `App.tsx:132` par `incoming-call` har kisi ko ek **full-screen manual Accept/Decline modal** dikhata hai. Koi auto-accept logic nahi — student ko click karna padta hai.

**Fix:** Student side par jab `incoming-call` aaye aur `fromRole === 'PROFESSOR'`, turant `call-response({accepted:true})` emit karke `CallModal` khol do (chhota "Professor connected" toast dikha sakte ho). Student↔student ke liye manual rakh sakte ho.

---

### Issue D — Call/Broadcast me Professor file play kare to Students sunein; aur Students apne desktop se play/pause/repeat kar sakein
**Do hisse hain:**

**D1. File/desktop audio students tak nahi pahunchti** — wahi root cause jaisa Issue A:
- Broadcast audio sirf **mic** se banta hai (`BroadcastStudioModal.tsx:485`, `micStreamRef`). Electron screen-capture `audio:false` (`:124`) se leta hai, to desktop/file audio capture hi nahi hoti.
- 1:1 call me screen-share `getDisplayMedia({ video:true, audio:false })` (`CallModal.tsx:289`) — file audio share nahi hoti.
- Viewer side wahi per-chunk `decodeAudioData` bug (`BroadcastViewerModal.tsx:127`) → audio waise bhi toot-ta hai.

**Fix:** system/loopback audio capture karo + audio ko WebRTC track (ya MSE) se bhejo. Screen-share ke saath audio track bhi add karo.

**D2. Students apne desktop se play/pause/repeat kar sakein — ye feature exist hi NAHI karta.**
- `StudentCabinView.tsx:499` ka "Play Audio Sample" button sirf `alert('Playing...')` hai — dummy. (Aur Electron me `alert` suppressed hai, to kuch nahi hota.)
- Koi mechanism nahi jisse professor koi audio file students ko bheje jise wo locally control karein.

**Fix:** Ek **"Shared Practice Media"** feature banao:
1. Professor audio/video file upload/select kare → server par store (ya LAN URL).
2. Professor `load-practice-media` event target students (individual/class) ko bheje (file URL + metadata).
3. Student UI me ek player (play / pause / repeat / seek / speed) aaye jo file **locally student ke PC par** bajaye — har student apna control kare.
4. Optional: "Play for all (synced)" mode jisme professor ka play/pause sab par sync ho (teacher-controlled).

---

### Issue E — Jab Student call kare to Professor ka desktop waisa hi rahe; chhota accept/reject button ho
**Root cause:** Professor ko bhi wahi **full-screen `modal-backdrop` overlay** (`App.tsx:490`) dikhta hai jo poora screen block kar deta hai. Professor apna kaam continue nahi kar sakta, aur manually click karna padta hai. Ye aapki requirement ke bilkul ulat hai.

**Fix:** Direction ke hisaab se alag UI:
- **Professor par incoming student call** = ek chhota corner **toast/pill** (accept ✓ / reject ✕) jo grid ke upar float kare, baaki desktop block na kare. Professor apna monitoring jaari rakhe.
- **Student par incoming professor call** = auto-accept (Issue C).

---

### Issue F — Professor ko sabhi students ka desktop + webcam + mic + desktop-audio lagatar monitor ho; kisi ek ko silently deeply monitor kar sake (student ko pata na chale)
**Current state:**
- Screen grid kaam karta hai **par JPEG slideshow (1.5s/frame)** — laggy, real video nahi.
- Webcam continuous **nahi** (Issue B).
- Mic ka **VU level** dikhता hai, par actual audio listening toota hua (Issue A), aur desktop audio bilkul nahi.
- Individual "silent monitor" exist karta hai (student ko UI alert nahi aata — achha), par usme audio/webcam/recording bugs hain.
- **Scalability bug:** single-view "25 FPS" mode student se `desktopCapturer.getSources()` har **40ms** maangta hai (`StudentCabinView.tsx:194`). Ye call bahut heavy hai (sochne me 100-300ms) → 25fps milega hi nahi, ulta CPU spike/freeze. 25 cabins × base64 JPEG Socket.IO par = bandwidth + server memory bhaari.

**Fix:** Monitoring ko **LiveKit/WebRTC SFU + simulcast** par le jao:
- Har student login par screen(+system audio) + webcam + mic tracks ek **monitor-room** me continuously publish kare.
- Professor grid ke liye **low-res simulcast layer** subscribe kare (25 chote feeds), single-view me **high-res layer**.
- Silent by design — student UI me kuch nahi badlta.
- Isse smoothness, 25-cabin scale, real audio, aur webcam — sab ek saath theek.

---

### Issue G — Student app open karke professor se communicate kare, warna background me chale
**Current state (ye mostly kaam karta hai):** Electron window close par tray me chhup jati hai (`main.cjs:179`), boot par auto-start, single-instance lock, exit ke liye Admin PIN, background throttling disabled. To background me chalti rehti hai aur capture jaari rehta hai. ✔

**Chhoti kamiyan:**
- `alert`/`confirm` globally suppress (`main.cjs:166`) — isliye koi real confirmation/dialog kaam nahi karega aur "Play Audio Sample" jaise buttons silently dead hain.
- Student ke liye quick-access (tray se hand-raise / call professor) nahi hai; app khol kar hi communicate kar sakta hai.
- Admin PIN **hardcoded `123456`** renderer HTML me plain (`main.cjs:251`) — koi bhi dekh/bypass kar sakta hai.

**Fix:** alert ko blanket suppress mat karo — sirf jahan loop issue tha wahan handle karo. Tray me student ke liye "Raise Hand" / "Call Professor" shortcuts do. Admin PIN server-side verify karao (neeche security §5).

---

## 3. Aur Bugs jo maine dhoonde (reported se alag)

### 🔴 Major / Critical

1. **Audio decode-per-chunk bug (core):** `SilentMonitorModal.tsx:141` aur `BroadcastViewerModal.tsx:127` dono har MediaRecorder chunk par `decodeAudioData` karte hain. WebM container me sirf pehla chunk self-decodable hota hai → listening aur broadcast audio dono fundamentally tooti hui hain. (Fix §2-A)

2. **Silent-monitor recording BLANK + silent aati hai:** `startRecording()` (`SilentMonitorModal.tsx:317`) `canvas.captureStream(30)` record karta hai. Par jab live screen `<img>` (liveScreenData) dikh raha hota hai to canvas render loop **early-return** karta hai (`:215`) → canvas blank/stale. Aur recording me **koi audio track nahi**. Natija: recordings blank + silent. Grid/call recording ka bhi koi composite nahi.

3. **`call-ended` sabki calls kaat deta hai:** `socket.ts:320` server par `socket.broadcast.emit('call-ended-by-peer', ...)` **har client** ko bhejta hai, aur `App.tsx:146` har client `activeCall=null` kar deta hai. Agar 2 alag calls chal rahi hon aur ek end ho, to **dusri bhi band** ho jaegi.

4. **Socket.IO par koi authentication nahi (surveillance data expose):** `register-session` (`socket.ts:62`) kisi bhi connection ko bina token-verify PROFESSOR/ADMIN bana sakta hai aur `cabin-snapshot` + sab cabins ke screen/webcam/audio frames le sakta hai. LAN par koi bhi device sabko dekh sakta hai. Aur `cabin-screen-frame`/`cabin-webcam-frame` me ye check nahi ki socket us cabinNumber ka maalik hai — koi student doosri cabin ke frames spoof/overwrite kar sakta hai. **Ye surveillance system me sabse serious hole hai.**

5. **Performance / scalability:** base64 screenshots server `cabinStates` me store hote hain aur sab professors ko emit + `cabin-snapshot` me ek saath 25 JPEG blobs — bhaari payloads. 40ms desktopCapturer loop CPU spike. 25-cabin par ye smooth nahi chalega.

### 🟠 Moderate

6. **Web-kiosk (.bat) students ka screen monitor nahi hota:** screen capture sirf `electronAPI` par depend karta hai (`StudentCabinView.tsx:155`). `/api/download/cabin-setup` wali browser-kiosk cabins me `electronAPI` undefined → inka screen/webcam kabhi stream nahi hoga. Do alag code-paths inconsistent hain.

7. **Fake/simulated mic levels:** jab real hardware active nahi (`StudentCabinView.tsx:249`) to har 600ms random 8–52 "audio level" bheja jata hai. Professor ko lagega student bol raha hai jabki silence hai. "Speaking" filter meaningless ho jata hai.

8. **STUN-only, no TURN:** `CallModal.tsx:53` sirf public Google STUN. Isolated LAN (no internet) me STUN unreachable; same-subnet host candidates se chal jaega par different VLAN/subnet par calls fail ho sakti hain. Designed `coturn` use nahi ho raha.

9. **Electron 22 (EOL, Chromium 108):** purana. Modern `getDisplayMedia` loopback-audio aur WebRTC features limited. Upgrade recommended.

10. **`unsafely-treat-insecure-origin-as-secure` me hardcoded IP `10.0.93.68`** (`main.cjs:13`) — har deployment par change karna padega; configurable hona chahiye.

### 🟡 Minor

11. **Auto-updater insecure:** HTTP par exe download karke silently run karta hai, bina signature/hash verify (`main.cjs:355`). LAN MITM malicious exe push kar sakta hai. Version compare `!==` hai → downgrade bhi trigger karta hai.
12. **Secrets committed:** `JWT_SECRET` dono docker-compose me plain, `livekit.yaml` me LiveKit key, Postgres/MinIO passwords. Git me nahi hone chahiye.
13. **`pingTimeout(5000) < pingInterval(10000)`** (`server.ts:31`) — ulta hai; load par premature disconnect ho sakta hai.
14. **`loadLabData` merge** (`App.tsx:57`) stale `online`/`screenData` ko OR-merge karta hai — cabin offline hone ke baad bhi purana screen/online dikh sakta hai jab tak snapshot overwrite na kare.
15. **MonitoringLog ka `endedAt` kabhi set nahi hota** — audit me sirf start time, duration track nahi.
16. **`lucide-react: ^1.43.0`** (`client/package.json`) version odd lagta hai (lucide-react normally 0.x). Verify karo ki sahi package resolve ho raha hai.
17. **Cosmetic/jhoothe labels:** "1080p @ 60fps • Sub-15ms LAN", "AMU LAN SFU" — jabki na 60fps hai na SFU. Confusion paida karte hain; real metrics ya hata do.
18. **Simulation mode** production me real cabin states ko random data se overwrite kar deta hai (`App.tsx:286`) — galti se on reh jaaye to professor ko fake data dikhega.

---

## 4. Security & Privacy (University deployment ke liye zaroori)

- **Socket auth lagao:** Socket.IO `io.use()` middleware me JWT verify karo; `register-session` ka role/cabin token se lo, client se nahi. Professor streams sirf verified professors ko. Cabin frames sirf us cabin ke owner socket se accept karo. *(Sabse zaroori)*
- **Admin PIN** ko hardcode mat karo; server-verified karo, per-deployment set karo.
- **Secrets** `.env`/secret manager me, git se hata kar rotate karo.
- **TLS:** LAN par bhi self-signed cert + proper secure context (coturn/LiveKit TLS). `ignore-certificate-errors` hatao.
- **Privacy/consent:** monitoring (screen/webcam/mic bina alert) ek legitimate lab feature hai (Sanako/NetSupport bhi karte hain), par university ko ek **signed AUP** chahiye. Aapke paas login par AUP checkbox hai (achha) — ise **mandatory** banao (abhi uncheck karke bhi login ho jata hai), server par timestamp store karo (ho raha hai), aur cabins par ek physical "monitored lab" notice lagao. Audit log (kisne-kab-kisko dekha) bhi hai — ise complete karo (endedAt).

---

## 5. Technology — behtar options

| Area | Abhi | Recommendation |
|---|---|---|
| Continuous media (monitor/broadcast/call) | Socket.IO par base64 JPEG + MediaRecorder chunks | **WebRTC + self-hosted LiveKit SFU** (aapne design kiya hua hai) — simulcast se 25-cabin grid + single-view HD, real audio incl. system audio, webcam, aur **Egress se recording**. Ye ek hi change 6-7 bugs khatam karta hai. |
| System/desktop audio | Capture hi nahi | Electron `getDisplayMedia` **`audio:'loopback'`** (Win) ya mic+system **audio mixing** |
| Calls NAT | Public Google STUN, no TURN | Self-hosted **coturn** (already designed) + LAN host candidates |
| DB | SQLite (single file) | 25-40 seats ke liye SQLite theek hai agar single server; par audit/scale ke liye **PostgreSQL** (already designed) behtar |
| Presence/state | In-memory (restart par gayab, multi-instance safe nahi) | **Redis** (already designed) agar HA chahiye |
| Recording storage | Local `uploads/` disk | **MinIO** (already designed) ya NAS |
| Electron | v22 (EOL) | Latest LTS Electron |
| Student screen grab | 1.5s JPEG screenshots | WebRTC screen track (low-res simulcast layer) |

> **Note:** Aapka original architecture doc bilkul sahi stack recommend karta hai. Problem design me nahi, **implementation us design tak nahi pahunchi** — shortcut (socket.io frames) le liya gaya. Asli kaam: us designed stack ko wire-up karna.

---

## 6. Suggested Priority Roadmap

**P0 (sabse pehle — core functionality + safety):**
1. Socket.IO authentication (JWT) + cabin-ownership checks. *(security)*
2. `call-ended` ko broadcast se hata kar sirf peer ko bhejo. *(sab calls kat-ne wala bug)*
3. Professor→student **auto-accept** + student→professor **chhota corner toast** (Issues C & E).
4. Audio transport fix: system/loopback audio capture + MSE/WebRTC (Issues A & D1).

**P1 (monitoring sahi karo):**
5. Student webcam auto-acquire + continuous stream (Issue B).
6. Continuous monitor ko WebRTC/LiveKit par shift (screen+webcam+mic+system audio), simulcast grid (Issue F + perf).
7. Recording ko live stream se bind karo (audio ke saath) — blank recording fix.

**P2 (teaching features):**
8. Shared Practice Media player (professor push → student play/pause/repeat) (Issue D2).
9. Broadcast ko bhi LiveKit track par; 5fps JPEG hatao.

**P3 (hardening):**
10. coturn/TURN, Electron upgrade, secrets out of git, signed auto-update, mandatory AUP + complete audit, remove simulation/fake-level/cosmetic-false labels, consistent electron-vs-kiosk path.

---

## 7. One-line Summary

App ka **design (architecture doc) industry-grade hai**, lekin **implementation ne LiveKit/WebRTC SFU ko chhod kar Socket.IO par JPEG-screenshots + MediaRecorder-audio-chunks ka shortcut** le liya — aur yahi aapke saare audio (desktop audio na aana, listening tooti), webcam (na dikhna), smoothness aur scale ke issues ki jad hai. Saath me kuch alag bugs (sab-calls-kat-na, blank recordings, no socket auth) aur ek auto-accept/non-intrusive-call UX ka gap hai. Sabse bada, ek hi high-leverage fix — **designed LiveKit stack ko actually adopt karna** — in media problems ka bada hissa ek saath solve kar deta hai.
