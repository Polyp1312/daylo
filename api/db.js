import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_FILE   = path.join(__dirname, '..', 'daylo.db')

const db = new Database(DB_FILE)
db.pragma('journal_mode = WAL')   // concurrent reads, serialized writes
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL COLLATE NOCASE,
    username   TEXT UNIQUE COLLATE NOCASE,
    hash       TEXT NOT NULL,
    code       TEXT,
    verified   INTEGER DEFAULT 0,
    last_seen  INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friends (
    user_id   TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    requester_id TEXT NOT NULL,
    target_id    TEXT NOT NULL,
    PRIMARY KEY (requester_id, target_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    type       TEXT NOT NULL,
    from_id    TEXT,
    message    TEXT NOT NULL,
    read       INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vlogs (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    filename   TEXT NOT NULL,
    duration   REAL DEFAULT 0,
    clip_count INTEGER DEFAULT 1,
    emoji      TEXT DEFAULT '🎬',
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_vlogs_user ON vlogs(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
  CREATE INDEX IF NOT EXISTS idx_req_target ON friend_requests(target_id);
  CREATE INDEX IF NOT EXISTS idx_req_requester ON friend_requests(requester_id);
`)

// Safe column migrations — silently ignore if column already exists
for (const sql of [
  'ALTER TABLE vlogs ADD COLUMN title TEXT',
  'ALTER TABLE vlogs ADD COLUMN thumbnail TEXT',
  "ALTER TABLE vlogs ADD COLUMN status TEXT DEFAULT 'ready'",
  'ALTER TABLE vlogs ADD COLUMN processed_filename TEXT',
]) { try { db.exec(sql) } catch {} }

db.exec(`
  CREATE TABLE IF NOT EXISTS reactions (
    vlog_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type    TEXT NOT NULL,
    PRIMARY KEY (vlog_id, user_id, type)
  );
  CREATE INDEX IF NOT EXISTS idx_reactions_vlog ON reactions(vlog_id);

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

// ── Migrate old daylo-db.json (runs once, then renames the file) ───────────────
const OLD = path.join(__dirname, '..', 'daylo-db.json')
if (fs.existsSync(OLD)) {
  try {
    const old = JSON.parse(fs.readFileSync(OLD, 'utf8'))
    const iUser   = db.prepare(`INSERT OR IGNORE INTO users (id,email,username,hash,code,verified,last_seen,created_at) VALUES (@id,@email,@username,@hash,@code,@verified,@lastSeen,@createdAt)`)
    const iFriend = db.prepare(`INSERT OR IGNORE INTO friends VALUES (?,?)`)
    const iReq    = db.prepare(`INSERT OR IGNORE INTO friend_requests VALUES (?,?)`)
    const iNotif  = db.prepare(`INSERT OR IGNORE INTO notifications (id,user_id,type,from_id,message,read,created_at) VALUES (@id,@userId,@type,@fromId,@message,@read,@createdAt)`)

    db.transaction(() => {
      for (const u of old.users ?? []) {
        iUser.run({
          id: u.id, email: u.email.toLowerCase(), username: u.username ?? null,
          hash: u.hash, code: u.code ?? null, verified: u.verified ? 1 : 0,
          lastSeen: u.lastSeen ?? null, createdAt: u.createdAt ?? Date.now(),
        })
        for (const fid of u.friendIds ?? [])        iFriend.run(u.id, fid)
        for (const rid of u.pendingRequests ?? [])  iReq.run(rid, u.id)
        for (const n of u.notifications ?? []) {
          iNotif.run({
            id: n.id ?? crypto.randomUUID(), userId: u.id, type: n.type,
            fromId: n.fromId ?? null, message: n.message,
            read: n.read ? 1 : 0, createdAt: n.createdAt ?? Date.now(),
          })
        }
      }
    })()

    fs.renameSync(OLD, OLD + '.migrated')
    console.log(`✅ ${(old.users ?? []).length} Nutzer aus daylo-db.json migriert`)
  } catch (e) {
    console.warn('⚠️  JSON-Migration fehlgeschlagen:', e.message)
  }
}

// ── New feature tables ─────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id         TEXT PRIMARY KEY,
    vlog_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    text       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_comments_vlog ON comments(vlog_id, created_at);

  CREATE TABLE IF NOT EXISTS user_groups (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    emoji              TEXT DEFAULT '👥',
    creator_id         TEXT NOT NULL,
    rotation_order     TEXT DEFAULT '[]',
    rotation_idx       INTEGER DEFAULT 0,
    last_rotation_date TEXT DEFAULT '',
    created_at         INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    from_id    TEXT NOT NULL,
    to_id      TEXT NOT NULL,
    text       TEXT NOT NULL,
    read       INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(from_id, to_id);
  CREATE INDEX IF NOT EXISTS idx_messages_to   ON messages(to_id, read);
`)
try { db.exec('ALTER TABLE users ADD COLUMN avatar TEXT') } catch {}

export default db
