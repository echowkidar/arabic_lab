# Arabic Language Lab Management Software — Technical Architecture & Project Plan

## 0. Category
Ye software category ko industry me **"Language Lab / Classroom Management Software"** kehte hain. Isi tarah ke commercial products: Sanako Connect, NetSupport School, Impero Education Pro, Robotel Smart Class. Aapka requirement inhi products jaisa hai, plus custom video-calling features.

**Compliance note (ek baar padh lein, phir architecture pe chalte hain):**
Screen/audio ka continuous monitoring bina per-session alert ke technically theek hai (jaise ye products karte hain), lekin university ko ek **Acceptable Use Policy (AUP)** banani chahiye jisme students ko batlaya jaye ki "Lab computers professor द्वारा monitor kiye jate hain (screen, audio, webcam) as part of teaching process." Ye ek baar ka signed/acknowledged policy hota hai (login ke time checkbox), per-instance popup nahi. Isse legal risk (wiretapping / privacy laws) kam ho jata hai aur ye industry-standard practice bhi hai. Main isko architecture me ek "consent-on-first-login" flag ke roop me add kar raha hoon — baaki sab aapki spec ke hisaab se hi bana raha hoon.

---

## 1. Functional Requirements (Recap, Organized)

### Professor Side
- Dashboard: sabhi 25 cabins ki live screen thumbnails + audio level indicators grid view me
- Kisi bhi student ki screen + audio + webcam ko bina unhe bataye monitor karna (silent monitor mode)
- Monitoring ke dauran webcam feed ko on/off toggle kar sakein
- Kisi ek student ko 1:1 video call
- Kisi ek student ko 1:1 audio-only call
- Multiple/all students ko group video call
- Group/1:1 call me apni screen share karna, saath me webcam ka round PiP (jo enable/disable ho sake)
- Recording: monitoring session ho ya call — screen + audio + webcam record karne ka button hamesha visible
- Admin panel: student login credentials dekh sakein, password reset kar sakein, account disable/enable kar sakein

### Student Side
- Professor ko video call / audio call kar sakein
- Dusre student ko video/audio call kar sakein (peer-to-peer, professor optional moderation ke sath)
- Apna login (username/password), professor se password reset ho sakta hai
- Normal Arabic learning session UI (simple, distraction-free)

### Non-functional
- **Latency near-zero** — kyunki ye ek physical LAN lab hai (25 cabins, same building/network)
- User-friendly UI dono taraf
- Role-based access: Admin / Professor / Student
- Scalable design (aaj 25 seats, kal doosre lab me 40+ seats bhi ho sakte hain)

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     UNIVERSITY LOCAL NETWORK (LAN)                │
│                                                                     │
│  ┌───────────────┐        ┌───────────────┐     ┌───────────────┐ │
│  │ Student PC 1  │        │ Student PC 2  │ ... │ Student PC 25 │ │
│  │ (Client App)  │        │ (Client App)  │     │ (Client App)  │ │
│  └───────┬───────┘        └───────┬───────┘     └───────┬───────┘ │
│          │  WebRTC media (UDP)    │                     │         │
│          └────────────┬───────────┴─────────────────────┘         │
│                        │                                           │
│               ┌────────▼─────────┐                                 │
│               │   SFU Media       │   <- LiveKit / mediasoup server │
│               │   Server (on-prem)│      (installed on-campus)      │
│               └────────┬─────────┘                                 │
│                        │                                            │
│               ┌────────▼─────────┐        ┌────────────────────┐   │
│               │ Signaling Server  │◄──────►│  Application/API   │   │
│               │ (WebSocket)       │        │  Server (Node.js)  │   │
│               └───────────────────┘        └──────────┬──────────┘  │
│                                                         │            │
│               ┌───────────────┐   ┌───────────────┐  ┌─▼──────────┐│
│               │  PostgreSQL    │   │  Redis         │  │ Local     ││
│               │  (users, logs) │   │ (presence/     │  │ Storage / ││
│               │                │   │  sessions)     │  │ NAS(rec.) ││
│               └───────────────┘   └───────────────┘  └────────────┘│
│                                                                       │
│               ┌───────────────┐                                     │
│               │ TURN/STUN     │  (coturn) - fallback only, LAN me    │
│               │ (coturn)      │   zyada tar direct P2P/SFU relay use │
│               └───────────────┘   hoga isliye latency minimal        │
│                                                                       │
│               ┌───────────────┐                                     │
│               │ Professor      │  Dashboard (grid view, controls,    │
│               │ Console (App)  │  recording, admin panel)            │
│               └───────────────┘                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key architectural decision: On-premise deployment.** Chunki ye ek physical lab hai jahan sab computers same building/LAN par hain, poora media server + signaling + database **university ke andar ek local server (or VM)** par host karna chahiye — cloud round-trip avoid karne se latency **5-20ms** tak reh sakti hai (cloud route se 100-300ms ho sakta). Ye sabse important decision hai low-latency ke liye.

---

## 3. Technology Stack (Industry-Grade)

| Layer | Recommended Tech | Reasoning |
|---|---|---|
| **Real-time media (video/audio/screen)** | **WebRTC** + **LiveKit** (self-hosted SFU) | WebRTC hi industry standard hai ultra-low-latency real-time media ke liye. LiveKit open-source, self-hostable SFU hai jo group calls, screen-share, recording (Egress) sab handle karta hai — mediasoup ya Janus se zyada developer-friendly aur AI-assisted build ke liye better documented. |
| **Signaling** | WebSocket via LiveKit's built-in signaling (ya Socket.io agar custom logic chahiye) | Room join/leave, call invite, presence events ke liye |
| **Client apps** | **Electron desktop app** (Professor console + Student client) built with **React + TypeScript** | Browser-only app me continuous background screen capture + system audio capture browser permissions ki wajah se limited hote hain (tab har baar permission maangega). Electron app OS-level access deta hai (silent, persistent screen/audio capture), jo aapke "bina jankari ke monitor karna" requirement ke liye zaroori hai. |
| **Screen capture (student side)** | Electron `desktopCapturer` API + native audio loopback capture | Continuous stream SFU ko publish karne ke liye |
| **Backend API** | **Node.js + NestJS** (TypeScript) | Structured, scalable, WebRTC/LiveKit SDK ke sath achi tarah integrate hota hai |
| **Database** | **PostgreSQL** | Users, roles, cabins, call logs, recording metadata — relational data ke liye best |
| **Cache / Presence** | **Redis** | Online/offline status, active session tracking, pub-sub events |
| **Recording** | LiveKit **Egress** service (built-in) | Room/track level recording — screen, audio, webcam sab automatically compose ho sakta hai MP4 me |
| **Recording storage** | Local NAS / on-prem object storage (**MinIO** — S3-compatible, self-hosted) | Recordings university ke andar hi rahen (privacy + no cloud cost) |
| **TURN/STUN** | **coturn** (self-hosted) | LAN me zyada zarurat nahi padegi lekin fallback ke liye zaroori (agar kabhi VPN/remote access chahiye ho) |
| **Auth** | JWT + bcrypt password hashing, **RBAC** (Admin/Professor/Student) | Standard secure auth pattern |
| **Admin/Professor Dashboard UI** | React + TailwindCSS + shadcn/ui components | Modern, clean, user-friendly grid dashboard |
| **Reverse proxy / TLS** | Nginx / Caddy | Internal HTTPS, WebSocket proxying |
| **Deployment** | Docker Compose (single on-prem server) ya lightweight Kubernetes (k3s) agar future scaling chahiye | 25 cabins ke liye ek achha spec wala on-prem server (16-32 core, 32-64GB RAM) sufficient hoga |

---

## 4. Feature-by-Feature Architecture

### 4.1 Continuous "Silent Monitoring" (screen + audio + webcam, without student notification)
- Student client (Electron app) login ke turant baad ek **background LiveKit room** ("lab-monitor-room") me apne screen track + mic track + webcam track ko **publish** karta hai, lekin apna **video/audio tile na dikhaye khud ko** (subscribe nahi karta khud se).
- Professor console isi room me **subscriber-only participant** ke roop me join hota hai — kisi bhi cabin ka track subscribe karke dekh/sun sakta hai.
- Professor dashboard grid view: har cabin ka live thumbnail (low-res preview stream, bandwidth bachane ke liye), click karne par full-res + audio unmute.
- Webcam track separate se toggle-able hota hai professor dashboard se (LiveKit track subscription on/off).
- **Important:** Student client UI par koi indicator nahi dikhana hai (per your spec) — lekin recommend hai ki OS-level me ek discreet lab-policy notice login screen par ek baar diya jaye (see Section 0).

### 4.2 1:1 / Group Video & Audio Calls
- Har call ek naya **LiveKit room** create karta hai (dynamic room ID).
- Signaling server call-invite events push karta hai target student/professor ko (WebSocket via Redis pub-sub for real-time delivery).
- Group call = same room me multiple participants join.
- Student-to-student call bhi isi pattern se — professor ko optional "moderator" access diya ja sakta hai (chahe to join/monitor kar sake).

### 4.3 Screen Share with Webcam PiP (Professor → Students)
- Professor apni screen ko ek additional track ke roop me room me publish karta hai (`getDisplayMedia` / Electron equivalent).
- Webcam track alag se publish hota hai — client-side UI usse ek round PiP overlay me render karta hai.
- Professor dashboard se webcam track ko mute/unmute (enable/disable) kiya ja sakta hai — track subscription toggle.
- Same pattern reverse me: jab professor kisi student ki screen access kare, us student ka webcam bhi ek chhota round overlay me dikhega, jise professor apni taraf se enable/disable kar sake.

### 4.4 Recording
- LiveKit **Egress API** use karke:
  - **Room composite recording**: screen + webcam + audio ek single MP4 me automatically compose ho jata hai
  - Professor dashboard/call UI me hamesha ek "Record" button visible ho (monitoring session ho ya call) — button dabate hi Egress request trigger hota hai
- Recordings MinIO (on-prem S3) me save hoti hain, metadata (kis student, kis date, kitni der) PostgreSQL me store hota hai
- Professor apne dashboard se past recordings list/playback kar sake

### 4.5 Admin Panel
- Professor ko ek "Admin" role bhi diya ja sakta hai (ya alag Admin login)
- Features: user list (25 students + professor), password reset (bcrypt re-hash), account enable/disable (soft flag `is_active`), cabin assignment (student ↔ cabin/PC mapping)
- Audit log table: kisne kab kis student ko monitor/record kiya (internal accountability ke liye, university policy compliance)

---

## 5. Core Data Model (simplified)

```sql
users (
  id UUID PK,
  name TEXT,
  username TEXT UNIQUE,
  password_hash TEXT,
  role ENUM('admin','professor','student'),
  cabin_number INT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP
)

sessions (
  id UUID PK,
  user_id UUID FK,
  login_at TIMESTAMP,
  logout_at TIMESTAMP,
  device_info TEXT
)

calls (
  id UUID PK,
  room_id TEXT,
  type ENUM('1:1_video','1:1_audio','group_video','group_audio'),
  initiated_by UUID FK,
  participants UUID[],
  started_at TIMESTAMP,
  ended_at TIMESTAMP
)

recordings (
  id UUID PK,
  related_call_id UUID FK NULL,
  student_id UUID FK NULL,
  recorded_by UUID FK,   -- professor
  file_path TEXT,        -- MinIO object path
  duration_sec INT,
  created_at TIMESTAMP
)

monitoring_logs (
  id UUID PK,
  professor_id UUID FK,
  student_id UUID FK,
  action ENUM('screen_view','audio_listen','webcam_view'),
  started_at TIMESTAMP,
  ended_at TIMESTAMP
)
```

---

## 6. Latency Optimization Checklist (LAN-specific)

1. **SFU server on-premise**, wired Ethernet (Wi-Fi avoid karein cabins me agar possible ho) — sub-30ms latency easily achievable
2. LiveKit ko **UDP** priority ke sath configure karein (TCP fallback sirf emergency ke liye)
3. Gigabit LAN switch use karein — 25 simultaneous screen streams ke liye bandwidth plan: har stream ~1-2 Mbps (adaptive bitrate) → total ~25-50 Mbps peak, Gigabit switch easily handle karega
4. Hardware video encoding enable karein client PCs par (agar GPU available hai) — CPU load kam hoga
5. Monitoring ke thumbnails ke liye **low-res simulcast layer** use karein (LiveKit simulcast feature) — sirf jab professor kisi ek cabin ko "expand" kare tab high-res layer subscribe ho
6. Database aur signaling bhi same LAN server par — koi external API call na ho real-time path me

---

## 7. Suggested Development Phases

| Phase | Deliverable |
|---|---|
| **Phase 1** | Auth system (login, roles, admin panel: create/disable/reset users) |
| **Phase 2** | Student Electron client: basic login UI + continuous screen/audio/webcam publish to LiveKit room |
| **Phase 3** | Professor dashboard: grid view of all cabins, click-to-view/listen, webcam toggle |
| **Phase 4** | 1:1 and group video/audio calling (both directions: professor↔student, student↔student) |
| **Phase 5** | Screen share with PiP webcam during calls |
| **Phase 6** | Recording (Egress integration) + recordings library UI |
| **Phase 7** | Polish: UI/UX refinement, notifications, network resilience, load testing with 25 concurrent cabins |

---

## 8. Suggested Repo Structure (for AI-assisted build, e.g. Claude Code)

```
arabic-lab-software/
├── apps/
│   ├── student-client/       # Electron + React
│   ├── professor-console/    # Electron + React
│   └── admin-web/            # (optional) browser-based admin panel
├── services/
│   ├── api-server/           # NestJS - auth, users, calls, recordings metadata
│   ├── livekit-server/       # docker-compose config for self-hosted LiveKit
│   └── coturn/               # TURN server config
├── packages/
│   └── shared-types/         # shared TS interfaces (User, Room, Recording, etc.)
├── infra/
│   ├── docker-compose.yml    # postgres, redis, minio, livekit, coturn, api
│   └── nginx/                # reverse proxy config
└── docs/
    └── architecture.md       # ye document
```

---

## 9. Summary — Why this stack

- **WebRTC + LiveKit (self-hosted)** = industry-standard, near-zero latency, handles 1:1, group calls, screen-share, aur recording sab ek hi system se
- **Electron client** = OS-level silent screen/audio/webcam capture, jo browser-only app me possible nahi
- **On-premise deployment on university LAN** = latency ka sabse bada factor — cloud avoid karke local server use karna
- **NestJS + PostgreSQL + Redis** = proven, scalable backend combo jo AI coding tools (Claude Code) achi tarah samajhte hain aur build kar sakte hain
- **MinIO** = recordings university ke andar hi rahen, privacy aur cost dono ke liye behtar

Is document ko aap directly Claude Code ya kisi bhi AI coding assistant ko de sakte hain as a spec — har section ek phase/module ke roop me implement karwaya ja sakta hai.
