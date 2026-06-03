# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server + Express API on port 5174 (HMR for frontend only)
npm run build    # Production build → dist/
npm start        # Production server: node server.js, serves dist/ on PORT (default 3000)
npm run lint     # ESLint
```

**Critical restart rule:** Any change to `api/` or `vite.config.js` requires a **full dev-server restart** — HMR does not pick them up. Schema additions in `api/db.js` take effect on the next restart (all `CREATE TABLE IF NOT EXISTS` are idempotent; `ALTER TABLE` migrations are wrapped in `try/catch`).

**HMR on Windows:** If a component edit doesn't hot-reload, bump the version comment at the top of the file (`// v5` → `// v6`).

**Deploy to Render:** `git push` — Render auto-deploys via `render.yaml`, which installs ffmpeg during the build step and auto-generates `JWT_SECRET`.

## Architecture

### Request flow
```
Browser → Vite dev server :5174
              └─ Express middleware (apiPlugin in vite.config.js)
                      └─ api/routes.js   ← all /api/* handlers
                      └─ /uploads/*      ← static video, thumbnail, avatar files
```
In production, `server.js` mounts the same `registerRoutes()` on a plain Express app serving `dist/`.

### Backend (`api/`)

**`api/db.js`** — Opens `daylo.db` (SQLite, WAL mode). Pragmas set on open: `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`, `cache_size=-8000`, `temp_store=MEMORY`. All schema is defined here with `CREATE TABLE IF NOT EXISTS`. All foreign keys use `ON DELETE CASCADE`. Safe column migrations use `try { db.exec('ALTER TABLE ...') } catch {}`.

| Table | Purpose |
|---|---|
| `users` | Auth: email, username, bcrypt hash, 6-digit code, `avatar` filename, `bio` (text), `notif_prefs` (JSON string, default `{}`), `searchable` (int 0/1, default 1), `color` (hex string, optional — overrides derived color) |
| `friends` | Bidirectional friendship edges |
| `friend_requests` | Pending requests |
| `notifications` | In-app notifications (max 50/user, trimmed on insert) |
| `vlogs` | Videos: filename, processed_filename, duration, clip_count, emoji, title, thumbnail, status |
| `reactions` | Emoji reactions per vlog per user (👍 ❤️ 😂), composite PK prevents duplicates |
| `comments` | Text comments per vlog — `(id, vlog_id, user_id, text, created_at)` |
| `user_groups` | Groups: name, emoji, creator_id, rotation_order (JSON), rotation_idx, last_rotation_date, `description` (text) |
| `group_members` | Group membership — `(group_id, user_id)` |
| `group_messages` | Group chat messages — `(id, group_id, user_id, text, created_at, reply_to_id)`. `reply_to_id` is nullable FK to `group_messages.id`. |
| `group_message_reads` | Per-user last-read timestamp per group — `(group_id, user_id, last_read_at)` |
| `group_message_reactions` | `(message_id, user_id, emoji)` composite PK. Allowed emoji: `👍 ❤️ 😂 😮 🔥 🥺`. |
| `messages` | Direct messages — `(id, from_id, to_id, text, read, created_at)` |
| `push_subscriptions` | Web Push endpoint + keys per user |
| `config` | Key-value store; VAPID key persistence |

**`api/routes.js`** — All `/api/*` endpoints via `registerRoutes(app)`. Key helpers:

- **`requireAuth(req, res)`** — Verifies `Authorization: Bearer <token>`, returns decoded payload or calls `res.status(401).json(...)` and returns `null`. Always call inline — never pass as middleware (Express 5 gotcha).
- **`sanitizeText(s, maxLen)`** — Trims + truncates all user-supplied strings. Call on every text input before DB write.
- **`rateLimit`** middleware — 5 requests/min per IP on `/api/auth/login` and `/api/auth/register`. In-memory `Map`, cleaned every 5 min.
- **`findFfmpeg()`** — Walks the winget package path on Windows; falls back to `'ffmpeg'` in `$PATH` (used on Render).
- **`runKiSchnitt(vlogId, userId, inputPath)`** — Fire-and-forget ffmpeg: colour grade + audio normalisation → `{name}_ki.mp4`, updates `vlogs.status` to `'ready'` or `'failed'`.
- **`notifyFriends(uploaderId, username)`** — Creates in-app `vlog_upload` notification + Resend email + Web Push to all verified friends on upload.
- **`cleanStaleSubscriptions()`** — Called 10 s after startup; removes push subscriptions that return 404/410.
- **`scheduleEveningReminder()`** — Called once at startup; fires push at 18:00 UTC daily to users who haven't uploaded.
- **`addNotification(userId, type, fromId, message)`** — Inserts into `notifications`, then prunes to the latest 50 per user. Types in use: `friend_request`, `friend_accepted`, `group_added`, `vlog_upload`, `vlog_react`, `your_turn`.
- **`formatGroup(g, forUserId?)`** — Joins `group_members` + `users`, parses `rotation_order` JSON, computes `unreadCount` from `group_message_reads`.
- **`advanceGroupRotation(g)`** — Increments `rotation_idx` if `last_rotation_date` ≠ today (called on `GET /api/groups`). Also sends a `your_turn` in-app notification + push to the newly-assigned member.
- **`formatVlog(row, ownerId, viewerId?)`** — Always serves `processed_filename ?? filename`. Embeds reactions with per-viewer `mine` flag.
- **`calcStreak(userId)`** — Consecutive UTC days with ≥1 vlog.

**Express 5 gotcha:** Never pass middleware as extra args to route definitions (`app.get(path, mw, handler)`) — it silently breaks route matching. Use `requireAuth` inline at the top of each handler.

### API surface

```
Auth:      POST /register (rate-limited)  POST /login (rate-limited)  POST /verify (rate-limited)
           GET  /me        PUT  /username   POST /avatar
           PUT  /settings  ← bio, notifPrefs (object), searchable (bool), color (hex)
           POST /change-password  ← { currentPassword, newPassword }
           DELETE /account        ← { password } — cascades all user data
Users:     GET  /users/search?q=…          ← respects searchable=0 (hidden from search)
           GET  /users/:id/profile         ← accessible to friends or group-mates; returns vlogCount, streak, mutualGroups
Presence:  POST /presence/ping    GET /presence?ids=…
Friends:   GET /friends   GET /friends/requests   GET /friends/sent
           POST /friends/request  POST /friends/accept  POST /friends/decline
           DELETE /friends/:id    DELETE /friends/request/:targetId  ← cancel sent request
Groups:    GET  /groups                    ← lists with per-user unreadCount + advances rotation
           GET  /groups/unread-count       ← total unread (MUST be registered before /:id routes)
           POST /groups
           PUT/DELETE /groups/:id
           POST /groups/:id/members        DELETE /groups/:id/members/:userId
           GET  /groups/:id/feed           ← recent vlogs from all members, ?limit=
           GET  /groups/:id/messages       ← fetches with reactions + replyTo preview; marks read
           POST /groups/:id/messages       ← { text, replyToId? }; sends + marks sender read
           POST /groups/:id/messages/:msgId/react  ← { emoji } toggles reaction
Messages:  GET /messages                   ← conversation list (latest msg per partner)
           GET /messages/unread-count      ← MUST be before /:friendId
           GET /messages/:friendId         ← marks received messages read
           POST /messages/:friendId
Vlogs:     POST /vlogs/upload             ← multipart; ?limit=&offset= on GETs
           GET  /vlogs/my   GET /vlogs/user/:userId   ← :userId accessible to friends OR group members
           DELETE /vlogs/:id               ← removes original, _ki.mp4, and thumbnail
           POST /vlogs/:id/react           ← toggles; sends vlog_react notification to owner
           GET  /vlogs/:id/reactors
           GET/POST /vlogs/:id/comments    DELETE /comments/:id
Notifs:    GET /notifications   POST /notifications/mark-read
Push:      GET /push/vapid-key   POST /push/subscribe   DELETE /push/unsubscribe
```

**Route ordering matters:** `GET /api/groups/unread-count`, `GET /api/messages/unread-count`, `GET /api/friends/sent`, and `GET /api/friends/requests` must be registered **before** their respective parameterised siblings (`/:id`, `/:friendId`).

Uploads served from `/uploads/vlogs/<userId>/` and `/uploads/avatars/` via `express.static` (1-day cache headers).

### Frontend providers

`main.jsx` wraps everything in order: `ErrorBoundary > ToastProvider > AuthProvider > Root`. Inside `Root`, when logged in: `AppProvider > ErrorBoundary > App`.

**`src/components/ErrorBoundary.jsx`** — Class component; catches render errors, shows retry/reload UI.

**`src/components/Toast.jsx`** — `ToastProvider` + `useToast()` hook. Call `toast.show(message, type, duration?)` where `type` is `'success' | 'error' | 'info' | 'spark'`. Toasts stack at the top, auto-dismiss with an animated drain bar, and can be **swiped left/right to dismiss early**. Max 4 visible simultaneously (oldest is dropped). The `'spark'` type uses orange styling for celebratory moments.

**`src/components/UserAvatar.jsx`** — Use everywhere instead of hand-rolled avatar divs. Accepts `{ user, size, className, fontSize, border }`. `user.avatar` may be a full URL or just a filename — the `avatarUrl(avatar)` helper (also exported) normalises both. Falls back to an initials + **gradient** on image load error; the gradient pair is deterministic from `user.id` (14 different colour combinations). The `border` prop passes a CSS `border` string directly to the element style.

**`src/components/ProgressRing.jsx`** — SVG circular progress. Accepts `{ progress, size, strokeWidth }`. Has an SVG `feGaussianBlur` glow filter on the progress arc and an animated **tip dot** that tracks the arc end position. At 100%, ring colour switches to green. Use `position: relative` on the wrapper with `width` and `height` set, and `absolute inset-0` on the ring itself.

### Frontend state

Two contexts:

- **`AuthContext`** — `user`, `loading`, `signUp/signIn/signOut/verifyCode/updateUser`. Token stored in `localStorage` as `daylo_token`. Session restored via `GET /api/auth/me` on mount (re-fetches from DB for fresh avatar/username). Registers an `onUnauthorized` listener — auto-calls `signOut()` if any request returns 401.

- **`AppContext`** — All social state + side effects:
  - `friends`, `requests`, `groups`, `myVlogs`, `myStreak`, `notifications`, `presences`, `unreadMessages`, `unreadGroupMsgs`
  - **Single consolidated polling interval (15 s):** unread counts + presence ping every tick; notifications + presence data every 2nd tick; group list every 4th tick. Polling is **paused while the browser tab is hidden** (`document.visibilitychange`).
  - **Vlog polling**: When any vlog has `status === 'processing'`, separately polls `/api/vlogs/my` every 5 s.
  - **`formatUser(u)`** → `{id, name, initials, color, avatar}`. **Avatar is always normalised to a full URL** here (`/uploads/avatars/<filename>`). Color is deterministic from UUID. Always call before storing a user object.
  - **`userCache`** — derived from `me` + `friends` + **all members of all joined groups**. `getUser(id)` therefore resolves non-friend group mates correctly without extra fetches.
  - **`fetchGroupMessages(groupId)`** — calls `GET /api/groups/:id/messages`, immediately zeros local `unreadCount`, refreshes total. Response messages include `reactions[]` and `replyTo` (preview object with `id`, `text`, `from_name`, or `null`).
  - **`updateGroup(id, body)`** — calls `PUT /api/groups/:id` with arbitrary body; supports `name`, `emoji`, `rotation`, `todayIdx`. Use instead of `renameGroup` when changing emoji.
  - **`sendGroupMessage(groupId, text, replyToId?)`** — optional third arg wires up reply threading.

### Navigation

No router library. `App.jsx` owns `view` state: `dashboard | record | reveal | messages | group | profile`. Bottom nav has 5 tabs.

**`RevealView` is rendered as a sibling to `AnimatePresence`**, not inside it — it's a fullscreen fixed-position overlay (`z-50`), so it doesn't need the page-swap animation. All other views go through `<AnimatePresence mode="wait">`.

**`openReveal(userId?, vlogId?)`** — both arguments optional. Passing `vlogId` pre-selects that vlog; `userId = null` shows the current user's own vlogs. Once vlogs are loaded, `RevealView` renders `StoryPlayer` (or a loading/empty state).

**`StoryPlayer`** (defined in `App.jsx`) — Full-screen Instagram-style story viewer:
- Video fills screen (`object-cover`), tap left-third → prev vlog, tap middle → pause/play, tap right-third → next vlog.
- Thin progress bars at top track video playback; clicking a bar jumps to that vlog.
- Mute button top-right; delete button top-right (owner only).
- Reactions as frosted-glass pill buttons over the video.
- Comments open as a bottom sheet (`y: '100%'` → `y: 0` spring animation) with swipe-down to close.
- Delete confirm is a bottom sheet overlay with backdrop blur.

**`StoryRingAvatar`** (defined in `App.jsx`) — Instagram-style story ring avatar used in the Dashboard member strip:
- Gradient green ring = uploaded today; gradient purple ring = "heute dran"; grey ring = no recent upload.
- Pulsing radial gradient behind the avatar when `isToday && !hasUploadedToday`.

**`AnimatedNumber`** (defined in `App.jsx`) — Counts up from 0 to `value` on mount using `requestAnimationFrame` with cubic ease-out. Use for streak badges and duration displays.

**`GoalConfetti`** (defined in `App.jsx`) — 56 particles (mix of circles and rectangles, 8 colours) fall from the top when `active` prop is `true`. Triggered once per session when `todayProgress >= 100`. Uses `useMemo` to generate particles once.

**`GroupView` screens:** `list | create | detail | chat | add-member`. `GroupDetail` receives `onReveal` prop to open any member's vlogs. Chat polls `GET /api/groups/:id/messages` every 5 s while open. Tapping a message bubble reveals a reaction picker (6 emoji + reply button) that slides in above/below the message. Replying sets a `replyTo` state object; the input placeholder changes and a context bar appears above the input. `replyTo` is cleared on send. Emoji changer in `GroupDetail` is a bottom-sheet overlay (`showEmojiPicker` state), only accessible to the group creator. The group list shows a direct-chat button (💬) per card that skips the detail screen.

**`MessagesView`** — `ConversationView` polls `GET /api/messages/:friendId` every 3 s while open. Uses optimistic message insertion with rollback on error. Accepts `initialFriend` prop (a formatted user object) — when provided, the view mounts directly into `ConversationView` for that friend. `App.jsx` passes this via `messageFriend` state, set when the user taps a friend's quick-message button in `ProfileView`. The `key` on `<MessagesView>` includes `messageFriend?.id` so the component remounts cleanly with new initial state.

**`ProfileView` screens:** `main | add-friend | settings | friend-profile`. `ProfileMain` shows an "online" section (friends with `last_seen` < 2 min), sent requests (with cancel), and a quick-message button per friend. Tapping a friend row opens `FriendProfileScreen` which fetches `GET /api/users/:id/profile` for vlogCount, streak, and mutual groups. `SettingsScreen` has internal sub-view state (`main | change-password | delete-account`) navigated with `AnimatePresence`. Settings are saved optimistically for toggles (notifications, searchable) and explicitly for profile fields (username, bio, accent color). The `ACCENT_COLORS` array of 12 hex values is the only allowed palette for the stored `color` field.

### Video recording & 24 h clip collection

1. `RecordView` records via `MediaRecorder` on a canvas (filter/mirror/zoom/sticker baking).
2. Each clip is persisted to IndexedDB via `src/lib/clipStore.js` — uses a singleton DB handle, `by_date` index for fast queries, auto-purges clips older than 2 days on every `saveClip`.
3. "Fertig" → `TitleScreen` (blurred first-clip thumbnail as fullscreen background, frosted-glass input card) → `ProcessingScreen` (animated dual-spinner → spring-bounce green checkmark with glow on completion).
4. On upload success, IndexedDB clips are deleted via `deleteClips`.
5. Server saves `.webm`, starts `runKiSchnitt` (non-blocking) → `_ki.mp4`, notifies friends.

### Styling

Tailwind CSS v4 via `@tailwindcss/vite` — **no `tailwind.config.js`**. All colours are inline hex:
- Page bg: `#0A0A0B` (or `#060608` for fullscreen sections) · Card: `#141415` · Input: `#1C1C1E` · Border: `#2C2C2E`
- Text: `white` / `#8E8E93` (secondary) / `#3A3A3C` (muted/placeholder)
- Brand: `#7B61FF` (purple) / `#00D9FF` (cyan)
- Status: `#2ECC71` (success/online) / `#FF9F43` (streak/warn) / `#FF453A` (error)

App is mobile-first, `max-w-[390px]`. On `md:` breakpoints it renders as a centred phone-frame card. All animations use Framer Motion.

`src/index.css` defines utility classes: `.no-scrollbar`, `.gradient-text`, `.skeleton` (shimmer animation), `.glow-pulse`. Also overrides iOS autofill background colour and sets `caretColor: #7B61FF` for inputs globally.

## Environment variables

```
RESEND_API_KEY=...   # Email sending. If missing, verification codes are only logged to console.
JWT_SECRET=...       # JWT signing. Fallback: 'daylo-secret-2025' (insecure — always set in prod).
PORT=3000            # Production server port.
```

`render.yaml` sets `generateValue: true` for `JWT_SECRET` so Render auto-generates a secure value.

## Key gotchas

- **`api/` changes require server restart** — Vite HMR does not cover the Express plugin.
- **`requireAuth` always inline** — Express 5 silently breaks route matching when middleware is passed as extra route arguments.
- **Route order** — `GET /api/groups/unread-count` and `GET /api/messages/unread-count` must come before their parameterised siblings (`/:id`, `/:friendId`).
- **Avatar URL normalisation** — `formatUser()` and `avatarUrl()` in `UserAvatar.jsx` both handle raw filenames and full `/uploads/avatars/` paths. Never concatenate `/uploads/avatars/` onto an avatar value that may already be a full URL — use `avatarUrl()`.
- **Today's vlog detection** — Compare `new Date(v.createdAt).toISOString().slice(0, 10)` against `new Date().toISOString().slice(0, 10)` (UTC). The server also uses UTC. Do **not** use `toLocaleDateString` for this comparison.
- **Group rotation** — `advanceGroupRotation` runs server-side on `GET /api/groups`. Rotation index wraps with `% rotation.length`. Always guard against zero-length rotation with `% Math.max(rotation.length, 1)` on the client. `removeMember` shrinks the rotation array and clamps the index.
- **Group message reads** — Both `GET` and `POST /api/groups/:id/messages` upsert into `group_message_reads`. `fetchGroupMessages` in AppContext zeros local `unreadCount` immediately for instant badge updates.
- **`processed_filename` takes precedence** — `formatVlog` always serves `_ki.mp4` if present. `DELETE /vlogs/:id` removes original, processed file, and thumbnail.
- **Comment deletion** — Both the comment author and the vlog owner can delete a comment.
- **Vlog access** — `GET /api/vlogs/user/:userId` is accessible to the owner, to friends, **or** to any user who shares a group with the target. Check both `friends` and `group_members` before returning 403.
- **Group feed** — `GET /api/groups/:id/feed` returns vlogs from all group members. Response includes `ownerName`, `ownerAvatar`, `ownerId` on each vlog object (not present on normal vlog responses).
- **VAPID keys** — Auto-generated and persisted in the `config` table on first run. Deleting them breaks all existing push subscriptions.
- **Push subscription cleanup** — `cleanStaleSubscriptions()` runs 10 s after startup and removes 404/410 endpoints. Invalid subscriptions are also pruned on any failed send.
- **Rate limiting** is in-memory — resets on server restart, not suitable for multi-process deployments.
- **ffmpeg path** — `findFfmpeg()` auto-locates the winget install on Windows; falls back to `ffmpeg` in `$PATH` on Linux/Render.
- **`formatUser` uses stored `color`** — `formatUser(u)` prefers `u.color` over the deterministic `deriveColor(u.id)`. `GET /api/auth/me` now returns `color` (and `bio`, `notif_prefs`, `searchable`) so the logged-in user's stored color is available immediately. Friends fetched via `GET /api/friends` do **not** include `color` — their color is always derived. Only `me` has a storable color.
- **`notif_prefs` is stored as a JSON string** in the DB but sent as an object in `PUT /api/auth/settings` (`{ notifPrefs: { friendRequests: true, ... } }`). Parse with `JSON.parse(user.notif_prefs || '{}')` on the client.
- **`searchable` is returned as a boolean** from `GET /api/auth/me` (converted from int: `fresh.searchable !== 0`), but stored as int 0/1.
- **Group message reactions** — `GET /api/groups/:id/messages` includes `reactions[]` on each message (computed in one extra query using `IN (?)` placeholder expansion). The `mine` flag is per-viewer. Toggling a reaction calls `POST /api/groups/:id/messages/:msgId/react` and returns the full updated `reactions[]` for that message — replace the message in local state, don't refetch all messages.
- **`ProgressRing` gradId uniqueness** — The SVG gradient and filter IDs include the `size` prop (`rg-${size}`, `glow-${size}`) to avoid conflicts when multiple rings render on the same page.
- **`GoalConfetti` uses `useMemo`** — Particles are generated once on component mount. Ensure the component is not unmounted and remounted mid-animation; keep it mounted and toggle `active` prop instead.
- **`StoryPlayer` video autoplay** — The `<video>` element uses `autoPlay playsInline`. Mute state is local to `StoryPlayer` and resets to unmuted when the component mounts.
- **`RevealView` not in `AnimatePresence`** — Because it's a fullscreen fixed overlay, it is rendered as a direct sibling to the `<AnimatePresence mode="wait">` block, not inside it. Moving it inside would cause layout shifts.
