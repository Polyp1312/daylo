// v9 — ClipsPanel + 24h session timer + auto-trigger on 60s / 24h
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RefreshCw, Check, Sparkles, AlertCircle, Lock, Clock, Film } from 'lucide-react'
import { api } from '../lib/api'
import { saveClip, loadTodayClips, loadYesterdayClips, deleteClips } from '../lib/clipStore'
import { useAuth } from '../context/AuthContext'

// ── Constants ──────────────────────────────────────────────────────────────────
const FREE_MAX_SEC      = 60
const PREMIUM_MAX_SEC   = 90
const FREE_FILTER_COUNT = 5
const EMOJIS_VLOG = ['🌅','🎬','🏋️','🌄','🎉','🎵','🏖️','🌙','🍕','🎮','🚀','🌸']
const randEmoji   = () => EMOJIS_VLOG[Math.floor(Math.random() * EMOJIS_VLOG.length)]

// ── Session start helpers (localStorage) ──────────────────────────────────────
// Key is NOT date-based so a session that starts at 11pm and continues past
// midnight (or after a long break) is still correctly tracked.
const SESSION_KEY      = 'daylo_session_start'
const getSessionStart  = ()  => { const v = localStorage.getItem(SESSION_KEY); return v ? +v : null }
const saveSessionStart = t   => localStorage.setItem(SESSION_KEY, String(t))
const clearSessionKey  = ()  => localStorage.removeItem(SESSION_KEY)

const FILTERS = [
  { name: 'Normal',  css: 'none' },
  { name: 'Vivid',   css: 'saturate(1.65) contrast(1.1) brightness(1.04)' },
  { name: 'Warm',    css: 'sepia(0.38) saturate(1.65) brightness(1.07) contrast(1.05)' },
  { name: 'Cool',    css: 'hue-rotate(22deg) saturate(1.45) brightness(0.97) contrast(1.1)' },
  { name: 'B&W',     css: 'grayscale(1) contrast(1.22) brightness(1.06)' },
  { name: 'Fade',    css: 'contrast(0.78) brightness(1.28) saturate(0.48)' },
  { name: 'Neon',    css: 'hue-rotate(265deg) saturate(3.2) brightness(1.12) contrast(1.12)' },
  { name: 'Drama',   css: 'contrast(1.48) saturate(0.68) brightness(0.87)' },
  { name: 'Golden',  css: 'sepia(0.48) saturate(2.1) hue-rotate(-18deg) brightness(1.08) contrast(1.05)' },
  { name: 'Cyber',   css: 'hue-rotate(155deg) saturate(2.4) contrast(1.18) brightness(1.06)' },
]

const EMOJIS = [
  '🔥','💀','😍','🤯','✨','💯','🎬','❤️','⚡','🏆','👑','🎉',
  '🤙','😎','🥶','💫','😂','💪','👀','🫶','🌊','🎵','💥','🫠',
]

const formatDur = secs => {
  if (secs < 60) return `${Math.round(secs)}s`
  const m = Math.floor(secs / 60); const s = Math.round(secs % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function fmt24h(ms) {
  if (ms <= 0) return '00:00:00'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── Clips Panel ────────────────────────────────────────────────────────────────
// Slide-up sheet that shows all clips for today, allows reorder + delete + submit
function ClipsPanel({ clips, totalSec, maxSec, sessionStart, onClose, onDelete, onMove, onSubmit }) {
  const listRef = useRef(null)
  const [countdown, setCountdown] = useState('')

  // Scroll to bottom when new clip is added
  useEffect(() => {
    if (clips.length > 0) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [clips.length])

  // Live 24h countdown display
  useEffect(() => {
    if (!sessionStart) { setCountdown(''); return }
    const deadline = sessionStart + 24 * 3_600_000
    const tick = () => setCountdown(fmt24h(Math.max(0, deadline - Date.now())))
    tick()
    const t = setInterval(tick, 1_000)
    return () => clearInterval(t)
  }, [sessionStart])

  const progress = Math.min((totalSec / maxSec) * 100, 100)
  const full = progress >= 100

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-30"
        style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-[28px] overflow-hidden"
        style={{
          height: '84vh',
          background: '#141415',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 -24px 80px rgba(0,0,0,0.8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#3A3A3C]" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-2 pb-3 flex-shrink-0">
          <div>
            <h2 className="text-white font-black text-xl leading-tight">Meine Clips</h2>
            <p className="text-[#8E8E93] text-xs mt-0.5">
              {clips.length} Clip{clips.length !== 1 ? 's' : ''}
              {clips.length > 0 && ` · ${formatDur(totalSec)} aufgenommen`}
            </p>
          </div>
          <motion.button whileTap={{ scale: 0.85 }} onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#2C2C2E] flex items-center justify-center flex-shrink-0 mt-0.5">
            <X size={15} className="text-[#8E8E93]" />
          </motion.button>
        </div>

        {/* Progress bar + countdown */}
        <div className="px-5 mb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-widest">Tagesfortschritt</span>
            <span className="text-xs font-black tabular-nums" style={{ color: full ? '#2ECC71' : '#7B61FF' }}>
              {Math.round(totalSec)}s / {maxSec}s
            </span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(44,44,46,0.8)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: full ? 'linear-gradient(90deg, #2ECC71, #00D9FF)' : 'linear-gradient(90deg, #7B61FF, #00D9FF)' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>

          <AnimatePresence>
            {full && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-2 rounded-xl px-3 py-2 flex items-center gap-2"
                style={{ background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.25)' }}>
                <span className="text-sm">🎉</span>
                <span className="text-xs text-[#2ECC71] font-bold">60 Sekunden erreicht! Jetzt abgeben.</span>
              </motion.div>
            )}
          </AnimatePresence>

          {countdown && !full && (
            <div className="flex items-center gap-1.5 mt-2">
              <Clock size={11} className="text-[#8E8E93] flex-shrink-0" />
              <span className="text-[11px] text-[#8E8E93]">
                Auto-Abgabe in{' '}
                <span className="text-white font-bold font-mono">{countdown}</span>
              </span>
            </div>
          )}
        </div>

        <div className="h-px bg-[#2C2C2E] mx-5 mb-1 flex-shrink-0" />

        {/* Clip list */}
        {clips.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 px-10">
            <motion.div
              animate={{ scale: [1, 1.04, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="w-24 h-24 rounded-3xl flex items-center justify-center"
              style={{ background: 'rgba(123,97,255,0.1)', border: '2px dashed rgba(123,97,255,0.3)' }}>
              <Film size={36} className="text-[#7B61FF]/50" />
            </motion.div>
            <div className="text-center">
              <p className="text-white font-bold text-base mb-1">Noch keine Clips</p>
              <p className="text-[#8E8E93] text-sm leading-relaxed">
                Tippe auf den weißen Knopf um deinen ersten Moment aufzunehmen!
              </p>
            </div>
          </div>
        ) : (
          <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-2 space-y-2.5 min-h-0">
            <AnimatePresence initial={false}>
              {clips.map((clip, i) => (
                <motion.div
                  key={clip.key ?? i}
                  layout
                  initial={{ opacity: 0, x: -20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                  className="flex items-center gap-3 rounded-2xl p-3"
                  style={{ background: 'rgba(28,28,30,0.95)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {/* Clip number pill */}
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(123,97,255,0.18)', border: '1px solid rgba(123,97,255,0.3)' }}>
                    <span className="text-[10px] font-black text-[#7B61FF]">{i + 1}</span>
                  </div>

                  {/* Thumbnail */}
                  <div className="w-11 h-[60px] rounded-xl overflow-hidden flex-shrink-0"
                    style={{ border: '1.5px solid rgba(255,255,255,0.1)' }}>
                    {clip.thumbUrl
                      ? <img src={clip.thumbUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-[#2C2C2E] flex items-center justify-center">
                          <Film size={12} className="text-[#3A3A3C]" />
                        </div>}
                  </div>

                  {/* Duration */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold">Clip {i + 1}</p>
                    <p className="text-[#8E8E93] text-xs font-mono mt-0.5">{clip.duration.toFixed(1)}s</p>
                  </div>

                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <motion.button whileTap={{ scale: 0.8 }}
                      onClick={() => onMove(i, -1)} disabled={i === 0}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-20"
                      style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <span className="text-white/80 text-sm leading-none select-none">↑</span>
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.8 }}
                      onClick={() => onMove(i, 1)} disabled={i === clips.length - 1}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-20"
                      style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <span className="text-white/80 text-sm leading-none select-none">↓</span>
                    </motion.button>
                  </div>

                  {/* Delete */}
                  <motion.button whileTap={{ scale: 0.82 }} onClick={() => onDelete(i)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(255,69,58,0.11)', border: '1px solid rgba(255,69,58,0.22)' }}>
                    <X size={14} className="text-red-400" />
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Submit button */}
        <div className="px-5 pt-3 pb-10 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,20,21,0.98)' }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onSubmit}
            disabled={clips.length === 0}
            className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-35 flex items-center justify-center gap-2.5"
            style={{
              background: clips.length > 0 ? 'linear-gradient(135deg, #7B61FF, #00D9FF)' : 'rgba(123,97,255,0.25)',
              boxShadow:  clips.length > 0 ? '0 0 32px rgba(123,97,255,0.45)' : 'none',
            }}>
            <Sparkles size={17} />
            {clips.length === 0 ? 'Noch keine Clips' : 'Jetzt abgeben →'}
          </motion.button>
        </div>
      </motion.div>
    </>
  )
}

// ── Upload / Processing Screen ─────────────────────────────────────────────────
const UPLOAD_STEPS = [
  { label: 'Clips zusammenfügen' },
  { label: 'Hochladen…'          },
  { label: 'Vlog fertigstellen'  },
]

// ── Title input screen ─────────────────────────────────────────────────────────
const VIS_OPTIONS = [
  { value: 'friends', label: '👫 Freunde' },
  { value: 'group',   label: '👥 Gruppe'  },
  { value: 'both',    label: '🌍 Beide'   },
]

function TitleScreen({ firstThumb, onSkip, onConfirm }) {
  const [title,      setTitle]      = useState('')
  const [visibility, setVisibility] = useState('friends')

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col">

      {/* Blurred thumbnail background */}
      {firstThumb ? (
        <>
          <img src={firstThumb} alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'blur(28px) brightness(0.35) saturate(1.4)', transform: 'scale(1.12)' }} />
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.75) 100%)' }} />
        </>
      ) : (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(123,97,255,0.18) 0%, #080809 60%)' }} />
      )}

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6">

        {/* Thumbnail preview */}
        {firstThumb && (
          <motion.div
            initial={{ scale: 0.75, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 18, stiffness: 200, delay: 0.05 }}
            className="w-28 h-40 rounded-3xl overflow-hidden mb-8 shadow-2xl"
            style={{ border: '2px solid rgba(255,255,255,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
            <img src={firstThumb} alt="" className="w-full h-full object-cover" />
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="w-full text-center">
          <p className="text-white/50 text-sm font-semibold uppercase tracking-widest mb-2">Wie war dein Tag?</p>
          <h2 className="text-white font-black text-[28px] mb-7 leading-tight">Gib ihm einen Titel</h2>

          {/* Input — frosted glass */}
          <div className="rounded-2xl px-5 py-4 mb-3 focus-within:border-white/35 transition-all"
            style={{
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              border: '1.5px solid rgba(255,255,255,0.14)',
            }}>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value.slice(0, 60))}
              onKeyDown={e => e.key === 'Enter' && onConfirm(title.trim(), visibility)}
              placeholder="Beschreibe deinen Tag…"
              className="w-full bg-transparent text-white placeholder-white/25 text-lg font-semibold text-center outline-none"
              style={{ caretColor: 'white' }}
            />
          </div>
          <AnimatePresence>
            {title.length > 0 && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-white/30 text-xs mb-4">{title.length}/60</motion.p>
            )}
          </AnimatePresence>

          {/* Visibility picker */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-2">Sichtbar für</p>
            <div className="flex gap-2 justify-center">
              {VIS_OPTIONS.map(opt => (
                <motion.button key={opt.value} whileTap={{ scale: 0.92 }}
                  onClick={() => setVisibility(opt.value)}
                  className="px-4 py-2 rounded-full text-sm font-bold transition-all"
                  style={{
                    background: visibility === opt.value ? 'rgba(123,97,255,0.85)' : 'rgba(255,255,255,0.1)',
                    border: `1.5px solid ${visibility === opt.value ? '#7B61FF' : 'rgba(255,255,255,0.15)'}`,
                    color: 'white',
                    backdropFilter: 'blur(12px)',
                  }}>
                  {opt.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Buttons */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="relative px-6 pb-14 flex gap-3">
        <motion.button whileTap={{ scale: 0.96 }} onClick={onSkip}
          className="flex-1 py-4 rounded-2xl font-semibold text-sm"
          style={{
            color: 'rgba(255,255,255,0.55)',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.14)',
            backdropFilter: 'blur(12px)',
          }}>
          Überspringen
        </motion.button>
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => onConfirm(title.trim(), visibility)}
          className="flex-1 py-4 rounded-2xl font-black text-white text-sm"
          style={{
            background: 'linear-gradient(135deg, #7B61FF, #00D9FF)',
            boxShadow: '0 0 28px rgba(123,97,255,0.5)',
          }}>
          Posten →
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

function ProcessingScreen({ clips, title, visibility = 'friends', onComplete }) {
  const [step,     setStep]     = useState(0)
  const [progress, setProgress] = useState(0)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        if (cancelled) return

        setStep(1)
        const duration = clips.reduce((s, c) => s + (c.duration ?? 0), 0)
        const formData = new FormData()

        for (let i = 0; i < clips.length; i++) {
          const ext = clips[i].blob?.type?.includes('mp4') ? 'mp4' : 'webm'
          formData.append(`clip_${i}`, clips[i].blob, `clip_${i}.${ext}`)
        }
        formData.append('duration',   String(Math.round(duration)))
        formData.append('clipCount',  String(clips.length))
        formData.append('emoji',      randEmoji())
        formData.append('visibility', visibility)
        if (title)               formData.append('title',     title)
        if (clips[0]?.thumbUrl)  formData.append('thumbnail', clips[0].thumbUrl)

        const { vlog } = await api.vlogs.upload(formData, pct => {
          if (!cancelled) setProgress(pct)
        })
        if (cancelled) return

        setStep(2)
        setTimeout(() => { if (!cancelled) onComplete(vlog) }, 1400)
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-10 gap-6"
      style={{ background: '#080809' }}>
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 14 }}
        className="w-20 h-20 rounded-3xl flex items-center justify-center"
        style={{ background: 'rgba(255,69,58,0.15)', border: '1.5px solid rgba(255,69,58,0.3)' }}>
        <AlertCircle size={36} className="text-red-400" />
      </motion.div>
      <div className="text-center">
        <p className="text-white font-black text-xl mb-2">Upload fehlgeschlagen</p>
        <p className="text-[#8E8E93] text-sm leading-relaxed">{error}</p>
      </div>
      <motion.button whileTap={{ scale: 0.96 }} onClick={() => window.location.reload()}
        className="px-8 py-3.5 rounded-2xl font-black text-white"
        style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
        Erneut versuchen
      </motion.button>
    </motion.div>
  )

  const done     = step === 2
  const barWidth = done ? '100%' : step === 0 ? '6%' : `${12 + progress * 0.83}%`

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8"
      style={{ background: 'radial-gradient(ellipse at 50% 20%, rgba(123,97,255,0.22) 0%, #080809 55%)' }}>

      <motion.div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-64 rounded-full blur-3xl pointer-events-none"
        style={{ background: 'rgba(123,97,255,0.12)' }}
        animate={{ opacity: [0.8, 1.2, 0.8] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />

      <div className="relative mb-10">
        <AnimatePresence mode="wait">
          {!done ? (
            <motion.div key="loading"
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className="relative w-36 h-36 flex items-center justify-center">
              <motion.div className="absolute inset-0 rounded-full"
                style={{ border: '3px solid transparent', borderTopColor: '#7B61FF', borderRightColor: '#00D9FF' }}
                animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} />
              <motion.div className="absolute inset-4 rounded-full"
                style={{ border: '2px solid transparent', borderTopColor: '#00D9FF', borderBottomColor: '#7B61FF80' }}
                animate={{ rotate: -360 }} transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }} />
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(123,97,255,0.15)', border: '1px solid rgba(123,97,255,0.3)' }}>
                <span className="text-4xl select-none">🎬</span>
              </div>
            </motion.div>
          ) : (
            <motion.div key="done"
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 11, stiffness: 200 }}
              className="relative w-36 h-36 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #2ECC71, #00D9FF)',
                boxShadow: '0 0 60px rgba(46,204,113,0.55), 0 0 120px rgba(0,217,255,0.2)',
              }}>
              <Check size={56} className="text-white" strokeWidth={2.5} />
              {[1.3, 1.6].map((s, i) => (
                <motion.div key={i} className="absolute inset-0 rounded-full"
                  style={{ border: '2px solid rgba(46,204,113,0.35)' }}
                  animate={{ scale: [1, s, 1], opacity: [0.7, 0, 0.7] }}
                  transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.5 }} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="done-text"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12 px-4">
            <h2 className="text-white font-black text-3xl mb-2 leading-tight">Gespeichert! 🎉</h2>
            <p className="text-[#8E8E93] text-base leading-relaxed">Deine Crew kann ihn jetzt sehen</p>
          </motion.div>
        ) : (
          <motion.div key="loading-text"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12 px-4">
            <h2 className="text-white font-black text-2xl mb-2">Wird verarbeitet…</h2>
            <motion.p key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-[#8E8E93] text-base">
              {step === 0 ? 'Clips zusammenfügen'
               : step === 1 ? `Hochladen ${progress}%`
               : 'Fast fertig…'}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full space-y-4 mb-10">
        {UPLOAD_STEPS.map((s, i) => {
          const isDone    = step > i
          const isCurrent = step === i + 1 && !done
          return (
            <motion.div key={i} animate={{ opacity: step < i ? 0.35 : 1 }} className="flex items-center gap-4">
              <motion.div
                animate={{
                  backgroundColor: isDone ? '#2ECC71' : isCurrent ? 'rgba(123,97,255,0.25)' : 'rgba(44,44,46,0.8)',
                  scale: isCurrent ? [1, 1.08, 1] : 1,
                }}
                transition={{ scale: { duration: 1.2, repeat: isCurrent ? Infinity : 0 } }}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ border: isCurrent ? '1.5px solid rgba(123,97,255,0.6)' : 'none' }}>
                {isDone ? (
                  <Check size={15} className="text-white" strokeWidth={2.5} />
                ) : isCurrent ? (
                  <motion.div className="w-2.5 h-2.5 rounded-full bg-[#7B61FF]"
                    animate={{ scale: [1, 1.6, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
                ) : (
                  <span className="text-[#3A3A3C] text-xs font-black">{i + 1}</span>
                )}
              </motion.div>
              <motion.span
                animate={{ color: isDone ? '#2ECC71' : isCurrent ? '#ffffff' : '#3A3A3C' }}
                className="text-sm font-bold flex-1">
                {s.label}
              </motion.span>
              {isCurrent && i === 1 && (
                <motion.span key={progress} initial={{ scale: 1.2 }} animate={{ scale: 1 }}
                  className="text-[#7B61FF] text-sm font-black tabular-nums">
                  {progress}%
                </motion.span>
              )}
              {isCurrent && i !== 1 && (
                <motion.div className="w-4 h-4 rounded-full border-2 border-t-transparent border-[#7B61FF]"
                  animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
              )}
              {isDone && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 12 }}
                  className="w-5 h-5 rounded-full bg-[#2ECC71]/20 flex items-center justify-center">
                  <Check size={10} className="text-[#2ECC71]" strokeWidth={3} />
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>

      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(44,44,46,0.6)' }}>
        <motion.div className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #7B61FF, #00D9FF)' }}
          animate={{ width: barWidth }}
          transition={{ duration: 0.4, ease: 'easeOut' }} />
      </div>
    </motion.div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function RecordView({ onBack, onDone }) {
  const { user } = useAuth()
  const isPremium = !!user?.premium
  const MAX_SEC   = isPremium ? PREMIUM_MAX_SEC : FREE_MAX_SEC

  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const rafRef      = useRef(null)
  const stopDrawRef = useRef(null)
  const streamRef   = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef   = useRef([])
  const startRef    = useRef(null)

  // Guard refs for auto-triggers — ensure they fire at most once per session
  const triggeredFullRef  = useRef(false)
  const triggered24hRef   = useRef(false)

  const [facingMode,     setFacingMode]     = useState('user')
  const [permission,     setPermission]     = useState('requesting')
  const [isRecording,    setIsRecording]    = useState(false)
  const [liveTimer,      setLiveTimer]      = useState(0)
  const [clips,          setClips]          = useState([])
  const [totalSec,       setTotalSec]       = useState(0)
  const [processing,     setProcessing]     = useState(false)
  const [showTitle,      setShowTitle]      = useState(false)
  const [showClipsPanel, setShowClipsPanel] = useState(false)
  const [vlogTitle,      setVlogTitle]      = useState('')
  const [vlogVisibility, setVlogVisibility] = useState('friends')
  const [flash,          setFlash]          = useState(false)
  const [switching,      setSwitching]      = useState(false)
  const [filterIdx,      setFilterIdx]      = useState(() => {
    const saved = parseInt(localStorage.getItem('yd_filterIdx') ?? '0', 10)
    return isNaN(saved) ? 0 : Math.min(saved, FILTERS.length - 1)
  })
  const [focusPoint,     setFocusPoint]     = useState(null)
  const [zoom,           setZoom]           = useState(1)
  const [stickers,       setStickers]       = useState([])
  const [activePanel,    setActivePanel]    = useState(null)
  const [pendingEmoji,   setPendingEmoji]   = useState(null)
  const [filterThumbs,   setFilterThumbs]   = useState(null)
  const [showZoom,       setShowZoom]       = useState(false)

  // 24h session start — loaded from localStorage so it persists across app restarts
  const [sessionStart, setSessionStart] = useState(() => getSessionStart())

  const filterCSS = FILTERS[filterIdx].css
  const remaining = Math.max(MAX_SEC - totalSec, 0)
  const progress  = Math.min(((totalSec + (isRecording ? liveTimer : 0)) / MAX_SEC) * 100, 100)

  // ── Load clips from IndexedDB on mount ──────────────────────────────────────
  // If an active session exists (user recorded clips and hasn't submitted yet)
  // we also load yesterday's clips so a session that crosses midnight or resumes
  // after a long break is fully restored.
  useEffect(() => {
    const hasActiveSession = getSessionStart() !== null
    const loaders = hasActiveSession
      ? [loadYesterdayClips(), loadTodayClips()]   // session may span midnight
      : [Promise.resolve([]),   loadTodayClips()]  // fresh start: today only

    Promise.all(loaders).then(([older, newer]) => {
      const all = [...older, ...newer]
      if (!all.length) return
      const withKey = all.map(c => ({ ...c, key: `idb_${c.idbId}` }))
      setClips(withKey)
      setTotalSec(withKey.reduce((s, c) => s + c.duration, 0))
    }).catch(() => {})
  }, [])

  // ── Save session start when first clip of the day is recorded ────────────────
  useEffect(() => {
    if (clips.length === 1 && !sessionStart) {
      const t = Date.now()
      saveSessionStart(t)
      setSessionStart(t)
    }
  }, [clips.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-trigger submission when 60s are reached ────────────────────────────
  useEffect(() => {
    if (
      totalSec >= MAX_SEC &&
      clips.length > 0 &&
      !processing &&
      !showTitle &&
      !triggeredFullRef.current
    ) {
      triggeredFullRef.current = true
      const t = setTimeout(() => {
        setShowClipsPanel(false)
        setShowTitle(true)
      }, 700)
      return () => clearTimeout(t)
    }
  }, [totalSec, clips.length, processing, showTitle, MAX_SEC])

  // ── Auto-trigger submission after 24 h ──────────────────────────────────────
  useEffect(() => {
    if (!sessionStart || clips.length === 0 || triggered24hRef.current) return
    const deadline   = sessionStart + 24 * 3_600_000
    const msLeft     = deadline - Date.now()
    if (msLeft <= 0) {
      // Already past deadline when app reopened
      triggered24hRef.current = true
      setShowClipsPanel(false)
      setShowTitle(true)
      return
    }
    const t = setTimeout(() => {
      triggered24hRef.current = true
      setShowClipsPanel(false)
      setShowTitle(true)
    }, msLeft)
    return () => clearTimeout(t)
  }, [sessionStart, clips.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera ──────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async (mode) => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width:     { ideal: 1920, min: 720 },
          height:    { ideal: 1080, min: 1280 },
          frameRate: { ideal: 60, min: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  false,
          sampleRate:       { ideal: 48000 },
        },
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setPermission('granted')
    } catch { setPermission('denied') }
  }, [])

  useEffect(() => {
    startCamera('user')
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      stopDrawRef.current?.()
      cancelAnimationFrame(rafRef.current)
    }
  }, [startCamera])

  const videoCallbackRef = useCallback(el => {
    videoRef.current = el
    if (el && streamRef.current) { el.srcObject = streamRef.current; el.play().catch(() => {}) }
  }, [])

  const switchCamera = async () => {
    if (isRecording || switching) return
    setSwitching(true)
    const newMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newMode)
    await startCamera(newMode)
    setSwitching(false)
  }

  const captureFilterThumbs = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = 100; c.height = 160
    const ctx = c.getContext('2d')
    if (facingMode === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(v, 0, 0, c.width, c.height)
    setFilterThumbs(c.toDataURL('image/jpeg', 0.75))
  }

  const openFilters = () => {
    captureFilterThumbs()
    setActivePanel(p => p === 'filter' ? null : 'filter')
  }

  // ── Canvas draw for recording ────────────────────────────────────────────────
  const startCanvasDraw = useCallback((canvas, video, filter, stickerList, zoomLevel, isFront) => {
    const ctx = canvas.getContext('2d')
    let stopped = false
    const draw = () => {
      if (stopped) return
      if (video.videoWidth) {
        canvas.width  = video.videoWidth
        canvas.height = video.videoHeight
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.save()
        const srcW = video.videoWidth  / zoomLevel
        const srcH = video.videoHeight / zoomLevel
        const srcX = (video.videoWidth  - srcW) / 2
        const srcY = (video.videoHeight - srcH) / 2
        if (isFront) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
        ctx.filter = filter !== 'none' ? filter : 'none'
        ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height)
        ctx.restore()
        ctx.filter = 'none'
        ctx.font = `${Math.round(canvas.width * 0.12)}px serif`
        ctx.textBaseline = 'middle'
        stickerList.forEach(s => {
          ctx.fillText(s.emoji, s.x * canvas.width - canvas.width * 0.06, s.y * canvas.height)
        })
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()
    stopDrawRef.current = () => { stopped = true; cancelAnimationFrame(rafRef.current) }
  }, [])

  // ── Live timer ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRecording) { setLiveTimer(0); return }
    const t = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000
      setLiveTimer(elapsed)
      if (totalSec + elapsed >= MAX_SEC) stopRecording()
    }, 80)
    return () => clearInterval(t)
  }, [isRecording, totalSec]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recording ────────────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!streamRef.current || totalSec >= MAX_SEC || isRecording) return
    chunksRef.current = []
    startRef.current  = Date.now()

    const canvas = canvasRef.current
    const video  = videoRef.current
    const canCap = !!canvas?.captureStream
    const hasEffect = filterCSS !== 'none' || stickers.length > 0 || zoom !== 1

    let recordStream = streamRef.current
    if (canCap && video && hasEffect) {
      startCanvasDraw(canvas, video, filterCSS, stickers, zoom, facingMode === 'user')
      const canvasStream = canvas.captureStream(60)
      const audio = streamRef.current.getAudioTracks()
      recordStream = new MediaStream([...canvasStream.getVideoTracks(), ...audio])
    } else {
      stopDrawRef.current?.()
    }

    const mimeType = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ].find(t => MediaRecorder.isTypeSupported(t)) ?? ''

    const mr = new MediaRecorder(recordStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 4_000_000,
      audioBitsPerSecond: 192_000,
    })
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = async () => {
      stopDrawRef.current?.()
      const duration = (Date.now() - startRef.current) / 1000
      if (duration < 0.08 || chunksRef.current.length === 0) return
      setFlash(true); setTimeout(() => setFlash(false), 220)
      const blob     = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
      const url      = URL.createObjectURL(blob)
      const thumbUrl = await captureThumb(url)
      const safeDur  = Math.min(duration, remaining)
      const clipKey  = `new_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const newClip  = { key: clipKey, url, blob, thumbUrl, duration: safeDur, idbId: null }
      setClips(prev => [...prev, newClip])
      setTotalSec(prev => Math.min(+(prev + safeDur).toFixed(2), MAX_SEC))
      saveClip({ blob, thumbUrl, duration: safeDur }).then(idbId => {
        setClips(prev => prev.map(c => c.key === clipKey ? { ...c, idbId } : c))
      }).catch(() => {})
    }
    mr.start(100)
    recorderRef.current = mr
    setIsRecording(true)
  }, [totalSec, isRecording, filterCSS, stickers, zoom, facingMode, remaining, startCanvasDraw])

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    else if (recorderRef.current?.state === 'paused') recorderRef.current.stop()
    setIsRecording(false)
  }, [])

  const deleteClip = i => {
    const clip = clips[i]
    URL.revokeObjectURL(clip.url)
    if (clip.idbId != null) deleteClips([clip.idbId]).catch(() => {})
    const next = clips.filter((_, idx) => idx !== i)
    setClips(next)
    setTotalSec(next.reduce((s, c) => s + c.duration, 0))
    // If all clips deleted, reset session start + guards
    if (next.length === 0) {
      clearSessionKey()
      setSessionStart(null)
      triggeredFullRef.current = false
      triggered24hRef.current  = false
    }
  }

  const moveClip = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= clips.length) return
    setClips(prev => { const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next })
  }

  const captureThumb = videoUrl => new Promise(resolve => {
    const v = document.createElement('video')
    const c = document.createElement('canvas')
    c.width = 160; c.height = 240
    v.src = videoUrl; v.muted = true; v.playsInline = true
    v.onloadeddata = () => { v.currentTime = 0.05 }
    v.onseeked     = () => { c.getContext('2d').drawImage(v, 0, 0, 160, 240); resolve(c.toDataURL('image/jpeg', 0.75)); v.src = '' }
    v.onerror      = () => resolve(null)
  })

  // ── Sticker placement + Tap-to-Focus ─────────────────────────────────────────
  const onCameraClick = async e => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top)  / rect.height

    if (pendingEmoji) {
      setStickers(prev => [...prev, { id: Date.now(), emoji: pendingEmoji, x, y }])
      setPendingEmoji(null)
      return
    }

    setFocusPoint({ x, y })
    setTimeout(() => setFocusPoint(null), 1600)
    const track = streamRef.current?.getVideoTracks()[0]
    if (track) {
      try {
        const caps = track.getCapabilities?.() ?? {}
        const adv  = []
        if (caps.focusMode?.includes('single-shot'))  adv.push({ focusMode: 'single-shot' })
        if (caps.pointsOfInterest)                    adv.push({ pointsOfInterest: [{ x, y }] })
        if (adv.length) await track.applyConstraints({ advanced: adv })
      } catch {}
    }
  }

  // ── Zoom show/hide ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (zoom === 1) { setShowZoom(false); return }
    setShowZoom(true)
    const t = setTimeout(() => setShowZoom(false), 1500)
    return () => clearTimeout(t)
  }, [zoom])

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Overlays ── */}
      <AnimatePresence>
        {showTitle && (
          <TitleScreen
            firstThumb={clips[0]?.thumbUrl ?? null}
            onSkip={() => { setVlogTitle(''); setShowTitle(false); setProcessing(true) }}
            onConfirm={(t, vis) => { setVlogTitle(t); setVlogVisibility(vis ?? 'friends'); setShowTitle(false); setProcessing(true) }}
          />
        )}
        {processing && (
          <ProcessingScreen
            clips={clips}
            title={vlogTitle}
            visibility={vlogVisibility}
            onComplete={vlog => {
              const idbIds = clips.map(c => c.idbId).filter(Boolean)
              deleteClips(idbIds).catch(() => {})
              clearSessionKey()
              onDone(vlog)
            }}
          />
        )}
        {showClipsPanel && (
          <ClipsPanel
            clips={clips}
            totalSec={totalSec}
            maxSec={MAX_SEC}
            sessionStart={sessionStart}
            onClose={() => setShowClipsPanel(false)}
            onDelete={i => deleteClip(i)}
            onMove={(i, dir) => moveClip(i, dir)}
            onSubmit={() => { setShowClipsPanel(false); setShowTitle(true) }}
          />
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black flex flex-col" style={{ userSelect: 'none' }}>

        {/* Camera — always mounted so stream attaches immediately */}
        <div className="absolute inset-0" onClick={onCameraClick}
          style={{ cursor: pendingEmoji ? 'crosshair' : 'default' }}>
          <video ref={videoCallbackRef} autoPlay playsInline muted
            className="w-full h-full object-cover"
            style={{
              filter:          filterCSS !== 'none' ? filterCSS : undefined,
              transform:       `${facingMode === 'user' ? 'scaleX(-1) ' : ''}scale(${zoom})`,
              transformOrigin: 'center',
              transition:      'filter 0.3s',
              opacity:         permission === 'granted' ? 1 : 0,
            }} />

          {/* Stickers */}
          {stickers.map(s => (
            <motion.div key={s.id} initial={{ scale: 0 }} animate={{ scale: 1 }}
              style={{ position: 'absolute', left: `${s.x * 100}%`, top: `${s.y * 100}%`, fontSize: 44, transform: 'translate(-50%,-50%)', touchAction: 'none' }}
              onDoubleClick={e => { e.stopPropagation(); setStickers(p => p.filter(st => st.id !== s.id)) }}>
              {s.emoji}
            </motion.div>
          ))}

          {/* Focus indicator */}
          <AnimatePresence>
            {focusPoint && (
              <motion.div
                key={`${focusPoint.x}-${focusPoint.y}`}
                initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.18 }}
                className="absolute pointer-events-none z-10"
                style={{
                  left: `${focusPoint.x * 100}%`, top: `${focusPoint.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 64, height: 64,
                  border: '2px solid rgba(255,220,0,0.9)',
                  borderRadius: 4, boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
                }} />
            )}
          </AnimatePresence>

          {/* Flash */}
          <AnimatePresence>
            {flash && (
              <motion.div initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }} className="absolute inset-0 bg-white pointer-events-none z-10" />
            )}
          </AnimatePresence>

          {/* Pending emoji hint */}
          <AnimatePresence>
            {pendingEmoji && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
                <div className="bg-black/60 backdrop-blur-md rounded-2xl px-5 py-3 flex flex-col items-center gap-2">
                  <span style={{ fontSize: 48 }}>{pendingEmoji}</span>
                  <span className="text-white text-xs">Tippe zum Platzieren</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Gradients */}
          <div className="absolute inset-x-0 top-0 h-48 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' }} />
          <div className="absolute inset-x-0 bottom-0 h-80 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }} />
        </div>

        {/* Loading / denied */}
        {permission !== 'granted' && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3 z-20">
            {permission === 'requesting'
              ? <><div className="w-10 h-10 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" />
                  <span className="text-[#8E8E93] text-sm">Kamera wird gestartet…</span></>
              : <><span className="text-5xl">🚫</span><p className="text-white font-semibold">Kamerazugriff verweigert</p></>}
          </div>
        )}

        {/* ── Top bar ── */}
        <div className="relative z-20 flex items-center justify-between px-4 pt-14 pb-2">
          <GlassBtn onClick={onBack}><X size={18} className="text-white" /></GlassBtn>

          {/* Center indicator */}
          <AnimatePresence mode="wait">
            {isRecording ? (
              <motion.div key="rec" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)' }}>
                <motion.div className="w-2.5 h-2.5 rounded-full bg-red-500"
                  animate={{ opacity: [1,0,1] }} transition={{ duration: 0.7, repeat: Infinity }} />
                <span className="text-white text-xs font-bold">{liveTimer.toFixed(1)}s</span>
              </motion.div>
            ) : showZoom ? (
              <motion.div key="zoom" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                className="px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)' }}>
                <span className="text-white text-xs font-bold">{zoom.toFixed(1)}×</span>
              </motion.div>
            ) : (
              <motion.div key="time" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)' }}>
                <span className="text-white/60 text-xs font-semibold">{remaining.toFixed(0)}s übrig</span>
              </motion.div>
            )}
          </AnimatePresence>

          <GlassBtn onClick={switchCamera} disabled={isRecording || switching}>
            <motion.div animate={{ rotate: switching ? 180 : 0 }} transition={{ duration: 0.35 }}>
              <RefreshCw size={17} className="text-white" />
            </motion.div>
          </GlassBtn>
        </div>

        {/* ── Bottom ── */}
        <div className="absolute bottom-0 inset-x-0 z-20 pb-10">

          {/* Filter panel */}
          <AnimatePresence>
            {activePanel === 'filter' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                className="mb-5 px-4">
                <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
                  {FILTERS.map((f, i) => {
                    const locked = !isPremium && i >= FREE_FILTER_COUNT
                    return (
                      <motion.button key={f.name} whileTap={locked ? {} : { scale: 0.88 }}
                        onClick={() => { if (locked) return; setFilterIdx(i); localStorage.setItem('yd_filterIdx', i) }}
                        className="flex-shrink-0 flex flex-col items-center gap-2"
                        style={{ opacity: locked ? 0.5 : 1 }}>
                        <div className="relative overflow-hidden rounded-2xl transition-all duration-200"
                          style={{
                            width: 62, height: 88,
                            border: filterIdx === i ? '2.5px solid white' : '2.5px solid transparent',
                            boxShadow: filterIdx === i ? '0 0 12px rgba(255,255,255,0.4)' : 'none',
                          }}>
                          {filterThumbs ? (
                            <img src={filterThumbs} alt={f.name}
                              className="w-full h-full object-cover"
                              style={{ filter: f.css !== 'none' ? f.css : undefined }} />
                          ) : (
                            <div className="w-full h-full bg-white/10" />
                          )}
                          {filterIdx === i && !locked && (
                            <div className="absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full bg-white flex items-center justify-center">
                              <Check size={10} className="text-black" strokeWidth={3} />
                            </div>
                          )}
                          {locked && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <Lock size={14} className="text-white/80" />
                            </div>
                          )}
                        </div>
                        <span className={`text-[10px] font-semibold transition-colors ${filterIdx === i ? 'text-white' : 'text-white/60'}`}>
                          {f.name}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Emoji panel */}
          <AnimatePresence>
            {activePanel === 'emoji' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                className="mb-5 px-4">
                <div className="rounded-3xl p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)' }}>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {EMOJIS.map(e => (
                      <motion.button key={e} whileTap={{ scale: 0.8 }}
                        onClick={() => { setPendingEmoji(e); setActivePanel(null) }}
                        className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl"
                        style={{ background: 'rgba(255,255,255,0.08)' }}>
                        {e}
                      </motion.button>
                    ))}
                  </div>
                  {stickers.length > 0 && (
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => setStickers([])}
                      className="mt-3 w-full py-2 rounded-xl text-red-400 text-xs font-semibold"
                      style={{ background: 'rgba(255,59,48,0.15)' }}>
                      Alle Sticker entfernen
                    </motion.button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Clip summary chip (tap to open panel) ── */}
          <AnimatePresence>
            {clips.length > 0 && !isRecording && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="flex justify-center mb-3">
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setShowClipsPanel(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full"
                  style={{
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.14)',
                  }}>
                  <Film size={12} className="text-[#7B61FF]" />
                  <span className="text-white/80 text-xs font-semibold">
                    {clips.length} Clip{clips.length !== 1 ? 's' : ''} · {formatDur(totalSec)}
                  </span>
                  <span className="text-[#7B61FF] text-xs font-bold">ansehen →</span>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main controls */}
          <div className="flex items-center justify-between px-6">

            {/* Left: filter + emoji */}
            <div className="flex gap-2 w-24">
              <motion.button whileTap={{ scale: 0.88 }} onClick={openFilters}
                className="w-12 h-12 rounded-2xl flex items-center justify-center relative overflow-hidden"
                style={{
                  background: activePanel === 'filter' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(12px)',
                  border: '1.5px solid rgba(255,255,255,0.2)',
                }}>
                {filterIdx > 0 && (
                  <div className="absolute inset-0 opacity-40"
                    style={{ background: `hue-rotate(${filterIdx * 36}deg) saturate(2)` }} />
                )}
                <span className="text-xl relative z-10">🎨</span>
              </motion.button>
              <motion.button whileTap={{ scale: 0.88 }}
                onClick={() => setActivePanel(p => p === 'emoji' ? null : 'emoji')}
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  background: activePanel === 'emoji' ? 'rgba(123,97,255,0.5)' : 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(12px)',
                  border: '1.5px solid rgba(255,255,255,0.2)',
                }}>
                <span className="text-xl">😊</span>
              </motion.button>
            </div>

            {/* Record button */}
            <TapRecordBtn
              isRecording={isRecording}
              disabled={permission !== 'granted' || totalSec >= MAX_SEC}
              progress={progress}
              zoom={zoom}
              onStart={startRecording}
              onStop={stopRecording}
              onZoom={setZoom} />

            {/* Right: Clips button (shows panel) */}
            <div className="w-24 flex justify-end">
              <AnimatePresence>
                {clips.length > 0 ? (
                  <motion.button
                    key="clips-btn"
                    initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowClipsPanel(true)}
                    className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-1 relative"
                    style={{
                      background: 'rgba(0,0,0,0.5)',
                      backdropFilter: 'blur(14px)',
                      border: '1.5px solid rgba(255,255,255,0.18)',
                    }}>
                    {/* Badge */}
                    <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center z-10"
                      style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 8px rgba(123,97,255,0.7)' }}>
                      <span className="text-[9px] text-white font-black leading-none">{clips.length}</span>
                    </div>
                    <Film size={20} className="text-white" />
                    <span className="text-[9px] text-white/70 font-semibold leading-none">Clips</span>
                  </motion.button>
                ) : (
                  // Invisible placeholder to keep layout stable
                  <div key="placeholder" className="w-16 h-16" />
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Hint */}
          <p className="text-center text-white/40 text-[11px] mt-4 px-4">
            {pendingEmoji          ? 'Tippe auf das Bild zum Platzieren'
              : totalSec >= MAX_SEC ? `${MAX_SEC}s erreicht — Clips überprüfen`
              : isRecording         ? 'Ziehen zum Zoomen · Nochmal tippen zum Stoppen'
              : clips.length === 0  ? 'Tippen zum Aufnehmen · Ziehen zum Zoomen'
              : 'Film-Symbol → Clips verwalten & abgeben'}
          </p>
        </div>
      </motion.div>
    </>
  )
}

// ── Glass button ───────────────────────────────────────────────────────────────
function GlassBtn({ children, onClick, disabled }) {
  return (
    <motion.button whileTap={{ scale: 0.85 }} onClick={onClick} disabled={disabled}
      className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-40"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)' }}>
      {children}
    </motion.button>
  )
}

// ── Tap-to-toggle record button with drag-to-zoom ──────────────────────────────
function TapRecordBtn({ isRecording, disabled, progress, zoom, onStart, onStop, onZoom }) {
  const R    = 44
  const CIRC = 2 * Math.PI * R

  const downRef = useRef(null)
  const didDrag = useRef(false)
  const btnRef  = useRef(null)

  const onDown = e => {
    if (disabled) return
    e.preventDefault()
    downRef.current = { y: e.clientY, z: zoom }
    didDrag.current = false
    btnRef.current?.setPointerCapture(e.pointerId)
  }

  const SNAP_POINTS = [1, 1.5, 2, 3, 4]
  const onMove = e => {
    if (!downRef.current) return
    const dy = downRef.current.y - e.clientY
    if (Math.abs(dy) > 8) didDrag.current = true
    const raw    = Math.min(4, Math.max(1, downRef.current.z + (dy / 160) * 3))
    const snapped = SNAP_POINTS.find(s => Math.abs(raw - s) < 0.12) ?? raw
    onZoom(parseFloat(snapped.toFixed(2)))
  }

  const onUp = e => {
    e.preventDefault()
    if (!downRef.current) return
    downRef.current = null
    if (!didDrag.current) {
      if (isRecording) onStop(); else onStart()
    }
  }

  const onCancel = () => { downRef.current = null; didDrag.current = false }

  return (
    <div className="relative flex items-center justify-center" style={{ width: 112, height: 112 }}>
      {/* Progress ring */}
      <svg className="absolute inset-0 -rotate-90" width="112" height="112">
        <circle cx="56" cy="56" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4.5" />
        <motion.circle cx="56" cy="56" r={R} fill="none"
          stroke={isRecording ? '#FF3B30' : 'rgba(255,255,255,0.9)'}
          strokeWidth="4.5" strokeLinecap="round"
          strokeDasharray={CIRC}
          animate={{ strokeDashoffset: CIRC - (progress / 100) * CIRC }}
          transition={{ duration: 0.15 }} />
      </svg>

      {/* Pulse when recording */}
      {isRecording && (
        <motion.div className="absolute rounded-full pointer-events-none"
          style={{ width: 100, height: 100, background: 'rgba(255,59,48,0.18)' }}
          animate={{ scale: [1, 1.14, 1], opacity: [0.9, 0.3, 0.9] }}
          transition={{ duration: 1.1, repeat: Infinity }} />
      )}

      {/* Main button */}
      <motion.button
        ref={btnRef}
        animate={{ scale: isRecording ? 0.88 : 1 }}
        transition={{ duration: 0.18, type: 'spring', stiffness: 260, damping: 20 }}
        disabled={disabled}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onContextMenu={e => e.preventDefault()}
        className="relative disabled:opacity-40"
        style={{
          width: 82, height: 82,
          borderRadius: '50%',
          background: isRecording ? '#FF3B30' : 'white',
          boxShadow: isRecording
            ? '0 0 0 5px rgba(255,59,48,0.22), 0 0 32px rgba(255,59,48,0.5)'
            : '0 0 0 5px rgba(255,255,255,0.14), 0 4px 24px rgba(0,0,0,0.5)',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <motion.div
          animate={{
            width:        isRecording ? 30 : 0,
            height:       isRecording ? 30 : 0,
            borderRadius: isRecording ? 8 : 0,
          }}
          transition={{ duration: 0.18 }}
          style={{ background: 'white', flexShrink: 0 }} />
      </motion.button>
    </div>
  )
}
