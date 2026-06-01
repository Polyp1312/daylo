// v3 — full-screen camera
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, RefreshCw, Check, Trash2, Sparkles, X } from 'lucide-react'

const MAX_SEC = 60

// ── KI Processing Screen ───────────────────────────────────────────────────────
const STEPS = [
  { label: 'Clips zusammenfügen',  ms: 900 },
  { label: 'Schnitt optimieren',   ms: 750 },
  { label: 'Farben angleichen',    ms: 650 },
  { label: 'Vlog fertigstellen',   ms: 500 },
]

function ProcessingScreen({ onComplete }) {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let delay = 500
    STEPS.forEach((s, i) => {
      delay += s.ms
      setTimeout(() => {
        setStep(i + 1)
        if (i === STEPS.length - 1) {
          setTimeout(() => setDone(true), 400)
          setTimeout(() => onComplete(),  1500)
        }
      }, delay)
    })
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-10"
      style={{ background: '#0A0A0B' }}>

      {/* Animated logo */}
      <div className="relative w-28 h-28 mb-10 flex items-center justify-center">
        {!done ? (
          <>
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: '3px solid transparent', borderTopColor: '#7B61FF', borderRightColor: '#00D9FF' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} />
            <motion.div
              className="absolute inset-3 rounded-full"
              style={{ border: '2px solid transparent', borderTopColor: '#00D9FF' }}
              animate={{ rotate: -360 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }} />
            <span className="text-3xl">🎬</span>
          </>
        ) : (
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 200 }}
            className="w-28 h-28 rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7B61FF22, #00D9FF22)', border: '3px solid #2ECC71' }}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1 }}>
              <Check size={44} className="text-[#2ECC71]" strokeWidth={2.5} />
            </motion.div>
          </motion.div>
        )}
      </div>

      <motion.h2 className="text-white text-2xl font-bold mb-2 text-center">
        {done ? 'Vlog fertig! 🎉' : 'KI schneidet deinen Vlog…'}
      </motion.h2>
      <p className="text-[#8E8E93] text-sm mb-12 text-center leading-relaxed">
        {done ? 'Dein Vlog wurde gespeichert und ist bereit' : 'Einen Moment — wir bearbeiten\ndeine Aufnahme automatisch'}
      </p>

      <div className="w-full space-y-5">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-4">
            <motion.div
              initial={{ scale: 0.6, opacity: 0.2 }}
              animate={step > i ? { scale: 1, opacity: 1 } : { scale: 0.6, opacity: 0.2 }}
              transition={{ type: 'spring', damping: 14 }}
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                step > i ? 'bg-[#2ECC71]' : 'bg-[#2C2C2E]'
              }`}>
              {step > i
                ? <Check size={14} className="text-white" />
                : <span className="text-[#8E8E93] text-xs font-bold">{i + 1}</span>}
            </motion.div>
            <motion.span
              animate={{ color: step > i ? '#ffffff' : '#3A3A3C' }}
              className="text-sm font-medium flex-1">
              {s.label}
            </motion.span>
            {step === i + 1 && !done && (
              <motion.div
                className="w-4 h-4 rounded-full border-2 border-t-transparent border-[#7B61FF]"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
            )}
          </div>
        ))}
      </div>

      {/* Bottom progress bar */}
      <div className="w-full mt-12 h-1 rounded-full bg-[#2C2C2E] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #7B61FF, #00D9FF)' }}
          initial={{ width: '0%' }}
          animate={{ width: done ? '100%' : `${(step / STEPS.length) * 90}%` }}
          transition={{ duration: 0.5 }} />
      </div>
    </motion.div>
  )
}

// ── Flash overlay ──────────────────────────────────────────────────────────────
function FlashOverlay({ show }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0.7 }} animate={{ opacity: 0 }}
          exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
          className="absolute inset-0 bg-white z-10 pointer-events-none" />
      )}
    </AnimatePresence>
  )
}

// ── Circular record button ─────────────────────────────────────────────────────
function RecordButton({ isRecording, disabled, progress, onStart, onStop }) {
  const RADIUS = 36
  const CIRC   = 2 * Math.PI * RADIUS

  return (
    <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
      {/* Progress ring */}
      <svg className="absolute inset-0 -rotate-90" width="96" height="96">
        <circle cx="48" cy="48" r={RADIUS} fill="none" stroke="#ffffff22" strokeWidth="3" />
        <motion.circle
          cx="48" cy="48" r={RADIUS} fill="none"
          stroke="white" strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          animate={{ strokeDashoffset: CIRC - (progress / 100) * CIRC }}
          transition={{ duration: 0.1 }} />
      </svg>

      {/* Pulse when recording */}
      {isRecording && (
        <motion.div
          className="absolute inset-0 rounded-full bg-red-500/20"
          animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.1, repeat: Infinity }} />
      )}

      {/* Button */}
      <motion.button
        whileTap={{ scale: 0.88 }}
        disabled={disabled}
        onPointerDown={onStart}
        onPointerUp={onStop}
        onPointerLeave={onStop}
        onPointerCancel={onStop}
        className="w-16 h-16 rounded-full flex items-center justify-center select-none touch-none disabled:opacity-40 transition-all duration-200"
        style={{
          background: isRecording
            ? '#EF4444'
            : 'linear-gradient(135deg, #7B61FF, #00D9FF)',
          boxShadow: isRecording
            ? '0 0 28px rgba(239,68,68,0.5)'
            : '0 0 28px rgba(123,97,255,0.5)',
        }}>
        <motion.div
          animate={{ borderRadius: isRecording ? '6px' : '50%', width: isRecording ? 22 : 26, height: isRecording ? 22 : 26 }}
          transition={{ duration: 0.2 }}
          className="bg-white" />
      </motion.button>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function RecordView({ onBack, onDone }) {
  const videoRef    = useRef(null)
  const streamRef   = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef   = useRef([])
  const startRef    = useRef(null)

  const [facingMode,  setFacingMode]  = useState('user')
  const [permission,  setPermission]  = useState('requesting')
  const [isRecording, setIsRecording] = useState(false)
  const [liveTimer,   setLiveTimer]   = useState(0)
  const [clips,       setClips]       = useState([])
  const [totalSec,    setTotalSec]    = useState(0)
  const [processing,  setProcessing]  = useState(false)
  const [flash,       setFlash]       = useState(false)
  const [switching,   setSwitching]   = useState(false)

  const remaining = Math.max(MAX_SEC - totalSec, 0)
  const progress  = Math.min(((totalSec + (isRecording ? liveTimer : 0)) / MAX_SEC) * 100, 100)

  // ── Camera ──────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async (mode) => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setPermission('granted')
    } catch {
      setPermission('denied')
    }
  }, [])

  useEffect(() => {
    startCamera('user')
    return () => streamRef.current?.getTracks().forEach(t => t.stop())
  }, [startCamera])

  const setVideoRef = useCallback(el => {
    videoRef.current = el
    if (el && streamRef.current) el.srcObject = streamRef.current
  }, [])

  const switchCamera = async () => {
    if (isRecording || switching) return
    setSwitching(true)
    const newMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newMode)
    await startCamera(newMode)
    setSwitching(false)
  }

  // ── Live timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRecording) { setLiveTimer(0); return }
    const t = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000
      setLiveTimer(elapsed)
      if (totalSec + elapsed >= MAX_SEC) stopRecording()
    }, 100)
    return () => clearInterval(t)
  }, [isRecording, totalSec])

  // ── Recording ───────────────────────────────────────────────────────────────
  const startRecording = () => {
    if (!streamRef.current || totalSec >= MAX_SEC || isRecording) return
    chunksRef.current = []
    startRef.current  = Date.now()
    const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) ?? ''
    const mr = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {})
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = async () => {
      const duration = Math.min((Date.now() - startRef.current) / 1000, remaining)
      if (duration < 0.3) return
      setFlash(true); setTimeout(() => setFlash(false), 300)
      const blob     = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
      const url      = URL.createObjectURL(blob)
      const thumbUrl = await captureThumb(url)
      setClips(prev => [...prev, { url, blob, thumbUrl, duration }])
      setTotalSec(prev => Math.min(+(prev + duration).toFixed(2), MAX_SEC))
    }
    mr.start(100)
    recorderRef.current = mr
    setIsRecording(true)
  }

  const stopRecording = () => {
    if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop()
    setIsRecording(false)
  }

  const deleteClip = i => {
    URL.revokeObjectURL(clips[i].url)
    const next = clips.filter((_, idx) => idx !== i)
    setClips(next)
    setTotalSec(next.reduce((s, c) => s + c.duration, 0))
  }

  const captureThumb = videoUrl => new Promise(resolve => {
    const v = document.createElement('video')
    const c = document.createElement('canvas')
    c.width = 160; c.height = 240
    v.src = videoUrl; v.muted = true; v.playsInline = true
    v.onloadeddata = () => { v.currentTime = 0.05 }
    v.onseeked = () => {
      c.getContext('2d').drawImage(v, 0, 0, 160, 240)
      resolve(c.toDataURL('image/jpeg', 0.75))
      v.src = ''
    }
    v.onerror = () => resolve(null)
  })

  return (
    <>
      <AnimatePresence>
        {processing && <ProcessingScreen onComplete={() => onDone(clips)} />}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black flex flex-col">

        {/* Full-screen camera */}
        <div className="absolute inset-0">
          {permission === 'granted' && (
            <video
              ref={setVideoRef}
              autoPlay playsInline muted
              className="w-full h-full object-cover"
              style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} />
          )}

          {/* Dark gradient overlays */}
          <div className="absolute inset-x-0 top-0 h-40 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)' }} />
          <div className="absolute inset-x-0 bottom-0 h-64 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }} />

          <FlashOverlay show={flash} />
        </div>

        {/* Loading / denied overlays */}
        {permission === 'requesting' && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" />
            <span className="text-[#8E8E93] text-sm">Kamera wird gestartet…</span>
          </div>
        )}
        {permission === 'denied' && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3 px-8 text-center">
            <span className="text-4xl">🚫</span>
            <p className="text-white font-semibold text-lg">Kein Kamerazugriff</p>
            <p className="text-[#8E8E93] text-sm">Bitte erlaube den Kamerazugriff in den Browser-Einstellungen.</p>
          </div>
        )}

        {/* ── Top bar ── */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-14 pb-4">
          <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)' }}>
            <X size={18} className="text-white" />
          </motion.button>

          {/* REC indicator */}
          {isRecording ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}>
              <motion.div className="w-2.5 h-2.5 rounded-full bg-red-500"
                animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.7, repeat: Infinity }} />
              <span className="text-white text-xs font-bold tracking-wider">
                {liveTimer.toFixed(1)}s
              </span>
            </motion.div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)' }}>
              <span className="text-white text-xs font-semibold">{remaining.toFixed(0)}s übrig</span>
            </div>
          )}

          {/* Camera flip */}
          <motion.button
            whileTap={{ scale: 0.88 }} onClick={switchCamera}
            disabled={isRecording || switching}
            className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-40"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)' }}>
            <motion.div animate={{ rotate: switching ? 180 : 0 }} transition={{ duration: 0.35 }}>
              <RefreshCw size={18} className="text-white" />
            </motion.div>
          </motion.button>
        </div>

        {/* ── Bottom controls ── */}
        <div className="absolute bottom-0 inset-x-0 z-10 px-5 pb-10">

          {/* Clip strip */}
          <AnimatePresence>
            {clips.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 mb-5 overflow-x-auto no-scrollbar py-1">
                {clips.map((clip, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex-shrink-0 relative group"
                    style={{ width: 44, height: 62 }}>
                    <div className="w-full h-full rounded-xl overflow-hidden border-2 border-white/20">
                      {clip.thumbUrl
                        ? <img src={clip.thumbUrl} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full bg-white/10" />}
                    </div>
                    <div className="absolute bottom-0 inset-x-0 rounded-b-xl bg-black/60 text-center py-0.5">
                      <span className="text-[7px] text-white font-semibold">{clip.duration.toFixed(1)}s</span>
                    </div>
                    <button onClick={() => deleteClip(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={10} className="text-white" />
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Record row */}
          <div className="flex items-center justify-between">

            {/* Left: total clips info */}
            <div className="w-16 text-center">
              {clips.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-0.5">
                  <span className="text-white text-lg font-bold">{clips.length}</span>
                  <span className="text-white/50 text-[10px]">Clips</span>
                </motion.div>
              )}
            </div>

            {/* Center: record button */}
            <RecordButton
              isRecording={isRecording}
              disabled={permission !== 'granted' || totalSec >= MAX_SEC}
              progress={progress}
              onStart={startRecording}
              onStop={stopRecording} />

            {/* Right: done button */}
            <div className="w-16 flex justify-center">
              <AnimatePresence>
                {clips.length > 0 && !isRecording && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0 }}
                    whileTap={{ scale: 0.88 }}
                    onClick={() => setProcessing(true)}
                    className="w-14 h-14 rounded-full flex flex-col items-center justify-center gap-0.5"
                    style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 20px rgba(123,97,255,0.5)' }}>
                    <Sparkles size={18} className="text-white" />
                    <span className="text-[9px] text-white font-bold leading-none">Fertig</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Hint text */}
          <p className="text-center text-white/50 text-xs mt-4">
            {totalSec >= MAX_SEC
              ? '60 Sekunden erreicht'
              : isRecording
              ? 'Loslassen zum Stoppen'
              : clips.length === 0
              ? 'Gedrückt halten zum Aufnehmen'
              : 'Weiterer Clip oder Fertig tippen'}
          </p>
        </div>
      </motion.div>
    </>
  )
}
