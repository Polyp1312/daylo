import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Resend } from 'resend'
import multer from 'multer'
import express from 'express'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import webpush from 'web-push'
import db from './db.js'

const __dirname    = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR  = path.join(__dirname, '..', 'uploads', 'vlogs')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Files land in UPLOADS_DIR temporarily; handler moves them to the user subfolder
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
    cb(null, UPLOADS_DIR)
  },
  filename: (_req, _file, cb) => cb(null, `${Date.now()}.webm`),
})
const upload = multer({ storage, limits: { fileSize: 300 * 1024 * 1024 } })

const JWT_SECRET = process.env.JWT_SECRET || 'daylo-secret-2025'
const resend = new Resend(process.env.RESEND_API_KEY)

// ── VAPID keys (auto-generate once, persist in DB) ─────────────────────────────
let vapidPublicKey  = db.prepare('SELECT value FROM config WHERE key=?').get('vapid_public')?.value
let vapidPrivateKey = db.prepare('SELECT value FROM config WHERE key=?').get('vapid_private')?.value
if (!vapidPublicKey || !vapidPrivateKey) {
  const keys = webpush.generateVAPIDKeys()
  vapidPublicKey  = keys.publicKey
  vapidPrivateKey = keys.privateKey
  db.prepare('INSERT OR REPLACE INTO config VALUES (?,?)').run('vapid_public',  vapidPublicKey)
  db.prepare('INSERT OR REPLACE INTO config VALUES (?,?)').run('vapid_private', vapidPrivateKey)
  console.log('🔑  Neue VAPID-Keys generiert')
}
webpush.setVapidDetails('mailto:daylo@example.com', vapidPublicKey, vapidPrivateKey)

// ── ffmpeg availability check ─────────────────────────────────────────────────
import { existsSync } from 'fs'
import os from 'os'

function findFfmpeg() {
  // Check explicit winget/common install paths on Windows first
  if (os.platform() === 'win32') {
    const localApp = process.env.LOCALAPPDATA ?? ''
    const candidates = [
      path.join(localApp, 'Microsoft', 'WinGet', 'Packages'),
    ]
    for (const base of candidates) {
      try {
        const entries = fs.readdirSync(base).filter(d => d.toLowerCase().startsWith('gyan.ffmpeg'))
        for (const entry of entries) {
          const bin = path.join(base, entry)
          const sub = fs.readdirSync(bin).find(d => d.startsWith('ffmpeg-'))
          if (sub) {
            const exe = path.join(bin, sub, 'bin', 'ffmpeg.exe')
            if (existsSync(exe)) return exe
          }
        }
      } catch {}
    }
  }
  return 'ffmpeg'  // fall back to PATH
}

const FFMPEG_BIN = findFfmpeg()
let ffmpegAvailable = false
;(function checkFfmpeg() {
  const p = spawn(FFMPEG_BIN, ['-version'], { stdio: 'ignore' })
  p.on('error', () => console.log('⚠️  ffmpeg nicht gefunden — KI-Schnitt deaktiviert'))
  p.on('close', code => {
    if (code === 0) { ffmpegAvailable = true; console.log(`✅ ffmpeg gefunden (${FFMPEG_BIN}) — KI-Schnitt aktiv`) }
  })
})()

function processVlogFfmpeg(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vf', 'eq=saturation=1.2:contrast=1.05:brightness=0.02',
      '-af', 'dynaudnorm=f=150:g=15',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', outputPath,
    ]
    const proc = spawn(FFMPEG_BIN, args, { stdio: 'ignore' })
    proc.on('error', reject)
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)))
  })
}

async function runKiSchnitt(vlogId, userId, inputPath) {
  const kiName     = path.basename(inputPath, path.extname(inputPath)) + '_ki.mp4'
  const outputPath = path.join(path.dirname(inputPath), kiName)
  try {
    await processVlogFfmpeg(inputPath, outputPath)
    db.prepare('UPDATE vlogs SET status=?, processed_filename=? WHERE id=?').run('ready', kiName, vlogId)
    console.log(`✅ KI-Schnitt fertig: ${kiName}`)
  } catch (err) {
    console.error(`❌ KI-Schnitt Fehler (${vlogId}):`, err.message)
    db.prepare('UPDATE vlogs SET status=? WHERE id=?').run('failed', vlogId)
  }
}

function authUser(req) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return null
  try { return jwt.verify(auth.slice(7), JWT_SECRET) } catch { return null }
}

// ── Rate limiting (5 requests/min per IP for auth endpoints) ──────────────────
const rateLimits = new Map()
function rateLimit(req, res, next) {
  const ip    = (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown'
  const now   = Date.now()
  const entry = rateLimits.get(ip) ?? { count: 0, resetAt: now + 60_000 }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60_000 }
  entry.count++
  rateLimits.set(ip, entry)
  if (entry.count > 5) return res.status(429).json({ error: 'Zu viele Versuche. Bitte 1 Minute warten.' })
  next()
}
setInterval(() => {
  const now = Date.now()
  for (const [ip, e] of rateLimits) if (now > e.resetAt + 10_000) rateLimits.delete(ip)
}, 300_000)

// ── Group helpers ─────────────────────────────────────────────────────────────
function formatGroup(g) {
  const members  = db.prepare(`SELECT u.id, u.username, u.avatar FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=?`).all(g.id)
  const rotation = JSON.parse(g.rotation_order || '[]')
  return { id: g.id, name: g.name, emoji: g.emoji, creatorId: g.creator_id, memberIds: members.map(m => m.id), members, rotation, todayIdx: g.rotation_idx, lastRotationDate: g.last_rotation_date }
}
function advanceGroupRotation(g) {
  const today    = new Date().toISOString().slice(0, 10)
  const rotation = JSON.parse(g.rotation_order || '[]')
  if (g.last_rotation_date === today || !rotation.length) return
  const newIdx = (g.rotation_idx + 1) % rotation.length
  db.prepare('UPDATE user_groups SET rotation_idx=?, last_rotation_date=? WHERE id=?').run(newIdx, today, g.id)
}

// ── Evening reminder (18:00 UTC daily) ────────────────────────────────────────
async function sendEveningReminder() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const users = db.prepare(`SELECT u.id FROM users u WHERE u.verified=1 AND u.id NOT IN (SELECT user_id FROM vlogs WHERE strftime('%Y-%m-%d', created_at/1000,'unixepoch')=?)`).all(today)
    const payload = JSON.stringify({ title: 'daylo.', body: 'Du hast heute noch keinen Vlog aufgenommen! 🎬' })
    for (const u of users) {
      const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(u.id)
      for (const sub of subs) {
        webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
          .catch(() => db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(sub.endpoint))
      }
    }
    console.log(`📅 Evening reminder → ${users.length} Nutzer`)
  } catch (err) { console.error('Evening reminder error:', err.message) }
}
function scheduleEveningReminder() {
  const now    = new Date()
  const target = new Date(now); target.setUTCHours(18, 0, 0, 0)
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1)
  setTimeout(() => { sendEveningReminder(); setInterval(sendEveningReminder, 24 * 60 * 60 * 1000) }, target - now)
}

// ── Avatar multer ─────────────────────────────────────────────────────────────
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { const d = path.join(__dirname, '..', 'uploads', 'avatars'); fs.mkdirSync(d, { recursive: true }); cb(null, d) },
    filename:    (_req, _file, cb) => cb(null, `${Date.now()}_av.jpg`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
})


function addNotification(userId, type, fromId, message) {
  db.prepare(`INSERT INTO notifications (id,user_id,type,from_id,message,read,created_at) VALUES (?,?,?,?,?,0,?)`)
    .run(crypto.randomUUID(), userId, type, fromId, message, Date.now())
  // Keep only the 50 newest notifications per user
  db.prepare(`DELETE FROM notifications WHERE user_id=? AND id NOT IN (SELECT id FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50)`)
    .run(userId, userId)
}

function formatVlog(row, ownerId, viewerId = null) {
  const rxRows = db.prepare(`
    SELECT type, COUNT(*) as cnt,
           MAX(CASE WHEN user_id=? THEN 1 ELSE 0 END) as mine
    FROM reactions WHERE vlog_id=? GROUP BY type
  `).all(viewerId ?? '', row.id)
  const videoFile = row.processed_filename ?? row.filename
  return {
    id:        row.id,
    url:       `/uploads/vlogs/${ownerId}/${videoFile}`,
    thumbnail: row.thumbnail ? `/uploads/vlogs/${ownerId}/${row.thumbnail}` : null,
    title:     row.title ?? null,
    status:    row.status ?? 'ready',
    duration:  row.duration,
    clipCount: row.clip_count,
    emoji:     row.emoji,
    date:      new Date(row.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    createdAt: row.created_at,
    reactions: rxRows.map(r => ({ type: r.type, count: r.cnt, mine: !!r.mine })),
  }
}

function calcStreak(userId) {
  const dates = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') as d
    FROM vlogs WHERE user_id=? ORDER BY d DESC
  `).all(userId).map(r => r.d)
  if (!dates.length) return 0
  let streak = 0
  for (let i = 0; i < dates.length; i++) {
    const expected = new Date()
    expected.setUTCDate(expected.getUTCDate() - i)
    if (dates[i] === expected.toISOString().slice(0, 10)) streak++
    else break
  }
  return streak
}

async function notifyFriends(uploaderId, username) {
  try {
    const friends = db.prepare(`
      SELECT u.id, u.email FROM friends f
      JOIN users u ON u.id = f.friend_id
      WHERE f.user_id=? AND u.verified=1
    `).all(uploaderId)

    const payload = JSON.stringify({
      title: 'daylo.',
      body:  `${username} hat heute seinen Vlog hochgeladen! 🎬`,
    })

    for (const friend of friends) {
      // Email
      resend.emails.send({
        from: 'daylo. <onboarding@resend.dev>',
        to: friend.email,
        subject: `${username} hat heute seinen Vlog hochgeladen 🎬`,
        html: `<div style="font-family:sans-serif;max-width:400px;margin:auto">
          <h2 style="color:#7B61FF">daylo.</h2>
          <p><strong>${username}</strong> hat heute einen neuen Vlog hochgeladen!</p>
          <p style="color:#999;font-size:12px">Öffne daylo, um ihn anzusehen.</p>
        </div>`,
      }).catch(() => {})

      // Push notifications
      const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(friend.id)
      for (const sub of subs) {
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        ).catch(() => {
          // Remove stale subscription
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(sub.endpoint)
        })
      }
    }
  } catch {}
}

export function registerRoutes(api) {

  // ── Auth ──────────────────────────────────────────────────────────────────────

  scheduleEveningReminder()

  api.post('/api/auth/register', rateLimit, async (req, res) => {
    const { email, password, username } = req.body || {}
    if (!email || !password || !username)
      return res.json({ error: 'Alle Felder ausfüllen.' })
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase()))
      return res.json({ error: 'E-Mail bereits registriert.' })
    if (db.prepare('SELECT id FROM users WHERE username=?').get(username))
      return res.json({ error: 'Nutzername bereits vergeben.' })

    const hash = await bcrypt.hash(password, 10)
    const code = String(Math.floor(100000 + Math.random() * 900000))
    db.prepare(`INSERT INTO users (id,email,username,hash,code,verified,created_at) VALUES (?,?,?,?,?,0,?)`)
      .run(crypto.randomUUID(), email.toLowerCase(), username, hash, code, Date.now())

    console.log(`\n🔑  Verifikationscode für ${email}: ${code}\n`)
    try {
      await resend.emails.send({
        from: 'daylo. <onboarding@resend.dev>', to: email,
        subject: 'Dein daylo Bestätigungscode',
        html: `<div style="font-family:sans-serif;max-width:400px;margin:auto">
          <h2 style="color:#7B61FF">Willkommen bei daylo! 🎬</h2>
          <p>Dein Bestätigungscode:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#7B61FF;padding:20px;background:#f5f5f5;border-radius:12px;text-align:center">${code}</div>
          <p style="color:#999;font-size:12px;margin-top:20px">Gib diesen Code in der App ein.</p>
        </div>`,
      })
    } catch (err) {
      console.warn('Mail-Fehler:', err.message)
    }
    res.json({ success: true })
  })

  api.post('/api/auth/verify', (req, res) => {
    const { email, code } = req.body || {}
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(email?.toLowerCase())
    if (!u) return res.json({ error: 'Benutzer nicht gefunden.' })
    if (u.code !== code) return res.json({ error: 'Falscher Code.' })
    db.prepare('UPDATE users SET verified=1 WHERE id=?').run(u.id)
    const { hash, code: _c, last_seen, ...safe } = u
    safe.verified = true
    const token = jwt.sign(safe, JWT_SECRET, { expiresIn: '30d' })
    res.json({ success: true, token, user: safe })
  })

  api.post('/api/auth/login', rateLimit, async (req, res) => {
    const { email, password } = req.body || {}
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(email?.toLowerCase())
    if (!u) return res.json({ error: 'Kein Konto mit dieser E-Mail gefunden.' })
    if (!await bcrypt.compare(password, u.hash)) return res.json({ error: 'Falsches Passwort.' })
    if (!u.verified) return res.json({ error: 'Bitte bestätige zuerst deine E-Mail.' })
    const { hash, code, last_seen, ...safe } = u
    safe.verified = !!safe.verified
    const token = jwt.sign(safe, JWT_SECRET, { expiresIn: '30d' })
    res.json({ success: true, token, user: safe })
  })

  api.get('/api/auth/me', (req, res) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return res.json({ error: 'Nicht autorisiert.' })
    try {
      const user = jwt.verify(auth.slice(7), JWT_SECRET)
      res.json({ user })
    } catch { res.json({ error: 'Session abgelaufen.' }) }
  })

  api.post('/api/auth/avatar', avatarUpload.single('avatar'), (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    if (!req.file) return res.json({ error: 'Keine Datei.' })
    const finalName = `${me.id}.jpg`
    const finalPath = path.join(__dirname, '..', 'uploads', 'avatars', finalName)
    try { fs.renameSync(req.file.path, finalPath) } catch {}
    db.prepare('UPDATE users SET avatar=? WHERE id=?').run(finalName, me.id)
    res.json({ success: true, avatar: `/uploads/avatars/${finalName}` })
  })

  api.put('/api/auth/username', (req, res) => {
    const me = authUser(req)
    if (!me) return res.json({ error: 'Nicht autorisiert.' })
    const { username } = req.body || {}
    if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username))
      return res.json({ error: 'Nutzername: 3–20 Zeichen, nur Buchstaben, Zahlen und _' })
    if (db.prepare('SELECT id FROM users WHERE username=? AND id!=?').get(username, me.id))
      return res.json({ error: 'Nutzername bereits vergeben.' })
    db.prepare('UPDATE users SET username=? WHERE id=?').run(username, me.id)
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(me.id)
    if (!u) return res.json({ error: 'User nicht gefunden.' })
    const { hash, code, last_seen, ...safe } = u
    safe.verified = !!safe.verified
    const token = jwt.sign(safe, JWT_SECRET, { expiresIn: '30d' })
    res.json({ success: true, token, user: safe })
  })

  // ── Users ─────────────────────────────────────────────────────────────────────

  api.get('/api/users/search', (req, res) => {
    const me = authUser(req)
    if (!me) return res.json({ users: [] })
    const q = `%${(req.query.q ?? '').toLowerCase()}%`
    const results = db.prepare(`
      SELECT u.id, u.username, u.email,
        CASE
          WHEN f.friend_id      IS NOT NULL THEN 'friend'
          WHEN fr_in.requester_id IS NOT NULL THEN 'incoming'
          WHEN fr_out.target_id   IS NOT NULL THEN 'sent'
          ELSE 'none'
        END AS status
      FROM users u
      LEFT JOIN friends         f      ON f.user_id        = ? AND f.friend_id        = u.id
      LEFT JOIN friend_requests fr_in  ON fr_in.target_id  = ? AND fr_in.requester_id = u.id
      LEFT JOIN friend_requests fr_out ON fr_out.requester_id = ? AND fr_out.target_id = u.id
      WHERE u.verified = 1 AND u.id != ?
        AND (LOWER(u.username) LIKE ? OR LOWER(u.email) LIKE ?)
      LIMIT 20
    `).all(me.id, me.id, me.id, me.id, q, q)
    res.json({ users: results })
  })

  // ── Friends ───────────────────────────────────────────────────────────────────

  api.get('/api/friends', (req, res) => {
    const me = authUser(req)
    if (!me) return res.json({ error: 'Nicht autorisiert.' })
    const friends = db.prepare(`
      SELECT u.id, u.username, u.email
      FROM friends f JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ?
    `).all(me.id)
    res.json({ friends })
  })

  api.post('/api/friends/request', (req, res) => {
    const me = authUser(req)
    if (!me) return res.json({ error: 'Nicht autorisiert.' })
    const { targetId } = req.body || {}
    if (!targetId) return res.json({ error: 'Keine targetId.' })
    if (!db.prepare('SELECT id FROM users WHERE id=?').get(targetId))
      return res.json({ error: 'User nicht gefunden.' })
    if (!db.prepare('SELECT 1 FROM friend_requests WHERE requester_id=? AND target_id=?').get(me.id, targetId)) {
      db.prepare('INSERT OR IGNORE INTO friend_requests VALUES (?,?)').run(me.id, targetId)
      const sender = db.prepare('SELECT username FROM users WHERE id=?').get(me.id)
      addNotification(targetId, 'friend_request', me.id, `${sender?.username ?? 'Jemand'} möchte dein Freund sein.`)
    }
    res.json({ success: true })
  })

  api.get('/api/friends/requests', (req, res) => {
    const me = authUser(req)
    if (!me) return res.json({ error: 'Nicht autorisiert.' })
    const requests = db.prepare(`
      SELECT u.id, u.username, u.email
      FROM friend_requests fr JOIN users u ON u.id = fr.requester_id
      WHERE fr.target_id = ?
    `).all(me.id)
    res.json({ requests })
  })

  api.post('/api/friends/accept', (req, res) => {
    const me = authUser(req)
    if (!me) return res.json({ error: 'Nicht autorisiert.' })
    const { requesterId } = req.body || {}
    if (!requesterId) return res.json({ error: 'Keine requesterId.' })
    db.transaction(() => {
      db.prepare('DELETE FROM friend_requests WHERE requester_id=? AND target_id=?').run(requesterId, me.id)
      db.prepare('INSERT OR IGNORE INTO friends VALUES (?,?)').run(me.id, requesterId)
      db.prepare('INSERT OR IGNORE INTO friends VALUES (?,?)').run(requesterId, me.id)
      const accepter = db.prepare('SELECT username FROM users WHERE id=?').get(me.id)
      addNotification(requesterId, 'friend_accepted', me.id,
        `${accepter?.username ?? 'Jemand'} hat deine Freundschaftsanfrage angenommen!`)
    })()
    res.json({ success: true })
  })

  api.post('/api/friends/decline', (req, res) => {
    const me = authUser(req)
    if (!me) return res.json({ error: 'Nicht autorisiert.' })
    const { requesterId } = req.body || {}
    db.prepare('DELETE FROM friend_requests WHERE requester_id=? AND target_id=?').run(requesterId ?? '', me.id)
    res.json({ success: true })
  })

  api.delete('/api/friends/:id', (req, res) => {
    const me = authUser(req)
    if (!me) return res.json({ error: 'Nicht autorisiert.' })
    db.transaction(() => {
      db.prepare('DELETE FROM friends WHERE user_id=? AND friend_id=?').run(me.id, req.params.id)
      db.prepare('DELETE FROM friends WHERE user_id=? AND friend_id=?').run(req.params.id, me.id)
    })()
    res.json({ success: true })
  })

  // ── Presence ──────────────────────────────────────────────────────────────────

  api.post('/api/presence/ping', (req, res) => {
    const me = authUser(req)
    if (!me) return res.json({ error: 'Nicht autorisiert.' })
    db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(), me.id)
    res.json({ success: true })
  })

  api.get('/api/presence', (req, res) => {
    const idList = (req.query.ids ?? '').split(',').filter(Boolean)
    if (!idList.length) return res.json({ presences: {} })
    const placeholders = idList.map(() => '?').join(',')
    const rows = db.prepare(`SELECT id, last_seen FROM users WHERE id IN (${placeholders})`).all(...idList)
    const presences = {}
    for (const r of rows) presences[r.id] = r.last_seen ?? null
    res.json({ presences })
  })

  // ── Notifications ─────────────────────────────────────────────────────────────

  api.get('/api/notifications', (req, res) => {
    const me = authUser(req)
    if (!me) return res.json({ error: 'Nicht autorisiert.' })
    const notifications = db.prepare(
      'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50'
    ).all(me.id).map(n => ({ ...n, read: !!n.read }))
    res.json({ notifications })
  })

  api.post('/api/notifications/mark-read', (req, res) => {
    const me = authUser(req)
    if (!me) return res.json({ error: 'Nicht autorisiert.' })
    db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(me.id)
    res.json({ success: true })
  })

  // ── Vlogs ─────────────────────────────────────────────────────────────────────

  // Upload: multer middleware + auth check inside handler
  api.post('/api/vlogs/upload', upload.single('video'), async (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    if (!req.file) return res.json({ error: 'Keine Videodatei erhalten.' })
    const { duration = 0, clipCount = 1, emoji = '🎬', title, thumbnail } = req.body
    const id = crypto.randomUUID()

    const userDir = path.join(UPLOADS_DIR, me.id)
    fs.mkdirSync(userDir, { recursive: true })
    const finalName = req.file.filename
    const srcPath   = req.file.path
    const destPath  = path.join(userDir, finalName)
    if (srcPath !== destPath) fs.renameSync(srcPath, destPath)

    // Save thumbnail from base64 if provided
    let thumbName = null
    if (thumbnail && thumbnail.startsWith('data:image/')) {
      try {
        const b64 = thumbnail.replace(/^data:image\/\w+;base64,/, '')
        thumbName = finalName.replace('.webm', '_thumb.jpg')
        fs.writeFileSync(path.join(userDir, thumbName), Buffer.from(b64, 'base64'))
      } catch {}
    }

    const vlogTitle  = (title ?? '').trim() || null
    const initStatus = ffmpegAvailable ? 'processing' : 'ready'
    db.prepare(`INSERT INTO vlogs (id,user_id,filename,duration,clip_count,emoji,title,thumbnail,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, me.id, finalName, parseFloat(duration) || 0, parseInt(clipCount) || 1, emoji, vlogTitle, thumbName, initStatus, Date.now())
    const vlog = db.prepare('SELECT * FROM vlogs WHERE id=?').get(id)

    // Start KI-Schnitt in background (non-blocking)
    if (ffmpegAvailable) runKiSchnitt(id, me.id, destPath)

    notifyFriends(me.id, me.username ?? me.email)

    res.json({ success: true, vlog: formatVlog(vlog, me.id, me.id) })
  })

  // My vlogs + streak
  api.get('/api/vlogs/my', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const rows = db.prepare('SELECT * FROM vlogs WHERE user_id=? ORDER BY created_at DESC').all(me.id)
    res.json({ vlogs: rows.map(v => formatVlog(v, me.id, me.id)), streak: calcStreak(me.id) })
  })

  // Another user's vlogs — only accessible to friends
  api.get('/api/vlogs/user/:userId', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const targetId   = req.params.userId
    const areFriends = db.prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?').get(me.id, targetId)
    if (targetId !== me.id && !areFriends)
      return res.json({ error: 'Kein Zugriff.' })
    const rows = db.prepare('SELECT * FROM vlogs WHERE user_id=? ORDER BY created_at DESC').all(targetId)
    res.json({ vlogs: rows.map(v => formatVlog(v, targetId, me.id)), streak: calcStreak(targetId) })
  })

  // Toggle reaction on a vlog
  api.post('/api/vlogs/:id/react', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const { type } = req.body || {}
    if (!['👍', '❤️', '😂'].includes(type)) return res.json({ error: 'Ungültiger Typ.' })
    const exists = db.prepare('SELECT 1 FROM reactions WHERE vlog_id=? AND user_id=? AND type=?').get(req.params.id, me.id, type)
    if (exists) {
      db.prepare('DELETE FROM reactions WHERE vlog_id=? AND user_id=? AND type=?').run(req.params.id, me.id, type)
    } else {
      db.prepare('INSERT OR IGNORE INTO reactions VALUES (?,?,?)').run(req.params.id, me.id, type)
    }
    const rxRows = db.prepare(`
      SELECT type, COUNT(*) as cnt, MAX(CASE WHEN user_id=? THEN 1 ELSE 0 END) as mine
      FROM reactions WHERE vlog_id=? GROUP BY type
    `).all(me.id, req.params.id)
    res.json({ reactions: rxRows.map(r => ({ type: r.type, count: r.cnt, mine: !!r.mine })) })
  })

  // Delete own vlog
  api.delete('/api/vlogs/:id', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const vlog = db.prepare('SELECT * FROM vlogs WHERE id=? AND user_id=?').get(req.params.id, me.id)
    if (!vlog) return res.json({ error: 'Nicht gefunden.' })
    fs.rm(path.join(UPLOADS_DIR, me.id, vlog.filename), () => {})
    db.prepare('DELETE FROM vlogs WHERE id=?').run(req.params.id)
    res.json({ success: true })
  })

  // ── Push Notifications ────────────────────────────────────────────────────────

  api.get('/api/push/vapid-key', (_req, res) => {
    res.json({ key: vapidPublicKey })
  })

  api.post('/api/push/subscribe', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const { endpoint, keys } = req.body || {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.json({ error: 'Ungültige Subscription.' })
    db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), me.id, endpoint, keys.p256dh, keys.auth, Date.now())
    res.json({ success: true })
  })

  api.delete('/api/push/unsubscribe', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const { endpoint } = req.body || {}
    if (endpoint) db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').run(me.id, endpoint)
    res.json({ success: true })
  })

  // ── Comments ──────────────────────────────────────────────────────────────────

  api.get('/api/vlogs/:id/comments', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const comments = db.prepare(`
      SELECT c.id, c.text, c.created_at, u.id as user_id, u.username, u.avatar
      FROM comments c JOIN users u ON u.id=c.user_id
      WHERE c.vlog_id=? ORDER BY c.created_at ASC
    `).all(req.params.id)
    res.json({ comments })
  })

  api.post('/api/vlogs/:id/comments', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const { text } = req.body || {}
    if (!text?.trim()) return res.json({ error: 'Kein Text.' })
    if (text.length > 500) return res.json({ error: 'Max. 500 Zeichen.' })
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO comments (id,vlog_id,user_id,text,created_at) VALUES (?,?,?,?,?)')
      .run(id, req.params.id, me.id, text.trim(), Date.now())
    const c = db.prepare(`SELECT c.id,c.text,c.created_at,u.id as user_id,u.username,u.avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?`).get(id)
    res.json({ comment: c })
  })

  api.delete('/api/comments/:id', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    db.prepare('DELETE FROM comments WHERE id=? AND user_id=?').run(req.params.id, me.id)
    res.json({ success: true })
  })

  // Who reacted to a vlog (for owner)
  api.get('/api/vlogs/:id/reactors', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const rows = db.prepare(`SELECT r.type, u.id, u.username FROM reactions r JOIN users u ON u.id=r.user_id WHERE r.vlog_id=?`).all(req.params.id)
    const byType = {}
    for (const r of rows) {
      if (!byType[r.type]) byType[r.type] = []
      byType[r.type].push({ id: r.id, name: r.username })
    }
    res.json({ reactors: byType })
  })

  // ── Groups ────────────────────────────────────────────────────────────────────

  api.get('/api/groups', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const rows = db.prepare(`SELECT g.* FROM user_groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=? ORDER BY g.created_at ASC`).all(me.id)
    rows.forEach(g => advanceGroupRotation(g))
    const updated = db.prepare(`SELECT g.* FROM user_groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=? ORDER BY g.created_at ASC`).all(me.id)
    res.json({ groups: updated.map(formatGroup) })
  })

  api.post('/api/groups', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const { name, emoji } = req.body || {}
    if (!name?.trim()) return res.json({ error: 'Kein Name.' })
    const id    = crypto.randomUUID()
    const today = new Date().toISOString().slice(0, 10)
    db.transaction(() => {
      db.prepare('INSERT INTO user_groups (id,name,emoji,creator_id,rotation_order,rotation_idx,last_rotation_date,created_at) VALUES (?,?,?,?,?,0,?,?)')
        .run(id, name.trim(), emoji || '👥', me.id, JSON.stringify([me.id]), today, Date.now())
      db.prepare('INSERT INTO group_members VALUES (?,?)').run(id, me.id)
    })()
    const g = db.prepare('SELECT * FROM user_groups WHERE id=?').get(id)
    res.json({ group: formatGroup(g) })
  })

  api.put('/api/groups/:id', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const g = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    if (!g) return res.json({ error: 'Nicht gefunden.' })
    const isMember = db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(req.params.id, me.id)
    if (!isMember) return res.json({ error: 'Kein Zugriff.' })
    const { name, emoji, rotation, todayIdx, lastRotationDate } = req.body || {}
    db.prepare('UPDATE user_groups SET name=?,emoji=?,rotation_order=?,rotation_idx=?,last_rotation_date=? WHERE id=?')
      .run(name ?? g.name, emoji ?? g.emoji, rotation ? JSON.stringify(rotation) : g.rotation_order, todayIdx ?? g.rotation_idx, lastRotationDate ?? g.last_rotation_date, req.params.id)
    const updated = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    res.json({ group: formatGroup(updated) })
  })

  api.delete('/api/groups/:id', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const g = db.prepare('SELECT * FROM user_groups WHERE id=? AND creator_id=?').get(req.params.id, me.id)
    if (!g) return res.json({ error: 'Nicht gefunden oder kein Zugriff.' })
    db.transaction(() => {
      db.prepare('DELETE FROM group_members WHERE group_id=?').run(req.params.id)
      db.prepare('DELETE FROM user_groups WHERE id=?').run(req.params.id)
    })()
    res.json({ success: true })
  })

  api.post('/api/groups/:id/members', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const { userId } = req.body || {}
    if (!userId) return res.json({ error: 'Keine userId.' })
    const isMember = db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(req.params.id, me.id)
    if (!isMember) return res.json({ error: 'Kein Zugriff.' })
    db.prepare('INSERT OR IGNORE INTO group_members VALUES (?,?)').run(req.params.id, userId)
    const g = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    const rotation = JSON.parse(g.rotation_order || '[]')
    if (!rotation.includes(userId)) {
      rotation.push(userId)
      db.prepare('UPDATE user_groups SET rotation_order=? WHERE id=?').run(JSON.stringify(rotation), req.params.id)
    }
    const updated = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    res.json({ group: formatGroup(updated) })
  })

  api.delete('/api/groups/:id/members/:userId', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const g = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    if (!g) return res.json({ error: 'Nicht gefunden.' })
    const isCreator = g.creator_id === me.id
    if (!isCreator && req.params.userId !== me.id) return res.json({ error: 'Kein Zugriff.' })
    db.prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').run(req.params.id, req.params.userId)
    const rotation = JSON.parse(g.rotation_order || '[]').filter(id => id !== req.params.userId)
    const newIdx   = Math.min(g.rotation_idx, Math.max(0, rotation.length - 1))
    db.prepare('UPDATE user_groups SET rotation_order=?,rotation_idx=? WHERE id=?').run(JSON.stringify(rotation), newIdx, req.params.id)
    const updated = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    res.json({ group: formatGroup(updated) })
  })

  // ── Direct Messages ───────────────────────────────────────────────────────────

  api.get('/api/messages/unread-count', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const { count } = db.prepare('SELECT COUNT(*) as count FROM messages WHERE to_id=? AND read=0').get(me.id)
    res.json({ count })
  })

  api.get('/api/messages', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    // Latest message per conversation partner
    const rows = db.prepare(`
      SELECT m.id, m.text, m.from_id, m.to_id, m.read, m.created_at,
        CASE WHEN m.from_id=? THEN m.to_id ELSE m.from_id END as partner_id
      FROM messages m
      WHERE m.from_id=? OR m.to_id=?
      GROUP BY partner_id HAVING m.created_at=MAX(m.created_at)
      ORDER BY m.created_at DESC
    `).all(me.id, me.id, me.id)
    const convos = rows.map(r => {
      const partner = db.prepare('SELECT id, username, avatar FROM users WHERE id=?').get(r.partner_id)
      const unread  = db.prepare('SELECT COUNT(*) as c FROM messages WHERE from_id=? AND to_id=? AND read=0').get(r.partner_id, me.id)?.c ?? 0
      return { ...r, partner, unread }
    })
    res.json({ conversations: convos })
  })

  api.get('/api/messages/:friendId', (req, res) => {
    const me  = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const fid = req.params.friendId
    const msgs = db.prepare(`
      SELECT m.*, u.username as from_name FROM messages m JOIN users u ON u.id=m.from_id
      WHERE (m.from_id=? AND m.to_id=?) OR (m.from_id=? AND m.to_id=?)
      ORDER BY m.created_at ASC LIMIT 100
    `).all(me.id, fid, fid, me.id)
    db.prepare('UPDATE messages SET read=1 WHERE from_id=? AND to_id=? AND read=0').run(fid, me.id)
    res.json({ messages: msgs })
  })

  api.post('/api/messages/:friendId', (req, res) => {
    const me = authUser(req)
    if (!me) return res.status(401).json({ error: 'Nicht autorisiert.' })
    const { text } = req.body || {}
    if (!text?.trim()) return res.json({ error: 'Kein Text.' })
    if (text.length > 1000) return res.json({ error: 'Nachricht zu lang.' })
    const areFriends = db.prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?').get(me.id, req.params.friendId)
    if (!areFriends) return res.json({ error: 'Nur Freunde können Nachrichten senden.' })
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO messages (id,from_id,to_id,text,read,created_at) VALUES (?,?,?,?,0,?)')
      .run(id, me.id, req.params.friendId, text.trim(), Date.now())
    const msg = db.prepare(`SELECT m.*,u.username as from_name FROM messages m JOIN users u ON u.id=m.from_id WHERE m.id=?`).get(id)
    res.json({ message: msg })
  })

  // Serve uploaded video files
  api.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))
}
