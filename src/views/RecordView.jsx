import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, Camera, Video, Sparkles, AlertCircle, Trash2 } from 'lucide-react'
import ProgressRing from '../components/ProgressRing'

const MAX_SEC = 60

export default function RecordView({ onBack, onDone }) {
  const videoRef      = useRef(null)
  const streamRef     = useRef(null)
  const recorderRef   = useRef(null)
  const chunksRef     = useRef([])
  const startRef      = useRef(null)

  const [permission,  setPermission]  = useState('requesting')
  const [isRecording, setIsRecording] = useState(false)
  const [liveTimer,   setLiveTimer]   = useState(0)
  const [clips,       setClips]       = useState([])
  const [totalSec,    setTotalSec]    = useState(0)

  const remaining = Math.max(MAX_SEC - totalSec, 0)
  const progress  = Math.min((totalSec / MAX_SEC) * 100, 100)

  // ── Camera setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true })
      .then(stream => {
        streamRef.current = stream
        setPermission('granted')
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setPermission('denied'))

    return () => streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  // Attach stream once video element exists
  const attachStream = el => {
    videoRef.current = el
    if (el && streamRef.current) el.srcObject = streamRef.current
  }

  // ── Live timer while recording ───────────────────────────────────────────
  useEffect(() => {
    if (!isRecording) { setLiveTimer(0); return }
    const t = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000
      setLiveTimer(elapsed)
      if (totalSec + elapsed >= MAX_SEC) stopRecording()
    }, 80)
    return () => clearInterval(t)
  }, [isRecording, totalSec])

  // ── Recording ────────────────────────────────────────────────────────────
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
      if (duration < 0.3) return // ignore accidental taps
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

  const deleteClip = (i) => {
    const removed = clips[i]
    URL.revokeObjectURL(removed.url)
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
    <motion.div
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className="min-h-screen bg-[#0A0A0B] flex flex-col pb-28">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-4">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-white font-semibold">Deinen Tag aufnehmen</span>
        <div className="text-sm font-semibold" style={{ color: remaining < 10 ? '#FF453A' : '#8E8E93' }}>
          {remaining.toFixed(0)}s frei
        </div>
      </div>

      {/* Camera preview */}
      <div className="relative mx-5 rounded-3xl overflow-hidden bg-[#141415] border border-[#2C2C2E]"
        style={{ aspectRatio: '9/14', maxHeight: '50vh' }}>

        {permission === 'granted' && (
          <video ref={attachStream} autoPlay playsInline muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }} />
        )}

        {permission === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" />
            <span className="text-[#8E8E93] text-sm">Kamera wird gestartet…</span>
          </div>
        )}

        {permission === 'denied' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <AlertCircle size={30} className="text-red-400" />
            <p className="text-white font-semibold">Kamerazugriff verweigert</p>
            <p className="text-[#8E8E93] text-sm">Bitte erlaube den Kamerazugriff in den Browser-Einstellungen.</p>
          </div>
        )}

        {/* REC badge */}
        {isRecording && (
          <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5">
            <motion.div className="w-2 h-2 rounded-full bg-red-500"
              animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.7, repeat: Infinity }} />
            <span className="text-white text-xs font-bold">{liveTimer.toFixed(1)}s</span>
          </div>
        )}

        {/* Limit warning */}
        {remaining <= 10 && remaining > 0 && (
          <div className="absolute top-4 right-4 bg-red-500/20 border border-red-500/50 rounded-full px-2.5 py-1">
            <span className="text-red-400 text-xs font-bold">{Math.ceil(remaining)}s</span>
          </div>
        )}
      </div>

      {/* Ring + clip strip */}
      <div className="flex items-center gap-4 px-5 mt-4">
        <div className="relative flex-shrink-0" style={{ width: 68, height: 68 }}>
          <ProgressRing progress={progress} size={68} strokeWidth={5} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold text-white leading-none">{Math.round(totalSec + (isRecording ? liveTimer : 0))}</span>
            <span className="text-[9px] text-[#8E8E93]">/ 60s</span>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1 py-1">
          {clips.length === 0 && (
            <div className="flex items-center h-16 w-full">
              <span className="text-xs text-[#3A3A3C]">Noch keine Clips – halte den Button gedrückt</span>
            </div>
          )}
          {clips.map((clip, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
              className="flex-shrink-0 w-11 h-16 rounded-xl overflow-hidden border border-[#2C2C2E] relative group">
              {clip.thumbUrl
                ? <img src={clip.thumbUrl} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-[#1C1C1E] flex items-center justify-center">
                    <Video size={12} className="text-[#8E8E93]" />
                  </div>
              }
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center py-0.5">
                <span className="text-[8px] text-white">{clip.duration.toFixed(1)}s</span>
              </div>
              <button onClick={() => deleteClip(i)}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Trash2 size={14} className="text-red-400" />
              </button>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Record button */}
      <div className="flex flex-col items-center gap-2 px-5 mt-5">
        <motion.button
          whileTap={{ scale: 0.9 }}
          disabled={permission !== 'granted' || totalSec >= MAX_SEC}
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          onPointerCancel={stopRecording}
          className="relative w-20 h-20 rounded-full select-none touch-none disabled:opacity-40 cursor-pointer">
          {isRecording && (
            <motion.div className="absolute inset-0 rounded-full bg-red-500/20"
              animate={{ scale: [1, 1.65, 1] }} transition={{ duration: 0.85, repeat: Infinity }} />
          )}
          <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors duration-150 ${
            isRecording ? 'bg-red-500' : totalSec >= MAX_SEC ? 'bg-[#2C2C2E]' : 'bg-[#7B61FF]'
          }`}>
            <Camera size={28} className="text-white" />
          </div>
        </motion.button>

        <p className="text-xs text-[#8E8E93] text-center">
          {totalSec >= MAX_SEC
            ? '60 Sekunden erreicht'
            : isRecording
            ? 'Loslassen zum Stoppen'
            : 'Gedrückt halten zum Aufnehmen'}
        </p>

        {clips.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onDone(clips)}
            className="mt-3 w-full py-4 rounded-2xl font-semibold text-white flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
            <Sparkles size={16} />
            Fertig – KI schneidet jetzt
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}
