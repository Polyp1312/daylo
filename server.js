import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import zlib from 'zlib'
import { createReadStream, statSync } from 'fs'
import { registerRoutes } from './api/routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET nicht gesetzt — Fallback-Geheimnis wird verwendet. NUR für Entwicklung!')
}

const app = express()

// ── Security headers ─────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})

// ── Body parser with size limit ──────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }))

// ── Gzip compression for text responses ─────────────────────────────────────
app.use((req, res, next) => {
  const ae = req.headers['accept-encoding'] ?? ''
  if (!ae.includes('gzip')) return next()
  const origJson = res.json.bind(res)
  res.json = (data) => {
    const buf = Buffer.from(JSON.stringify(data), 'utf8')
    if (buf.length < 1024) return origJson(data)  // don't compress tiny responses
    zlib.gzip(buf, (err, compressed) => {
      if (err) return origJson(data)
      res.setHeader('Content-Encoding', 'gzip')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Vary', 'Accept-Encoding')
      res.end(compressed)
    })
  }
  next()
})

registerRoutes(app)

// ── Static files with cache headers ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    // Never cache index.html so the app always gets the latest shell
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    }
  },
}))

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }))

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next()
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err)
  if (res.headersSent) return
  res.status(500).json({ error: 'Interner Serverfehler.' })
})

app.listen(PORT, () => {
  console.log(`🚀 daylo server läuft auf Port ${PORT}`)

  // Self-ping every 14 minutes to prevent Render free-tier spin-down
  const APP_URL = process.env.APP_URL
  if (APP_URL) {
    setInterval(() => {
      fetch(`${APP_URL}/health`).catch(() => {})
    }, 14 * 60 * 1000)
  }
})
