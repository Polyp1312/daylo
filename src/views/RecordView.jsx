// v4 — canvas · filters · stickers · pinch-zoom
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RefreshCw, Check, Sparkles } from 'lucide-react'

const MAX_SEC = 60

// ── Filters ────────────────────────────────────────────────────────────────────
const FILTERS = [
  { name: 'Normal', css: 'none',                                                  color: '#2C2C2E' },
  { name: 'Vivid',  css: 'saturate(1.9) contrast(1.1)',                           color: '#FF6B9D' },
  { name: 'Warm',   css: 'sepia(0.4) saturate(1.6) brightness(1.05)',             color: '#FF9F43' },
  { name: 'Cool',   css: 'hue-rotate(30deg) saturate(1.4) brightness(0.95)',      color: '#00D9FF' },
  { name: 'B&W',    css: 'grayscale(1) contrast(1.2)',                            color: '#8E8E93' },
  { name: 'Fade',   css: 'contrast(0.75) brightness(1.25) saturate(0.65)',        color: '#BF5AF2' },
  { name: 'Neon',   css: 'hue-rotate(260deg) saturate(2.5) brightness(1.15)',     color: '#7B61FF' },
  { name: 'Drama',  css: 'contrast(1.4) saturate(0.8) brightness(0.9)',           color: '#FF453A' },
]

const EMOJIS = [
  '🔥','💀','😍','🤯','✨','💯','🎬','❤️','⚡','🏆','👑','🎉',
  '🤙','😎','🥶','💫','😂','💪','👀','🫶','🌊','🎵','💥','🫠',
]

// ── KI Processing Screen ───────────────────────────────────────────────────────
const STEPS = [
  { label: 'Clips zusammenfügen', ms: 900 },
  { label: 'Filter anwenden',     ms: 750 },
  { label: 'Schnitt optimieren',  ms: 700 },
  { label: 'Vlog fertigstellen',  ms: 500 },
]

function ProcessingScreen({ onComplete }) {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let delay = 400
    STEPS.forEach((s, i) => {
      delay += s.ms
      setTimeout(() => {
        setStep(i + 1)
        if (i === STEPS.length - 1) {
          setTimeout(() => setDone(true), 400)
          setTimeout(() => onComplete(), 1500)
        }
      }, delay)
    })
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-10"
      style={{ background: '#0A0A0B' }}>
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
        {done ? 'Vlog fertig! 🎉' : 'KI schneidet…'}
      </h2>
      <p className="text-[#8E8E93] text-sm mb-12 text-center">
        {done ? 'Gespeichert und bereit' : 'Dein Vlog wird automatisch bearbeitet'}
      </p>
      <div className="w-full space-y-5">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-4">
            <motion.div
              animate={step > i ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0.25 }}
              className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${step > i ? 'bg-[#2ECC71]' : 'bg-[#2C2C2E]'}`}>
              {step > i ? <Check size={14} className="text-white" /> : <span className="text-[#8E8E93] text-xs font-bold">{i+1}</span>}
            </motion.div>
            <motion.span animate={{ color: step > i ? '#fff' : '#3A3A3C' }} className="text-sm font-medium flex-1">{s.label}</motion.span>
            {step === i + 1 && !done && (
              <motion.div className="w-4 h-4 rounded-full border-2 border-t-transparent border-[#7B61FF]"
                animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
            )}
          </div>
        ))}
      </div>
      <div className="w-full mt-10 h-1.5 rounded-full bg-[#2C2C2E] overflow-hidden">
        <motion.div className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #7B61FF, #00D9FF)' }}
          animate={{ width: done ? '100%' : `${(step / STEPS.length) * 88}%` }}
          transition={{ duration: 0.5 }} />
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
  const pinchRef    = useRef(null)

  const [facingMode,    setFacingMode]    = useState('user')
  const [permission,    setPermission]    = useState('requesting')
  const [isRecording,   setIsRecording]   = useState(false)
  const [liveTimer,     setLiveTimer]     = useState(0)
  const [clips,         setClips]         = useState([])
  const [totalSec,      setTotalSec]      = useState(0)
  const [processing,    setProcessing]    = useState(false)
  const [flash,         setFlash]         = useState(false)
  const [switching,     setSwitching]     = useState(false)

  const [filterIdx,     setFilterIdx]     = useState(0)
  const [zoom,          setZoom]          = useState(1)
  const [stickers,      setStickers]      = useState([])   // [{id,emoji,x,y}]
  const [activePanel,   setActivePanel]   = useState(null) // 'filter'|'emoji'
  const [pendingEmoji,  setPendingEmoji]  = useState(null) // emoji waiting to be placed

  const filterCSS = FILTERS[filterIdx].css
  const remaining = Math.max(MAX_SEC - totalSec, 0)
  const progress  = Math.min(((totalSec + (isRecording ? liveTimer : 0)) / MAX_SEC) * 100, 100)

  // ── Camera setup ─────────────────────────────────────────────────────────────
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

  // ── Canvas draw loop (runs during recording) ──────────────────────────────────
  const startCanvasDraw = useCallback((canvas, video, filter, stickerList, zoomLevel, isFront) => {
    const ctx = canvas.getContext('2d')
    let stopped = false
    const draw = () => {
      if (stopped || !video.videoWidth) { rafRef.current = requestAnimationFrame(draw); return }
      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      ctx.save()
      // Zoom by cropping source
      const srcW = video.videoWidth  / zoomLevel
      const srcH = video.videoHeight / zoomLevel
      const srcX = (video.videoWidth  - srcW) / 2
      const srcY = (video.videoHeight - srcH) / 2
      if (isFront) {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.filter = filter !== 'none' ? filter : 'none'
      ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height)
      ctx.restore()
      // Stickers
      ctx.filter = 'none'
      ctx.font = `${Math.round(canvas.width * 0.12)}px serif`
      ctx.textBaseline = 'middle'
      stickerList.forEach(s => {
        ctx.fillText(s.emoji,
          s.x * canvas.width  - canvas.width  * 0.06,
          s.y * canvas.height + canvas.height * 0.03)
      })
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()
    stopDrawRef.current = () => { stopped = true; cancelAnimationFrame(rafRef.current) }
  }, [])

  // ── Live timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRecording) { setLiveTimer(0); return }
    const t = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000
      setLiveTimer(elapsed)
      if (totalSec + elapsed >= MAX_SEC) stopRecording()
    }, 100)
    return () => clearInterval(t)
  }, [isRecording, totalSec])

  // ── Recording ─────────────────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!streamRef.current || totalSec >= MAX_SEC || isRecording) return
    chunksRef.current = []
    startRef.current  = Date.now()

    const canvas  = canvasRef.current
    const video   = videoRef.current
    const canCap  = !!canvas?.captureStream

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
      const duration = Math.min((Date.now() - startRef.current) / 1000, remaining)
      if (duration < 0.3) return
      setFlash(true); setTimeout(() => setFlash(false), 250)
      const blob     = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
      const url      = URL.createObjectURL(blob)
      const thumbUrl = await captureThumb(url)
      setClips(prev => [...prev, { url, blob, thumbUrl, duration }])
      setTotalSec(prev => Math.min(+(prev + duration).toFixed(2), MAX_SEC))
    }
    mr.start(100)
    recorderRef.current = mr
    setIsRecording(true)
  }, [totalSec, isRecording, filterCSS, stickers, zoom, facingMode, remaining, startCanvasDraw])

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
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
    v.onseeked    = () => { c.getContext('2d').drawImage(v, 0, 0, 160, 240); resolve(c.toDataURL('image/jpeg', 0.75)); v.src = '' }
    v.onerror     = () => resolve(null)
  })

  // ── Pinch zoom ────────────────────────────────────────────────────────────────
  const onTouchStart = e => {
    if (e.touches.length === 2) {
      pinchRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY)
    }
  }
  const onTouchMove = e => {
    if (e.touches.length === 2 && pinchRef.current != null) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY)
      const ratio = d / pinchRef.current
      setZoom(z => Math.min(4, Math.max(1, +(z * ratio).toFixed(2))))
      pinchRef.current = d
    }
  }

  // ── Sticker placement ─────────────────────────────────────────────────────────
  const onCameraClick = e => {
    if (!pendingEmoji) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top)  / rect.height
    setStickers(prev => [...prev, { id: Date.now(), emoji: pendingEmoji, x, y }])
    setPendingEmoji(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Hidden canvas for recording */}
      <canvas ref={canvasRef} className="hidden" />

      <AnimatePresence>
        {processing && <ProcessingScreen onComplete={() => onDone(clips)} />}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black flex flex-col select-none">

        {/* ── Camera fullscreen ── */}
        <div
          className="absolute inset-0"
          onClick={onCameraClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          style={{ cursor: pendingEmoji ? 'crosshair' : 'default' }}>

          {permission === 'granted' && (
            <video
              ref={videoCallbackRef}
              autoPlay playsInline muted
              className="w-full h-full object-cover"
              style={{
                filter:    filterCSS !== 'none' ? filterCSS : undefined,
                transform: `${facingMode === 'user' ? 'scaleX(-1) ' : ''}scale(${zoom})`,
                transformOrigin: 'center',
              }} />
          )}

          {/* Emoji sticker overlays */}
          {stickers.map(s => (
            <motion.div
              key={s.id}
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              style={{ position: 'absolute', left: `${s.x * 100}%`, top: `${s.y * 100}%`, fontSize: 40, transform: 'translate(-50%,-50%)', userSelect: 'none' }}
              onDoubleClick={e => { e.stopPropagation(); setStickers(p => p.filter(st => st.id !== s.id)) }}>
              {s.emoji}
            </motion.div>
          ))}

          {/* Flash */}
          <AnimatePresence>
            {flash && (
              <motion.div initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="absolute inset-0 bg-white pointer-events-none z-10" />
            )}
          </AnimatePresence>

          {/* Gradients */}
          <div className="absolute inset-x-0 top-0 h-44 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)' }} />
          <div className="absolute inset-x-0 bottom-0 h-72 pointer-events-none"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }} />
        </div>

        {/* Loading / denied */}
        {permission !== 'granted' && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3 z-20">
            {permission === 'requesting'
              ? <><div className="w-10 h-10 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" /><span className="text-[#8E8E93] text-sm">Kamera wird gestartet…</span></>
              : <><span className="text-5xl">🚫</span><p className="text-white font-semibold">Kamerazugriff verweigert</p><p className="text-[#8E8E93] text-sm text-center px-8">Erlaube den Kamerazugriff in den Einstellungen.</p></>}
          </div>
        )}

        {/* ── Top bar ── */}
        <div className="relative z-20 flex items-center justify-between px-4 pt-14 pb-2">
          <Btn onClick={onBack}><X size={18} className="text-white" /></Btn>

          {/* REC / timer */}
          {isRecording ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}>
              <motion.div className="w-2.5 h-2.5 rounded-full bg-red-500"
                animate={{ opacity: [1,0,1] }} transition={{ duration: 0.7, repeat: Infinity }} />
              <span className="text-white text-xs font-bold">{liveTimer.toFixed(1)}s</span>
            </div>
          ) : zoom > 1.05 ? (
            <div className="px-3 py-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}>
              <span className="text-white text-xs font-semibold">{zoom.toFixed(1)}×</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)' }}>
              <span className="text-white/70 text-xs font-semibold">{remaining.toFixed(0)}s übrig</span>
            </div>
          )}

          <Btn onClick={switchCamera} disabled={isRecording || switching}>
            <motion.div animate={{ rotate: switching ? 180 : 0 }} transition={{ duration: 0.35 }}>
              <RefreshCw size={17} className="text-white" />
            </motion.div>
          </Btn>
        </div>

        {/* ── Right: zoom slider ── */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2">
          <span className="text-white/60 text-[10px] font-bold">{zoom.toFixed(1)}×</span>
          <div className="relative h-36 w-7 flex items-center justify-center">
            <div className="w-1 h-full rounded-full bg-white/20" />
            <input type="range" min={1} max={4} step={0.05} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="absolute h-36 appearance-none bg-transparent cursor-pointer"
              style={{ writingMode: 'vertical-lr', direction: 'rtl', WebkitAppearance: 'slider-vertical', width: 28 }} />
          </div>
          <span className="text-white/40 text-[9px]">ZOOM</span>
        </div>

        {/* ── Bottom panel ── */}
        <div className="absolute bottom-0 inset-x-0 z-20 pb-10">

          {/* Filter strip */}
          <AnimatePresence>
            {activePanel === 'filter' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                className="flex gap-3 px-4 mb-4 overflow-x-auto no-scrollbar pb-1">
                {FILTERS.map((f, i) => (
                  <motion.button key={f.name} whileTap={{ scale: 0.9 }}
                    onClick={() => setFilterIdx(i)}
                    className="flex-shrink-0 flex flex-col items-center gap-1.5">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 transition-all"
                      style={{ borderColor: filterIdx === i ? '#fff' : 'transparent' }}>
                      <div className="w-full h-full rounded-xl"
                        style={{ background: `linear-gradient(135deg, ${f.color}, ${f.color}88)`, filter: f.css !== 'none' ? f.css : undefined }} />
                    </div>
                    <span className="text-white text-[10px] font-medium">{f.name}</span>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Emoji picker */}
          <AnimatePresence>
            {activePanel === 'emoji' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                className="px-4 mb-4">
                {pendingEmoji ? (
                  <div className="text-center py-2">
                    <span className="text-4xl">{pendingEmoji}</span>
                    <p className="text-white/70 text-xs mt-1">Tippe auf die Kamera zum Platzieren</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {EMOJIS.map(e => (
                      <motion.button key={e} whileTap={{ scale: 0.8 }}
                        onClick={() => { setPendingEmoji(e); setActivePanel(null) }}
                        className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl bg-white/10">
                        {e}
                      </motion.button>
                    ))}
                  </div>
                )}
                {stickers.length > 0 && (
                  <button onClick={() => setStickers([])}
                    className="mt-3 w-full py-2 rounded-xl bg-red-500/20 text-red-400 text-xs font-semibold">
                    Alle Sticker entfernen
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Clip strip */}
          <AnimatePresence>
            {clips.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 px-4 mb-4 overflow-x-auto no-scrollbar">
                {clips.map((clip, i) => (
                  <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="flex-shrink-0 relative group" style={{ width: 40, height: 56 }}>
                    <div className="w-full h-full rounded-xl overflow-hidden border-2 border-white/30">
                      {clip.thumbUrl
                        ? <img src={clip.thumbUrl} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full bg-white/10" />}
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-black/70 rounded-b-xl text-center py-0.5">
                      <span className="text-[6px] text-white font-semibold">{clip.duration.toFixed(1)}s</span>
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

          {/* Control row */}
          <div className="flex items-center justify-between px-6">

            {/* Filter + Emoji buttons */}
            <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.88 }}
                onClick={() => setActivePanel(p => p === 'filter' ? null : 'filter')}
                className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{
                  background: activePanel === 'filter' ? FILTERS[filterIdx].color : 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(10px)',
                  border: activePanel === 'filter' ? '2px solid white' : '2px solid rgba(255,255,255,0.2)',
                }}>
                <span className="text-xl">🎨</span>
              </motion.button>
              <motion.button whileTap={{ scale: 0.88 }}
                onClick={() => setActivePanel(p => p === 'emoji' ? null : 'emoji')}
                className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{
                  background: activePanel === 'emoji' ? 'rgba(123,97,255,0.6)' : 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(10px)',
                  border: activePanel === 'emoji' ? '2px solid white' : '2px solid rgba(255,255,255,0.2)',
                }}>
                <span className="text-xl">😊</span>
              </motion.button>
            </div>

            {/* Record button */}
            <RecordBtn
              isRecording={isRecording}
              disabled={permission !== 'granted' || totalSec >= MAX_SEC}
              progress={progress}
              onStart={startRecording}
              onStop={stopRecording} />

            {/* Done button */}
            <div className="w-24 flex justify-end">
              <AnimatePresence>
                {clips.length > 0 && !isRecording && (
                  <motion.button
                    initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setProcessing(true)}
                    className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5"
                    style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 24px rgba(123,97,255,0.6)' }}>
                    <Sparkles size={20} className="text-white" />
                    <span className="text-[9px] text-white font-bold">Fertig</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Hint */}
          <p className="text-center text-white/40 text-[11px] mt-3">
            {pendingEmoji ? `Tippe auf das Bild um ${pendingEmoji} zu platzieren`
              : totalSec >= MAX_SEC ? '60s erreicht'
              : isRecording ? 'Loslassen zum Stoppen'
              : clips.length === 0 ? 'Gedrückt halten zum Aufnehmen'
              : 'Nächster Clip oder Fertig'}
          </p>
        </div>
      </motion.div>
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled }) {
  return (
    <motion.button whileTap={{ scale: 0.85 }} onClick={onClick} disabled={disabled}
      className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-40"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)' }}>
      {children}
    </motion.button>
  )
}

function RecordBtn({ isRecording, disabled, progress, onStart, onStop }) {
  const R    = 38
  const CIRC = 2 * Math.PI * R
  return (
    <div className="relative flex items-center justify-center" style={{ width: 100, height: 100 }}>
      <svg className="absolute inset-0 -rotate-90" width="100" height="100">
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
        <motion.circle cx="50" cy="50" r={R} fill="none" stroke="white" strokeWidth="3"
          strokeLinecap="round" strokeDasharray={CIRC}
          animate={{ strokeDashoffset: CIRC - (progress / 100) * CIRC }}
          transition={{ duration: 0.12 }} />
      </svg>
      {isRecording && (
        <motion.div className="absolute inset-0 rounded-full"
          style={{ background: 'rgba(239,68,68,0.18)' }}
          animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0, 0.7] }}
          transition={{ duration: 1.1, repeat: Infinity }} />
      )}
      <motion.button
        whileTap={{ scale: 0.88 }}
        disabled={disabled}
        onPointerDown={e => { e.preventDefault(); onStart() }}
        onPointerUp={e => { e.preventDefault(); onStop() }}
        onPointerLeave={onStop}
        onPointerCancel={onStop}
        onContextMenu={e => e.preventDefault()}
        className="relative w-[68px] h-[68px] rounded-full flex items-center justify-center disabled:opacity-40"
        style={{
          background: isRecording
            ? '#EF4444'
            : 'linear-gradient(135deg, #7B61FF, #00D9FF)',
          boxShadow: isRecording
            ? '0 0 32px rgba(239,68,68,0.55)'
            : '0 0 32px rgba(123,97,255,0.55)',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}>
        <motion.div
          animate={{
            width:        isRecording ? 24 : 28,
            height:       isRecording ? 24 : 28,
            borderRadius: isRecording ? 6  : 14,
          }}
          transition={{ duration: 0.18 }}
          className="bg-white" />
      </motion.button>
    </div>
  )
}
