// v7 — title input + thumbnail upload
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RefreshCw, Check, Sparkles, AlertCircle, Pencil } from 'lucide-react'
import { api } from '../lib/api'

const MAX_SEC = 60
const EMOJIS_VLOG = ['🌅','🎬','🏋️','🌄','🎉','🎵','🏖️','🌙','🍕','🎮','🚀','🌸']
const randEmoji = () => EMOJIS_VLOG[Math.floor(Math.random() * EMOJIS_VLOG.length)]

const FILTERS = [
  { name: 'Normal',  css: 'none' },
  { name: 'Vivid',   css: 'saturate(2) contrast(1.15)' },
  { name: 'Warm',    css: 'sepia(0.5) saturate(1.8) brightness(1.08)' },
  { name: 'Cool',    css: 'hue-rotate(25deg) saturate(1.5) brightness(0.96)' },
  { name: 'B&W',     css: 'grayscale(1) contrast(1.3)' },
  { name: 'Fade',    css: 'contrast(0.7) brightness(1.3) saturate(0.55)' },
  { name: 'Neon',    css: 'hue-rotate(265deg) saturate(2.8) brightness(1.2)' },
  { name: 'Drama',   css: 'contrast(1.5) saturate(0.7) brightness(0.88)' },
  { name: 'Golden',  css: 'sepia(0.6) saturate(2) hue-rotate(-15deg) brightness(1.1)' },
  { name: 'Cyber',   css: 'hue-rotate(150deg) saturate(2) contrast(1.2)' },
]

const EMOJIS = [
  '🔥','💀','😍','🤯','✨','💯','🎬','❤️','⚡','🏆','👑','🎉',
  '🤙','😎','🥶','💫','😂','💪','👀','🫶','🌊','🎵','💥','🫠',
]

// ── Upload / Processing Screen ─────────────────────────────────────────────────
const UPLOAD_STEPS = [
  { label: 'Clips zusammenfügen' },
  { label: 'Hochladen…'          },
  { label: 'Vlog fertigstellen'  },
]

// ── Title input screen ─────────────────────────────────────────────────────────
function TitleScreen({ firstThumb, onSkip, onConfirm }) {
  const [title, setTitle] = useState('')
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{ background: '#0A0A0B' }}>
      {firstThumb && (
        <div className="w-24 h-36 rounded-2xl overflow-hidden mb-6 border border-[#2C2C2E]">
          <img src={firstThumb} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="w-8 h-8 rounded-full bg-[#7B61FF]/15 flex items-center justify-center mb-3">
        <Pencil size={15} className="text-[#7B61FF]" />
      </div>
      <h2 className="text-white font-bold text-xl mb-1">Vlog benennen</h2>
      <p className="text-[#8E8E93] text-sm text-center mb-6">Gib deinem Tag einen Titel</p>
      <div className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-3.5 focus-within:border-[#7B61FF] transition-colors mb-5">
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value.slice(0, 60))}
          onKeyDown={e => e.key === 'Enter' && onConfirm(title.trim())}
          placeholder="Beschreibe deinen Tag…"
          className="w-full bg-transparent text-white placeholder-[#3A3A3C] text-base outline-none"
        />
      </div>
      <div className="flex gap-3 w-full">
        <motion.button whileTap={{ scale: 0.96 }} onClick={onSkip}
          className="flex-1 py-3.5 rounded-2xl border border-[#2C2C2E] text-[#8E8E93] font-semibold text-sm">
          Überspringen
        </motion.button>
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => onConfirm(title.trim())}
          className="flex-1 py-3.5 rounded-2xl text-white font-semibold text-sm"
          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
          Speichern
        </motion.button>
      </div>
    </motion.div>
  )
}

function ProcessingScreen({ clips, title, onComplete }) {
  const [step,     setStep]     = useState(0)   // 0=merging 1=uploading 2=done
  const [progress, setProgress] = useState(0)   // 0-100 upload %
  const [error,    setError]    = useState(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        // Step 0 — merge blobs in browser (instant)
        const mimeType = clips[0]?.blob?.type || 'video/webm'
        const combined = new Blob(clips.map(c => c.blob), { type: mimeType })
        if (cancelled) return

        // Step 1 — upload to server
        setStep(1)
        const duration  = clips.reduce((s, c) => s + (c.duration ?? 0), 0)
        const formData  = new FormData()
        formData.append('video',     combined, 'vlog.webm')
        formData.append('duration',  String(Math.round(duration)))
        formData.append('clipCount', String(clips.length))
        formData.append('emoji',     randEmoji())
        if (title)               formData.append('title',     title)
        if (clips[0]?.thumbUrl)  formData.append('thumbnail', clips[0].thumbUrl)

        const { vlog } = await api.vlogs.upload(formData, pct => {
          if (!cancelled) setProgress(pct)
        })
        if (cancelled) return

        // Step 2 — done
        setStep(2)
        setTimeout(() => { if (!cancelled) onComplete(vlog) }, 1000)
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-10 gap-5"
      style={{ background: '#0A0A0B' }}>
      <AlertCircle size={52} className="text-red-400" />
      <p className="text-white font-bold text-lg text-center">Upload fehlgeschlagen</p>
      <p className="text-[#8E8E93] text-sm text-center">{error}</p>
      <motion.button whileTap={{ scale: 0.94 }} onClick={() => window.location.reload()}
        className="px-6 py-3 rounded-2xl bg-[#7B61FF] text-white font-semibold">
        Erneut versuchen
      </motion.button>
    </motion.div>
  )

  const done = step === 2
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-10"
      style={{ background: '#0A0A0B' }}>

      {/* Icon */}
      <div className="relative w-28 h-28 mb-10 flex items-center justify-center">
        {!done ? (
          <>
            <motion.div className="absolute inset-0 rounded-full"
              style={{ border: '3px solid transparent', borderTopColor: '#7B61FF', borderRightColor: '#00D9FF' }}
              animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} />
            <motion.div className="absolute inset-3 rounded-full"
              style={{ border: '2px solid transparent', borderTopColor: '#00D9FF' }}
              animate={{ rotate: -360 }} transition={{ duration: 1.7, repeat: Infinity, ease: 'linear' }} />
            <span className="text-3xl">🎬</span>
          </>
        ) : (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 180 }}
            className="w-28 h-28 rounded-full flex items-center justify-center"
            style={{ border: '3px solid #2ECC71', background: '#2ECC7115' }}>
            <Check size={44} className="text-[#2ECC71]" strokeWidth={2.5} />
          </motion.div>
        )}
      </div>

      <h2 className="text-white text-2xl font-bold mb-2 text-center">
        {done ? 'Vlog gespeichert! 🎉' : 'Wird gespeichert…'}
      </h2>
      <p className="text-[#8E8E93] text-sm mb-12 text-center">
        {done ? 'Deine Freunde können ihn jetzt sehen' : 'Dein Vlog wird hochgeladen'}
      </p>

      {/* Steps */}
      <div className="w-full space-y-5">
        {UPLOAD_STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-4">
            <motion.div
              animate={step > i ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0.25 }}
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${step > i ? 'bg-[#2ECC71]' : 'bg-[#2C2C2E]'}`}>
              {step > i
                ? <Check size={14} className="text-white" />
                : <span className="text-[#8E8E93] text-xs font-bold">{i + 1}</span>}
            </motion.div>
            <motion.span animate={{ color: step > i ? '#fff' : '#3A3A3C' }}
              className="text-sm font-medium flex-1">{s.label}</motion.span>
            {step === i + 1 && !done && i === 1 && (
              <span className="text-[#7B61FF] text-xs font-bold">{progress}%</span>
            )}
            {step === i + 1 && !done && i !== 1 && (
              <motion.div className="w-4 h-4 rounded-full border-2 border-t-transparent border-[#7B61FF]"
                animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
            )}
          </div>
        ))}
      </div>

      {/* Progress bar — shows real upload % */}
      <div className="w-full mt-10 h-1.5 rounded-full bg-[#2C2C2E] overflow-hidden">
        <motion.div className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #7B61FF, #00D9FF)' }}
          animate={{ width: done ? '100%' : step === 0 ? '5%' : `${10 + progress * 0.85}%` }}
          transition={{ duration: 0.3 }} />
      </div>
    </motion.div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function RecordView({ onBack, onDone }) {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const rafRef      = useRef(null)
  const stopDrawRef = useRef(null)
  const streamRef   = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef   = useRef([])
  const startRef    = useRef(null)

  const [facingMode,   setFacingMode]   = useState('user')
  const [permission,   setPermission]   = useState('requesting')
  const [isRecording,  setIsRecording]  = useState(false)
  const [liveTimer,    setLiveTimer]    = useState(0)
  const [clips,        setClips]        = useState([])
  const [totalSec,     setTotalSec]     = useState(0)
  const [processing,   setProcessing]   = useState(false)
  const [showTitle,    setShowTitle]    = useState(false)
  const [vlogTitle,    setVlogTitle]    = useState('')
  const [flash,        setFlash]        = useState(false)
  const [switching,    setSwitching]    = useState(false)
  const [filterIdx,    setFilterIdx]    = useState(0)
  const [zoom,         setZoom]         = useState(1)
  const [stickers,     setStickers]     = useState([])
  const [activePanel,  setActivePanel]  = useState(null)
  const [pendingEmoji, setPendingEmoji] = useState(null)
  const [filterThumbs, setFilterThumbs] = useState(null) // base64 frame for filter previews
  const [showZoom,     setShowZoom]     = useState(false)

  const filterCSS = FILTERS[filterIdx].css
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

  // Capture frame for filter preview thumbnails
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
  }, [isRecording, totalSec])

  // ── Recording ────────────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!streamRef.current || totalSec >= MAX_SEC || isRecording) return
    chunksRef.current = []
    startRef.current  = Date.now()

    const canvas = canvasRef.current
    const video  = videoRef.current
    const canCap = !!canvas?.captureStream

    let recordStream = streamRef.current
    if (canCap && video) {
      startCanvasDraw(canvas, video, filterCSS, stickers, zoom, facingMode === 'user')
      const canvasStream = canvas.captureStream(30)
      const audio = streamRef.current.getAudioTracks()
      recordStream = new MediaStream([...canvasStream.getVideoTracks(), ...audio])
    }

    const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) ?? ''
    const mr = new MediaRecorder(recordStream, mimeType ? { mimeType } : {})
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = async () => {
      stopDrawRef.current?.()
      const duration = (Date.now() - startRef.current) / 1000
      // Always save clips ≥ 0.08s
      if (duration < 0.08 || chunksRef.current.length === 0) return
      setFlash(true); setTimeout(() => setFlash(false), 220)
      const blob     = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
      const url      = URL.createObjectURL(blob)
      const thumbUrl = await captureThumb(url)
      const safeDur  = Math.min(duration, remaining)
      setClips(prev => [...prev, { url, blob, thumbUrl, duration: safeDur }])
      setTotalSec(prev => Math.min(+(prev + safeDur).toFixed(2), MAX_SEC))
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
    v.onseeked     = () => { c.getContext('2d').drawImage(v, 0, 0, 160, 240); resolve(c.toDataURL('image/jpeg', 0.75)); v.src = '' }
    v.onerror      = () => resolve(null)
  })

  // ── Sticker placement ────────────────────────────────────────────────────────
  const onCameraClick = e => {
    if (!pendingEmoji) return
    const rect = e.currentTarget.getBoundingClientRect()
    setStickers(prev => [...prev, {
      id: Date.now(), emoji: pendingEmoji,
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
    }])
    setPendingEmoji(null)
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
      <AnimatePresence>
        {showTitle && (
          <TitleScreen
            firstThumb={clips[0]?.thumbUrl ?? null}
            onSkip={() => { setVlogTitle(''); setShowTitle(false); setProcessing(true) }}
            onConfirm={t => { setVlogTitle(t); setShowTitle(false); setProcessing(true) }}
          />
        )}
        {processing && <ProcessingScreen clips={clips} title={vlogTitle} onComplete={onDone} />}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black flex flex-col" style={{ userSelect: 'none' }}>

        {/* Camera */}
        <div className="absolute inset-0" onClick={onCameraClick}
          style={{ cursor: pendingEmoji ? 'crosshair' : 'default' }}>
          {permission === 'granted' && (
            <video ref={videoCallbackRef} autoPlay playsInline muted
              className="w-full h-full object-cover"
              style={{
                filter:          filterCSS !== 'none' ? filterCSS : undefined,
                transform:       `${facingMode === 'user' ? 'scaleX(-1) ' : ''}scale(${zoom})`,
                transformOrigin: 'center',
                transition:      'filter 0.3s',
              }} />
          )}

          {/* Stickers */}
          {stickers.map(s => (
            <motion.div key={s.id} initial={{ scale: 0 }} animate={{ scale: 1 }}
              style={{ position: 'absolute', left: `${s.x * 100}%`, top: `${s.y * 100}%`, fontSize: 44, transform: 'translate(-50%,-50%)', touchAction: 'none' }}
              onDoubleClick={e => { e.stopPropagation(); setStickers(p => p.filter(st => st.id !== s.id)) }}>
              {s.emoji}
            </motion.div>
          ))}

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
              ? <><div className="w-10 h-10 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" /><span className="text-[#8E8E93] text-sm">Kamera wird gestartet…</span></>
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

          {/* Filter panel — with live video frame previews */}
          <AnimatePresence>
            {activePanel === 'filter' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                className="mb-5 px-4">
                <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
                  {FILTERS.map((f, i) => (
                    <motion.button key={f.name} whileTap={{ scale: 0.88 }}
                      onClick={() => setFilterIdx(i)}
                      className="flex-shrink-0 flex flex-col items-center gap-2">
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
                        {filterIdx === i && (
                          <div className="absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full bg-white flex items-center justify-center">
                            <Check size={10} className="text-black" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                      <span className={`text-[10px] font-semibold transition-colors ${filterIdx === i ? 'text-white' : 'text-white/60'}`}>
                        {f.name}
                      </span>
                    </motion.button>
                  ))}
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

          {/* Clip strip */}
          <AnimatePresence>
            {clips.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 px-4 mb-5 overflow-x-auto no-scrollbar">
                {clips.map((clip, i) => (
                  <motion.div key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="flex-shrink-0 relative group" style={{ width: 42, height: 60 }}>
                    <div className="w-full h-full rounded-xl overflow-hidden"
                      style={{ border: '2px solid rgba(255,255,255,0.35)' }}>
                      {clip.thumbUrl
                        ? <img src={clip.thumbUrl} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full bg-white/10" />}
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-black/70 rounded-b-xl text-center py-0.5">
                      <span className="text-[7px] text-white font-bold">{clip.duration.toFixed(1)}s</span>
                    </div>
                    <button onClick={() => deleteClip(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <X size={10} className="text-white" />
                    </button>
                  </motion.div>
                ))}
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
                {/* Color swatch of current filter */}
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

            {/* Record button with Snap-style drag-to-zoom */}
            <SnapRecordBtn
              isRecording={isRecording}
              disabled={permission !== 'granted' || totalSec >= MAX_SEC}
              progress={progress}
              zoom={zoom}
              onStart={startRecording}
              onStop={stopRecording}
              onZoom={setZoom} />

            {/* Right: done */}
            <div className="w-24 flex justify-end">
              <AnimatePresence>
                {clips.length > 0 && (
                  <motion.button
                    initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    whileTap={{ scale: 0.9 }}
                    disabled={isRecording}
                    onClick={() => setShowTitle(true)}
                    className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-1 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 28px rgba(123,97,255,0.55)' }}>
                    <Sparkles size={22} className="text-white" />
                    <span className="text-[9px] text-white font-bold leading-none">Fertig</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Hint */}
          <p className="text-center text-white/40 text-[11px] mt-4 px-4">
            {pendingEmoji ? 'Tippe auf das Bild zum Platzieren'
              : totalSec >= MAX_SEC ? '60 Sekunden erreicht'
              : isRecording ? 'Nach oben ziehen zum Zoomen · Loslassen zum Stoppen'
              : clips.length === 0 ? 'Halten zum Aufnehmen · Nach oben ziehen zum Zoomen'
              : 'Halten für weiteren Clip · Fertig zum Speichern'}
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

// ── Snapchat-style record button ───────────────────────────────────────────────
function SnapRecordBtn({ isRecording, disabled, progress, zoom, onStart, onStop, onZoom }) {
  const R        = 40
  const CIRC     = 2 * Math.PI * R
  const startY   = useRef(null)
  const startZ   = useRef(1)
  const btnRef   = useRef(null)

  const handlePointerDown = e => {
    if (disabled) return
    e.preventDefault()
    startY.current = e.clientY
    startZ.current = zoom
    btnRef.current?.setPointerCapture(e.pointerId)
    onStart()
  }

  const handlePointerMove = e => {
    if (startY.current == null) return
    const dy   = startY.current - e.clientY  // drag up = positive
    const dz   = (dy / 180) * 3              // 180px drag = 3× change
    const newZ = Math.min(4, Math.max(1, startZ.current + dz))
    onZoom(parseFloat(newZ.toFixed(2)))
  }

  const handlePointerUp = e => {
    e.preventDefault()
    startY.current = null
    onStop()
  }

  return (
    <div className="relative flex items-center justify-center" style={{ width: 108, height: 108 }}>
      {/* Progress ring */}
      <svg className="absolute inset-0 -rotate-90" width="108" height="108">
        <circle cx="54" cy="54" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3.5" />
        <motion.circle cx="54" cy="54" r={R} fill="none" stroke="white" strokeWidth="3.5"
          strokeLinecap="round" strokeDasharray={CIRC}
          animate={{ strokeDashoffset: CIRC - (progress / 100) * CIRC }}
          transition={{ duration: 0.1 }} />
      </svg>

      {/* Pulse */}
      {isRecording && (
        <motion.div className="absolute w-24 h-24 rounded-full"
          style={{ background: 'rgba(239,68,68,0.2)' }}
          animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 1, repeat: Infinity }} />
      )}

      {/* Button */}
      <motion.button
        ref={btnRef}
        animate={{ scale: isRecording ? 0.88 : 1 }}
        transition={{ duration: 0.15 }}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={e => e.preventDefault()}
        className="relative w-[74px] h-[74px] rounded-full flex items-center justify-center disabled:opacity-40"
        style={{
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          background: isRecording
            ? '#EF4444'
            : 'linear-gradient(135deg, #7B61FF, #00D9FF)',
          boxShadow: isRecording
            ? '0 0 36px rgba(239,68,68,0.6)'
            : '0 0 36px rgba(123,97,255,0.6)',
        }}>
        <motion.div
          animate={{ width: isRecording ? 26 : 30, height: isRecording ? 26 : 30, borderRadius: isRecording ? 6 : 15 }}
          transition={{ duration: 0.15 }}
          className="bg-white" />
      </motion.button>
    </div>
  )
}
