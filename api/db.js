import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_FILE   = path.join(__dirname, '..', 'daylo.db')

const db = new Database(DB_FILE)

// ── Performance & safety pragmas ─────────────────────────────────────────────
db.pragma('journal_mode = WAL')      // concurrent reads, serialised writes
db.pragma('foreign_keys = ON')       // enforce referential integrity
db.pragma('busy_timeout = 5000')     // wait up to 5s instead of throwing SQLITE_BUSY
db.pragma('synchronous = NORMAL')    // fsync only at checkpoints — safe with WAL
db.pragma('cache_size = -8000')      // 8 MB page cache
db.pragma('temp_store = MEMORY')     // temp tables in RAM

// ── Core schema ───────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL COLLATE NOCASE,
    username   TEXT UNIQUE COLLATE NOCASE,
    hash       TEXT NOT NULL,
    code       TEXT,
    verified   INTEGER DEFAULT 0,
    avatar     TEXT,
    last_seen  INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friends (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, friend_id)
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (requester_id, target_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    from_id    TEXT,
    message    TEXT NOT NULL,
    read       INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vlogs (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename           TEXT NOT NULL,
    processed_filename TEXT,
    thumbnail          TEXT,
    title              TEXT,
    duration           REAL DEFAULT 0,
    clip_count         INTEGER DEFAULT 1,
    emoji              TEXT DEFAULT '🎬',
    status             TEXT DEFAULT 'ready',
    created_at         INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reactions (
    vlog_id TEXT NOT NULL REFERENCES vlogs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type    TEXT NOT NULL,
    PRIMARY KEY (vlog_id, user_id, type)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         TEXT PRIMARY KEY,
    vlog_id    TEXT NOT NULL REFERENCES vlogs(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_groups (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    emoji              TEXT DEFAULT '👥',
    creator_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rotation_order     TEXT DEFAULT '[]',
    rotation_idx       INTEGER DEFAULT 0,
    last_rotation_date TEXT DEFAULT '',
    created_at         INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS group_messages (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_message_reads (
    group_id     TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    from_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    read       INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_message_reactions (
    message_id TEXT NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS group_invite_codes (
    code       TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
`)

// ── Indexes ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_notif_user      ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_vlogs_user      ON vlogs(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_friends_user    ON friends(user_id);
  CREATE INDEX IF NOT EXISTS idx_req_target      ON friend_requests(target_id);
  CREATE INDEX IF NOT EXISTS idx_req_requester   ON friend_requests(requester_id);
  CREATE INDEX IF NOT EXISTS idx_reactions_vlog  ON reactions(vlog_id);
  CREATE INDEX IF NOT EXISTS idx_push_user       ON push_subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_comments_vlog   ON comments(vlog_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_group_members_u ON group_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_gmsgs_group     ON group_messages(group_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_pair   ON messages(from_id, to_id);
  CREATE INDEX IF NOT EXISTS idx_messages_to     ON messages(to_id, read);
  CREATE INDEX IF NOT EXISTS idx_gmsg_reactions  ON group_message_reactions(message_id);
`)

// ── Premium codes ─────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS premium_codes (
    code       TEXT PRIMARY KEY,
    max_uses   INTEGER DEFAULT -1,
    used_count INTEGER DEFAULT 0,
    reward     TEXT    NOT NULL DEFAULT 'premium_lifetime',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS code_redemptions (
    code    TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redeemed_at INTEGER NOT NULL,
    PRIMARY KEY (code, user_id)
  );
`)
// Seed the "winner" code (unlimited uses) if not already present
db.prepare(`INSERT OR IGNORE INTO premium_codes (code, max_uses, reward, created_at) VALUES (?,?,?,?)`)
  .run('winner', -1, 'premium_lifetime', Date.now())

// ── Safe column migrations (idempotent) ───────────────────────────────────────
const migrations = [
  'ALTER TABLE vlogs ADD COLUMN title TEXT',
  'ALTER TABLE vlogs ADD COLUMN thumbnail TEXT',
  "ALTER TABLE vlogs ADD COLUMN status TEXT DEFAULT 'ready'",
  'ALTER TABLE vlogs ADD COLUMN processed_filename TEXT',
  'ALTER TABLE users ADD COLUMN avatar TEXT',
  'ALTER TABLE group_messages ADD COLUMN reply_to_id TEXT',
  'ALTER TABLE user_groups ADD COLUMN description TEXT',
  'ALTER TABLE users ADD COLUMN bio TEXT',
  "ALTER TABLE users ADD COLUMN notif_prefs TEXT DEFAULT '{}'",
  'ALTER TABLE users ADD COLUMN searchable INTEGER DEFAULT 1',
  'ALTER TABLE users ADD COLUMN color TEXT',
  'ALTER TABLE users ADD COLUMN reset_token TEXT',
  'ALTER TABLE users ADD COLUMN reset_token_expires INTEGER',
  "ALTER TABLE vlogs ADD COLUMN visibility TEXT DEFAULT 'friends'",
  'ALTER TABLE users ADD COLUMN premium INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN streak_freeze_month TEXT',
]
for (const sql of migrations) {
  try { db.exec(sql) } catch { /* column already exists */ }
}

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
        for (const fid of u.friendIds ?? [])       iFriend.run(u.id, fid)
        for (const rid of u.pendingRequests ?? []) iReq.run(rid, u.id)
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

export default db
