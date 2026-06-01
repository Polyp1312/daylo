# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server + Express API on port 5174 (HMR for frontend only)
npm run build    # Production build → dist/
npm start        # Production server: node server.js, serves dist/ on PORT (default 3000)
npm run lint     # ESLint
```

**Critical:** The Express API is embedded in `vite.config.js` as a Vite plugin (`apiPlugin → configureServer`). Any change to `api/` or `vite.config.js` requires a **full dev-server restart** — HMR does not pick them up.

**HMR on Windows:** If a component edit doesn't hot-reload, bump the version comment at the top of the file (`// v4` → `// v5`).

## Architecture

### Request flow
```
Browser → Vite dev server :5174
              └─ Express middleware (apiPlugin in vite.config.js)
                      └─ api/routes.js   ← all /api/* handlers
                      └─ /uploads/*      ← static video + thumbnail files
```
In production, `server.js` mounts the same `registerRoutes()` on a plain Express app serving `dist/`.

### Backend (`api/`)

**`api/db.js`** — Opens `daylo.db` (SQLite, WAL mode). All schema is defined here with `CREATE TABLE IF NOT EXISTS`. Safe column migrations use `try { db.exec('ALTER TABLE ...') } catch {}`. Tables:

| Table | Purpose |
|---|---|
| `users` | Auth: email, username, bcrypt hash, 6-digit verification code |
| `friends` | Bidirectional friendship edges |
| `friend_requests` | Pending requests |
| `notifications` | In-app notifications (max 50/user, trimmed on insert) |
| `vlogs` | Videos: filename, processed_filename, duration, clip_count, emoji, title, thumbnail, status |
| `reactions` | Emoji reactions per vlog per user (👍 ❤️ 😂), composite PK prevents duplicates |
| `push_subscriptions` | Web Push endpoint + keys per user, unique on endpoint |
| `config` | Key-value store; used for VAPID key persistence |

**`api/routes.js`** — All `/api/*` endpoints via `registerRoutes(app)`. Auth is inline (`authUser(req)` → JWT verify). Key helpers at module level:

- **VAPID init**: Keys auto-generated on first run, stored in `config` table, set on `webpush` immediately.
- **`findFfmpeg()`**: Walks the winget package path on Windows to locate `ffmpeg.exe` without relying on `$PATH`.
- **`ffmpegAvailable`**: Set asynchronously at startup via `spawn`. Safe to check in upload handler (uploads happen after user interaction).
- **`runKiSchnitt(vlogId, userId, inputPath)`**: Fires and forgets — runs `ffmpeg` in background, applies colour grade + audio normalisation, saves `{name}_ki.mp4`, updates `vlogs.status` to `'ready'` (or `'failed'`).
- **`notifyFriends(uploaderId, username)`**: Sends both Resend email and Web Push to all verified friends.
- **`calcStreak(userId)`**: Counts consecutive UTC days with at least one vlog, returned in `GET /api/vlogs/my`.
- **`formatVlog(row, ownerId, viewerId?)`**: Always use `processed_filename ?? filename` for the URL. Embeds reactions with per-viewer `mine` flag.

**Express 5 gotcha:** Never pass middleware as extra args to route definitions (`app.get(path, mw, handler)`) — it silently breaks route matching. Inline the auth check instead.

### Frontend state

Two contexts wrap the entire app:

- **`AuthContext`** (`src/context/AuthContext.jsx`) — `user`, `loading`, login/logout/verify. Token stored in `localStorage` as `daylo_token`. Session restored via `GET /api/auth/me` on mount.
- **`AppContext`** (`src/context/AppContext.jsx`) — social state + side effects:
  - Friends, requests, groups, vlogs, streak, notifications, presences
  - **Groups are localStorage-only** (`daylo_groups_{uid}`). The server has no group data. `advanceRotation()` bumps the rotation index once per UTC day on load.
  - **Vlog polling**: When any vlog has `status === 'processing'`, AppContext polls `/api/vlogs/my` every 5 s until all are `'ready'`.
  - **Push setup**: On login, registers `public/sw.js`, requests `Notification` permission, subscribes via `pushManager.subscribe`, POSTs the subscription to `/api/push/subscribe`.
  - `formatUser(u)` converts `{id, email, username}` → `{id, name, initials, color}`. Color is deterministic from UUID. Always call before storing a user in friends/members.

### Navigation

No router library. `main.jsx` renders `<AuthView>` when unauthenticated, `<App>` inside `<AppProvider>` when logged in.

`App.jsx` owns a `view` state string (`dashboard | record | reveal | group | profile`) and a bottom tab bar. Views are swapped via `<AnimatePresence mode="wait">`. `RevealView` is defined inline in `App.jsx` (not a separate file). All other views are in `src/views/`.

Each view (`GroupView`, `ProfileView`) manages its own sub-screen stack internally with a `screen` state + `AnimatePresence`.

### Video upload flow

1. User records clips in `RecordView` via `MediaRecorder` on a canvas (for filter/mirror/zoom/sticker baking).
2. Pressing "Fertig" opens `TitleScreen` (thumbnail preview + text input). User sets optional title, then confirms.
3. `ProcessingScreen` merges clip blobs, uploads via XHR (`api.vlogs.upload`) with real progress %. Sends `title`, `thumbnail` (first clip's base64 frame), `duration`, `clipCount`, `emoji`.
4. Server saves the `.webm`, decodes and saves the thumbnail as `_thumb.jpg`, inserts the DB row with `status='processing'` if ffmpeg is available.
5. `runKiSchnitt` runs in background → produces `_ki.mp4` → updates status.
6. `onDone(vlog)` → `addVlog(vlog)` prepends to `myVlogs` in AppContext.

### Styling

Tailwind CSS v4 via `@tailwindcss/vite` — **no `tailwind.config.js`**. All colours are inline hex values:
- Page bg: `#0A0A0B` · Card: `#141415` · Input: `#1C1C1E` · Border: `#2C2C2E`
- Text: `white` / `#8E8E93` (secondary)
- Brand: `#7B61FF` (purple) / `#00D9FF` (cyan)

App is mobile-first, `max-w-[390px]`. On `md:` breakpoints it renders as a centred phone-frame card with shadow. All animations use Framer Motion.

## Environment variables

```
RESEND_API_KEY=...   # Email sending. If missing, codes are only logged.
JWT_SECRET=...       # JWT signing. Fallback: 'daylo-secret-2025'
PORT=3000            # Production server port.
```

Read by `dotenv/config` at the top of both `server.js` and `api/routes.js`.

## Key gotchas

- **`api/` changes require server restart** — Vite HMR does not cover the Express plugin.
- **Groups are client-side only** — `advanceRotation` runs on load; the server never knows which group a user is in. Push/email notifications go to all friends, not group members.
- **ffmpeg path**: `findFfmpeg()` auto-locates the winget install under `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*`. Falls back to `'ffmpeg'` in `$PATH`.
- **`processed_filename` takes precedence**: `formatVlog` always serves the `_ki.mp4` if present; the raw `.webm` is kept as backup.
- **VAPID keys** are auto-generated and persisted in the `config` table on first run — do not manually delete them or all existing push subscriptions will break.
- **Stale push subscriptions** are deleted on send failure inside `notifyFriends`.
- Dead code in `src/lib/`: `videoDB.js`, `supabase.js`, `localAuth.js` — never imported.
