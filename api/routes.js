import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
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

// ── Email — Resend primary, Gmail fallback ────────────────────────────────────
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const gmailClient  = (process.env.GMAIL_USER && process.env.GMAIL_PASS)
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS } })
  : null

async function sendEmail(to, subject, html) {
  if (resendClient) {
    const { error } = await resendClient.emails.send({
      from: 'daylo. <onboarding@resend.dev>',
      to, subject, html,
    })
    if (!error) return
    console.warn('Resend-Fehler:', error.message)
  }
  if (gmailClient) {
    await gmailClient.sendMail({ from: `daylo. <${process.env.GMAIL_USER}>`, to, subject, html })
    return
  }
  throw new Error('Kein E-Mail-Provider konfiguriert.')
}

// ── Branded email templates ───────────────────────────────────────────────────
function emailVerifyHtml(code) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:48px 20px">
<tr><td align="center">
<table width="100%" style="max-width:460px;background:#141415;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)">
  <tr>
    <td style="background:linear-gradient(135deg,#7B61FF 0%,#00D9FF 100%);padding:36px;text-align:center">
      <p style="margin:0 0 10px;font-size:40px">🎬</p>
      <p style="margin:0;color:white;font-size:28px;font-weight:900;letter-spacing:-0.5px">daylo<span style="opacity:0.7">.</span></p>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.65);font-size:13px;font-weight:500">Jeden Tag. Eine Person. Dein Leben.</p>
    </td>
  </tr>
  <tr>
    <td style="padding:40px 36px;text-align:center">
      <h2 style="color:white;font-size:22px;font-weight:800;margin:0 0 12px">Dein Bestätigungscode</h2>
      <p style="color:#8E8E93;font-size:15px;margin:0 0 32px;line-height:1.65">
        Gib diesen Code in der App ein, um dein Konto zu aktivieren.
      </p>
      <div style="display:inline-block;background:rgba(123,97,255,0.14);border:2px solid rgba(123,97,255,0.4);border-radius:20px;padding:22px 36px;margin-bottom:28px">
        <span style="font-size:50px;font-weight:900;letter-spacing:14px;color:#7B61FF;font-variant-numeric:tabular-nums">${code}</span>
      </div>
      <p style="color:#8E8E93;font-size:13px;margin:0 0 6px">
        Gültig für <strong style="color:white">15 Minuten</strong>.
      </p>
      <p style="color:#3A3A3C;font-size:12px;margin:0">
        Kein Konto erstellt? Einfach ignorieren.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:18px 36px;border-top:1px solid rgba(255,255,255,0.06);text-align:center">
      <p style="color:#3A3A3C;font-size:11px;margin:0">© ${new Date().getFullYear()} daylo · Dein täglicher Vlog</p>
    </td>
  </tr>
</table>
</td></tr></table>
</body></html>`
}

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

// ── auto-editor detection ─────────────────────────────────────────────────────
// auto-editor intelligently removes silence + low-motion segments per clip.
// Falls back to ffmpeg-only silence detection when not installed.
let autoEditorCmd = null   // e.g. ['auto-editor'] or ['python', '-m', 'auto_editor']

;(async () => {
  for (const cmd of [['auto-editor'], ['python', '-m', 'auto_editor'], ['python3', '-m', 'auto_editor']]) {
    try {
      await new Promise((resolve, reject) => {
        const p = spawn(cmd[0], [...cmd.slice(1), '--version'], { stdio: 'ignore' })
        p.on('close', code => code === 0 ? resolve() : reject(new Error()))
        p.on('error', reject)
      })
      autoEditorCmd = cmd
      console.log(`✅ auto-editor (${cmd.join(' ')}) — intelligenter Schnitt aktiv`)
      break
    } catch {}
  }
  if (!autoEditorCmd) console.log('⚠️  auto-editor nicht gefunden — führe "pip install auto-editor" aus')
})()

function runAutoEditor(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      ...autoEditorCmd.slice(1),
      inputPath,
      '--no-open',
      '-o', outputPath,
    ]
    const proc  = spawn(autoEditorCmd[0], args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('auto-editor timeout')) }, 90_000)
    proc.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`auto-editor exit ${code}`)) })
    proc.on('error', e   => { clearTimeout(timer); reject(e) })
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// KI-Schnitt — single-pass pipeline
//  Pre-pass (auto-editor): intelligent silence + motion cut-point detection
//  Main pass (ffmpeg):     trim · speed-ramp · stabilise · denoise · scale ·
//                          xfade transitions · cinematic grade · audio master
// ═══════════════════════════════════════════════════════════════════════════════

// ── Low-level helpers ─────────────────────────────────────────────────────────

function ffrun(args, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const proc  = spawn(FFMPEG_BIN, args, { stdio: 'ignore' })
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('ffmpeg timeout')) }, timeoutMs)
    proc.on('error', e  => { clearTimeout(timer); reject(e) })
    proc.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)) })
  })
}

const FFPROBE_BIN = FFMPEG_BIN.replace(/ffmpeg(\.exe)?$/, (_, e) => `ffprobe${e ?? ''}`)

function probeDuration(filePath) {
  return new Promise(resolve => {
    const proc = spawn(FFPROBE_BIN, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.on('close', () => { const d = parseFloat(out.trim()); resolve(isNaN(d) ? 0 : d) })
    proc.on('error', () => resolve(0))
  })
}

// ── Stage 1 helpers ───────────────────────────────────────────────────────────

// Detect how much silence to trim from the START and END of a clip.
// Conservative: only removes clear dead air at edges, never real content.
function detectSilenceTrim(filePath, clipDur) {
  return new Promise(resolve => {
    const proc = spawn(FFMPEG_BIN, [
      '-i', filePath,
      '-af', 'silencedetect=noise=-42dB:d=0.25',
      '-f', 'null', '-',
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', () => {
      let trimStart = 0, trimEnd = 0
      // silence at the very beginning
      const firstEnd = stderr.match(/silence_end:\s*([\d.]+)/)
      if (firstEnd) {
        const se = parseFloat(firstEnd[1])
        if (se < 0.8) trimStart = se
      }
      // silence at the very end
      const allStarts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)]
      if (allStarts.length) {
        const lastSS = parseFloat(allStarts[allStarts.length - 1][1])
        const tail   = clipDur - lastSS
        if (tail > 0.1 && tail < 0.8) trimEnd = tail
      }
      resolve({ trimStart: Math.min(trimStart, 0.6), trimEnd: Math.min(trimEnd, 0.6) })
    })
    proc.on('error', () => resolve({ trimStart: 0, trimEnd: 0 }))
  })
}

// Cinematic transitions — snappy cuts feel more dynamic
const TRANSITIONS = [
  'fade',
  'smoothleft',
  'smoothright',
  'fadeblack',
  'dissolve',
  'slideup',
  'slideleft',
  'smoothup',
]

// Cinematic grade — subtle warmth + gentle sharpening, natural not Instagram-overdone
const CURVE_V = [
  "curves=r='0/0 0.25/0.255 0.75/0.775 1/0.985':g='0/0 0.25/0.248 0.75/0.755 1/0.955':b='0/0.015 0.25/0.255 0.75/0.695 1/0.855'",
  'eq=saturation=1.12:contrast=1.04:brightness=0.01',
  'unsharp=5:5:0.45:0:0:0',
  'vignette=PI/5:eval=init',
].join(',')

const AUDIO_MASTER = [
  'loudnorm=I=-14:TP=-2:LRA=11',
  'acompressor=threshold=-16dB:ratio=2:attack=8:release=100:knee=5',
  'alimiter=limit=-1dB:attack=5:release=50',
].join(',')

// ── Single-pass encode ────────────────────────────────────────────────────────
// All per-clip processing (trim, vidstab/deshake, denoise, scale) + transitions
// + grade in ONE ffmpeg call → no intermediate files, no double compression.
function singlePassEncode(clips, outputPath, hd = false) {
  const n = clips.length
  const resolution = hd
    ? 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
    : 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280'

  const fc = []
  const procDurs = []

  // Per-clip filter chains
  clips.forEach(({ rawDur, trim, trfPath, crop }, i) => {
    const effDur = rawDur - trim.trimStart - trim.trimEnd
    const isLong = effDur > 12
    const pd     = Math.max(0.1, effDur * (isLong ? 0.833 : 1))
    procDurs.push(pd)

    const vf = [], af = []

    // Normalise to CFR — phones often record VFR which breaks vidstab + xfade
    vf.push('fps=30')

    if (trim.trimStart > 0.05 || trim.trimEnd > 0.05) {
      const s = trim.trimStart.toFixed(3)
      const e = (rawDur - trim.trimEnd).toFixed(3)
      vf.push(`trim=start=${s}:end=${e},setpts=PTS-STARTPTS`)
      af.push(`atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS`)
    }
    if (isLong) { vf.push('setpts=0.833*PTS'); af.push('atempo=1.2') }

    // vidstab (2-pass) if analysis succeeded, else deshake fallback
    if (trfPath) {
      const trf = trfPath.replace(/\\/g, '/')
      vf.push(`vidstabtransform=input=${trf}:smoothing=30:optzoom=1:interpol=bicubic`)
    } else {
      vf.push('deshake=rx=16:ry=16:edge=mirror:blocksize=16')
    }

    // Temporal denoise
    vf.push('hqdn3d=2:2:1.5:1.5')

    // Auto-exposure: stretch histogram to full range, smooth over 30 frames
    // Fixes dark phone footage / bad white balance without looking artificial
    vf.push('normalize=blackpt=black:whitept=white:smoothing=30')

    // Remove black bars detected in pre-pass, then scale to target resolution
    if (crop) vf.push(`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`)
    vf.push(resolution)

    // FFT-based noise reduction (removes mic hiss, wind, background noise)
    af.push('afftdn=nr=8:nf=-25')
    af.push('dynaudnorm=f=200:g=15:p=0.9')

    fc.push(`[${i}:v]${vf.join(',')}[cv${i}]`)
    fc.push(`[${i}:a]${af.join(',')}[ca${i}]`)
  })

  // Transition timing
  const fadeDur  = Math.min(0.3, Math.min(...procDurs) / 2.5)
  const totalDur = procDurs.reduce((s, d, i) => s + d - (i < n - 1 ? fadeDur : 0), 0)

  // ── Ending constants ─────────────────────────────────────────────────────────
  const FADE_IN     = 0.5   // gentle fade-in
  const HOLD_END    = 0.6   // freeze last frame before fade
  const FADE_OUT    = 1.2   // slow, cinematic fade to black (was 0.4s)
  const extDur      = totalDur + HOLD_END
  const fo          = Math.max(0, extDur - FADE_OUT).toFixed(3)
  // Audio fades out 0.3 s before the freeze, then silence fills the hold
  const audioFadeAt = Math.max(0, totalDur - 0.3).toFixed(3)

  // Build ending filter:
  //   1. fade-in at start
  //   2. cinematic colour grade (CURVE_V)
  //   3. tpad: clone last frame for HOLD_END seconds (freeze frame)
  //   4. fade to black over FADE_OUT seconds
  const buildVideoEnd = (src) =>
    `${src}fade=t=in:st=0:d=${FADE_IN},${CURVE_V},tpad=stop_mode=clone:stop_duration=${HOLD_END},fade=t=out:st=${fo}:d=${FADE_OUT}[vout]`

  const buildAudioEnd = (src) =>
    `${src}${AUDIO_MASTER},afade=t=out:st=${audioFadeAt}:d=0.3,apad=pad_dur=${HOLD_END}[aout]`

  if (n === 1) {
    fc.push(buildVideoEnd('[cv0]'))
    fc.push(buildAudioEnd('[ca0]'))
  } else {
    let prevV = '[cv0]', cumOff = 0
    for (let i = 1; i < n; i++) {
      cumOff += procDurs[i - 1] - fadeDur
      const trans  = TRANSITIONS[i % TRANSITIONS.length]
      const offset = Math.max(0, cumOff).toFixed(3)
      const tag    = i < n - 1 ? `[xv${i}]` : '[xvlast]'
      fc.push(`${prevV}[cv${i}]xfade=transition=${trans}:duration=${fadeDur.toFixed(3)}:offset=${offset}${tag}`)
      prevV = tag
    }
    fc.push(buildVideoEnd('[xvlast]'))

    let prevA = '[ca0]'
    for (let i = 1; i < n; i++) {
      const tag = i < n - 1 ? `[xa${i}]` : '[xalast]'
      fc.push(`${prevA}[ca${i}]acrossfade=d=${fadeDur.toFixed(3)}:c1=tri:c2=tri${tag}`)
      prevA = tag
    }
    fc.push(buildAudioEnd('[xalast]'))
  }

  const inputs = clips.flatMap(c => ['-i', c.path])
  return ffrun([
    ...inputs,
    '-filter_complex', fc.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', hd ? 'medium' : 'fast', '-crf', hd ? '18' : '19',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-y', outputPath,
  ], 300_000)
}

// ── Black-bar detection ───────────────────────────────────────────────────────
// Scans the first 3 s of a clip to find any letterbox/pillarbox borders.
function detectCrop(clipPath) {
  return new Promise(resolve => {
    const proc = spawn(FFMPEG_BIN, [
      '-i', clipPath, '-t', '3',
      '-vf', 'cropdetect=24:16:0',
      '-f', 'null', '-',
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', () => {
      const matches = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)]
      if (!matches.length) return resolve(null)
      const last = matches[matches.length - 1]
      resolve({ w: +last[1], h: +last[2], x: +last[3], y: +last[4] })
    })
    proc.on('error', () => resolve(null))
  })
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────
// Samples 5 frames across the video, picks the one with the largest JPEG size
// (larger size = more detail = typically the sharpest/most interesting frame).
async function extractBestThumbnail(videoPath, thumbPath, seekSecs) {
  const dur = await probeDuration(videoPath)
  const fallback = () => ffrun([
    '-ss', Math.max(0.5, seekSecs).toFixed(2), '-i', videoPath,
    '-vframes', '1', '-q:v', '1', '-y', thumbPath,
  ])

  if (!dur || dur < 1) return fallback()

  const checkpoints = [0.15, 0.28, 0.42, 0.56, 0.70]
    .map(p => Math.min(Math.max(0.5, dur * p), dur - 0.3).toFixed(2))

  const results = await Promise.allSettled(checkpoints.map(async (t, i) => {
    const cand = thumbPath.replace(/\.jpg$/, `_c${i}.jpg`)
    await ffrun(['-ss', t, '-i', videoPath, '-vframes', '1', '-q:v', '1', '-y', cand])
    return cand
  }))

  const valid = results.filter(r => r.status === 'fulfilled').map(r => r.value)
  if (!valid.length) return fallback()

  // Pick the frame with most JPEG detail (largest file = most high-frequency content)
  let best = valid[0], bestSize = 0
  for (const c of valid) {
    try {
      const sz = fs.statSync(c).size
      if (sz > bestSize) { bestSize = sz; best = c }
    } catch {}
  }

  try {
    fs.renameSync(best, thumbPath)
  } catch {
    await fallback()
  }
  // Cleanup leftover candidates
  for (const c of valid) if (c !== thumbPath) try { fs.unlinkSync(c) } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// runKiSchnitt
// ═══════════════════════════════════════════════════════════════════════════════
async function runKiSchnitt(vlogId, userId, clipPaths, totalDuration, hd = false) {
  const userDir = path.join(UPLOADS_DIR, userId)
  const kiName  = `${vlogId}_ki.mp4`
  const outPath = path.join(userDir, kiName)
  const tmpDir  = path.join(userDir, `_tmp_${vlogId}`)

  try {
    fs.mkdirSync(tmpDir, { recursive: true })
    let workClips = [...clipPaths]

    // ── Pre-pass 1: auto-editor ──────────────────────────────────────────────
    if (autoEditorCmd) {
      const results = await Promise.allSettled(
        workClips.map(async (p, i) => {
          const ext   = path.extname(p) || '.webm'
          const aeOut = path.join(tmpDir, `ae${i}${ext}`)
          await runAutoEditor(p, aeOut)
          return aeOut
        })
      )
      workClips = results.map((r, i) => r.status === 'fulfilled' ? r.value : workClips[i])
      console.log(`🤖 auto-editor: ${results.filter(r => r.status === 'fulfilled').length}/${clipPaths.length} clips`)
    }

    // ── Probe durations + optional silence detection ─────────────────────────
    const rawDurations = await Promise.all(workClips.map(p => probeDuration(p)))
    const silenceTrims = autoEditorCmd
      ? workClips.map(() => ({ trimStart: 0, trimEnd: 0 }))
      : await Promise.all(workClips.map((p, i) => detectSilenceTrim(p, rawDurations[i])))

    let clips = workClips
      .map((p, i) => ({ path: p, rawDur: rawDurations[i], trim: silenceTrims[i] }))
      .filter(c => c.rawDur >= 0.5)
    if (!clips.length) {
      clips = [{ path: workClips[0], rawDur: rawDurations[0] || 1, trim: { trimStart: 0, trimEnd: 0 } }]
    }

    // ── Pre-pass 2: vidstab analysis (parallel, no encode) ───────────────────
    // vidstab analyses motion across the full clip before stabilizing — far
    // better than deshake which works frame-by-frame and creates warping.
    const stabResults = await Promise.allSettled(
      clips.map(async (c, i) => {
        const trfPath = path.join(tmpDir, `stab${i}.trf`)
        await ffrun([
          '-i', c.path,
          '-vf', `vidstabdetect=shakiness=8:accuracy=15:result=${trfPath.replace(/\\/g, '/')}`,
          '-f', 'null', '-',
        ], 60_000)
        return trfPath
      })
    )
    clips = clips.map((c, i) => ({
      ...c,
      trfPath: stabResults[i].status === 'fulfilled' ? stabResults[i].value : null,
    }))
    console.log(`🔭 vidstab: ${stabResults.filter(r => r.status === 'fulfilled').length}/${clips.length} clips analysiert`)

    // ── Pre-pass 3: black-bar detection (parallel, reads first 3 s only) ─────
    const cropResults = await Promise.allSettled(clips.map(c => detectCrop(c.path)))
    clips = clips.map((c, i) => ({
      ...c,
      crop: cropResults[i].status === 'fulfilled' ? cropResults[i].value : null,
    }))
    const cropsFound = cropResults.filter(r => r.status === 'fulfilled' && r.value).length
    if (cropsFound) console.log(`✂️  cropdetect: ${cropsFound} clips haben schwarze Ränder`)

    console.log(`🎬 KI-Schnitt${autoEditorCmd ? ' ✨' : ''}: ${clips.length} clips → single-pass encode`)

    await singlePassEncode(clips, outPath, hd)

    const realDuration = await probeDuration(outPath)
    const thumbName    = `${vlogId}_thumb.jpg`
    const thumbPath    = path.join(userDir, thumbName)
    await extractBestThumbnail(outPath, thumbPath, (realDuration || totalDuration || 10) * 0.28)

    db.prepare('UPDATE vlogs SET status=?, processed_filename=?, thumbnail=? WHERE id=?')
      .run('ready', kiName, thumbName, vlogId)
    console.log(`✅ KI-Schnitt fertig: ${kiName} (${clips.length} clips → ${Math.round(realDuration || 0)}s)`)

    // Cleanup
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    for (const p of clipPaths) { try { fs.unlinkSync(p) } catch {} }

  } catch (err) {
    console.error(`❌ KI-Schnitt Fehler (${vlogId}):`, err.message)
    db.prepare('UPDATE vlogs SET status=? WHERE id=?').run('failed', vlogId)
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
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

// ── SSE (Server-Sent Events) — real-time push to connected clients ────────────
const sseClients = new Map()   // userId → Set<Response>

function pushSSE(userId, event, data) {
  const clients = sseClients.get(userId)
  if (!clients?.size) return
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of [...clients]) {
    try { res.write(msg) } catch { clients.delete(res) }
  }
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
  filename:    (_req, _file, cb) => cb(null, `${crypto.randomUUID()}_raw${path.extname(_file.originalname) || '.webm'}`),
})
const upload = multer({
  storage: vlogStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
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
  const id  = crypto.randomUUID()
  const now = Date.now()
  db.prepare(`INSERT INTO notifications (id,user_id,type,from_id,message,read,created_at) VALUES (?,?,?,?,?,0,?)`)
    .run(id, userId, type, fromId, message, now)
  db.prepare(`
    DELETE FROM notifications WHERE user_id=? AND id NOT IN (
      SELECT id FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50
    )
  `).run(userId, userId)
  // Real-time push to connected SSE clients
  pushSSE(userId, 'notification', { id, type, fromId, message, created_at: now, read: false })
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
    reactions:  rxRows.map(r => ({ type: r.type, count: r.cnt, mine: !!r.mine })),
    visibility: row.visibility ?? 'friends',
  }
}

// ── Streak calculator ─────────────────────────────────────────────────────────
function calcStreak(userId) {
  const dates = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') as d
    FROM vlogs WHERE user_id=? ORDER BY d DESC
  `).all(userId).map(r => r.d)
  if (!dates.length) return 0

  const today        = new Date().toISOString().slice(0, 10)
  const currentMonth = today.slice(0, 7)

  // Premium streak freeze: if today's vlog is missing but yesterday's is present,
  // auto-consume one monthly freeze so the streak survives.
  let effectiveDates = dates
  if (dates[0] !== today) {
    const yesterday = new Date()
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    if (dates[0] === yesterdayStr) {
      const u = db.prepare('SELECT premium, streak_freeze_month FROM users WHERE id=?').get(userId)
      if (u?.premium && u?.streak_freeze_month !== currentMonth) {
        effectiveDates = [today, ...dates]
        db.prepare('UPDATE users SET streak_freeze_month=? WHERE id=?').run(currentMonth, userId)
      }
    }
  }

  let streak = 0
  for (let i = 0; i < effectiveDates.length; i++) {
    const expected = new Date()
    expected.setUTCDate(expected.getUTCDate() - i)
    if (effectiveDates[i] === expected.toISOString().slice(0, 10)) streak++
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
    sendEmail(
      friend.email,
      `${username} hat heute seinen Vlog hochgeladen 🎬`,
      `<div style="font-family:sans-serif;max-width:400px;margin:auto">
        <h2 style="color:#7B61FF">daylo.</h2>
        <p><strong>${username}</strong> hat heute einen neuen Vlog hochgeladen!</p>
        <p style="color:#999;font-size:12px">Öffne daylo, um ihn anzusehen.</p>
      </div>`
    ).catch(err => console.warn(`E-Mail an ${friend.email} fehlgeschlagen:`, err.message))

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
  setTimeout(cleanStaleSubscriptions, 10_000)

  // ── SSE endpoint — real-time events ────────────────────────────────────────
  api.get('/api/sse', (req, res) => {
    const token = req.query.token ?? req.headers.authorization?.slice(7)
    let me
    try { me = jwt.verify(token, JWT_SECRET) } catch { return res.status(401).end() }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')   // disable nginx buffering on Render
    res.flushHeaders()

    if (!sseClients.has(me.id)) sseClients.set(me.id, new Set())
    sseClients.get(me.id).add(res)

    // Heartbeat every 25 s (keeps connection alive through proxies)
    const hb = setInterval(() => {
      try { res.write(':ping\n\n') }
      catch { clearInterval(hb); sseClients.get(me.id)?.delete(res) }
    }, 25_000)

    req.on('close', () => {
      clearInterval(hb)
      sseClients.get(me.id)?.delete(res)
      if (!sseClients.get(me.id)?.size) sseClients.delete(me.id)
    })
  })

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

    const hash = await bcrypt.hash(password, 10)
    const code = String(Math.floor(100000 + Math.random() * 900000))
    db.prepare(`INSERT INTO users (id,email,username,hash,code,verified,created_at) VALUES (?,?,?,?,?,0,?)`)
      .run(crypto.randomUUID(), email, username, hash, code, Date.now())

    console.log(`\n🔑  Verifikationscode für ${email}: ${code}\n`)
    sendEmail(email, 'Dein daylo Bestätigungscode', emailVerifyHtml(code))
      .catch(err => console.warn('Mail-Fehler:', err.message))

    res.json({ success: true })
  })

  api.post('/api/auth/verify', rateLimit, (req, res) => {
    const email = sanitizeText(req.body?.email ?? '', 254).toLowerCase()
    const code  = sanitizeText(req.body?.code ?? '', 10)
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(email)
    if (!u)            return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
    if (u.verified)    return res.status(400).json({ error: 'Konto bereits verifiziert.' })
    if (u.code !== code) return res.status(400).json({ error: 'Falscher Code. Bitte nochmal prüfen.' })
    db.prepare('UPDATE users SET verified=1, code=NULL WHERE id=?').run(u.id)
    const { hash, code: _c, last_seen, ...safe } = u
    safe.verified = true
    const token = jwt.sign(safe, JWT_SECRET, { expiresIn: '30d' })
    res.json({ success: true, token, user: safe })
  })

  api.post('/api/auth/resend-code', rateLimit, async (req, res) => {
    const email = sanitizeText(req.body?.email ?? '', 254).toLowerCase()
    if (!email) return res.status(400).json({ error: 'E-Mail erforderlich.' })
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(email)
    if (!u)         return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
    if (u.verified) return res.status(400).json({ error: 'Konto bereits verifiziert.' })
    const code = String(Math.floor(100000 + Math.random() * 900000))
    db.prepare('UPDATE users SET code=? WHERE id=?').run(code, u.id)
    console.log(`\n🔑  Neuer Code für ${email}: ${code}\n`)
    sendEmail(email, 'Dein neuer daylo Code', emailVerifyHtml(code))
      .catch(err => console.warn('Mail-Fehler:', err.message))
    res.json({ success: true })
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

  // ── Password reset ──────────────────────────────────────────────────────────

  api.post('/api/auth/forgot-password', rateLimit, async (req, res) => {
    const email = sanitizeText(req.body?.email ?? '', 254).toLowerCase()
    if (!email) return res.status(400).json({ error: 'E-Mail erforderlich.' })
    const u = db.prepare('SELECT id FROM users WHERE email=? AND verified=1').get(email)
    // Always return success to prevent email enumeration
    if (u) {
      const code    = String(Math.floor(100000 + Math.random() * 900000))
      const expires = Date.now() + 15 * 60 * 1000  // 15 minutes
      db.prepare('UPDATE users SET reset_token=?, reset_token_expires=? WHERE id=?').run(code, expires, u.id)
      console.log(`🔑 Reset-Code für ${email}: ${code}`)
      sendEmail(
        email,
        'Dein daylo Passwort zurücksetzen',
        `<div style="font-family:sans-serif;max-width:400px;margin:auto;padding:24px">
          <h2 style="color:#7B61FF">Passwort zurücksetzen 🔑</h2>
          <p style="color:#555">Dein Reset-Code (gültig 15 Minuten):</p>
          <div style="font-size:42px;font-weight:900;letter-spacing:10px;color:#7B61FF;padding:24px;background:#f0eeff;border-radius:16px;text-align:center">${code}</div>
          <p style="color:#999;font-size:12px;margin-top:20px">Falls du das nicht angefordert hast, ignoriere diese E-Mail.</p>
        </div>`
      ).catch(err => console.warn('Reset-Mail Fehler:', err.message))
    }
    res.json({ success: true })
  })

  api.post('/api/auth/reset-password', rateLimit, async (req, res) => {
    const email    = sanitizeText(req.body?.email ?? '', 254).toLowerCase()
    const code     = sanitizeText(req.body?.code ?? '', 10)
    const password = req.body?.password ?? ''
    if (!email || !code || !password) return res.status(400).json({ error: 'Alle Felder erforderlich.' })
    if (password.length < 8) return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' })
    const u = db.prepare('SELECT * FROM users WHERE email=? AND reset_token=?').get(email, code)
    if (!u) return res.status(400).json({ error: 'Ungültiger Code.' })
    if (Date.now() > (u.reset_token_expires ?? 0)) return res.status(400).json({ error: 'Code abgelaufen. Bitte neu anfordern.' })
    const hash = await bcrypt.hash(password, 10)
    db.prepare('UPDATE users SET hash=?, reset_token=NULL, reset_token_expires=NULL WHERE id=?').run(hash, u.id)
    res.json({ success: true })
  })

  api.get('/api/auth/me', (req, res) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Nicht autorisiert.' })
    try {
      const user = jwt.verify(auth.slice(7), JWT_SECRET)
      const fresh = db.prepare('SELECT id,email,username,verified,avatar,bio,notif_prefs,searchable,color,premium,streak_freeze_month,created_at FROM users WHERE id=?').get(user.id)
      if (!fresh) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
      res.json({ user: { ...fresh, verified: !!fresh.verified, searchable: fresh.searchable !== 0 } })
    } catch { res.status(401).json({ error: 'Session abgelaufen.' }) }
  })

  // ── Premium code redemption ───────────────────────────────────────────────────
  api.post('/api/auth/redeem-code', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const code = sanitizeText(req.body?.code ?? '', 50).toLowerCase().trim()
    if (!code) return res.status(400).json({ error: 'Kein Code angegeben.' })

    const pc = db.prepare('SELECT * FROM premium_codes WHERE LOWER(code)=?').get(code)
    if (!pc) return res.status(404).json({ error: 'Ungültiger Code.' })

    // Already redeemed by this user?
    const already = db.prepare('SELECT 1 FROM code_redemptions WHERE code=? AND user_id=?').get(pc.code, me.id)
    if (already) return res.status(409).json({ error: 'Du hast diesen Code bereits eingelöst.' })

    // Max uses exceeded? (-1 = unlimited)
    if (pc.max_uses !== -1 && pc.used_count >= pc.max_uses)
      return res.status(410).json({ error: 'Dieser Code ist abgelaufen.' })

    db.transaction(() => {
      db.prepare('INSERT INTO code_redemptions (code,user_id,redeemed_at) VALUES (?,?,?)').run(pc.code, me.id, Date.now())
      db.prepare('UPDATE premium_codes SET used_count=used_count+1 WHERE code=?').run(pc.code)
      if (pc.reward === 'premium_lifetime') {
        db.prepare('UPDATE users SET premium=1 WHERE id=?').run(me.id)
      }
    })()

    res.json({ success: true, reward: pc.reward, message: '🎉 Premium freigeschaltet!' })
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
    const me     = requireAuth(req, res)
    if (!me) return
    const raw    = sanitizeText(req.query.q ?? '', 100).toLowerCase().trim()
    const offset = Math.max(0, parseInt(req.query.offset) || 0)
    const limit  = Math.min(40, Math.max(1, parseInt(req.query.limit) || 30))

    const statusCase = `
      CASE
        WHEN f.friend_id        IS NOT NULL THEN 'friend'
        WHEN fr_in.requester_id IS NOT NULL THEN 'incoming'
        WHEN fr_out.target_id   IS NOT NULL THEN 'sent'
        ELSE 'none'
      END AS status`

    const joins = `
      LEFT JOIN friends         f      ON f.user_id          = ? AND f.friend_id        = u.id
      LEFT JOIN friend_requests fr_in  ON fr_in.target_id    = ? AND fr_in.requester_id = u.id
      LEFT JOIN friend_requests fr_out ON fr_out.requester_id = ? AND fr_out.target_id   = u.id`

    let results
    if (raw.length === 0) {
      // Global discover: return all searchable verified users, friends first
      results = db.prepare(`
        SELECT u.id, u.username, u.avatar, u.premium, ${statusCase}
        FROM users u ${joins}
        WHERE u.verified = 1 AND u.id != ? AND u.searchable = 1
        ORDER BY CASE WHEN f.friend_id IS NOT NULL THEN 0 ELSE 1 END, u.username COLLATE NOCASE
        LIMIT ? OFFSET ?
      `).all(me.id, me.id, me.id, me.id, limit, offset)
    } else {
      const q = `%${raw}%`
      results = db.prepare(`
        SELECT u.id, u.username, u.avatar, u.premium, ${statusCase}
        FROM users u ${joins}
        WHERE u.verified = 1 AND u.id != ? AND (u.searchable = 1 OR u.id = ?)
          AND (LOWER(u.username) LIKE ? OR LOWER(u.email) LIKE ?)
        ORDER BY CASE WHEN LOWER(u.username) LIKE ? THEN 0 ELSE 1 END, u.username COLLATE NOCASE
        LIMIT ? OFFSET ?
      `).all(me.id, me.id, me.id, me.id, me.id, me.id, q, q, `${raw}%`, limit, offset)
    }
    res.json({ users: results })
  })

  // ── User profiles ────────────────────────────────────────────────────────────

  api.get('/api/users/:id/profile', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const targetId = req.params.id
    const u = db.prepare('SELECT id, username, avatar, bio, premium, created_at FROM users WHERE id=? AND verified=1').get(targetId)
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
      pushToUser(targetId, '👤 Freundschaftsanfrage', `${sender?.username ?? 'Jemand'} möchte dein Freund sein.`)
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
      pushToUser(requesterId, '🎉 Freundschaft angenommen', `${accepter?.username ?? 'Jemand'} ist jetzt dein Freund!`)
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

  api.post('/api/vlogs/upload', upload.any(), async (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return

    // Enforce vlog archive limit for free users (30 max)
    const freshUser = db.prepare('SELECT premium FROM users WHERE id=?').get(me.id)
    if (!freshUser?.premium) {
      const vlogCount = db.prepare('SELECT COUNT(*) as c FROM vlogs WHERE user_id=?').get(me.id)?.c ?? 0
      if (vlogCount >= 30) {
        return res.status(403).json({ error: 'Vlog-Limit erreicht. Upgrade auf Premium für unbegrenzten Speicher.' })
      }
    }
    const hd = !!freshUser?.premium

    const duration  = Math.max(0, parseFloat(req.body.duration) || 0)
    const clipCount = Math.max(1, parseInt(req.body.clipCount) || 1)
    const emoji     = sanitizeText(req.body.emoji || '🎬', 10)
    const title     = sanitizeText(req.body.title || '', 100) || null

    const userDir = path.join(UPLOADS_DIR, me.id)
    fs.mkdirSync(userDir, { recursive: true })

    // Collect uploaded clip files: new multi-clip format (clip_0, clip_1, …)
    // or legacy single 'video' field
    const files = req.files ?? []
    let clipFiles = files
      .filter(f => /^clip_\d+$/.test(f.fieldname))
      .sort((a, b) => parseInt(a.fieldname.split('_')[1]) - parseInt(b.fieldname.split('_')[1]))

    if (!clipFiles.length) {
      const single = files.find(f => f.fieldname === 'video')
      if (!single) return res.status(400).json({ error: 'Keine Videodatei erhalten.' })
      clipFiles = [single]
    }

    // Move all clips into the user dir
    const clipPaths = []
    for (const f of clipFiles) {
      const dest = path.join(userDir, f.filename)
      try { if (f.path !== dest) fs.renameSync(f.path, dest) } catch { try { fs.unlinkSync(f.path) } catch {} }
      clipPaths.push(dest)
    }
    if (!clipPaths.length) return res.status(400).json({ error: 'Keine Videodatei erhalten.' })

    // Save client thumbnail (base64) as fallback while KI processes
    let thumbName = null
    const thumbB64 = req.body.thumbnail ?? null
    if (thumbB64 && typeof thumbB64 === 'string' && thumbB64.startsWith('data:image/')) {
      try {
        const b64 = thumbB64.replace(/^data:image\/\w+;base64,/, '')
        thumbName = `${crypto.randomUUID()}_thumb.jpg`
        fs.writeFileSync(path.join(userDir, thumbName), Buffer.from(b64, 'base64'))
      } catch {}
    }

    const id         = crypto.randomUUID()
    const initStatus  = ffmpegAvailable ? 'processing' : 'ready'
    const rawVis      = sanitizeText(req.body?.visibility ?? 'friends', 20)
    const visibility  = ['friends', 'group', 'both', 'private'].includes(rawVis) ? rawVis : 'friends'

    const mainFilename = path.basename(clipPaths[0])
    db.prepare(`INSERT INTO vlogs (id,user_id,filename,duration,clip_count,emoji,title,thumbnail,status,visibility,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, me.id, mainFilename, duration, clipCount, emoji, title, thumbName, initStatus, visibility, Date.now())

    const vlog = db.prepare('SELECT * FROM vlogs WHERE id=?').get(id)
    if (ffmpegAvailable) runKiSchnitt(id, me.id, clipPaths, duration, hd)
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

  // ── Social feed — vlogs from friends + group members based on visibility ──────
  api.get('/api/feed', (req, res) => {
    const me     = requireAuth(req, res)
    if (!me) return
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit)  || 20))
    const offset = Math.max(0, parseInt(req.query.offset) || 0)

    const rows = db.prepare(`
      SELECT DISTINCT v.*, u.username as owner_name, u.avatar as owner_avatar
      FROM vlogs v
      JOIN users u ON u.id = v.user_id
      WHERE v.status = 'ready'
        AND v.user_id != ?
        AND (
          (v.visibility IN ('friends','both') AND v.user_id IN (
            SELECT friend_id FROM friends WHERE user_id = ?
          ))
          OR
          (v.visibility IN ('group','both') AND v.user_id IN (
            SELECT gm2.user_id FROM group_members gm1
            JOIN group_members gm2 ON gm1.group_id = gm2.group_id
            WHERE gm1.user_id = ? AND gm2.user_id != ?
          ))
        )
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
    `).all(me.id, me.id, me.id, me.id, limit, offset)

    res.json({
      vlogs: rows.map(v => ({
        ...formatVlog(v, v.user_id, me.id),
        ownerId:     v.user_id,
        ownerName:   v.owner_name,
        ownerAvatar: v.owner_avatar,
      }))
    })
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

  // ── Year Review (premium only) ────────────────────────────────────────────────
  api.get('/api/users/year-review', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const freshUser = db.prepare('SELECT premium FROM users WHERE id=?').get(me.id)
    if (!freshUser?.premium) return res.status(403).json({ error: 'Premium erforderlich.' })

    const year = parseInt(req.query.year) || new Date().getFullYear()
    const from = new Date(`${year}-01-01T00:00:00.000Z`).getTime()
    const to   = new Date(`${year + 1}-01-01T00:00:00.000Z`).getTime()

    const vlogs = db.prepare(`
      SELECT v.id, v.title, v.thumbnail, v.duration, v.created_at,
             (SELECT COUNT(*) FROM reactions r WHERE r.vlog_id = v.id) as reaction_count
      FROM vlogs v
      WHERE v.user_id=? AND v.created_at>=? AND v.created_at<? AND v.status='ready'
      ORDER BY v.created_at ASC
    `).all(me.id, from, to)

    const totalVlogs = vlogs.length
    const totalReactions = vlogs.reduce((s, v) => s + (v.reaction_count ?? 0), 0)

    // Longest streak in the year
    const dates = db.prepare(`
      SELECT DISTINCT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') as d
      FROM vlogs WHERE user_id=? AND created_at>=? AND created_at<? ORDER BY d ASC
    `).all(me.id, from, to).map(r => r.d)
    let longestStreak = 0, cur = 0
    for (let i = 0; i < dates.length; i++) {
      if (i === 0) { cur = 1; continue }
      const prev = new Date(dates[i - 1]); prev.setUTCDate(prev.getUTCDate() + 1)
      cur = prev.toISOString().slice(0, 10) === dates[i] ? cur + 1 : 1
      if (cur > longestStreak) longestStreak = cur
    }
    if (dates.length === 1) longestStreak = 1

    // Best month
    const monthCounts = {}
    for (const d of dates) {
      const m = d.slice(0, 7)
      monthCounts[m] = (monthCounts[m] ?? 0) + 1
    }
    const bestMonthKey = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
    const bestMonth = bestMonthKey ? MONTHS[parseInt(bestMonthKey.slice(5)) - 1] : null

    // Most-reacted vlog
    const topVlog = vlogs.sort((a, b) => b.reaction_count - a.reaction_count)[0] ?? null
    const userId  = me.id

    res.json({
      year,
      totalVlogs,
      totalReactions,
      longestStreak,
      bestMonth,
      mostReactedVlog: topVlog ? {
        id:        topVlog.id,
        title:     topVlog.title,
        thumbnail: topVlog.thumbnail ? `/uploads/vlogs/${userId}/${topVlog.thumbnail}` : null,
        reactions: topVlog.reaction_count,
      } : null,
    })
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
        pushToUser(vlog.user_id, `${type} Reaktion`, `${sender?.username ?? 'Jemand'} hat deinen Vlog mit ${type} reagiert.`)
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
    const vlogOwner = db.prepare('SELECT user_id FROM vlogs WHERE id=?').get(req.params.id)
    if (vlogOwner && vlogOwner.user_id !== me.id) {
      const commenter = db.prepare('SELECT username FROM users WHERE id=?').get(me.id)
      const preview = text.length > 40 ? text.slice(0, 40) + '…' : text
      addNotification(vlogOwner.user_id, 'vlog_comment', me.id,
        `${commenter?.username ?? 'Jemand'} hat deinen Vlog kommentiert: „${preview}"`)
      pushToUser(vlogOwner.user_id, '💬 Neuer Kommentar',
        `${commenter?.username ?? 'Jemand'}: ${text.slice(0, 60)}`)
    }
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

    // Enforce group limit for free users (3 max)
    const freshUser = db.prepare('SELECT premium FROM users WHERE id=?').get(me.id)
    if (!freshUser?.premium) {
      const groupCount = db.prepare('SELECT COUNT(*) as c FROM group_members WHERE user_id=?').get(me.id)?.c ?? 0
      if (groupCount >= 3) {
        return res.status(403).json({ error: 'Gruppen-Limit erreicht. Upgrade auf Premium für unbegrenzte Gruppen.' })
      }
    }
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

  // ── Group invite codes ──────────────────────────────────────────────────────

  api.post('/api/groups/:id/invite-code', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    if (!db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(req.params.id, me.id))
      return res.status(403).json({ error: 'Kein Zugriff.' })
    const existing = db.prepare('SELECT code FROM group_invite_codes WHERE group_id=?').get(req.params.id)
    if (existing) return res.json({ code: existing.code })
    const code = crypto.randomBytes(4).toString('hex').toUpperCase()
    db.prepare('INSERT INTO group_invite_codes (code,group_id,created_by,created_at) VALUES (?,?,?,?)')
      .run(code, req.params.id, me.id, Date.now())
    res.json({ code })
  })

  api.get('/api/groups/join/:code', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const invite = db.prepare('SELECT * FROM group_invite_codes WHERE code=?').get(req.params.code.toUpperCase())
    if (!invite) return res.status(404).json({ error: 'Ungültiger Einladungscode.' })
    const g = db.prepare('SELECT * FROM user_groups WHERE id=?').get(invite.group_id)
    if (!g) return res.status(404).json({ error: 'Gruppe nicht gefunden.' })
    const members = db.prepare('SELECT u.id,u.username,u.avatar FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=?').all(g.id)
    const alreadyMember = members.some(m => m.id === me.id)
    res.json({ group: { id: g.id, name: g.name, emoji: g.emoji, memberCount: members.length }, alreadyMember })
  })

  api.post('/api/groups/join/:code', (req, res) => {
    const me = requireAuth(req, res)
    if (!me) return
    const invite = db.prepare('SELECT * FROM group_invite_codes WHERE code=?').get(req.params.code.toUpperCase())
    if (!invite) return res.status(404).json({ error: 'Ungültiger Einladungscode.' })
    const g = db.prepare('SELECT * FROM user_groups WHERE id=?').get(invite.group_id)
    if (!g) return res.status(404).json({ error: 'Gruppe nicht gefunden.' })
    if (db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(g.id, me.id))
      return res.status(409).json({ error: 'Du bist bereits Mitglied.' })
    db.prepare('INSERT OR IGNORE INTO group_members VALUES (?,?)').run(g.id, me.id)
    const rotation = JSON.parse(g.rotation_order || '[]')
    if (!rotation.includes(me.id)) {
      rotation.push(me.id)
      db.prepare('UPDATE user_groups SET rotation_order=? WHERE id=?').run(JSON.stringify(rotation), g.id)
    }
    const joiner = db.prepare('SELECT username FROM users WHERE id=?').get(me.id)
    const members = db.prepare('SELECT user_id FROM group_members WHERE group_id=? AND user_id!=?').all(g.id, me.id)
    for (const m of members) {
      addNotification(m.user_id, 'group_added', me.id,
        `${joiner?.username ?? 'Jemand'} ist der Gruppe „${g.name}" beigetreten.`)
    }
    const updated = db.prepare('SELECT * FROM user_groups WHERE id=?').get(g.id)
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
      pushSSE(o.user_id, 'new_group_msg', { groupId: req.params.id, fromId: me.id })
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
    const sender = db.prepare('SELECT username FROM users WHERE id=?').get(me.id)
    pushToUser(req.params.friendId, `💬 ${sender?.username ?? 'Nachricht'}`, text.slice(0, 80))
    pushSSE(req.params.friendId, 'new_dm', { fromId: me.id, fromName: sender?.username })
    res.status(201).json({ message: msg })
  })

  // ── Static uploads ──────────────────────────────────────────────────────────
  api.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
    maxAge: '1d',
    etag: true,
  }))
}
