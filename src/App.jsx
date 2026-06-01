// v4
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, Video, Users, Home, Play, User,
  Clock, Zap, Sparkles, Camera, QrCode, X, Plus,
  Check, CheckCircle, UserPlus, ChevronLeft,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

import ProgressRing   from './components/ProgressRing'
import RecordView     from './views/RecordView'
import GroupView      from './views/GroupView'
import ProfileView    from './views/ProfileView'
import { useApp }     from './context/AppContext'
import { useAuth }    from './context/AuthContext'
import { api }        from './lib/api'

// ── Helpers ────────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0')

function secsUntilMidnight() {
  const now = new Date()
  const mid = new Date(now); mid.setHours(24, 0, 0, 0)
  return Math.max(0, Math.floor((mid - now) / 1000))
}
function secsToHMS(s) {
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}

const page = {
  initial:    { opacity: 0, y: 22 },
  animate:    { opacity: 1, y: 0  },
  exit:       { opacity: 0, y: -16 },
  transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
}

// ── QR Modal ───────────────────────────────────────────────────────────────────
function QRModal({ onClose }) {
  const url = `${window.location.protocol}//${window.location.host}`
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#141415] border border-[#2C2C2E] rounded-3xl p-6 w-full max-w-[280px] flex flex-col items-center gap-4">
        <div className="flex items-center justify-between w-full">
          <p className="text-white font-bold text-lg">Auf Handy öffnen</p>
          <motion.button whileTap={{ scale: 0.85 }} onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center">
            <X size={14} className="text-[#8E8E93]" />
          </motion.button>
        </div>
        <div className="p-3 bg-white rounded-2xl">
          <QRCodeSVG value={url} size={180} bgColor="#ffffff" fgColor="#0A0A0B" level="M" />
        </div>
        <div className="text-center">
          <p className="text-[#8E8E93] text-xs">Selbes WLAN · Handy-Kamera scannen</p>
          <p className="text-[#7B61FF] text-xs font-mono mt-1 font-semibold">{url}</p>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Notifications Panel ────────────────────────────────────────────────────────
function NotificationsPanel({ onClose }) {
  const { requests, notifications, acceptRequest, declineRequest, markNotificationsRead } = useApp()

  useEffect(() => {
    markNotificationsRead()
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-center items-start pt-20 px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: -10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#141415] border border-[#2C2C2E] rounded-3xl p-5 w-full max-w-[370px] max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-bold text-base">Benachrichtigungen</p>
          <motion.button whileTap={{ scale: 0.85 }} onClick={onClose}
            className="w-7 h-7 rounded-full bg-[#2C2C2E] flex items-center justify-center">
            <X size={13} className="text-[#8E8E93]" />
          </motion.button>
        </div>

        {/* Pending friend requests */}
        {requests.map(u => (
          <div key={u.id}
            className="flex items-center gap-3 mb-3 bg-[#7B61FF]/10 border border-[#7B61FF]/20 rounded-2xl p-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${u.color}, ${u.color}88)` }}>
              {u.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{u.name}</p>
              <p className="text-[#8E8E93] text-xs">möchte dein Freund sein</p>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <motion.button whileTap={{ scale: 0.88 }} onClick={() => acceptRequest(u)}
                className="w-7 h-7 rounded-full bg-[#7B61FF] flex items-center justify-center">
                <Check size={12} className="text-white" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.88 }} onClick={() => declineRequest(u.id)}
                className="w-7 h-7 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                <X size={12} className="text-[#8E8E93]" />
              </motion.button>
            </div>
          </div>
        ))}

        {/* Server notifications */}
        {notifications.map(n => (
          <div key={n.id}
            className={`flex items-start gap-3 mb-3 rounded-2xl p-3 ${
              n.read ? 'bg-[#1C1C1E]' : 'bg-[#7B61FF]/10 border border-[#7B61FF]/20'
            }`}>
            <div className="w-9 h-9 rounded-full bg-[#7B61FF]/15 flex items-center justify-center flex-shrink-0">
              {n.type === 'friend_accepted'
                ? <CheckCircle size={16} className="text-[#2ECC71]" />
                : <UserPlus size={16} className="text-[#7B61FF]" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm leading-snug">{n.message}</p>
              <p className="text-[#8E8E93] text-xs mt-0.5">
                {new Date(n.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {requests.length === 0 && notifications.length === 0 && (
          <div className="text-center py-8">
            <p className="text-4xl mb-2">🔔</p>
            <p className="text-[#8E8E93] text-sm">Keine Benachrichtigungen</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Nav tabs ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'home',    icon: Home,   label: 'Home',      view: 'dashboard' },
  { id: 'record',  icon: Camera, label: 'Aufnehmen', view: 'record',   special: true },
  { id: 'group',   icon: Users,  label: 'Gruppe',    view: 'group'     },
  { id: 'profile', icon: User,   label: 'Profil',    view: 'profile'   },
]

function BottomNav({ activeTab, onNavigate }) {
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-[#0A0A0B]/90 backdrop-blur-xl border-t border-[#2C2C2E] px-6 pt-3 pb-8 z-50">
      <div className="flex items-end justify-around">
        {TABS.map(tab => (
          <motion.button key={tab.id} whileTap={{ scale: 0.82 }}
            onClick={() => onNavigate(tab.id, tab.view)}
            className="flex flex-col items-center gap-1">
            {tab.special ? (
              <div className="w-14 h-14 rounded-full flex items-center justify-center -mt-7 shadow-2xl"
                style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 28px rgba(123,97,255,0.45)' }}>
                <tab.icon size={22} className="text-white" />
              </div>
            ) : (
              <>
                <motion.div animate={{ color: activeTab === tab.id ? '#7B61FF' : '#3A3A3C' }}>
                  <tab.icon size={22} />
                </motion.div>
                <span className="text-[10px] transition-colors" style={{ color: activeTab === tab.id ? '#7B61FF' : '#3A3A3C' }}>
                  {tab.label}
                </span>
              </>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ countdown, onReveal, onShowQR, onShowNotifications, onGoToGroup, onGoToRecord }) {
  // onReveal(userId?) — null = my own vlogs, string = specific user's vlogs
  const { user } = useAuth()
  const { groups, getUser, myVlogs, requests, notifications } = useApp()

  const username = user?.username ?? user?.email?.split('@')[0] ?? '?'
  const initials = username.slice(0, 2).toUpperCase()

  const activeGroup = groups[0] ?? null
  const todayUserId = activeGroup ? activeGroup.rotation[activeGroup.todayIdx % activeGroup.rotation.length] : null
  const todayUser   = todayUserId ? getUser(todayUserId) : null

  const timerStr = `${pad(countdown.h)}:${pad(countdown.m)}:${pad(countdown.s)}`

  // Today's recorded time
  const todayStr      = new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const todayDuration = myVlogs.filter(v => v.date === todayStr).reduce((s, v) => s + v.duration, 0)
  const todayProgress = Math.min((todayDuration / 60) * 100, 100)
  const todayRemaining = Math.max(60 - todayDuration, 0)

  const unreadCount = requests.length + notifications.filter(n => !n.read).length

  return (
    <motion.div key="dashboard" {...page} className="pb-28">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-14 pb-5">
        <div className="flex items-baseline gap-0.5">
          <span className="text-[26px] font-bold tracking-tight text-white">daylo</span>
          <span className="text-[26px] font-bold text-[#7B61FF]">.</span>
        </div>
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.88 }} onClick={onShowQR}
            className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center">
            <QrCode size={17} className="text-[#8E8E93]" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.88 }} onClick={onShowNotifications}
            className="relative w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center">
            <Bell size={18} className="text-[#8E8E93]" />
            {unreadCount > 0 && (
              <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#7B61FF] flex items-center justify-center">
                <span className="text-[9px] text-white font-bold">{Math.min(unreadCount, 9)}</span>
              </div>
            )}
          </motion.button>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
            {initials}
          </div>
        </div>
      </div>

      {/* HEUTE DRAN */}
      <div className="px-5 mb-4">
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl bg-[#141415] border border-[#2C2C2E] p-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#7B61FF]/12 blur-3xl pointer-events-none" />

          <div className="flex items-center gap-1.5 mb-4">
            <Zap size={13} className="text-[#7B61FF]" />
            <span className="text-[11px] font-semibold text-[#7B61FF] uppercase tracking-widest">Heute dran</span>
          </div>

          {todayUser ? (
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0 w-16 h-16">
                <motion.div
                  animate={{ scale: [1, 1.18, 1], opacity: [0.3, 0.55, 0.3] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 rounded-full"
                  style={{ background: `radial-gradient(circle, ${todayUser.color}88 0%, transparent 70%)` }} />
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl relative z-10"
                  style={{ background: `linear-gradient(135deg, ${todayUser.color}, ${todayUser.color}88)` }}>
                  {todayUser.initials}
                </div>
                <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#2ECC71] border-2 border-[#141415] z-20" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-white text-xl font-bold leading-tight">{todayUser.name}</h2>
                <p className="text-[#8E8E93] text-sm mt-0.5">nimmt heute seinen Vlog auf</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Clock size={11} className="text-[#8E8E93]" />
                  <span className="text-xs text-[#8E8E93]">{timerStr} verbleibend</span>
                </div>
              </div>
              <motion.button whileTap={{ scale: 0.88 }} onClick={() => onReveal(todayUserId)}
                className="w-10 h-10 rounded-full bg-[#7B61FF]/20 flex items-center justify-center flex-shrink-0">
                <Play size={15} className="text-[#7B61FF] ml-0.5" fill="#7B61FF" />
              </motion.button>
            </div>
          ) : (
            <motion.button whileTap={{ scale: 0.97 }} onClick={onGoToGroup}
              className="w-full flex flex-col items-center py-4 gap-3">
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
        </motion.div>
      </div>

      {/* Progress ring — only if in a group */}
      {activeGroup && (
        <div className="px-5 mb-4">
          <div className="rounded-3xl bg-[#141415] border border-[#2C2C2E] p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-white">Mein Fortschritt</span>
              <span className="text-xs text-[#8E8E93] bg-[#1C1C1E] px-2.5 py-1 rounded-full">Heute</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="relative flex-shrink-0" style={{ width: 108, height: 108 }}>
                <ProgressRing progress={todayProgress} size={108} strokeWidth={7} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-white leading-none">{todayDuration}</span>
                  <span className="text-[11px] text-[#8E8E93]">/ 60s</span>
                </div>
              </div>
              <div className="flex-1 space-y-2.5">
                {[
                  { label: 'Aufgenommen', val: `${todayDuration}s`,   color: 'text-white'     },
                  { label: 'Verbleibend', val: `${todayRemaining}s`,  color: 'text-[#7B61FF]' },
                  { label: 'Reset um',    val: '00:00 Uhr',           color: 'text-[#00D9FF]' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-xs text-[#8E8E93]">{r.label}</span>
                    <span className={`text-sm font-semibold ${r.color}`}>{r.val}</span>
                  </div>
                ))}
                <div className="h-px bg-[#2C2C2E]" />
                <div className="flex items-center gap-1.5">
                  <Sparkles size={11} className="text-[#FF9F43]" />
                  <span className="text-xs text-[#FF9F43] font-medium">KI-Schnitt aktiv</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Group members */}
      <div className="mb-4">
        <div className="flex items-center justify-between px-5 mb-3">
          <span className="text-sm font-semibold text-white">Gruppe</span>
          {activeGroup && (
            <span className="text-xs text-[#8E8E93]">{activeGroup.name}</span>
          )}
        </div>

        {activeGroup ? (
          <div className="flex gap-4 px-5 overflow-x-auto no-scrollbar pb-1">
            {activeGroup.memberIds.map((uid, i) => {
              const m = getUser(uid)
              if (!m) return null
              const isToday = uid === todayUserId
              return (
                <motion.div key={uid}
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="flex-shrink-0 flex flex-col items-center gap-1.5">
                  <div className="relative">
                    {isToday && (
                      <motion.div
                        animate={{ opacity: [0.25, 0.7, 0.25] }}
                        transition={{ duration: 2.2, repeat: Infinity }}
                        className="absolute -inset-1 rounded-full"
                        style={{ background: `${m.color}50` }} />
                    )}
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm relative z-10"
                      style={{ background: `linear-gradient(135deg, ${m.color}, ${m.color}88)` }}>
                      {m.initials}
                    </div>
                    {isToday && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#2ECC71] border-2 border-[#0A0A0B] flex items-center justify-center z-20">
                        <Video size={7} className="text-white" />
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] text-[#8E8E93]">{m.name}</span>
                  {isToday && <span className="text-[10px] text-[#7B61FF] font-semibold -mt-0.5">Heute</span>}
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

      {/* Vergangene Vlogs */}
      <div className="px-5">
        <span className="text-sm font-semibold text-white block mb-3">Vergangene Vlogs</span>
        {myVlogs.length > 0 ? (
          <div className="space-y-3">
            {myVlogs.slice(0, 3).map(v => (
              <motion.div key={v.id}
                whileTap={{ scale: 0.97 }} onClick={() => onReveal(null)}
                className="flex items-center gap-3 bg-[#141415] border border-[#2C2C2E] rounded-2xl p-3.5 cursor-pointer">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ background: '#7B61FF15' }}>
                  {v.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Mein Tag</p>
                  <p className="text-xs text-[#8E8E93] mt-0.5">{v.date} · {v.clips} Clips · {v.duration}s</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-[#7B61FF]/20 flex items-center justify-center flex-shrink-0">
                  <Play size={13} className="text-[#7B61FF] ml-0.5" fill="#7B61FF" />
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.button whileTap={{ scale: 0.97 }} onClick={onGoToRecord}
            className="w-full rounded-3xl bg-[#141415] border border-dashed border-[#2C2C2E] p-8 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[#7B61FF]/10 border border-dashed border-[#7B61FF]/30 flex items-center justify-center">
              <Camera size={22} className="text-[#7B61FF]/60" />
            </div>
            <div className="text-center">
              <p className="text-white font-semibold text-sm">Noch keine Vlogs</p>
              <p className="text-[#8E8E93] text-xs mt-1">Nimm deinen ersten Tag auf!</p>
            </div>
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

const REACTION_TYPES = ['👍', '❤️', '😂']

// ── Reveal View ───────────────────────────────────────────────────────────────
function RevealView({ onBack, targetUserId }) {
  const { user }    = useAuth()
  const { myVlogs } = useApp()
  const [vlogs,     setVlogs]     = useState(null)
  const [selected,  setSelected]  = useState(null)
  const [rxMap,     setRxMap]     = useState({})   // vlogId → reactions[]

  const isMe = !targetUserId || targetUserId === user?.id

  useEffect(() => {
    if (isMe) {
      setVlogs(myVlogs)
    } else {
      api.vlogs.userList(targetUserId)
        .then(d => setVlogs(d.vlogs ?? []))
        .catch(() => setVlogs([]))
    }
  }, [isMe, targetUserId, myVlogs])

  const selectedVlog = vlogs?.find(v => v.id === selected)

  const getReactions = vlog => rxMap[vlog.id] ?? vlog.reactions ?? []

  const handleReact = async (vlogId, type) => {
    const data = await api.vlogs.react(vlogId, type)
    if (data.reactions) setRxMap(p => ({ ...p, [vlogId]: data.reactions }))
  }

  return (
    <motion.div key="reveal" {...page} className="pb-28">
      <div className="flex items-center justify-between px-5 pt-14 pb-5">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-white font-semibold">
          {isMe ? 'Meine Vlogs' : 'Vlogs ansehen'}
        </span>
        <div className="w-10" />
      </div>

      {/* Video player */}
      {selectedVlog && (
        <div className="mx-5 mb-3">
          <div className="rounded-3xl overflow-hidden bg-[#141415] border border-[#2C2C2E]"
            style={{ aspectRatio: '9/16', maxHeight: '55vh' }}>
            <video
              key={selectedVlog.url}
              src={selectedVlog.url}
              controls autoPlay playsInline
              className="w-full h-full object-cover" />
          </div>

          {/* Vlog title */}
          {selectedVlog.title && (
            <p className="text-white font-semibold text-base mt-3 px-1">{selectedVlog.title}</p>
          )}

          {/* Reactions */}
          <div className="flex gap-2 mt-3 px-1">
            {REACTION_TYPES.map(type => {
              const rx = getReactions(selectedVlog).find(r => r.type === type)
              const count = rx?.count ?? 0
              const mine  = rx?.mine  ?? false
              return (
                <motion.button key={type} whileTap={{ scale: 0.85 }}
                  onClick={() => handleReact(selectedVlog.id, type)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors"
                  style={{
                    background: mine ? 'rgba(123,97,255,0.2)' : 'rgba(44,44,46,1)',
                    border: `1.5px solid ${mine ? 'rgba(123,97,255,0.5)' : 'transparent'}`,
                  }}>
                  <span>{type}</span>
                  {count > 0 && <span className="text-xs" style={{ color: mine ? '#7B61FF' : '#8E8E93' }}>{count}</span>}
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {/* Loading */}
      {vlogs === null && (
        <div className="flex justify-center pt-20">
          <div className="w-8 h-8 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {vlogs !== null && vlogs.length === 0 && (
        <div className="mx-5 rounded-3xl bg-[#141415] border border-[#2C2C2E] p-12 flex flex-col items-center gap-3">
          <span className="text-5xl">🎬</span>
          <p className="text-white font-semibold">Noch keine Vlogs</p>
          <p className="text-[#8E8E93] text-sm text-center">Nimm heute deinen Tag auf</p>
        </div>
      )}

      {/* Vlog list */}
      {vlogs?.length > 0 && (
        <div className="px-5 space-y-3">
          {vlogs.map((v, i) => (
            <motion.div key={v.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelected(v.id)}
              className={`flex items-center gap-3 rounded-2xl p-3.5 cursor-pointer border transition-colors ${
                selected === v.id
                  ? 'bg-[#7B61FF]/10 border-[#7B61FF]/30'
                  : 'bg-[#141415] border-[#2C2C2E]'
              }`}>
              {/* Thumbnail or emoji fallback */}
              <div className="w-12 h-18 rounded-xl overflow-hidden flex-shrink-0"
                style={{ width: 48, height: 64, background: '#7B61FF15', flexShrink: 0 }}>
                {v.thumbnail
                  ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-2xl">{v.emoji}</div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{v.title ?? v.date}</p>
                <p className="text-xs text-[#8E8E93] mt-0.5">{v.date} · {v.clipCount} Clips · {Math.round(v.duration)}s</p>
                {/* Mini reaction summary */}
                {(v.reactions?.length > 0) && (
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    {v.reactions.map(r => `${r.type} ${r.count}`).join('  ')}
                  </p>
                )}
              </div>
              <div className="w-8 h-8 rounded-full bg-[#7B61FF]/20 flex items-center justify-center flex-shrink-0">
                <Play size={13} className="text-[#7B61FF] ml-0.5" fill="#7B61FF" />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view,              setView]              = useState('dashboard')
  const [activeTab,         setActiveTab]         = useState('home')
  const [showQR,            setShowQR]            = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [revealTarget,      setRevealTarget]      = useState(null)  // userId whose vlogs to show

  // Countdown to midnight, synced to real clock
  const [totalSecs, setTotalSecs] = useState(secsUntilMidnight)
  const countdown = secsToHMS(totalSecs)
  useEffect(() => {
    const t = setInterval(() => setTotalSecs(secsUntilMidnight()), 1000)
    return () => clearInterval(t)
  }, [])

  const { addVlog } = useApp()

  const navigate     = (tab, v) => { setActiveTab(tab); setView(v) }
  const showNav      = view !== 'record'
  const openReveal   = (userId = null) => { setRevealTarget(userId); setView('reveal') }

  return (
    <div className="min-h-screen flex justify-center items-start" style={{ background: '#070708' }}>
      {/* Desktop background — only visible at ≥ md */}
      <div className="hidden md:block fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 25% 40%, rgba(123,97,255,0.07) 0%, transparent 55%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 75% 60%, rgba(0,217,255,0.05) 0%, transparent 50%)' }} />
      </div>

      <div className="relative w-full max-w-[390px] md:mt-8 md:mb-8 md:rounded-[44px] md:border md:border-[#1C1C1E] md:shadow-[0_32px_80px_rgba(0,0,0,0.7)] min-h-screen md:min-h-0 bg-[#0A0A0B] overflow-hidden">

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
          {view === 'reveal' && (
            <RevealView key="reveal"
              onBack={() => setView('dashboard')}
              targetUserId={revealTarget} />
          )}
          {view === 'group'   && <GroupView   key="group"   />}
          {view === 'profile' && <ProfileView key="profile" />}
        </AnimatePresence>

        {showNav && <BottomNav activeTab={activeTab} onNavigate={navigate} />}

        <AnimatePresence>
          {showQR && <QRModal onClose={() => setShowQR(false)} />}
          {showNotifications && <NotificationsPanel onClose={() => setShowNotifications(false)} />}
        </AnimatePresence>
      </div>
    </div>
  )
}
