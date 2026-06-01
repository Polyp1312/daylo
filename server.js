import 'dotenv/config'
import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Resend } from 'resend'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH    = path.join(__dirname, 'daylo-db.json')
const JWT_SECRET = process.env.JWT_SECRET || 'daylo-secret-2025'
const PORT       = process.env.PORT || 3000

// ── DB helpers ─────────────────────────────────────────────────────────────────
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) } catch { return { users: [] } }
}
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)) }

function addNotification(db, userId, type, fromId, message) {
  const idx = db.users.findIndex(u => u.id === userId)
  if (idx === -1) return
  if (!db.users[idx].notifications) db.users[idx].notifications = []
  db.users[idx].notifications.unshift({
    id: crypto.randomUUID(), type, fromId, message, read: false, createdAt: Date.now(),
  })
  db.users[idx].notifications = db.users[idx].notifications.slice(0, 50)
}

const resend = new Resend(process.env.RESEND_API_KEY)

function authUser(req) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return null
  try { return jwt.verify(auth.slice(7), JWT_SECRET) } catch { return null }
}

const app = express()
app.use(express.json())

// ── Auth ───────────────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { email, password, username } = req.body || {}
  if (!email || !password || !username)
    return res.json({ error: 'Alle Felder ausfüllen.' })
  const db = readDB()
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.json({ error: 'E-Mail bereits registriert.' })
  if (db.users.find(u => u.username?.toLowerCase() === username.toLowerCase()))
    return res.json({ error: 'Nutzername bereits vergeben.' })
  const hash = await bcrypt.hash(password, 10)
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const user = { id: crypto.randomUUID(), email, username, hash, code, verified: false, createdAt: Date.now() }
  db.users.push(user)
  writeDB(db)
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
    console.warn(`⚠️  Mail nicht gesendet (${err.message})`)
    console.log(`\n🔑  Verifikationscode für ${email}: \x1b[33m${code}\x1b[0m\n`)
  }
  res.json({ success: true })
})

app.post('/api/auth/verify', (req, res) => {
  const { email, code } = req.body || {}
  const db  = readDB()
  const idx = db.users.findIndex(u => u.email.toLowerCase() === email?.toLowerCase())
  if (idx === -1) return res.json({ error: 'Benutzer nicht gefunden.' })
  if (db.users[idx].code !== code) return res.json({ error: 'Falscher Code.' })
  db.users[idx].verified = true
  writeDB(db)
  const { hash, code: _c, notifications: _n, ...safe } = db.users[idx]
  const token = jwt.sign(safe, JWT_SECRET, { expiresIn: '30d' })
  res.json({ success: true, token, user: safe })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  const db = readDB()
  const u  = db.users.find(u => u.email.toLowerCase() === email?.toLowerCase())
  if (!u) return res.json({ error: 'Kein Konto mit dieser E-Mail gefunden.' })
  const ok = await bcrypt.compare(password, u.hash)
  if (!ok) return res.json({ error: 'Falsches Passwort.' })
  if (!u.verified) return res.json({ error: 'Bitte bestätige zuerst deine E-Mail.' })
  const { hash, code, notifications: _n, ...safe } = u
  const token = jwt.sign(safe, JWT_SECRET, { expiresIn: '30d' })
  res.json({ success: true, token, user: safe })
})

app.get('/api/auth/me', (req, res) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.json({ error: 'Nicht autorisiert.' })
  try {
    const user = jwt.verify(auth.slice(7), JWT_SECRET)
    res.json({ user })
  } catch { res.json({ error: 'Session abgelaufen.' }) }
})

app.put('/api/auth/username', (req, res) => {
  const me = authUser(req)
  if (!me) return res.json({ error: 'Nicht autorisiert.' })
  const { username } = req.body || {}
  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.json({ error: 'Nutzername: 3–20 Zeichen, nur Buchstaben, Zahlen und _' })
  const db = readDB()
  if (db.users.find(u => u.id !== me.id && u.username?.toLowerCase() === username.toLowerCase()))
    return res.json({ error: 'Nutzername bereits vergeben.' })
  const idx = db.users.findIndex(u => u.id === me.id)
  if (idx === -1) return res.json({ error: 'User nicht gefunden.' })
  db.users[idx].username = username
  writeDB(db)
  const { hash, code, notifications: _n, ...safe } = db.users[idx]
  const token = jwt.sign(safe, JWT_SECRET, { expiresIn: '30d' })
  res.json({ success: true, token, user: safe })
})

// ── Users ──────────────────────────────────────────────────────────────────────

app.get('/api/users/search', (req, res) => {
  const me = authUser(req)
  const { q = '' } = req.query
  const db = readDB()
  const myUser      = me ? db.users.find(u => u.id === me.id) : null
  const myFriendIds = myUser?.friendIds       ?? []
  const myIncoming  = myUser?.pendingRequests ?? []
  const results = db.users
    .filter(u => u.verified && u.id !== me?.id &&
      (u.username?.toLowerCase().includes(q.toLowerCase()) ||
       u.email?.toLowerCase().includes(q.toLowerCase())))
    .map(u => {
      let status = 'none'
      if (myFriendIds.includes(u.id))                      status = 'friend'
      else if (myIncoming.includes(u.id))                  status = 'incoming'
      else if ((u.pendingRequests ?? []).includes(me?.id)) status = 'sent'
      return { id: u.id, username: u.username, email: u.email, status }
    })
    .slice(0, 20)
  res.json({ users: results })
})

// ── Friends ────────────────────────────────────────────────────────────────────

app.get('/api/friends', (req, res) => {
  const me = authUser(req)
  if (!me) return res.json({ error: 'Nicht autorisiert.' })
  const db = readDB()
  const user = db.users.find(u => u.id === me.id)
  if (!user) return res.json({ error: 'User nicht gefunden.' })
  const friends = db.users
    .filter(u => (user.friendIds ?? []).includes(u.id))
    .map(({ id, username, email }) => ({ id, username, email }))
  res.json({ friends })
})

app.post('/api/friends/request', (req, res) => {
  const me = authUser(req)
  if (!me) return res.json({ error: 'Nicht autorisiert.' })
  const { targetId } = req.body || {}
  if (!targetId) return res.json({ error: 'Keine targetId.' })
  const db = readDB()
  const targetIdx = db.users.findIndex(u => u.id === targetId)
  if (targetIdx === -1) return res.json({ error: 'User nicht gefunden.' })
  if (!db.users[targetIdx].pendingRequests) db.users[targetIdx].pendingRequests = []
  if (!db.users[targetIdx].pendingRequests.includes(me.id)) {
    db.users[targetIdx].pendingRequests.push(me.id)
    const sender = db.users.find(u => u.id === me.id)
    addNotification(db, targetId, 'friend_request', me.id,
      `${sender?.username ?? 'Jemand'} möchte dein Freund sein.`)
    writeDB(db)
  }
  res.json({ success: true })
})

app.get('/api/friends/requests', (req, res) => {
  const me = authUser(req)
  if (!me) return res.json({ error: 'Nicht autorisiert.' })
  const db   = readDB()
  const user = db.users.find(u => u.id === me.id)
  if (!user) return res.json({ error: 'User nicht gefunden.' })
  const requests = db.users
    .filter(u => (user.pendingRequests ?? []).includes(u.id))
    .map(({ id, username, email }) => ({ id, username, email }))
  res.json({ requests })
})

app.post('/api/friends/accept', (req, res) => {
  const me = authUser(req)
  if (!me) return res.json({ error: 'Nicht autorisiert.' })
  const { requesterId } = req.body || {}
  if (!requesterId) return res.json({ error: 'Keine requesterId.' })
  const db = readDB()
  const myIdx    = db.users.findIndex(u => u.id === me.id)
  const theirIdx = db.users.findIndex(u => u.id === requesterId)
  if (myIdx === -1 || theirIdx === -1) return res.json({ error: 'User nicht gefunden.' })
  db.users[myIdx].pendingRequests = (db.users[myIdx].pendingRequests ?? []).filter(id => id !== requesterId)
  if (!db.users[myIdx].friendIds)    db.users[myIdx].friendIds    = []
  if (!db.users[theirIdx].friendIds) db.users[theirIdx].friendIds = []
  if (!db.users[myIdx].friendIds.includes(requesterId))  db.users[myIdx].friendIds.push(requesterId)
  if (!db.users[theirIdx].friendIds.includes(me.id))     db.users[theirIdx].friendIds.push(me.id)
  const accepter = db.users[myIdx]
  addNotification(db, requesterId, 'friend_accepted', me.id,
    `${accepter?.username ?? 'Jemand'} hat deine Freundschaftsanfrage angenommen!`)
  writeDB(db)
  res.json({ success: true })
})

app.post('/api/friends/decline', (req, res) => {
  const me = authUser(req)
  if (!me) return res.json({ error: 'Nicht autorisiert.' })
  const { requesterId } = req.body || {}
  const db  = readDB()
  const idx = db.users.findIndex(u => u.id === me.id)
  if (idx === -1) return res.json({ error: 'User nicht gefunden.' })
  db.users[idx].pendingRequests = (db.users[idx].pendingRequests ?? []).filter(id => id !== requesterId)
  writeDB(db)
  res.json({ success: true })
})

app.delete('/api/friends/:id', (req, res) => {
  const me = authUser(req)
  if (!me) return res.json({ error: 'Nicht autorisiert.' })
  const db  = readDB()
  const idx = db.users.findIndex(u => u.id === me.id)
  if (idx === -1) return res.json({ error: 'User nicht gefunden.' })
  db.users[idx].friendIds = (db.users[idx].friendIds ?? []).filter(f => f !== req.params.id)
  writeDB(db)
  res.json({ success: true })
})

// ── Presence ───────────────────────────────────────────────────────────────────

app.post('/api/presence/ping', (req, res) => {
  const me = authUser(req)
  if (!me) return res.json({ error: 'Nicht autorisiert.' })
  const db  = readDB()
  const idx = db.users.findIndex(u => u.id === me.id)
  if (idx !== -1) { db.users[idx].lastSeen = Date.now(); writeDB(db) }
  res.json({ success: true })
})

app.get('/api/presence', (req, res) => {
  const { ids = '' } = req.query
  const idList = ids.split(',').filter(Boolean)
  if (!idList.length) return res.json({ presences: {} })
  const db = readDB()
  const presences = {}
  for (const id of idList) {
    const u = db.users.find(u => u.id === id)
    if (u) presences[id] = u.lastSeen ?? null
  }
  res.json({ presences })
})

// ── Notifications ──────────────────────────────────────────────────────────────

app.get('/api/notifications', (req, res) => {
  const me = authUser(req)
  if (!me) return res.json({ error: 'Nicht autorisiert.' })
  const db = readDB()
  const user = db.users.find(u => u.id === me.id)
  res.json({ notifications: user?.notifications ?? [] })
})

app.post('/api/notifications/mark-read', (req, res) => {
  const me = authUser(req)
  if (!me) return res.json({ error: 'Nicht autorisiert.' })
  const db  = readDB()
  const idx = db.users.findIndex(u => u.id === me.id)
  if (idx !== -1 && db.users[idx].notifications) {
    db.users[idx].notifications = db.users[idx].notifications.map(n => ({ ...n, read: true }))
    writeDB(db)
  }
  res.json({ success: true })
})

// ── Static files (production build) ───────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'dist')))
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => console.log(`🚀 daylo server läuft auf Port ${PORT}`))
