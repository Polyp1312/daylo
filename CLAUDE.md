# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Vite + embedded Express API on same port)
npm run build    # Production build
npm run lint     # ESLint
```

There is no separate backend process. The Express API is embedded directly inside `vite.config.js` as a Vite plugin (`configureServer`). **Changing `vite.config.js` requires a full server restart** — HMR does not pick it up.

**HMR trigger on Windows**: The `Write` tool doesn't always trigger Vite's file watcher. If a component edit doesn't hot-reload, bump the version comment at the top of the file (`// v2` → `// v3`).

## Architecture

### Backend (embedded in Vite)
`vite.config.js` mounts Express middleware on the Vite dev server. All `/api/*` routes live there:
- `POST /api/auth/register` — bcrypt hash, 6-digit verification code, Ethereal email preview
- `POST /api/auth/verify` — validates code, returns JWT
- `POST /api/auth/login` — bcrypt compare, returns JWT
- `GET  /api/auth/me` — validates JWT from `Authorization: Bearer` header
- `GET  /api/users/search?q=&exclude=` — searches verified users by username/email

**Database**: `daylo-db.json` (flat JSON file, `fs.readFileSync`/`writeFileSync`). User shape: `{ id (UUID), email, username, hash, code, verified, createdAt }`.

JWT secret is hardcoded as `daylo-secret-2025`. Token expiry: 30 days. Token stored in `localStorage` under key `daylo_token`.

### Auth flow
`AuthContext` (`src/context/AuthContext.jsx`) handles the JWT lifecycle. On mount it calls `/api/auth/me` to restore the session. Exposes: `signUp`, `verifyCode`, `signIn`, `signOut`, and `user` (the decoded JWT payload: `{ id, email, username }`).

`src/lib/api.js` is the thin fetch wrapper — reads the JWT from localStorage and adds the `Authorization` header automatically.

> `src/lib/supabase.js` and `src/lib/localAuth.js` are legacy stubs — not used anywhere.

### App state
`AppContext` (`src/context/AppContext.jsx`) manages all social data: friends, groups, vlogs. State is **persisted to localStorage namespaced by user ID** (`daylo_app_${uid}`), so multiple accounts on the same browser are fully isolated.

Key helpers:
- `formatUser(u)` — converts a backend user `{ id, email, username }` to a UI object `{ id, name, initials, color }`. Color is deterministically derived from the UUID via `deriveColor()` using a fixed palette. **Always call this before storing a user in friends/members.**
- `getUser(id)` — looks up any user (self or friend) from an in-memory cache.
- `addFriend(userObj)` — takes a **full formatted user object**, not just an ID.
- `addMember(gid, userObj)` — same, takes a full object.

Group rotation: each group has a `rotation` array (member IDs), `todayIdx`, and `lastRotationDate` (ISO date string). `advanceRotation()` bumps `todayIdx` once per calendar day on load.

### Views & routing
There is no router library. Navigation is `useState`-based:
- `main.jsx` renders `<AuthView>` (unauthenticated) or `<App>` wrapped in `<AppProvider>` (authenticated).
- `App.jsx` owns the bottom tab bar and switches between `dashboard`, `record`, `reveal`, `group`, `profile` views via a `view` state string.
- Each view (`GroupView`, `ProfileView`) manages its own sub-screens (`list`, `detail`, `add-member`, etc.) internally with `AnimatePresence mode="wait"`.

All animations use **Framer Motion**. The app is mobile-first, constrained to `max-w-[390px]`.

### Styling
Tailwind CSS v4 via `@tailwindcss/vite` — **no `tailwind.config.js`**. All colors are inline hex values; the design system palette is:
- Background: `#0A0A0B` (page), `#141415` (cards), `#1C1C1E` (inputs), `#2C2C2E` (borders/dividers)
- Text: `white` (primary), `#8E8E93` (secondary), `#3A3A3C` (placeholder)
- Brand: `#7B61FF` (primary purple), `#00D9FF` (cyan accent)

### QR code (mobile preview)
`App.jsx` has a hardcoded `NETWORK_URL = 'http://192.168.178.86:5175'` used for the QR modal. Update this IP when testing on a different network.
