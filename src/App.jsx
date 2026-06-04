import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, Video, Users, Home, Play, User, MessageCircle,
  Clock, Zap, Sparkles, Camera, QrCode, X, Plus,
  Check, CheckCircle, UserPlus, ChevronLeft, Trash2, Send, Flame, Heart, Star,
  MessageSquare, Pause, Volume2, VolumeX, Trophy, Share2, MessageCircleMore,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

import ProgressRing   from './components/ProgressRing'
import UserAvatar, { avatarUrl } from './components/UserAvatar'
import RecordView     from './views/RecordView'
import GroupView      from './views/GroupView'
import ProfileView    from './views/ProfileView'
import MessagesView   from './views/MessagesView'
import { useApp }     from './context/AppContext'
import { useAuth }    from './context/AuthContext'
import { useToast }   from './components/Toast'
import { api }        from './lib/api'
import { deleteClips } from './lib/clipStore'

// ── Helpers ────────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0')

function secsUntilMidnight() {
  const now = new Date()
  const mid = new Date(now)
  mid.setHours(24, 0, 0, 0)
  return Math.max(0, Math.floor((mid - now) / 1000))
}
function secsToHMS(s) {
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}
function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}
function timeGreeting() {
  const h = new Date().getHours()
  if (h < 5)  return { text: 'Gute Nacht',   emoji: '🌙' }
  if (h < 12) return { text: 'Guten Morgen', emoji: '☀️' }
  if (h < 17) return { text: 'Hallo',        emoji: '👋' }
  if (h < 21) return { text: 'Guten Abend',  emoji: '🌅' }
  return           { text: 'Gute Nacht',   emoji: '🌙' }
}

const page = {
  initial:    { opacity: 0, y: 22 },
  animate:    { opacity: 1, y: 0  },
  exit:       { opacity: 0, y: -16 },
  transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
}

const REACTION_TYPES = ['👍', '❤️', '😂']

// ── Animated number (counts up on mount) ─────────────────────────────────────
function AnimatedNumber({ value, duration = 0.8, className, style }) {
  const [displayed, setDisplayed] = useState(0)
  useEffect(() => {
    if (value === 0) { setDisplayed(0); return }
    const start = Date.now()
    const raf = () => {
      const t = Math.min((Date.now() - start) / (duration * 1000), 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayed(Math.round(eased * value))
      if (t < 1) requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
  }, [value, duration])
  return <span className={className} style={style}>{displayed}</span>
}

// ── Confetti burst ────────────────────────────────────────────────────────────
function GoalConfetti({ active }) {
  const particles = useMemo(() =>
    Array.from({ length: 56 }, (_, i) => ({
      id: i,
      x: 5 + Math.random() * 90,
      delay: Math.random() * 1.8,
      dur: 2.4 + Math.random() * 2,
      color: ['#7B61FF','#00D9FF','#FF9F43','#2ECC71','#FF6B9D','#FFD93D','#FF453A','#BF5AF2'][i % 8],
      size: 5 + Math.random() * 7,
      circle: Math.random() > 0.55,
      spin: 200 + Math.random() * 560,
    }))
  , [])

  return (
    <AnimatePresence>
      {active && (
        <div className="fixed inset-0 pointer-events-none z-[90] overflow-hidden">
          {particles.map(p => (
            <motion.div
              key={p.id}
              initial={{ x: `${p.x}vw`, y: '-6vh', rotate: 0, opacity: 1 }}
              animate={{ y: '108vh', rotate: p.spin, opacity: [1, 1, 1, 0] }}
              transition={{ duration: p.dur, delay: p.delay, ease: 'linear' }}
              style={{
                position:     'absolute',
                width:        p.size,
                height:       p.circle ? p.size : p.size * 0.55,
                background:   p.color,
                borderRadius: p.circle ? '50%' : 2,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}

// ── QR Modal ───────────────────────────────────────────────────────────────────
function QRModal({ onClose }) {
  const url = `${window.location.protocol}//${window.location.host}`
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(24px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: 10 }}
        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#141415] border border-[#2C2C2E] rounded-3xl p-6 w-full max-w-[280px] flex flex-col items-center gap-5">
        <div className="flex items-center justify-between w-full">
          <div>
            <p className="text-white font-bold text-lg">Auf Handy öffnen</p>
            <p className="text-[#8E8E93] text-xs mt-0.5">Gleiches WLAN · QR scannen</p>
          </div>
          <motion.button whileTap={{ scale: 0.85 }} onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center">
            <X size={14} className="text-[#8E8E93]" />
          </motion.button>
        </div>
        <div className="p-3 bg-white rounded-2xl shadow-inner">
          <QRCodeSVG value={url} size={188} bgColor="#ffffff" fgColor="#0A0A0B" level="M" />
        </div>
        <p className="text-[#7B61FF] text-[11px] font-mono font-semibold text-center break-all">{url}</p>
      </motion.div>
    </motion.div>
  )
}

// ── Notifications Panel ─────────────────────────────────────────────────────────
function NotificationsPanel({ onClose }) {
  const { requests, notifications, acceptRequest, declineRequest, markNotificationsRead } = useApp()
  const toast = useToast()

  useEffect(() => { markNotificationsRead() }, [])

  const notifIcon = type => {
    if (type === 'friend_accepted') return <CheckCircle      size={15} className="text-[#2ECC71]" />
    if (type === 'group_added')     return <Users            size={15} className="text-[#00D9FF]" />
    if (type === 'vlog_upload')     return <Video            size={15} className="text-[#FF9F43]" />
    if (type === 'vlog_react')      return <Heart            size={15} className="text-[#FF6B9D]" />
    if (type === 'vlog_comment')    return <MessageCircleMore size={15} className="text-[#7B61FF]" />
    if (type === 'your_turn')       return <Star             size={15} className="text-[#FF9F43]" />
    return <UserPlus size={15} className="text-[#7B61FF]" />
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts
    if (diff < 60_000)    return 'Gerade'
    if (diff < 3600_000)  return `${Math.floor(diff / 60_000)} Min.`
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} Std.`
    if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} Tage`
    return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-center items-start pt-16 px-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: -12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -12 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#141415] border border-[#2C2C2E] rounded-3xl p-5 w-full max-w-[370px] max-h-[72vh] overflow-y-auto">

        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-white font-bold text-base">Benachrichtigungen</p>
            {(requests.length + notifications.filter(n => !n.read).length) > 0 && (
              <p className="text-[#7B61FF] text-xs mt-0.5">
                {requests.length + notifications.filter(n => !n.read).length} neu
              </p>
            )}
          </div>
          <motion.button whileTap={{ scale: 0.85 }} onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center">
            <X size={14} className="text-[#8E8E93]" />
          </motion.button>
        </div>

        <AnimatePresence>
          {requests.map(u => (
            <motion.div key={u.id}
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 mb-2.5 bg-[#7B61FF]/10 border border-[#7B61FF]/25 rounded-2xl p-3.5 overflow-hidden">
              <UserAvatar user={u} size={38} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{u.name}</p>
                <p className="text-[#8E8E93] text-xs">möchte dein Freund sein</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <motion.button whileTap={{ scale: 0.88 }}
                  onClick={() => { acceptRequest(u); toast?.show(`Du bist jetzt mit ${u.name} befreundet! 🎉`, 'success') }}
                  className="w-8 h-8 rounded-full bg-[#7B61FF] flex items-center justify-center">
                  <Check size={13} className="text-white" />
                </motion.button>
                <motion.button whileTap={{ scale: 0.88 }} onClick={() => declineRequest(u.id)}
                  className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                  <X size={13} className="text-[#8E8E93]" />
                </motion.button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {notifications.map(n => (
          <div key={n.id}
            className={`flex items-start gap-3 mb-2.5 rounded-2xl p-3.5 transition-colors ${
              n.read ? 'bg-[#1C1C1E]' : 'bg-[#7B61FF]/10 border border-[#7B61FF]/20'
            }`}>
            <div className="w-9 h-9 rounded-xl bg-[#7B61FF]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              {notifIcon(n.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm leading-snug">{n.message}</p>
              <p className="text-[#8E8E93] text-[10px] mt-1">{timeAgo(n.created_at)}</p>
            </div>
            {!n.read && <div className="w-2 h-2 rounded-full bg-[#7B61FF] flex-shrink-0 mt-2" />}
          </div>
        ))}

        {requests.length === 0 && notifications.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-[#1C1C1E] flex items-center justify-center mx-auto mb-4">
              <Bell size={24} className="text-[#3A3A3C]" />
            </div>
            <p className="text-white font-semibold text-sm">Alles gelesen</p>
            <p className="text-[#8E8E93] text-xs mt-1">Keine neuen Benachrichtigungen</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Nav tabs ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'home',     icon: Home,          label: 'Home',      view: 'dashboard' },
  { id: 'record',   icon: Camera,        label: 'Aufnehmen', view: 'record',   special: true },
  { id: 'messages', icon: MessageCircle, label: 'Chats',     view: 'messages'  },
  { id: 'group',    icon: Users,         label: 'Gruppen',   view: 'group'     },
  { id: 'profile',  icon: User,          label: 'Profil',    view: 'profile'   },
]

function BottomNav({ activeTab, onNavigate }) {
  const { unreadMessages, unreadGroupMsgs } = useApp()
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] px-4 pb-6 pt-2 z-50">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300, delay: 0.1 }}
        className="rounded-[30px] px-2 py-2.5"
        style={{
          background: 'rgba(16,16,18,0.96)',
          backdropFilter: 'blur(28px)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}>
        <div className="flex items-center justify-around">
          {TABS.map(tab => (
            <motion.button key={tab.id} whileTap={{ scale: 0.80 }}
              onClick={() => onNavigate(tab.id, tab.view)}
              className="flex flex-col items-center gap-1 min-w-[48px] relative py-1 px-2 rounded-2xl">

              {tab.special ? (
                <motion.div
                  whileTap={{ scale: 0.92 }}
                  className="w-[52px] h-[52px] rounded-full flex items-center justify-center -mt-5"
                  style={{
                    background: 'linear-gradient(135deg, #7B61FF 0%, #00D9FF 100%)',
                    boxShadow: '0 0 24px rgba(123,97,255,0.65), 0 0 48px rgba(0,217,255,0.15)',
                  }}>
                  <tab.icon size={22} className="text-white" />
                </motion.div>
              ) : (
                <>
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-2xl"
                      style={{ background: 'rgba(123,97,255,0.13)' }}
                      transition={{ type: 'spring', damping: 28, stiffness: 360 }}
                    />
                  )}
                  <div className="relative z-10">
                    <tab.icon size={21}
                      style={{ color: activeTab === tab.id ? '#7B61FF' : '#3A3A3C', transition: 'color 0.2s' }}
                    />
                    {tab.id === 'messages' && unreadMessages > 0 && (
                      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#7B61FF] flex items-center justify-center shadow-lg">
                        <span className="text-[8px] text-white font-bold">{Math.min(unreadMessages, 9)}</span>
                      </div>
                    )}
                    {tab.id === 'group' && unreadGroupMsgs > 0 && (
                      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#FF453A] flex items-center justify-center shadow-lg">
                        <span className="text-[8px] text-white font-bold">{Math.min(unreadGroupMsgs, 9)}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-medium relative z-10 transition-colors"
                    style={{ color: activeTab === tab.id ? '#7B61FF' : '#3A3A3C' }}>
                    {tab.label}
                  </span>
                </>
              )}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

// ── Story Player ──────────────────────────────────────────────────────────────
// Full-screen immersive vlog viewer (Instagram/TikTok-style)
function StoryPlayer({ vlogs, initialVlogId, isMe, targetUser, onBack, onVlogDeleted }) {
  const { user } = useAuth()
  const { deleteVlog } = useApp()
  const toast = useToast()

  const [idx, setIdx] = useState(() => {
    if (!initialVlogId) return 0
    const i = vlogs.findIndex(v => v.id === initialVlogId)
    return i >= 0 ? i : 0
  })
  const [videoProgress, setVideoProgress] = useState(0)
  const [muted,          setMuted]          = useState(false)
  const [paused,         setPaused]         = useState(false)
  const [showComments,   setShowComments]   = useState(false)
  const [commentText,    setCommentText]    = useState('')
  const [comments,       setComments]       = useState({})
  const [rxMap,          setRxMap]          = useState({})
  const [reactors,       setReactors]       = useState({})
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [sending,        setSending]        = useState(false)
  const videoRef    = useRef(null)
  const commentRef  = useRef(null)

  const vlog = vlogs[idx]

  useEffect(() => {
    if (!vlog) return
    setVideoProgress(0)
    setConfirmDelete(false)
    if (!comments[vlog.id]) {
      api.vlogs.comments(vlog.id).then(d => {
        if (d.comments) setComments(p => ({ ...p, [vlog.id]: d.comments }))
      }).catch(() => {})
    }
    if (isMe && !reactors[vlog.id]) {
      api.vlogs.reactors(vlog.id).then(d => {
        if (d.reactors) setReactors(p => ({ ...p, [vlog.id]: d.reactors }))
      }).catch(() => {})
    }
  }, [vlog?.id, isMe])

  const goToIdx = useCallback((i) => {
    if (i < 0 || i >= vlogs.length) return
    setIdx(i)
    setShowComments(false)
    setVideoProgress(0)
  }, [vlogs.length])

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (v && v.duration > 0) setVideoProgress(v.currentTime / v.duration)
  }

  const handleEnded = () => {
    if (idx < vlogs.length - 1) goToIdx(idx + 1)
  }

  const handleVideoTap = (e) => {
    if (showComments) { setShowComments(false); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width * 0.33) goToIdx(idx - 1)
    else if (x > rect.width * 0.67) goToIdx(idx + 1)
    else {
      const v = videoRef.current
      if (!v) return
      if (v.paused) v.play().catch(() => {})
      else v.pause()
    }
  }

  const handleReact = async (vlogId, type) => {
    const data = await api.vlogs.react(vlogId, type).catch(() => ({}))
    if (data.reactions) setRxMap(p => ({ ...p, [vlogId]: data.reactions }))
  }

  const handleSendComment = async () => {
    const t = commentText.trim()
    if (!t || sending || !vlog) return
    setSending(true); setCommentText('')
    const { comment, error } = await api.vlogs.addComment(vlog.id, t).catch(() => ({}))
    if (error) { toast?.show(error, 'error'); setCommentText(t) }
    else if (comment) setComments(p => ({ ...p, [vlog.id]: [...(p[vlog.id] ?? []), comment] }))
    setSending(false)
  }

  const handleDeleteComment = async (commentId) => {
    await api.comments.delete(commentId).catch(() => {})
    setComments(p => ({ ...p, [vlog.id]: (p[vlog.id] ?? []).filter(c => c.id !== commentId) }))
    toast?.show('Kommentar gelöscht.', 'info')
  }

  const handleDeleteVlog = async () => {
    await deleteVlog(vlog.id)
    toast?.show('Vlog gelöscht.', 'info')
    setConfirmDelete(false)
    onVlogDeleted?.()
  }

  const getReactions  = v => rxMap[v.id] ?? v.reactions ?? []
  const vlogComments  = vlog ? (comments[vlog.id] ?? []) : []
  const vlogReactors  = vlog ? (reactors[vlog.id] ?? {}) : {}
  const commentCount  = vlogComments.length

  if (!vlog) return null

  return (
    <div className="fixed inset-0 z-50 bg-black select-none">

      {/* ── Video / Processing background ── */}
      <div className="absolute inset-0" onClick={handleVideoTap}>
        {vlog.status === 'processing' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-5"
            style={{ background: 'linear-gradient(180deg, #0D0D0F 0%, #1A1020 100%)' }}>
            <motion.div className="w-16 h-16 rounded-full"
              style={{ border: '3px solid transparent', borderTopColor: '#7B61FF', borderRightColor: '#00D9FF' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} />
            <div className="text-center">
              <p className="text-white font-semibold">KI-Schnitt läuft…</p>
              <p className="text-[#8E8E93] text-sm mt-1">Bitte kurz warten</p>
            </div>
          </div>
        ) : (
          <video
            key={vlog.id}
            ref={videoRef}
            src={vlog.url}
            autoPlay
            playsInline
            muted={muted}
            loop={vlogs.length === 1}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Pause indicator */}
      <AnimatePresence>
        {paused && !showComments && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center">
              <Pause size={28} className="text-white/90" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top gradient */}
      <div className="absolute inset-x-0 top-0 h-52 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)' }} />

      {/* Bottom gradient */}
      <div className="absolute inset-x-0 bottom-0 h-80 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)' }} />

      {/* ── Top UI ── */}
      <div className="absolute inset-x-0 top-0 z-30 px-4 pt-14">
        {/* Story progress bars */}
        <div className="flex gap-1 mb-4">
          {vlogs.map((v, i) => (
            <motion.div key={v.id}
              className="flex-1 h-[3px] rounded-full overflow-hidden cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.2)' }}
              onClick={e => { e.stopPropagation(); goToIdx(i) }}>
              <motion.div
                className="h-full bg-white rounded-full"
                animate={{
                  width: i < idx ? '100%'
                    : i === idx ? `${videoProgress * 100}%`
                    : '0%',
                }}
                transition={{ duration: 0.08 }}
              />
            </motion.div>
          ))}
        </div>

        {/* Header row */}
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}>
            <X size={17} className="text-white" />
          </motion.button>

          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {targetUser && (
              <UserAvatar user={targetUser} size={32} className="flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm leading-tight">
                {isMe ? 'Meine Vlogs' : `${targetUser?.name ?? '...'}`}
              </p>
              {vlog.date && (
                <p className="text-white/50 text-[11px]">{vlog.date}</p>
              )}
            </div>
            {vlogs.length > 1 && (
              <span className="text-white/40 text-xs flex-shrink-0">
                {idx + 1}/{vlogs.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <motion.button whileTap={{ scale: 0.88 }}
              onClick={e => { e.stopPropagation(); setMuted(m => !m) }}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}>
              {muted
                ? <VolumeX size={15} className="text-white/70" />
                : <Volume2 size={15} className="text-white/70" />
              }
            </motion.button>
            {isMe && (
              <motion.button whileTap={{ scale: 0.88 }}
                onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}>
                <Trash2 size={14} className="text-white/70" />
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* ── Nav arrows (left/right) for bigger screens ── */}
      {idx > 0 && (
        <motion.button whileTap={{ scale: 0.9 }}
          onClick={e => { e.stopPropagation(); goToIdx(idx - 1) }}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full flex items-center justify-center hidden sm:flex"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}>
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
      )}

      {/* ── Bottom UI ── */}
      <div className="absolute inset-x-0 bottom-0 z-30 px-5 pb-8">
        {/* Vlog info */}
        {vlog.title && (
          <p className="text-white font-bold text-lg mb-1 leading-tight">{vlog.title}</p>
        )}
        <p className="text-white/50 text-xs mb-4">
          {vlog.clipCount} Clip{vlog.clipCount !== 1 ? 's' : ''} · {Math.round(vlog.duration)}s
          {vlog.status === 'processing' ? ' · KI-Schnitt läuft…' : ''}
        </p>

        {/* Reactions + Comments row */}
        <div className="flex items-center gap-2.5 mb-0">
          {REACTION_TYPES.map(type => {
            const rx    = getReactions(vlog).find(r => r.type === type)
            const count = rx?.count ?? 0
            const mine  = rx?.mine  ?? false
            return (
              <motion.button key={type} whileTap={{ scale: 0.82 }}
                onClick={e => { e.stopPropagation(); handleReact(vlog.id, type) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-base font-semibold transition-all"
                style={{
                  background: mine ? 'rgba(123,97,255,0.28)' : 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                  border: mine ? '1.5px solid rgba(123,97,255,0.55)' : '1.5px solid rgba(255,255,255,0.12)',
                }}>
                <span>{type}</span>
                {count > 0 && (
                  <span className="text-xs font-bold" style={{ color: mine ? '#A896FF' : 'rgba(255,255,255,0.7)' }}>
                    {count}
                  </span>
                )}
              </motion.button>
            )
          })}

          <motion.button whileTap={{ scale: 0.88 }}
            onClick={e => { e.stopPropagation(); setShowComments(true) }}
            className="ml-auto flex items-center gap-2 px-3 py-2 rounded-full"
            style={{
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(8px)',
              border: '1.5px solid rgba(255,255,255,0.12)',
            }}>
            <MessageSquare size={15} className="text-white/80" />
            {commentCount > 0 && (
              <span className="text-xs text-white/70 font-bold">{commentCount}</span>
            )}
          </motion.button>
        </div>

        {/* Reactors (only vlog owner sees) */}
        {isMe && Object.keys(vlogReactors).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {Object.entries(vlogReactors).map(([type, users]) => (
              <span key={type} className="text-xs text-white/50 bg-white/5 px-2.5 py-1 rounded-full backdrop-blur-sm">
                {type} {users.map(u => u.name).join(', ')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Delete confirm ── */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-end justify-center px-5 pb-10"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
            onClick={() => setConfirmDelete(false)}>
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 320 }}
              onClick={e => e.stopPropagation()}
              className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-3xl p-5">
              <p className="text-white font-bold text-base text-center mb-1">Vlog löschen?</p>
              <p className="text-[#8E8E93] text-sm text-center mb-5">Diese Aktion kann nicht rückgängig gemacht werden.</p>
              <div className="flex gap-3">
                <motion.button whileTap={{ scale: 0.96 }} onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-3.5 rounded-2xl bg-[#2C2C2E] text-white font-semibold text-sm">
                  Abbrechen
                </motion.button>
                <motion.button whileTap={{ scale: 0.96 }} onClick={handleDeleteVlog}
                  className="flex-1 py-3.5 rounded-2xl bg-red-500 text-white font-semibold text-sm">
                  Löschen
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Comments sheet ── */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-end"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowComments(false)}>
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 340 }}
              onClick={e => e.stopPropagation()}
              className="w-full rounded-t-3xl overflow-hidden"
              style={{
                background: '#161618',
                border: '1px solid rgba(255,255,255,0.08)',
                maxHeight: '72vh',
                display: 'flex',
                flexDirection: 'column',
              }}>
              {/* Sheet handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-[#3A3A3C]" />
              </div>

              <div className="flex items-center justify-between px-5 py-3 flex-shrink-0 border-b border-[#2C2C2E]">
                <p className="text-white font-bold text-base">
                  Kommentare {commentCount > 0 ? `· ${commentCount}` : ''}
                </p>
                <motion.button whileTap={{ scale: 0.88 }} onClick={() => setShowComments(false)}
                  className="w-7 h-7 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                  <X size={13} className="text-[#8E8E93]" />
                </motion.button>
              </div>

              {/* Comments list */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
                {vlogComments.map(c => {
                  const cu = { initials: (c.username ?? '?').slice(0, 2).toUpperCase(), color: '#7B61FF', avatar: c.avatar ?? null }
                  return (
                    <div key={c.id} className="flex items-start gap-3">
                      <UserAvatar user={cu} size={30} className="flex-shrink-0" />
                      <div className="flex-1 bg-[#1C1C1E] rounded-2xl rounded-tl-md px-3.5 py-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[#7B61FF] text-xs font-bold">{c.username}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[#3A3A3C]">
                              {new Date(c.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {c.user_id === user?.id && (
                              <motion.button whileTap={{ scale: 0.85 }} onClick={() => handleDeleteComment(c.id)}>
                                <X size={11} className="text-[#8E8E93]" />
                              </motion.button>
                            )}
                          </div>
                        </div>
                        <p className="text-white text-sm leading-relaxed">{c.text}</p>
                      </div>
                    </div>
                  )
                })}
                {vlogComments.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-3xl mb-2">💬</p>
                    <p className="text-[#3A3A3C] text-sm">Noch keine Kommentare</p>
                    <p className="text-[#3A3A3C] text-xs mt-0.5">Sei der Erste!</p>
                  </div>
                )}
              </div>

              {/* Comment input */}
              <div className="px-4 py-3 flex-shrink-0 border-t border-[#2C2C2E]"
                style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-2.5 focus-within:border-[#7B61FF] transition-colors">
                    <input
                      ref={commentRef}
                      value={commentText}
                      onChange={e => setCommentText(e.target.value.slice(0, 500))}
                      onKeyDown={e => e.key === 'Enter' && handleSendComment()}
                      placeholder="Kommentar schreiben…"
                      className="w-full bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none"
                    />
                  </div>
                  <motion.button whileTap={{ scale: 0.85 }} onClick={handleSendComment}
                    disabled={!commentText.trim() || sending}
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
                    <Send size={15} className="text-white" style={{ transform: 'translateX(1px)' }} />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Story Ring Avatar ─────────────────────────────────────────────────────────
// Instagram-style story ring: gradient = uploaded today, purple = heute dran, gray = none
function StoryRingAvatar({ member, isToday, hasUploadedToday, isOnline, size = 60, onClick }) {
  const ringSize = size + 8

  const ringStyle = hasUploadedToday
    ? { background: 'linear-gradient(135deg, #2ECC71 0%, #00D9FF 100%)' }
    : isToday
      ? { background: 'linear-gradient(135deg, #7B61FF 0%, #00D9FF 100%)' }
      : { background: '#2C2C2E' }

  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      className="flex-shrink-0 flex flex-col items-center gap-2">
      <div className="relative" style={{ width: ringSize, height: ringSize }}>
        {/* Ring */}
        <div className="absolute inset-0 rounded-full p-[3px]" style={ringStyle}>
          <div className="w-full h-full rounded-full bg-[#0A0A0B]" />
        </div>
        {/* Pulse for heute dran */}
        {isToday && !hasUploadedToday && (
          <motion.div
            className="absolute inset-0 rounded-full"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background: 'linear-gradient(135deg, #7B61FF60, #00D9FF40)' }}
          />
        )}
        {/* Avatar */}
        <div className="absolute inset-[3px] rounded-full overflow-hidden">
          <UserAvatar user={member} size={size} />
        </div>
        {/* Status badge */}
        {isToday ? (
          <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#7B61FF] border-2 border-[#0A0A0B] flex items-center justify-center z-10">
            <Video size={9} className="text-white" />
          </div>
        ) : isOnline ? (
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#2ECC71] border-2 border-[#0A0A0B] z-10" />
        ) : null}
      </div>
      <span className="text-[11px] text-[#8E8E93] max-w-[64px] truncate text-center leading-tight">
        {member.name}
      </span>
      {isToday && (
        <span className="text-[10px] text-[#7B61FF] font-bold -mt-1">Heute</span>
      )}
    </motion.button>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ countdown, onReveal, onShowQR, onShowNotifications, onGoToGroup, onGoToRecord }) {
  const { user } = useAuth()
  const { groups, getUser, myVlogs, myStreak, requests, notifications, presences, loadMoreVlogs,
          feedVlogs, yesterdayClips, setYesterdayClips } = useApp()
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore,     setHasMore]     = useState(true)

  const handleLoadMore = async () => {
    setLoadingMore(true)
    const added = await loadMoreVlogs()
    setHasMore(added >= 10)
    setLoadingMore(false)
  }
  const [selGroupId,   setSelGroupId]   = useState(null)
  const [groupFeed,    setGroupFeed]    = useState(null)
  const [feedLoading,  setFeedLoading]  = useState(false)

  const username = user?.username ?? user?.email?.split('@')[0] ?? '?'

  useEffect(() => {
    if (!groups.length) { setSelGroupId(null); return }
    if (selGroupId && !groups.find(g => g.id === selGroupId)) setSelGroupId(null)
  }, [groups, selGroupId])

  const activeGroup   = (selGroupId ? groups.find(g => g.id === selGroupId) : null) ?? groups[0] ?? null
  const todayUserId   = activeGroup ? activeGroup.rotation[activeGroup.todayIdx % Math.max(activeGroup.rotation.length, 1)] : null
  const todayUser     = todayUserId ? getUser(todayUserId) : null
  const timerStr      = `${pad(countdown.h)}:${pad(countdown.m)}:${pad(countdown.s)}`
  const today         = todayUTC()
  const todayPersonVlog = groupFeed?.find(v =>
    v.ownerId === todayUserId && new Date(v.createdAt ?? 0).toISOString().slice(0, 10) === today
  ) ?? null

  const todayVlogs      = myVlogs.filter(v => new Date(v.createdAt).toISOString().slice(0, 10) === today)
  const todayDuration   = todayVlogs.reduce((s, v) => s + (v.duration ?? 0), 0)
  const todayProgress   = Math.min((todayDuration / 60) * 100, 100)
  const todayRemaining  = Math.max(60 - todayDuration, 0)
  const hasUploadedToday = todayVlogs.length > 0

  const unreadCount   = requests.length + notifications.filter(n => !n.read).length
  const meFormatted   = { avatar: avatarUrl(user?.avatar), initials: username.slice(0, 2).toUpperCase(), color: '#7B61FF' }
  const greeting      = timeGreeting()

  // Konfetti: einmalig auslösen wenn Tagesziel zuerst erreicht wird
  const [confetti,    setConfetti]    = useState(false)
  const [celebrated,  setCelebrated]  = useState(false)
  useEffect(() => {
    if (todayProgress >= 100 && !celebrated) {
      setCelebrated(true)
      setConfetti(true)
      setTimeout(() => setConfetti(false), 5500)
    }
  }, [todayProgress, celebrated])

  const isOnline = id => {
    const t = presences[id]
    return t && Date.now() - t < 3 * 60 * 1000
  }

  useEffect(() => {
    if (!activeGroup) { setGroupFeed(null); return }
    setFeedLoading(true)
    api.groups.feed(activeGroup.id, 20).then(d => {
      setGroupFeed(d.vlogs ?? [])
      setFeedLoading(false)
    }).catch(() => { setGroupFeed([]); setFeedLoading(false) })
  }, [activeGroup?.id])

  // Build a set of members who uploaded today (for story rings)
  const todayUploaders = new Set(
    (groupFeed ?? [])
      .filter(v => new Date(v.createdAt ?? 0).toISOString().slice(0, 10) === today)
      .map(v => v.ownerId)
  )

  return (
    <motion.div key="dashboard" {...page} className="pb-32">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-14 pb-3">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-[26px] font-bold tracking-tight text-white">daylo</span>
            <span className="text-[26px] font-bold text-[#7B61FF]">.</span>
          </div>
          <p className="text-[#8E8E93] text-xs mt-0.5">
            {greeting.emoji} {greeting.text}, {username.split(' ')[0]}!
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {myStreak > 0 && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                const text = `🔥 ${myStreak} Tage Streak bei daylo! Nehme ich täglich meine 60 Sekunden auf.`
                if (navigator.share) navigator.share({ title: 'daylo Streak', text })
                else navigator.clipboard?.writeText(text).catch(() => {})
              }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 12, stiffness: 260, delay: 0.15 }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
              style={{
                background:  'rgba(255,159,67,0.15)',
                border:      '1px solid rgba(255,159,67,0.35)',
                boxShadow:   '0 0 12px rgba(255,159,67,0.2)',
              }}>
              <motion.span
                animate={{ rotate: [0, -12, 12, -8, 8, 0] }}
                transition={{ duration: 0.8, delay: 0.5 }}>
                <Flame size={13} className="text-[#FF9F43]" />
              </motion.span>
              <AnimatedNumber value={myStreak} duration={0.6}
                className="text-[#FF9F43] text-xs font-black tabular-nums" />
            </motion.button>
          )}
          <motion.button whileTap={{ scale: 0.88 }} onClick={onShowQR}
            className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center">
            <QrCode size={16} className="text-[#8E8E93]" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.88 }} onClick={onShowNotifications}
            className="relative w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center">
            <Bell size={17} className="text-[#8E8E93]" />
            {unreadCount > 0 && (
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 w-[18px] h-[18px] rounded-full bg-[#7B61FF] flex items-center justify-center shadow-lg">
                <span className="text-[8px] text-white font-bold">{Math.min(unreadCount, 9)}</span>
              </motion.div>
            )}
          </motion.button>
          <motion.button whileTap={{ scale: 0.88 }} onClick={() => onReveal(user?.id)}>
            <UserAvatar user={meFormatted} size={36} />
          </motion.button>
        </div>
      </div>

      {/* ── Group switcher ── */}
      {groups.length > 1 && (
        <div className="flex gap-2 px-5 overflow-x-auto no-scrollbar mb-4 pb-0.5">
          {groups.map(g => (
            <motion.button key={g.id} whileTap={{ scale: 0.92 }}
              onClick={() => setSelGroupId(g.id === activeGroup?.id ? null : g.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-all ${
                activeGroup?.id === g.id
                  ? 'bg-[#7B61FF] text-white'
                  : 'bg-[#1C1C1E] text-[#8E8E93] border border-[#2C2C2E]'
              }`}>
              <span>{g.emoji}</span>
              <span>{g.name}</span>
              {(g.unreadCount ?? 0) > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#FF453A] text-white text-[9px] font-bold flex items-center justify-center">
                  {Math.min(g.unreadCount, 9)}
                </span>
              )}
            </motion.button>
          ))}
        </div>
      )}

      {/* ── HEUTE DRAN hero card ── */}
      <div className="px-5 mb-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.04 }}
          className="rounded-3xl overflow-hidden relative"
          style={{ minHeight: 140 }}>

          {/* Background gradient */}
          <div className="absolute inset-0"
            style={{
              background: todayUser
                ? `linear-gradient(135deg, ${todayUser.color ?? '#7B61FF'}22 0%, #141415 60%)`
                : 'linear-gradient(135deg, #7B61FF18 0%, #141415 70%)',
              border: '1px solid rgba(255,255,255,0.06)',
            }} />
          {/* Glow orb */}
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full blur-3xl pointer-events-none"
            style={{ background: (todayUser?.color ?? '#7B61FF') + '20' }} />

          <div className="relative p-5">
            <div className="flex items-center gap-1.5 mb-4">
              <Zap size={12} className="text-[#7B61FF]" />
              <span className="text-[11px] font-bold text-[#7B61FF] uppercase tracking-widest">Heute dran</span>
              {activeGroup && (
                <span className="text-[11px] text-[#3A3A3C] ml-auto">
                  {activeGroup.emoji} {activeGroup.name}
                </span>
              )}
            </div>

            {todayUser ? (
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <div className="absolute -inset-2 rounded-2xl"
                    style={{
                      background: todayPersonVlog
                        ? 'linear-gradient(135deg, #2ECC71, #00D9FF)'
                        : `linear-gradient(135deg, ${todayUser.color ?? '#7B61FF'}, #00D9FF)`,
                      opacity: 0.3,
                      filter: 'blur(8px)',
                    }} />
                  {todayPersonVlog?.thumbnail ? (
                    <div className="w-16 h-20 rounded-2xl overflow-hidden relative z-10"
                      style={{ border: '2px solid #2ECC71' }}>
                      <img src={todayPersonVlog.thumbnail} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="relative z-10">
                      <UserAvatar user={todayUser} size={64} />
                    </div>
                  )}
                  <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-[#141415] z-20 flex items-center justify-center ${todayPersonVlog ? 'bg-[#2ECC71]' : 'bg-[#FF9F43]'}`}>
                    {todayPersonVlog
                      ? <Check size={10} className="text-white" strokeWidth={3} />
                      : <Clock size={10} className="text-white" />
                    }
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="text-white text-xl font-bold leading-tight">{todayUser.name}</h2>
                  {todayPersonVlog ? (
                    <p className="text-[#2ECC71] text-sm mt-0.5 font-medium flex items-center gap-1.5">
                      <Check size={13} strokeWidth={2.5} /> Heute aufgenommen
                    </p>
                  ) : (
                    <p className="text-[#8E8E93] text-sm mt-0.5">Noch nicht aufgenommen</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2.5">
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/20">
                      <Clock size={10} className="text-[#8E8E93]" />
                      <span className="text-[11px] text-[#8E8E93] font-mono">{timerStr}</span>
                    </div>
                    <span className="text-[11px] text-[#3A3A3C]">verbleibend</span>
                  </div>
                </div>

                <motion.button whileTap={{ scale: 0.88 }}
                  onClick={() => todayPersonVlog
                    ? onReveal(todayUserId, todayPersonVlog.id)
                    : onReveal(todayUserId)
                  }
                  className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: todayPersonVlog
                      ? 'linear-gradient(135deg, #2ECC71, #00D9FF)'
                      : 'linear-gradient(135deg, #7B61FF, #00D9FF)',
                    boxShadow: `0 0 20px ${todayPersonVlog ? '#2ECC7155' : '#7B61FF55'}`,
                  }}>
                  <Play size={16} className="text-white ml-0.5" fill="white" />
                </motion.button>
              </div>
            ) : (
              <motion.button whileTap={{ scale: 0.97 }} onClick={onGoToGroup}
                className="w-full flex flex-col items-center py-5 gap-3">
                <div className="w-14 h-14 rounded-full bg-[#7B61FF]/10 border border-dashed border-[#7B61FF]/40 flex items-center justify-center">
                  <Users size={22} className="text-[#7B61FF]/60" />
                </div>
                <div className="text-center">
                  <p className="text-white font-semibold text-sm">Noch keine Gruppe</p>
                  <p className="text-[#8E8E93] text-xs mt-0.5">Erstelle eine Gruppe um loszulegen</p>
                </div>
                <div className="flex items-center gap-1.5 bg-[#7B61FF]/15 border border-[#7B61FF]/30 px-4 py-2 rounded-full">
                  <Plus size={13} className="text-[#7B61FF]" />
                  <span className="text-[#7B61FF] text-sm font-semibold">Gruppe erstellen</span>
                </div>
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Konfetti ── */}
      <GoalConfetti active={confetti} />

      {/* ── My progress / Goal celebration ── */}
      {activeGroup && (
        <div className="px-5 mb-4">
          <AnimatePresence mode="wait">
            {todayProgress >= 100 ? (
              /* ── Feier-Karte ── */
              <motion.div key="celebration"
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1,    opacity: 1 }}
                exit={{    scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', damping: 18, stiffness: 260 }}
                className="rounded-3xl p-5 relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(46,204,113,0.18) 0%, rgba(0,217,255,0.12) 100%)',
                  border:     '1px solid rgba(46,204,113,0.3)',
                }}>
                {/* Ambient glow */}
                <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full blur-3xl pointer-events-none"
                  style={{ background: 'rgba(46,204,113,0.25)' }} />

                <div className="relative flex items-center gap-4">
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', damping: 11, stiffness: 220, delay: 0.1 }}
                    className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background:  'linear-gradient(135deg, #2ECC71, #00D9FF)',
                      boxShadow:   '0 0 32px rgba(46,204,113,0.5)',
                    }}>
                    <Trophy size={28} className="text-white" />
                  </motion.div>

                  <div className="flex-1">
                    <p className="text-white font-black text-lg leading-tight">Tagesziel erreicht! 🎉</p>
                    <p className="text-[#2ECC71] text-sm font-bold mt-0.5">60 Sekunden aufgenommen</p>
                    {myStreak > 0 && (
                      <motion.p
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-[#FF9F43] text-xs font-semibold mt-1 flex items-center gap-1">
                        <Flame size={12} /> {myStreak} Tage Streak — weiter so!
                      </motion.p>
                    )}
                  </div>
                </div>

                {/* Completed bar */}
                <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(46,204,113,0.15)' }}>
                  <motion.div className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #2ECC71, #00D9FF)' }}
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }} />
                </div>
              </motion.div>
            ) : (
              /* ── Normal progress card ── */
              <motion.div key="progress"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="rounded-3xl p-5"
                style={{ background: 'linear-gradient(135deg, #141415 0%, #0F0F12 100%)', border: '1px solid rgba(255,255,255,0.05)' }}>

                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-black text-white">Mein Fortschritt</span>
                  {hasUploadedToday && (
                    <span className="text-[11px] text-[#2ECC71] font-bold bg-[#2ECC71]/10 px-2.5 py-1 rounded-full border border-[#2ECC71]/20">
                      Heute ✓
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-5">
                  <div className="relative flex-shrink-0" style={{ width: 100, height: 100 }}>
                    <ProgressRing progress={todayProgress} size={100} strokeWidth={6} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <AnimatedNumber value={Math.round(todayDuration)}
                        className="text-[22px] font-black text-white leading-none" />
                      <span className="text-[11px] text-[#8E8E93]">/ 60s</span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3">
                    {[
                      { label: 'Aufgenommen', val: `${Math.round(todayDuration)}s`,  color: '#fff'    },
                      { label: 'Verbleibend', val: `${Math.round(todayRemaining)}s`, color: '#7B61FF' },
                      { label: 'Reset um',    val: '00:00 Uhr',                      color: '#00D9FF' },
                    ].map(r => (
                      <div key={r.label} className="flex items-center justify-between">
                        <span className="text-xs text-[#8E8E93]">{r.label}</span>
                        <span className="text-sm font-bold" style={{ color: r.color }}>{r.val}</span>
                      </div>
                    ))}
                    <div className="h-px bg-[#2C2C2E]" />
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={11} className="text-[#FF9F43]" />
                      <span className="text-xs text-[#FF9F43] font-semibold">KI-Schnitt aktiv</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(44,44,46,0.8)' }}>
                  <motion.div className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #7B61FF, #00D9FF)' }}
                    animate={{ width: `${todayProgress}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Story rings for members ── */}
      <div className="mb-4">
        <div className="flex items-center justify-between px-5 mb-3">
          <span className="text-sm font-bold text-white">Mitglieder</span>
          {activeGroup && (
            <motion.button whileTap={{ scale: 0.92 }} onClick={onGoToGroup}
              className="text-xs text-[#7B61FF] font-semibold">
              Gruppe öffnen →
            </motion.button>
          )}
        </div>

        {activeGroup ? (
          <div className="flex gap-4 px-5 overflow-x-auto no-scrollbar pb-1">
            {activeGroup.memberIds.map((uid, i) => {
              const m = getUser(uid)
              if (!m) return null
              return (
                <motion.div key={uid}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.06 + i * 0.05 }}>
                  <StoryRingAvatar
                    member={m}
                    isToday={uid === todayUserId}
                    hasUploadedToday={todayUploaders.has(uid)}
                    isOnline={isOnline(uid)}
                    size={52}
                    onClick={() => onReveal(uid)}
                  />
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className="mx-5 rounded-2xl bg-[#141415] border border-dashed border-[#2C2C2E] p-5 flex flex-col items-center gap-2">
            <span className="text-2xl">👥</span>
            <p className="text-[#8E8E93] text-sm text-center">Füge Freunde hinzu und erstelle eine Gruppe</p>
          </div>
        )}
      </div>

      {/* ── Group feed ── */}
      {activeGroup && (
        <div className="mb-4">
          <div className="flex items-center justify-between px-5 mb-3">
            <span className="text-sm font-bold text-white">Gruppen Vlogs</span>
            <span className="text-xs text-[#3A3A3C]">{activeGroup.emoji} {activeGroup.name}</span>
          </div>

          {feedLoading ? (
            <div className="flex gap-3 px-5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1.5">
                  <div className="w-[72px] h-[96px] rounded-2xl bg-[#1C1C1E] animate-pulse" />
                  <div className="w-12 h-2 rounded bg-[#1C1C1E] animate-pulse" />
                </div>
              ))}
            </div>
          ) : groupFeed && groupFeed.length > 0 ? (
            <div className="flex gap-3 px-5 overflow-x-auto no-scrollbar pb-1">
              {groupFeed.map((v, i) => {
                const owner = getUser(v.ownerId)
                const uploadedToday = new Date(v.createdAt ?? 0).toISOString().slice(0, 10) === today
                return (
                  <motion.button key={v.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => onReveal(v.ownerId, v.id)}
                    className="flex-shrink-0 flex flex-col items-center gap-1.5">
                    <div className="relative">
                      {/* Story ring on feed thumbnails */}
                      <div className="absolute -inset-0.5 rounded-2xl"
                        style={{
                          background: uploadedToday
                            ? 'linear-gradient(135deg, #2ECC71, #00D9FF)'
                            : 'transparent',
                          padding: uploadedToday ? 2 : 0,
                        }}>
                        <div className="w-full h-full rounded-xl bg-[#0A0A0B]" />
                      </div>
                      <div className="relative w-[72px] h-[96px] rounded-2xl overflow-hidden z-10"
                        style={{ background: '#7B61FF15', border: '1.5px solid rgba(255,255,255,0.06)' }}>
                        {v.thumbnail
                          ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-3xl">{v.emoji}</div>
                        }
                        {v.status === 'processing' && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          </div>
                        )}
                        <div className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                          <Play size={10} className="text-white ml-0.5" fill="white" />
                        </div>
                        {uploadedToday && (
                          <div className="absolute top-1.5 left-1.5 bg-[#2ECC71] rounded-full px-1.5 py-0.5">
                            <span className="text-[8px] text-white font-bold">NEU</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {owner && <UserAvatar user={owner} size={14} />}
                      <span className="text-[11px] text-[#8E8E93] max-w-[68px] truncate">{v.ownerName ?? owner?.name ?? '?'}</span>
                    </div>
                    <span className="text-[10px] text-[#3A3A3C]">{v.date}</span>
                  </motion.button>
                )
              })}
            </div>
          ) : groupFeed !== null ? (
            <div className="mx-5 rounded-2xl bg-[#141415] border border-dashed border-[#2C2C2E] p-6 flex flex-col items-center gap-2">
              <span className="text-3xl">🎬</span>
              <p className="text-[#8E8E93] text-sm text-center">Noch keine Vlogs in der Gruppe</p>
              <motion.button whileTap={{ scale: 0.96 }} onClick={onGoToRecord}
                className="mt-1 flex items-center gap-1.5 bg-[#7B61FF]/15 border border-[#7B61FF]/30 px-4 py-2 rounded-full">
                <Camera size={12} className="text-[#7B61FF]" />
                <span className="text-[#7B61FF] text-xs font-semibold">Jetzt aufnehmen</span>
              </motion.button>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Gestern nicht gepostet — Banner ── */}
      <AnimatePresence>
        {yesterdayClips.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-5 mb-4 rounded-2xl p-4 flex items-center gap-3"
            style={{ background: 'rgba(255,159,67,0.12)', border: '1px solid rgba(255,159,67,0.3)' }}>
            <span className="text-2xl flex-shrink-0">📼</span>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">Gestrige Clips nicht hochgeladen</p>
              <p className="text-[#8E8E93] text-xs mt-0.5">{yesterdayClips.length} Clip{yesterdayClips.length > 1 ? 's' : ''} von gestern</p>
            </div>
            <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.92 }} onClick={onGoToRecord}
                className="px-3 py-1.5 rounded-full text-xs font-bold text-white"
                style={{ background: 'rgba(255,159,67,0.8)' }}>
                Posten
              </motion.button>
              <motion.button whileTap={{ scale: 0.92 }}
                onClick={() => { deleteClips(yesterdayClips.map(c => c.idbId)).catch(() => {}); setYesterdayClips([]) }}
                className="px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#8E8E93' }}>
                Löschen
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sozialer Feed ── */}
      {feedVlogs.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between px-5 mb-3">
            <span className="text-sm font-bold text-white">Was heute passiert</span>
            <span className="text-xs text-[#3A3A3C]">{feedVlogs.length} Vlogs</span>
          </div>
          <div className="flex gap-3 px-5 overflow-x-auto no-scrollbar pb-1">
            {feedVlogs.map((v, i) => {
              const owner = { id: v.ownerId, name: v.ownerName, avatar: v.ownerAvatar }
              const uploadedToday = new Date(v.createdAt ?? 0).toISOString().slice(0, 10) === today
              return (
                <motion.button key={v.id}
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => onReveal(v.ownerId, v.id)}
                  className="flex-shrink-0 flex flex-col items-center gap-1.5">
                  <div className="relative">
                    <div className="absolute -inset-0.5 rounded-2xl"
                      style={{ background: uploadedToday ? 'linear-gradient(135deg, #2ECC71, #00D9FF)' : 'transparent', padding: uploadedToday ? 2 : 0 }}>
                      <div className="w-full h-full rounded-xl bg-[#0A0A0B]" />
                    </div>
                    <div className="relative w-[72px] h-[96px] rounded-2xl overflow-hidden z-10"
                      style={{ background: '#7B61FF15', border: '1.5px solid rgba(255,255,255,0.06)' }}>
                      {v.thumbnail
                        ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-3xl">{v.emoji}</div>}
                      <div className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center">
                        <Play size={10} className="text-white ml-0.5" fill="white" />
                      </div>
                      {uploadedToday && (
                        <div className="absolute top-1.5 left-1.5 bg-[#2ECC71] rounded-full px-1.5 py-0.5">
                          <span className="text-[8px] text-white font-bold">NEU</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <UserAvatar user={owner} size={14} />
                    <span className="text-[11px] text-[#8E8E93] max-w-[68px] truncate">{v.ownerName}</span>
                  </div>
                  <span className="text-[10px] text-[#3A3A3C]">{v.date}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Meine Vlogs ── */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-white">
            Meine Vlogs{myVlogs.length > 0 ? ` · ${myVlogs.length}` : ''}
          </span>
        </div>

        {myVlogs.length > 0 ? (
          <div className="space-y-2.5">
            <AnimatePresence>
              {myVlogs.map((v, i) => (
                <motion.div key={v.id}
                  layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ delay: i * 0.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onReveal(null, v.id)}
                  className="flex items-center gap-3 rounded-2xl p-3 cursor-pointer transition-colors active:bg-[#1C1C1E]"
                  style={{
                    background: 'rgba(20,20,21,0.9)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                  <div className="w-12 h-14 rounded-xl overflow-hidden flex-shrink-0 relative"
                    style={{ background: '#7B61FF15' }}>
                    {v.thumbnail
                      ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-xl">{v.emoji}</div>
                    }
                    {new Date(v.createdAt).toISOString().slice(0, 10) === today && (
                      <div className="absolute inset-x-0 bottom-0 h-0.5"
                        style={{ background: 'linear-gradient(90deg, #7B61FF, #00D9FF)' }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{v.title ?? 'Mein Tag'}</p>
                    <p className="text-xs text-[#8E8E93] mt-0.5">{v.date} · {v.clipCount} Clips · {Math.round(v.duration)}s</p>
                    {v.reactions?.some(r => r.count > 0) && (
                      <p className="text-xs text-[#8E8E93] mt-0.5">
                        {v.reactions.filter(r => r.count > 0).map(r => `${r.type} ${r.count}`).join('  ')}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {v.status === 'processing'
                      ? <div className="w-8 h-8 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" />
                      : <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                          style={{ background: 'linear-gradient(135deg, #7B61FF22, #00D9FF22)', border: '1px solid rgba(123,97,255,0.2)' }}>
                          <Play size={14} className="text-[#7B61FF] ml-0.5" fill="#7B61FF" />
                        </div>
                    }
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {hasMore && (
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full py-3 rounded-2xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'rgba(123,97,255,0.1)', border: '1px solid rgba(123,97,255,0.2)', color: '#7B61FF' }}>
                {loadingMore
                  ? <><div className="w-4 h-4 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" /> Laden…</>
                  : '↓ Ältere Vlogs laden'}
              </motion.button>
            )}
          </div>
        ) : (
          <motion.button whileTap={{ scale: 0.97 }} onClick={onGoToRecord}
            className="w-full rounded-3xl p-8 flex flex-col items-center gap-4"
            style={{
              background: 'linear-gradient(135deg, #141415 0%, #0F0F12 100%)',
              border: '1.5px dashed rgba(123,97,255,0.3)',
            }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7B61FF22, #00D9FF22)', border: '1.5px dashed rgba(123,97,255,0.4)' }}>
              <Camera size={24} className="text-[#7B61FF]/70" />
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-sm">Noch keine Vlogs</p>
              <p className="text-[#8E8E93] text-xs mt-1">Nimm deinen ersten Tag auf!</p>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full"
              style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 20px rgba(123,97,255,0.4)' }}>
              <Camera size={14} className="text-white" />
              <span className="text-white text-sm font-bold">Jetzt aufnehmen</span>
            </div>
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

// ── Reveal View ───────────────────────────────────────────────────────────────
function RevealView({ onBack, targetUserId, initialVlogId }) {
  const { user } = useAuth()
  const { myVlogs, getUser } = useApp()
  const [vlogs, setVlogs] = useState(null)

  const isMe = !targetUserId || targetUserId === user?.id
  const targetUser = targetUserId && !isMe ? getUser(targetUserId) : null

  useEffect(() => {
    if (isMe) setVlogs(myVlogs)
    else api.vlogs.userList(targetUserId).then(d => setVlogs(d.vlogs ?? [])).catch(() => setVlogs([]))
  }, [isMe, targetUserId, myVlogs])

  if (vlogs === null) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" />
          <p className="text-[#8E8E93] text-sm">Wird geladen…</p>
        </div>
      </div>
    )
  }

  if (vlogs.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-5">
        <span className="text-6xl">🎬</span>
        <div className="text-center">
          <p className="text-white font-bold text-lg">Noch keine Vlogs</p>
          <p className="text-[#8E8E93] text-sm mt-1">
            {isMe ? 'Nimm heute deinen Tag auf!' : `${targetUser?.name ?? '...'} hat noch nichts aufgenommen.`}
          </p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={onBack}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#1C1C1E]">
          <ChevronLeft size={16} className="text-white" />
          <span className="text-white font-semibold">Zurück</span>
        </motion.button>
      </div>
    )
  }

  return (
    <StoryPlayer
      vlogs={vlogs}
      initialVlogId={initialVlogId}
      isMe={isMe}
      targetUser={targetUser}
      onBack={onBack}
      onVlogDeleted={onBack}
    />
  )
}

// ── Onboarding ────────────────────────────────────────────────────────────────
function OnboardingModal({ onDone }) {
  const steps = [
    { emoji: '🎬', title: 'Willkommen bei daylo!', body: 'Nimm täglich mindestens 60 Sekunden deines Tages auf — kurze Clips, ehrliche Momente.' },
    { emoji: '👥', title: 'Gruppen & Rotation', body: 'Erstelle eine Gruppe mit Freunden. Jeden Tag ist eine andere Person dran — alle sehen den Vlog.' },
    { emoji: '🔥', title: 'Streaks & Ziele', body: 'Täglich aufnehmen baut deinen Streak auf. Je länger der Streak, desto mehr Erinnerungen sammelst du.' },
  ]
  const [idx, setIdx] = useState(0)
  const step = steps[idx]
  const isLast = idx === steps.length - 1

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-8"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)' }}>
      <motion.div
        key={idx}
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        className="w-full max-w-[360px] rounded-3xl p-7 text-center"
        style={{ background: '#141415', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="text-6xl mb-5">{step.emoji}</div>
        <h2 className="text-white font-black text-xl mb-2">{step.title}</h2>
        <p className="text-[#8E8E93] text-sm leading-relaxed mb-8">{step.body}</p>
        <div className="flex justify-center gap-1.5 mb-6">
          {steps.map((_, i) => (
            <div key={i} className="h-1.5 rounded-full transition-all"
              style={{ width: i === idx ? 24 : 8, background: i === idx ? '#7B61FF' : '#2C2C2E' }} />
          ))}
        </div>
        <motion.button whileTap={{ scale: 0.97 }}
          onClick={() => isLast ? onDone() : setIdx(p => p + 1)}
          className="w-full py-4 rounded-2xl font-black text-white text-base"
          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 24px rgba(123,97,255,0.4)' }}>
          {isLast ? 'Loslegen 🚀' : 'Weiter'}
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view,              setView]              = useState('dashboard')
  const [activeTab,         setActiveTab]         = useState('home')
  const [showQR,            setShowQR]            = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [revealTarget,      setRevealTarget]      = useState(null)
  const [revealInitialVlog, setRevealInitialVlog] = useState(null)
  const [messageFriend,     setMessageFriend]     = useState(null)
  const [showOnboarding,    setShowOnboarding]    = useState(
    () => !localStorage.getItem('daylo_onboarding_done')
  )

  const [totalSecs, setTotalSecs] = useState(secsUntilMidnight)
  const countdown = secsToHMS(totalSecs)
  useEffect(() => {
    const t = setInterval(() => setTotalSecs(secsUntilMidnight()), 1000)
    return () => clearInterval(t)
  }, [])

  const { addVlog } = useApp()

  const navigate   = (tab, v) => { setActiveTab(tab); setView(v) }
  const showNav    = view !== 'record' && view !== 'reveal'
  const openReveal = (userId = null, vlogId = null) => {
    setRevealTarget(userId)
    setRevealInitialVlog(vlogId)
    setView('reveal')
  }
  const closeReveal = () => {
    setView('dashboard')
    setRevealTarget(null)
    setRevealInitialVlog(null)
  }

  return (
    <div className="min-h-screen flex justify-center items-start" style={{ background: '#060608' }}>
      {/* Desktop ambient glow */}
      <div className="hidden md:block fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 25% 40%, rgba(123,97,255,0.1) 0%, transparent 55%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 75% 60%, rgba(0,217,255,0.06) 0%, transparent 50%)' }} />
      </div>

      <div className="relative w-full max-w-[390px] md:mt-8 md:mb-8 md:rounded-[44px] md:border md:border-[#1C1C1E] md:shadow-[0_32px_80px_rgba(0,0,0,0.9)] min-h-screen md:min-h-0 bg-[#0A0A0B] overflow-hidden">

        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <Dashboard key="dashboard"
              countdown={countdown}
              onReveal={openReveal}
              onShowQR={() => setShowQR(true)}
              onShowNotifications={() => setShowNotifications(true)}
              onGoToGroup={() => navigate('group', 'group')}
              onGoToRecord={() => navigate('record', 'record')} />
          )}
          {view === 'record' && (
            <RecordView key="record"
              onBack={() => navigate('home', 'dashboard')}
              onDone={vlog => { addVlog(vlog); navigate('home', 'dashboard') }} />
          )}
          {view === 'messages' && (
            <MessagesView key={`messages-${messageFriend?.id ?? 'list'}`}
              onFindFriends={() => navigate('profile', 'profile')}
              initialFriend={messageFriend} />
          )}
          {view === 'group' && (
            <GroupView key="group" onReveal={openReveal} />
          )}
          {view === 'profile' && (
            <ProfileView key="profile" onReveal={openReveal}
              onOpenMessage={friend => { setMessageFriend(friend); navigate('messages', 'messages') }} />
          )}
        </AnimatePresence>

        {/* RevealView is rendered outside AnimatePresence to be fullscreen overlay */}
        {view === 'reveal' && (
          <RevealView
            key="reveal"
            onBack={closeReveal}
            targetUserId={revealTarget}
            initialVlogId={revealInitialVlog}
          />
        )}

        {showNav && <BottomNav activeTab={activeTab} onNavigate={navigate} />}

        <AnimatePresence>
          {showQR            && <QRModal             key="qr"    onClose={() => setShowQR(false)} />}
          {showNotifications && <NotificationsPanel  key="notif" onClose={() => setShowNotifications(false)} />}
          {showOnboarding    && <OnboardingModal     key="onb"   onDone={() => { localStorage.setItem('daylo_onboarding_done','1'); setShowOnboarding(false) }} />}
        </AnimatePresence>
      </div>
    </div>
  )
}
