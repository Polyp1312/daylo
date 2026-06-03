import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Resend } from 'resend'
import multer from 'multer'
import express from 'express'
import path from 'path'
import fs from 'fs'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import os from 'os'
import webpush from 'web-push'
import db from './db.js'

const __dirname   = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'vlogs')
const AVATARS_DIR = path.join(__dirname, '..', 'uploads', 'avatars')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })
fs.mkdirSync(AVATARS_DIR, { recursive: true })

// ── JWT secret ────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'daylo-secret-2025'

// ── Resend email client ───────────────────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY)

// ── VAPID keys (auto-generate once, persist in DB) ────────────────────────────
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

// ── ffmpeg detection ──────────────────────────────────────────────────────────
function findFfmpeg() {
  if (os.platform() === 'win32') {
    const localApp = process.env.LOCALAPPDATA ?? ''
    try {
      const base = path.join(localApp, 'Microsoft', 'WinGet', 'Packages')
      const entries = fs.readdirSync(base).filter(d => d.toLowerCase().startsWith('gyan.ffmpeg'))
      for (const entry of entries) {
        const sub = fs.readdirSync(path.join(base, entry)).find(d => d.startsWith('ffmpeg-'))
        if (sub) {
          const exe = path.join(base, entry, sub, 'bin', 'ffmpeg.exe')
          if (existsSync(exe)) return exe
        }
      }
    } catch {}
  }
  return 'ffmpeg'
}

const FFMPEG_BIN = findFfmpeg()
let ffmpegAvailable = false
;(function checkFfmpeg() {
  const p = spawn(FFMPEG_BIN, ['-version'], { stdio: 'ignore' })
  p.on('error', () => console.log('⚠️  ffmpeg nicht gefunden — KI-Schnitt deaktiviert'))
  p.on('close', code => {
    if (code === 0) { ffmpegAvailable = true; console.log(`✅ ffmpeg (${FFMPEG_BIN}) — KI-Schnitt aktiv`) }
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

// ── Auth helper ───────────────────────────────────────────────────────────────
function authUser(req) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return null
  try { return jwt.verify(auth.slice(7), JWT_SECRET) } catch { return null }
}

function requireAuth(req, res) {
  const user = authUser(req)
  if (!user) res.status(401).json({ error: 'Nicht autorisiert.' })
  return user
}

// ── Input helpers ─────────────────────────────────────────────────────────────
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

function sanitizeText(s, maxLen = 1000) {
  if (typeof s !== 'string') return ''
  return s.trim().slice(0, maxLen)
}

// ── Rate limiting (per IP, sliding window) ────────────────────────────────────
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

// ── Multer — vlog upload ──────────────────────────────────────────────────────
const vlogStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); cb(null, UPLOADS_DIR) },
  filename:    (_req, _file, cb) => cb(null, `${Date.now()}.webm`),
})
const upload = multer({
  storage: vlogStorage,
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/webm', 'video/mp4', 'video/quicktime', 'application/octet-stream']
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith('.webm'))
  },
})

// ── Multer — avatar upload ────────────────────────────────────────────────────
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { fs.mkdirSync(AVATARS_DIR, { recursive: true }); cb(null, AVATARS_DIR) },
    filename:    (_req, _file, cb) => cb(null, `${Date.now()}_av_tmp`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.mimetype)) {
      cb(new Error('Nur Bilder erlaubt (JPEG, PNG, WebP, GIF).'))
    } else {
      cb(null, true)
    }
  },
})

// ── Group helpers ─────────────────────────────────────────────────────────────
function formatGroup(g, forUserId = null) {
  const members  = db.prepare(`SELECT u.id, u.username, u.avatar FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=?`).all(g.id)
  const rotation = JSON.parse(g.rotation_order || '[]')
  let unreadCount = 0
  if (forUserId) {
    const read = db.prepare('SELECT last_read_at FROM group_message_reads WHERE group_id=? AND user_id=?').get(g.id, forUserId)
    const lastReadAt = read?.last_read_at ?? 0
    const r = db.prepare('SELECT COUNT(*) as c FROM group_messages WHERE group_id=? AND created_at>? AND user_id!=?').get(g.id, lastReadAt, forUserId)
    unreadCount = r?.c ?? 0
  }
  return {
    id: g.id, name: g.name, emoji: g.emoji, creatorId: g.creator_id,
    description: g.description ?? null,
    memberIds: members.map(m => m.id), members, rotation,
    todayIdx: g.rotation_idx, lastRotationDate: g.last_rotation_date, unreadCount,
  }
}

// ── Push helper ───────────────────────────────────────────────────────────────
function pushToUser(userId, title, body) {
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(userId)
  for (const sub of subs) {
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body })
    ).catch(() => db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(sub.endpoint))
  }
}

function advanceGroupRotation(g) {
  const today    = new Date().toISOString().slice(0, 10)
  const rotation = JSON.parse(g.rotation_order || '[]')
  if (g.last_rotation_date === today || !rotation.length) return
  const newIdx    = (g.rotation_idx + 1) % rotation.length
  db.prepare('UPDATE user_groups SET rotation_idx=?, last_rotation_date=? WHERE id=?').run(newIdx, today, g.id)
  // Notify the newly-assigned person it's their turn
  const newUserId = rotation[newIdx]
  if (newUserId) {
    addNotification(newUserId, 'your_turn', null,
      `Du bist heute dran! Nimm deinen Vlog für „${g.name}" auf 🎬`)
    pushToUser(newUserId, `${g.emoji ?? '🎬'} ${g.name}`, 'Du bist heute dran! Nimm deinen Vlog auf 🎬')
  }
}

// ── Evening reminder (18:00 UTC daily) ───────────────────────────────────────
async function sendEveningReminder() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const users = db.prepare(`
      SELECT u.id FROM users u
      WHERE u.verified=1 AND u.id NOT IN (
        SELECT user_id FROM vlogs WHERE strftime('%Y-%m-%d', created_at/1000,'unixepoch')=?
      )
    `).all(today)
    const payload = JSON.stringify({ title: 'daylo.', body: 'Du hast heute noch keinen Vlog aufgenommen! 🎬' })
    for (const u of users) {
      const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(u.id)
      for (const sub of subs) {
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        ).catch(() => db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(sub.endpoint))
      }
    }
    console.log(`📅 Evening reminder → ${users.length} Nutzer`)
  } catch (err) {
    console.error('Evening reminder error:', err.message)
  }
}

function scheduleEveningReminder() {
  const now    = new Date()
  const target = new Date(now)
  target.setUTCHours(18, 0, 0, 0)
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1)
  setTimeout(() => {
    sendEveningReminder()
    setInterval(sendEveningReminder, 24 * 60 * 60 * 1000)
  }, target - now)
}

// ── Notification helper ───────────────────────────────────────────────────────
function addNotification(userId, type, fromId, message) {
  db.prepare(`INSERT INTO notifications (id,user_id,type,from_id,message,read,created_at) VALUES (?,?,?,?,?,0,?)`)
    .run(crypto.randomUUID(), userId, type, fromId, message, Date.now())
  db.prepare(`
    DELETE FROM notifications WHERE user_id=? AND id NOT IN (
      SELECT id FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50
    )
  `).run(userId, userId)
}

// ── Vlog formatter ────────────────────────────────────────────────────────────
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

// ── Streak calculator ─────────────────────────────────────────────────────────
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

// ── Friend upload notification ────────────────────────────────────────────────
async function notifyFriends(uploaderId, username) {
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
    // In-app notification
    addNotification(friend.id, 'vlog_upload', uploaderId,
      `${username} hat heute seinen Vlog hochgeladen! 🎬`)

    // Email (non-blocking, best-effort)
    resend.emails.send({
      from: 'daylo. <onboarding@resend.dev>',
      to: friend.email,
      subject: `${username} hat heute seinen Vlog hochgeladen 🎬`,
      html: `<div style="font-family:sans-serif;max-width:400px;margin:auto">
        <h2 style="color:#7B61FF">daylo.</h2>
        <p><strong>${username}</strong> hat heute einen neuen Vlog hochgeladen!</p>
        <p style="color:#999;font-size:12px">Öffne daylo, um ihn anzusehen.</p>
      </div>`,
    }).catch(err => console.warn(`E-Mail an ${friend.email} fehlgeschlagen:`, err.message))

    // Push notifications
    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(friend.id)
    for (const sub of subs) {
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ).catch(() => db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(sub.endpoint))
    }
  }
}

// ── Stale push subscription cleanup (runs on startup) ────────────────────────
function cleanStaleSubscriptions() {
  const subs = db.prepare('SELECT * FROM push_subscriptions').all()
  let removed = 0
  for (const sub of subs) {
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title: 'ping' })
    ).catch(err => {
      // 404/410 = subscription expired or revoked
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(sub.endpoint)
        removed++
      }
    })
  }
  if (subs.length) console.log(`🔔 Push-Cleanup: ${subs.length} geprüft`)
}

// ── Routes ────────────────────────────────────────────────────────────────────
export function registerRoutes(api) {
  scheduleEveningReminder()

  // Run stale subscription cleanup after 10s startup delay (non-blocking)
  setTimeout(cleanStaleSubscriptions, 10_000)

  // ── Auth ────────────────────────────────────────────────────────────────────

  api.post('/api/auth/register', rateLimit, async (req, res) => {
    const email    = sanitizeText(req.body?.email ?? '', 254).toLowerCase()
    const password = req.body?.password ?? ''
    const username = sanitizeText(req.body?.username ?? '', 20)

    if (!email || !password || !username)
      return res.status(400).json({ error: 'Alle Felder ausfüllen.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' })
    if (!USERNAME_RE.test(username))
      return res.status(400).json({ error: 'Nutzername: 3–20 Zeichen, nur Buchstaben, Zahlen und _' })
    if (password.length < 8)
      return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' })
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email))
      return res.status(409).json({ error: 'E-Mail bereits registriert.' })
    if (db.prepare('SELECT id FROM users WHERE username=?').get(username))
      return res.status(409).json({ error: 'Nutzername bereits vergeben.' })

    const hash = await bcrypt.hash(password, 12)
    const code = String(Math.floor(100000 + Math.random() * 900000))
    db.prepare(`INSERT INTO users (id,email,username,hash,code,verified,created_at) VALUES (?,?,?,?,?,0,?)`)
      .run(crypto.randomUUID(), email, username, hash, code, Date.now())

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

  api.post('/api/auth/verify', rateLimit, (req, res) => {
    const email = sanitizeText(req.body?.email ?? '', 254).toLowerCase()
    const code  = sanitizeText(req.body?.code ?? '', 10)
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(email)
    if (!u) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
    if (u.code !== code) return res.status(400).json({ error: 'Falscher Code.' })
    db.prepare('UPDATE users SET verified=1, code=NULL WHERE id=?').run(u.id)
    const { hash, code: _c, last_seen, ...safe } = u
    safe.verified = true
    const token = jwt.sign(safe, JWT_SECRET, { expiresIn: '30d' })
    res.json({ success: true, token, user: safe })
  })

  api.post('/api/auth/login', rateLimit, async (req, res) => {
    const email    = sanitizeText(req.body?.email ?? '', 254).toLowerCase()
    const password = req.body?.password ?? ''
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(email)
    if (!u) return res.status(401).json({ error: 'Kein Konto mit dieser E-Mail gefunden.' })
    if (!await bcrypt.compare(password, u.hash)) return res.status(401).json({ error: 'Falsches Passwort.' })
    if (!u.verified) return res.status(403).json({ error: 'Bitte bestätige zuerst deine E-Mail.' })
    const { hash, code, last_seen, ...safe } = u
    safe.verified = !!safe.verified
    const token = jwt.sign(safe, JWT_SECRET, { expiresIn: '30d' })
    res.json({ success: true, token, user: safe })
  })

  api.get('/api/auth/me', (req, res) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht autorisiert.' })
    try {
      const user = jwt.verify(auth.slice(7), JWT_SECRET)
      const fresh = db.prepare('SELECT id,email,username,verified,avatar,bio,notif_prefs,searchable,color,created_at FROM users WHERE id=?').get(user.id)
      if (!fresh) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
      res.json({ user: { ...fresh, verified: !!fresh.verified, searchable: fresh.searchable !== 0 } })
    } catch { res.status(401).json({ error: 'Session abgelaufen.' }) }
  })

  api.put('/api/auth/settings', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const updates = []; const params = []
    if (req.body?.bio !== undefined) {
      updates.push('bio=?'); params.push(sanitizeText(req.body.bio ?? '', 120))
    }
    if (req.body?.notifPrefs !== undefined) {
      updates.push('notif_prefs=?'); params.push(JSON.stringify(req.body.notifPrefs))
    }
    if (req.body?.searchable !== undefined) {
      updates.push('searchable=?'); params.push(req.body.searchable ? 1 : 0)
    }
    if (req.body?.color !== undefined) {
      const VALID = ['#7B61FF','#FF6B9D','#00D9FF','#FF9F43','#2ECC71','#FF453A','#BF5AF2','#32ADE6','#FF6B35','#30B0C7','#34C759','#FFD60A']
      if (VALID.includes(req.body.color)) { updates.push('color=?'); params.push(req.body.color) }
    }
    if (!updates.length) return res.status(400).json({ error: 'Keine Änderungen.' })
    params.push(me.id)
    db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=?`).run(...params)
    res.json({ success: true })
  })

  api.post('/api/auth/change-password', async (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const { currentPassword, newPassword } = req.body || {}
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'Alle Felder ausfüllen.' })
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'Neues Passwort: mindestens 8 Zeichen.' })
    const u = db.prepare('SELECT hash FROM users WHERE id=?').get(me.id)
    if (!u || !await bcrypt.compare(currentPassword, u.hash))
      return res.status(401).json({ error: 'Aktuelles Passwort ist falsch.' })
    const hash = await bcrypt.hash(newPassword, 12)
    db.prepare('UPDATE users SET hash=? WHERE id=?').run(hash, me.id)
    res.json({ success: true })
  })

  api.delete('/api/auth/account', async (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const { password } = req.body || {}
    if (!password) return res.status(400).json({ error: 'Passwort erforderlich.' })
    const u = db.prepare('SELECT hash FROM users WHERE id=?').get(me.id)
    if (!u || !await bcrypt.compare(password, u.hash))
      return res.status(401).json({ error: 'Falsches Passwort.' })
    db.prepare('DELETE FROM users WHERE id=?').run(me.id)
    res.json({ success: true })
  })

  api.post('/api/auth/avatar', avatarUpload.single('avatar'), (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    if (!req.file) return res.status(400).json({ error: 'Keine Datei.' })
    const finalName = `${me.id}.jpg`
    const finalPath = path.join(AVATARS_DIR, finalName)
    try {
      fs.renameSync(req.file.path, finalPath)
    } catch (err) {
      try { fs.unlinkSync(req.file.path) } catch {}
      return res.status(500).json({ error: 'Avatar konnte nicht gespeichert werden.' })
    }
    db.prepare('UPDATE users SET avatar=? WHERE id=?').run(finalName, me.id)
    res.json({ success: true, avatar: `/uploads/avatars/${finalName}` })
  })

  api.put('/api/auth/username', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const username = sanitizeText(req.body?.username ?? '', 20)
    if (!USERNAME_RE.test(username))
      return res.status(400).json({ error: 'Nutzername: 3–20 Zeichen, nur Buchstaben, Zahlen und _' })
    if (db.prepare('SELECT id FROM users WHERE username=? AND id!=?').get(username, me.id))
      return res.status(409).json({ error: 'Nutzername bereits vergeben.' })
    db.prepare('UPDATE users SET username=? WHERE id=?').run(username, me.id)
    const u = db.prepare('SELECT id,email,username,verified,avatar FROM users WHERE id=?').get(me.id)
    if (!u) return res.status(404).json({ error: 'User nicht gefunden.' })
    const safe = { ...u, verified: !!u.verified }
    const token = jwt.sign(safe, JWT_SECRET, { expiresIn: '30d' })
    res.json({ success: true, token, user: safe })
  })

  // ── Users ───────────────────────────────────────────────────────────────────

  api.get('/api/users/search', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const q = `%${sanitizeText(req.query.q ?? '', 100).toLowerCase()}%`
    const results = db.prepare(`
      SELECT u.id, u.username, u.avatar,
        CASE
          WHEN f.friend_id        IS NOT NULL THEN 'friend'
          WHEN fr_in.requester_id IS NOT NULL THEN 'incoming'
          WHEN fr_out.target_id   IS NOT NULL THEN 'sent'
          ELSE 'none'
        END AS status
      FROM users u
      LEFT JOIN friends         f      ON f.user_id          = ? AND f.friend_id        = u.id
      LEFT JOIN friend_requests fr_in  ON fr_in.target_id    = ? AND fr_in.requester_id = u.id
      LEFT JOIN friend_requests fr_out ON fr_out.requester_id = ? AND fr_out.target_id   = u.id
      WHERE u.verified = 1 AND u.id != ? AND (u.searchable = 1 OR u.id = ?)
        AND (LOWER(u.username) LIKE ? OR LOWER(u.email) LIKE ?)
      LIMIT 20
    `).all(me.id, me.id, me.id, me.id, me.id, q, q)
    res.json({ users: results })
  })

  // ── User profiles ────────────────────────────────────────────────────────────

  api.get('/api/users/:id/profile', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const targetId = req.params.id
    const u = db.prepare('SELECT id, username, avatar, created_at FROM users WHERE id=? AND verified=1').get(targetId)
    if (!u) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (targetId !== me.id) {
      const areFriends = db.prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?').get(me.id, targetId)
      if (!areFriends) {
        const shareGroup = db.prepare(`
          SELECT 1 FROM group_members gm1
          JOIN group_members gm2 ON gm1.group_id = gm2.group_id
          WHERE gm1.user_id=? AND gm2.user_id=?
        `).get(me.id, targetId)
        if (!shareGroup) return res.status(403).json({ error: 'Kein Zugriff.' })
      }
    }
    const vlogCount = db.prepare('SELECT COUNT(*) as c FROM vlogs WHERE user_id=?').get(targetId)?.c ?? 0
    const streak = calcStreak(targetId)
    const mutualGroups = db.prepare(`
      SELECT g.id, g.name, g.emoji FROM user_groups g
      JOIN group_members gm1 ON gm1.group_id = g.id AND gm1.user_id = ?
      JOIN group_members gm2 ON gm2.group_id = g.id AND gm2.user_id = ?
    `).all(me.id, targetId)
    res.json({ user: u, vlogCount, streak, mutualGroups })
  })

  // ── Friends ─────────────────────────────────────────────────────────────────

  api.get('/api/friends', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const friends = db.prepare(`
      SELECT u.id, u.username, u.avatar
      FROM friends f JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = ?
    `).all(me.id)
    res.json({ friends })
  })

  api.post('/api/friends/request', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const { targetId } = req.body || {}
    if (!targetId) return res.status(400).json({ error: 'Keine targetId.' })
    if (targetId === me.id) return res.status(400).json({ error: 'Du kannst dir selbst keine Anfrage senden.' })
    if (!db.prepare('SELECT id FROM users WHERE id=?').get(targetId))
      return res.status(404).json({ error: 'User nicht gefunden.' })
    if (db.prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?').get(me.id, targetId))
      return res.status(409).json({ error: 'Bereits befreundet.' })
    if (!db.prepare('SELECT 1 FROM friend_requests WHERE requester_id=? AND target_id=?').get(me.id, targetId)) {
      db.prepare('INSERT OR IGNORE INTO friend_requests VALUES (?,?)').run(me.id, targetId)
      const sender = db.prepare('SELECT username FROM users WHERE id=?').get(me.id)
      addNotification(targetId, 'friend_request', me.id, `${sender?.username ?? 'Jemand'} möchte dein Freund sein.`)
    }
    res.json({ success: true })
  })

  api.get('/api/friends/requests', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const requests = db.prepare(`
      SELECT u.id, u.username, u.avatar
      FROM friend_requests fr JOIN users u ON u.id = fr.requester_id
      WHERE fr.target_id = ?
    `).all(me.id)
    res.json({ requests })
  })

  api.post('/api/friends/accept', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const { requesterId } = req.body || {}
    if (!requesterId) return res.status(400).json({ error: 'Keine requesterId.' })
    if (!db.prepare('SELECT 1 FROM friend_requests WHERE requester_id=? AND target_id=?').get(requesterId, me.id))
      return res.status(404).json({ error: 'Anfrage nicht gefunden.' })
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

  api.get('/api/friends/sent', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const sent = db.prepare(`
      SELECT u.id, u.username, u.avatar
      FROM friend_requests fr JOIN users u ON u.id = fr.target_id
      WHERE fr.requester_id = ?
    `).all(me.id)
    res.json({ sent })
  })

  api.delete('/api/friends/request/:targetId', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    db.prepare('DELETE FROM friend_requests WHERE requester_id=? AND target_id=?').run(me.id, req.params.targetId)
    res.json({ success: true })
  })

  api.post('/api/friends/decline', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const { requesterId } = req.body || {}
    if (!requesterId) return res.status(400).json({ error: 'Keine requesterId.' })
    db.prepare('DELETE FROM friend_requests WHERE requester_id=? AND target_id=?').run(requesterId, me.id)
    res.json({ success: true })
  })

  api.delete('/api/friends/:id', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    db.transaction(() => {
      db.prepare('DELETE FROM friends WHERE user_id=? AND friend_id=?').run(me.id, req.params.id)
      db.prepare('DELETE FROM friends WHERE user_id=? AND friend_id=?').run(req.params.id, me.id)
    })()
    res.json({ success: true })
  })

  // ── Presence ─────────────────────────────────────────────────────────────────

  api.post('/api/presence/ping', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(Date.now(), me.id)
    res.json({ success: true })
  })

  api.get('/api/presence', (req, res) => {
    const idList = (req.query.ids ?? '').split(',').filter(id => id && /^[a-f0-9-]{36}$/.test(id)).slice(0, 100)
    if (!idList.length) return res.json({ presences: {} })
    const placeholders = idList.map(() => '?').join(',')
    const rows = db.prepare(`SELECT id, last_seen FROM users WHERE id IN (${placeholders})`).all(...idList)
    const presences = {}
    for (const r of rows) presences[r.id] = r.last_seen ?? null
    res.json({ presences })
  })

  // ── Notifications ─────────────────────────────────────────────────────────────

  api.get('/api/notifications', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const notifications = db.prepare(
      'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50'
    ).all(me.id).map(n => ({ ...n, read: !!n.read }))
    res.json({ notifications })
  })

  api.post('/api/notifications/mark-read', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(me.id)
    res.json({ success: true })
  })

  // ── Vlogs ─────────────────────────────────────────────────────────────────────

  api.post('/api/vlogs/upload', upload.single('video'), async (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    if (!req.file) return res.status(400).json({ error: 'Keine Videodatei erhalten.' })

    const duration  = Math.max(0, parseFloat(req.body.duration) || 0)
    const clipCount = Math.max(1, parseInt(req.body.clipCount) || 1)
    const emoji     = sanitizeText(req.body.emoji || '🎬', 10)
    const title     = sanitizeText(req.body.title || '', 100) || null
    const thumbnail = req.body.thumbnail ?? null

    const id      = crypto.randomUUID()
    const userDir = path.join(UPLOADS_DIR, me.id)
    fs.mkdirSync(userDir, { recursive: true })

    const finalName = req.file.filename
    const srcPath   = req.file.path
    const destPath  = path.join(userDir, finalName)
    try {
      if (srcPath !== destPath) fs.renameSync(srcPath, destPath)
    } catch (err) {
      try { fs.unlinkSync(srcPath) } catch {}
      return res.status(500).json({ error: 'Video konnte nicht gespeichert werden.' })
    }

    // Save thumbnail from base64 if provided
    let thumbName = null
    if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('data:image/')) {
      try {
        const b64 = thumbnail.replace(/^data:image\/\w+;base64,/, '')
        thumbName = finalName.replace('.webm', '_thumb.jpg')
        fs.writeFileSync(path.join(userDir, thumbName), Buffer.from(b64, 'base64'))
      } catch {}
    }

    const initStatus = ffmpegAvailable ? 'processing' : 'ready'
    db.prepare(`INSERT INTO vlogs (id,user_id,filename,duration,clip_count,emoji,title,thumbnail,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, me.id, finalName, duration, clipCount, emoji, title, thumbName, initStatus, Date.now())

    const vlog = db.prepare('SELECT * FROM vlogs WHERE id=?').get(id)
    if (ffmpegAvailable) runKiSchnitt(id, me.id, destPath)
    notifyFriends(me.id, me.username ?? me.email).catch(() => {})

    res.json({ success: true, vlog: formatVlog(vlog, me.id, me.id) })
  })

  // My vlogs + streak — supports pagination via ?limit=&offset=
  api.get('/api/vlogs/my', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit)  || 20))
    const offset = Math.max(0, parseInt(req.query.offset) || 0)
    const rows = db.prepare('SELECT * FROM vlogs WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(me.id, limit, offset)
    const total = db.prepare('SELECT COUNT(*) as c FROM vlogs WHERE user_id=?').get(me.id)?.c ?? 0
    res.json({ vlogs: rows.map(v => formatVlog(v, me.id, me.id)), streak: calcStreak(me.id), total })
  })

  // Another user's vlogs — accessible to friends OR group members
  api.get('/api/vlogs/user/:userId', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const targetId = req.params.userId
    if (targetId !== me.id) {
      const areFriends = db.prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?').get(me.id, targetId)
      if (!areFriends) {
        const shareGroup = db.prepare(`
          SELECT 1 FROM group_members gm1
          JOIN group_members gm2 ON gm1.group_id = gm2.group_id
          WHERE gm1.user_id=? AND gm2.user_id=?
        `).get(me.id, targetId)
        if (!shareGroup) return res.status(403).json({ error: 'Kein Zugriff.' })
      }
    }
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit)  || 20))
    const offset = Math.max(0, parseInt(req.query.offset) || 0)
    const rows  = db.prepare('SELECT * FROM vlogs WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(targetId, limit, offset)
    const total = db.prepare('SELECT COUNT(*) as c FROM vlogs WHERE user_id=?').get(targetId)?.c ?? 0
    res.json({ vlogs: rows.map(v => formatVlog(v, targetId, me.id)), streak: calcStreak(targetId), total })
  })

  // Toggle reaction
  api.post('/api/vlogs/:id/react', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const { type } = req.body || {}
    if (!['👍', '❤️', '😂'].includes(type)) return res.status(400).json({ error: 'Ungültiger Typ.' })
    const vlog = db.prepare('SELECT id, user_id FROM vlogs WHERE id=?').get(req.params.id)
    if (!vlog) return res.status(404).json({ error: 'Vlog nicht gefunden.' })
    const exists = db.prepare('SELECT 1 FROM reactions WHERE vlog_id=? AND user_id=? AND type=?').get(req.params.id, me.id, type)
    if (exists) {
      db.prepare('DELETE FROM reactions WHERE vlog_id=? AND user_id=? AND type=?').run(req.params.id, me.id, type)
    } else {
      db.prepare('INSERT OR IGNORE INTO reactions VALUES (?,?,?)').run(req.params.id, me.id, type)
      // Notify the vlog owner (skip if reacting to own vlog)
      if (vlog.user_id !== me.id) {
        const sender = db.prepare('SELECT username FROM users WHERE id=?').get(me.id)
        addNotification(
          vlog.user_id, 'vlog_react', me.id,
          `${sender?.username ?? 'Jemand'} hat auf deinen Vlog reagiert: ${type}`
        )
      }
    }
    const rxRows = db.prepare(`
      SELECT type, COUNT(*) as cnt, MAX(CASE WHEN user_id=? THEN 1 ELSE 0 END) as mine
      FROM reactions WHERE vlog_id=? GROUP BY type
    `).all(me.id, req.params.id)
    res.json({ reactions: rxRows.map(r => ({ type: r.type, count: r.cnt, mine: !!r.mine })) })
  })

  // Delete own vlog (cleans up all associated files)
  api.delete('/api/vlogs/:id', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const vlog = db.prepare('SELECT * FROM vlogs WHERE id=? AND user_id=?').get(req.params.id, me.id)
    if (!vlog) return res.status(404).json({ error: 'Nicht gefunden.' })
    const userDir = path.join(UPLOADS_DIR, me.id)
    for (const file of [vlog.filename, vlog.processed_filename, vlog.thumbnail].filter(Boolean)) {
      fs.rm(path.join(userDir, file), { force: true }, () => {})
    }
    db.prepare('DELETE FROM vlogs WHERE id=?').run(req.params.id)
    res.json({ success: true })
  })

  // ── Push Notifications ─────────────────────────────────────────────────────

  api.get('/api/push/vapid-key', (_req, res) => {
    res.json({ key: vapidPublicKey })
  })

  api.post('/api/push/subscribe', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const { endpoint, keys } = req.body || {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'Ungültige Subscription.' })
    db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), me.id, endpoint, keys.p256dh, keys.auth, Date.now())
    res.json({ success: true })
  })

  api.delete('/api/push/unsubscribe', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const { endpoint } = req.body || {}
    if (endpoint) db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').run(me.id, endpoint)
    res.json({ success: true })
  })

  // ── Comments ───────────────────────────────────────────────────────────────

  api.get('/api/vlogs/:id/comments', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const comments = db.prepare(`
      SELECT c.id, c.text, c.created_at, u.id as user_id, u.username, u.avatar
      FROM comments c JOIN users u ON u.id=c.user_id
      WHERE c.vlog_id=? ORDER BY c.created_at ASC
    `).all(req.params.id)
    res.json({ comments })
  })

  api.post('/api/vlogs/:id/comments', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const text = sanitizeText(req.body?.text ?? '', 500)
    if (!text) return res.status(400).json({ error: 'Kein Text.' })
    if (!db.prepare('SELECT id FROM vlogs WHERE id=?').get(req.params.id))
      return res.status(404).json({ error: 'Vlog nicht gefunden.' })
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO comments (id,vlog_id,user_id,text,created_at) VALUES (?,?,?,?,?)')
      .run(id, req.params.id, me.id, text, Date.now())
    const c = db.prepare(`
      SELECT c.id, c.text, c.created_at, u.id as user_id, u.username, u.avatar
      FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?
    `).get(id)
    res.json({ comment: c })
  })

  api.delete('/api/comments/:id', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const comment = db.prepare('SELECT c.*, v.user_id as vlog_owner FROM comments c JOIN vlogs v ON v.id=c.vlog_id WHERE c.id=?').get(req.params.id)
    if (!comment) return res.status(404).json({ error: 'Kommentar nicht gefunden.' })
    // Allow deletion by comment author OR vlog owner
    if (comment.user_id !== me.id && comment.vlog_owner !== me.id)
      return res.status(403).json({ error: 'Kein Zugriff.' })
    db.prepare('DELETE FROM comments WHERE id=?').run(req.params.id)
    res.json({ success: true })
  })

  // Who reacted (for owner)
  api.get('/api/vlogs/:id/reactors', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const rows = db.prepare(`SELECT r.type, u.id, u.username FROM reactions r JOIN users u ON u.id=r.user_id WHERE r.vlog_id=?`).all(req.params.id)
    const byType = {}
    for (const r of rows) {
      if (!byType[r.type]) byType[r.type] = []
      byType[r.type].push({ id: r.id, name: r.username })
    }
    res.json({ reactors: byType })
  })

  // ── Groups ─────────────────────────────────────────────────────────────────

  // Must come before /api/groups/:id routes
  api.get('/api/groups/unread-count', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const result = db.prepare(`
      SELECT COALESCE(SUM(
        (SELECT COUNT(*) FROM group_messages gm
         WHERE gm.group_id = g.group_id
           AND gm.created_at > COALESCE(
             (SELECT last_read_at FROM group_message_reads WHERE group_id=g.group_id AND user_id=?), 0)
           AND gm.user_id != ?)
      ), 0) as total
      FROM group_members g WHERE g.user_id=?
    `).get(me.id, me.id, me.id)
    res.json({ count: result?.total ?? 0 })
  })

  api.get('/api/groups', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const rows = db.prepare(`
      SELECT g.* FROM user_groups g JOIN group_members gm ON gm.group_id=g.id
      WHERE gm.user_id=? ORDER BY g.created_at ASC
    `).all(me.id)
    rows.forEach(g => advanceGroupRotation(g))
    const updated = db.prepare(`
      SELECT g.* FROM user_groups g JOIN group_members gm ON gm.group_id=g.id
      WHERE gm.user_id=? ORDER BY g.created_at ASC
    `).all(me.id)
    res.json({ groups: updated.map(g => formatGroup(g, me.id)) })
  })

  api.post('/api/groups', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const name  = sanitizeText(req.body?.name ?? '', 50)
    const emoji = sanitizeText(req.body?.emoji || '👥', 10)
    if (!name) return res.status(400).json({ error: 'Kein Name.' })
    const id    = crypto.randomUUID()
    const today = new Date().toISOString().slice(0, 10)
    db.transaction(() => {
      db.prepare('INSERT INTO user_groups (id,name,emoji,creator_id,rotation_order,rotation_idx,last_rotation_date,created_at) VALUES (?,?,?,?,?,0,?,?)')
        .run(id, name, emoji, me.id, JSON.stringify([me.id]), today, Date.now())
      db.prepare('INSERT INTO group_members VALUES (?,?)').run(id, me.id)
    })()
    const g = db.prepare('SELECT * FROM user_groups WHERE id=?').get(id)
    res.status(201).json({ group: formatGroup(g, me.id) })
  })

  api.put('/api/groups/:id', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const g = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    if (!g) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (!db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(req.params.id, me.id))
      return res.status(403).json({ error: 'Kein Zugriff.' })
    const name             = sanitizeText(req.body?.name ?? g.name, 50)
    const emoji            = sanitizeText(req.body?.emoji ?? g.emoji, 10)
    const rotation         = req.body?.rotation
    const todayIdx         = req.body?.todayIdx ?? g.rotation_idx
    const lastRotationDate = req.body?.lastRotationDate ?? g.last_rotation_date
    db.prepare('UPDATE user_groups SET name=?,emoji=?,rotation_order=?,rotation_idx=?,last_rotation_date=? WHERE id=?')
      .run(name, emoji, rotation ? JSON.stringify(rotation) : g.rotation_order, todayIdx, lastRotationDate, req.params.id)
    const updated = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    res.json({ group: formatGroup(updated, me.id) })
  })

  api.delete('/api/groups/:id', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const g = db.prepare('SELECT * FROM user_groups WHERE id=? AND creator_id=?').get(req.params.id, me.id)
    if (!g) return res.status(404).json({ error: 'Nicht gefunden oder kein Zugriff.' })
    db.transaction(() => {
      db.prepare('DELETE FROM group_messages WHERE group_id=?').run(req.params.id)
      db.prepare('DELETE FROM group_message_reads WHERE group_id=?').run(req.params.id)
      db.prepare('DELETE FROM group_members WHERE group_id=?').run(req.params.id)
      db.prepare('DELETE FROM user_groups WHERE id=?').run(req.params.id)
    })()
    res.json({ success: true })
  })

  api.post('/api/groups/:id/members', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const { userId } = req.body || {}
    if (!userId) return res.status(400).json({ error: 'Keine userId.' })
    if (!db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(req.params.id, me.id))
      return res.status(403).json({ error: 'Kein Zugriff.' })
    const g = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    if (!g) return res.status(404).json({ error: 'Gruppe nicht gefunden.' })
    if (db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(req.params.id, userId))
      return res.status(409).json({ error: 'Nutzer ist bereits Mitglied.' })
    db.prepare('INSERT OR IGNORE INTO group_members VALUES (?,?)').run(req.params.id, userId)
    const rotation = JSON.parse(g.rotation_order || '[]')
    if (!rotation.includes(userId)) {
      rotation.push(userId)
      db.prepare('UPDATE user_groups SET rotation_order=? WHERE id=?').run(JSON.stringify(rotation), req.params.id)
    }
    const adder = db.prepare('SELECT username FROM users WHERE id=?').get(me.id)
    addNotification(userId, 'group_added', me.id,
      `${adder?.username ?? 'Jemand'} hat dich zur Gruppe „${g.name}" hinzugefügt.`)
    pushToUser(userId, g.emoji + ' ' + g.name, `${adder?.username ?? 'Jemand'} hat dich hinzugefügt!`)
    const updated = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    res.json({ group: formatGroup(updated, me.id) })
  })

  // Group vlogs feed — recent vlogs from all members of a group
  api.get('/api/groups/:id/feed', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    if (!db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(req.params.id, me.id))
      return res.status(403).json({ error: 'Kein Zugriff.' })
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20))
    const rows = db.prepare(`
      SELECT v.*, u.username as owner_name, u.avatar as owner_avatar
      FROM vlogs v
      JOIN group_members gm ON gm.user_id = v.user_id AND gm.group_id = ?
      ORDER BY v.created_at DESC
      LIMIT ?
    `).all(req.params.id, limit)
    res.json({
      vlogs: rows.map(v => ({
        ...formatVlog(v, v.user_id, me.id),
        ownerName: v.owner_name,
        ownerAvatar: v.owner_avatar,
        ownerId: v.user_id,
      }))
    })
  })

  // ── Group chat ─────────────────────────────────────────────────────────────

  api.get('/api/groups/:id/messages', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    if (!db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(req.params.id, me.id))
      return res.status(403).json({ error: 'Kein Zugriff.' })
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 80))
    const messages = db.prepare(`
      SELECT gm.id, gm.group_id, gm.user_id, gm.text, gm.created_at, gm.reply_to_id,
             u.username as from_name, u.avatar
      FROM group_messages gm JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY gm.created_at DESC LIMIT ?
    `).all(req.params.id, limit).reverse()

    // Fetch reactions grouped by message
    const msgIds = messages.map(m => m.id)
    const reactionsMap = {}
    if (msgIds.length) {
      const ph = msgIds.map(() => '?').join(',')
      const rxRows = db.prepare(`
        SELECT message_id, emoji, COUNT(*) as count,
               MAX(CASE WHEN user_id=? THEN 1 ELSE 0 END) as mine
        FROM group_message_reactions WHERE message_id IN (${ph})
        GROUP BY message_id, emoji
      `).all(me.id, ...msgIds)
      for (const r of rxRows) {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = []
        reactionsMap[r.message_id].push({ emoji: r.emoji, count: r.count, mine: !!r.mine })
      }
    }

    // Fetch reply-to previews
    const replyIds = [...new Set(messages.filter(m => m.reply_to_id).map(m => m.reply_to_id))]
    const replyMap = {}
    if (replyIds.length) {
      const ph = replyIds.map(() => '?').join(',')
      const replyRows = db.prepare(`
        SELECT gm.id, gm.text, u.username as from_name
        FROM group_messages gm JOIN users u ON u.id = gm.user_id
        WHERE gm.id IN (${ph})
      `).all(...replyIds)
      for (const r of replyRows) replyMap[r.id] = r
    }

    const result = messages.map(m => ({
      ...m,
      reactions: reactionsMap[m.id] ?? [],
      replyTo: m.reply_to_id ? (replyMap[m.reply_to_id] ?? null) : null,
    }))

    const now = Date.now()
    db.prepare(`
      INSERT INTO group_message_reads (group_id, user_id, last_read_at) VALUES (?,?,?)
      ON CONFLICT(group_id, user_id) DO UPDATE SET last_read_at=excluded.last_read_at
    `).run(req.params.id, me.id, now)
    res.json({ messages: result })
  })

  api.post('/api/groups/:id/messages', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    if (!db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(req.params.id, me.id))
      return res.status(403).json({ error: 'Kein Zugriff.' })
    const text = sanitizeText(req.body?.text ?? '', 1000)
    if (!text) return res.status(400).json({ error: 'Nachricht fehlt.' })
    const replyToId = req.body?.replyToId ?? null
    if (replyToId && !db.prepare('SELECT 1 FROM group_messages WHERE id=? AND group_id=?').get(replyToId, req.params.id))
      return res.status(400).json({ error: 'Ungültige reply_to_id.' })
    const id  = crypto.randomUUID()
    const now = Date.now()
    db.prepare('INSERT INTO group_messages (id,group_id,user_id,text,reply_to_id,created_at) VALUES (?,?,?,?,?,?)')
      .run(id, req.params.id, me.id, text, replyToId, now)
    db.prepare(`
      INSERT INTO group_message_reads (group_id, user_id, last_read_at) VALUES (?,?,?)
      ON CONFLICT(group_id, user_id) DO UPDATE SET last_read_at=excluded.last_read_at
    `).run(req.params.id, me.id, now)
    const msg = db.prepare(`
      SELECT gm.*, u.username as from_name, u.avatar
      FROM group_messages gm JOIN users u ON u.id=gm.user_id WHERE gm.id=?
    `).get(id)
    // Attach reply preview if present
    let replyTo = null
    if (replyToId) {
      replyTo = db.prepare(`
        SELECT gm.id, gm.text, u.username as from_name
        FROM group_messages gm JOIN users u ON u.id=gm.user_id WHERE gm.id=?
      `).get(replyToId) ?? null
    }
    const g      = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    const others = db.prepare('SELECT user_id FROM group_members WHERE group_id=? AND user_id!=?').all(req.params.id, me.id)
    const sender = db.prepare('SELECT username FROM users WHERE id=?').get(me.id)
    for (const o of others) {
      pushToUser(o.user_id, `${g?.emoji ?? '💬'} ${g?.name ?? 'Gruppe'}`, `${sender?.username ?? '?'}: ${text.slice(0, 80)}`)
    }
    res.status(201).json({ message: { ...msg, reactions: [], replyTo } })
  })

  api.post('/api/groups/:id/messages/:msgId/react', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    if (!db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(req.params.id, me.id))
      return res.status(403).json({ error: 'Kein Zugriff.' })
    const { emoji } = req.body || {}
    const ALLOWED = ['👍', '❤️', '😂', '😮', '🔥', '🥺']
    if (!ALLOWED.includes(emoji)) return res.status(400).json({ error: 'Ungültiges Emoji.' })
    if (!db.prepare('SELECT 1 FROM group_messages WHERE id=? AND group_id=?').get(req.params.msgId, req.params.id))
      return res.status(404).json({ error: 'Nachricht nicht gefunden.' })
    const exists = db.prepare('SELECT 1 FROM group_message_reactions WHERE message_id=? AND user_id=? AND emoji=?').get(req.params.msgId, me.id, emoji)
    if (exists) {
      db.prepare('DELETE FROM group_message_reactions WHERE message_id=? AND user_id=? AND emoji=?').run(req.params.msgId, me.id, emoji)
    } else {
      db.prepare('INSERT OR IGNORE INTO group_message_reactions (message_id, user_id, emoji) VALUES (?,?,?)').run(req.params.msgId, me.id, emoji)
    }
    const reactions = db.prepare(`
      SELECT emoji, COUNT(*) as count, MAX(CASE WHEN user_id=? THEN 1 ELSE 0 END) as mine
      FROM group_message_reactions WHERE message_id=? GROUP BY emoji
    `).all(me.id, req.params.msgId).map(r => ({ emoji: r.emoji, count: r.count, mine: !!r.mine }))
    res.json({ reactions })
  })

  api.delete('/api/groups/:id/members/:userId', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const g = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    if (!g) return res.status(404).json({ error: 'Nicht gefunden.' })
    const isCreator = g.creator_id === me.id
    if (!isCreator && req.params.userId !== me.id) return res.status(403).json({ error: 'Kein Zugriff.' })
    db.prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').run(req.params.id, req.params.userId)
    const rotation = JSON.parse(g.rotation_order || '[]').filter(id => id !== req.params.userId)
    const newIdx   = Math.min(g.rotation_idx, Math.max(0, rotation.length - 1))
    db.prepare('UPDATE user_groups SET rotation_order=?,rotation_idx=? WHERE id=?').run(JSON.stringify(rotation), newIdx, req.params.id)
    const updated = db.prepare('SELECT * FROM user_groups WHERE id=?').get(req.params.id)
    // updated is null if this was the last member and the group was deleted by cascade — return success
    res.json({ group: updated ? formatGroup(updated, me.id) : null })
  })

  // ── Direct Messages ─────────────────────────────────────────────────────────

  api.get('/api/messages/unread-count', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const { count } = db.prepare('SELECT COUNT(*) as count FROM messages WHERE to_id=? AND read=0').get(me.id)
    res.json({ count })
  })

  api.get('/api/messages', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
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
    const me  = requireAuth(req, res)
    if (!me) return
    const fid   = req.params.friendId
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100))
    const msgs  = db.prepare(`
      SELECT m.*, u.username as from_name FROM messages m JOIN users u ON u.id=m.from_id
      WHERE (m.from_id=? AND m.to_id=?) OR (m.from_id=? AND m.to_id=?)
      ORDER BY m.created_at ASC LIMIT ?
    `).all(me.id, fid, fid, me.id, limit)
    db.prepare('UPDATE messages SET read=1 WHERE from_id=? AND to_id=? AND read=0').run(fid, me.id)
    res.json({ messages: msgs })
  })

  api.post('/api/messages/:friendId', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const text = sanitizeText(req.body?.text ?? '', 1000)
    if (!text) return res.status(400).json({ error: 'Kein Text.' })
    if (!db.prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?').get(me.id, req.params.friendId))
      return res.status(403).json({ error: 'Nur Freunde können Nachrichten senden.' })
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO messages (id,from_id,to_id,text,read,created_at) VALUES (?,?,?,?,0,?)')
      .run(id, me.id, req.params.friendId, text, Date.now())
    const msg = db.prepare(`
      SELECT m.*, u.username as from_name FROM messages m JOIN users u ON u.id=m.from_id WHERE m.id=?
    `).get(id)
    res.status(201).json({ message: msg })
  })

  // ── Static uploads ──────────────────────────────────────────────────────────
  api.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
    maxAge: '1d',
    etag: true,
  }))
}
