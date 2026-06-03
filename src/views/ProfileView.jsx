import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, LogOut, UserPlus, Trash2, Check, X,
  ChevronLeft, Search, AtSign, Save, Camera, Edit3, Play, Flame,
} from 'lucide-react'
import { useApp, formatUser } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import UserAvatar, { avatarUrl } from '../components/UserAvatar'
import { api } from '../lib/api'

const slide = {
  initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 }, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
}

// ── Settings screen ───────────────────────────────────────────────────────────
function SettingsScreen({ onBack }) {
  const { user, updateUser, signOut } = useAuth()
  const { me } = useApp()
  const toast = useToast()
  const [username,   setUsername]   = useState(user?.username ?? '')
  const [loading,    setLoading]    = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [avatarSrc,  setAvatarSrc]  = useState(avatarUrl(user?.avatar))
  const [avatarLoad, setAvatarLoad] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { setAvatarSrc(avatarUrl(user?.avatar)) }, [user?.avatar])

  const saveUsername = async () => {
    if (!username.trim() || username === user?.username) return
    setLoading(true); setSaved(false)
    const data = await api.updateUsername(username.trim())
    setLoading(false)
    if (data.error) { toast?.show(data.error, 'error'); return }
    updateUser(data.user, data.token)
    setSaved(true)
    toast?.show('Nutzername gespeichert!', 'success')
    setTimeout(() => setSaved(false), 2500)
  }

  const handleAvatarChange = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setAvatarSrc(preview)
    setAvatarLoad(true)
    const formData = new FormData()
    formData.append('avatar', file)
    try {
      const { avatar: url, error } = await api.uploadAvatar(formData)
      if (error) throw new Error(error)
      const fresh = url + '?t=' + Date.now()
      setAvatarSrc(fresh)
      updateUser({ ...user, avatar: url }, null)
      toast?.show('Profilbild aktualisiert!', 'success')
    } catch (err) {
      setAvatarSrc(avatarUrl(user?.avatar))
      toast?.show(err.message || 'Upload fehlgeschlagen.', 'error')
    }
    setAvatarLoad(false)
    URL.revokeObjectURL(preview)
  }

  const displayInitials = (user?.username ?? 'ME').slice(0, 2).toUpperCase()

  return (
    <motion.div key="settings" {...slide} className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>

      <div className="flex items-center gap-3 px-5 pt-14 pb-6">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-xl font-black text-white">Einstellungen</span>
      </div>

      <div className="px-5 space-y-4">

        {/* Avatar card */}
        <div className="rounded-3xl overflow-hidden"
          style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="px-5 pt-5 pb-4">
            <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-5">Profilbild</p>
            <div className="flex items-center gap-5">
              <div className="relative cursor-pointer flex-shrink-0" onClick={() => fileRef.current?.click()}>
                {avatarSrc
                  ? <img src={avatarSrc} alt="" className="w-20 h-20 rounded-2xl object-cover" />
                  : <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-black text-2xl"
                      style={{ background: `linear-gradient(135deg, ${me?.color ?? '#7B61FF'}, #00D9FF)` }}>
                      {displayInitials}
                    </div>
                }
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl flex items-center justify-center border-2 border-[#141415]"
                  style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
                  {avatarLoad
                    ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    : <Camera size={14} className="text-white" />}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-base">{user?.username ?? 'Dein Name'}</p>
                <p className="text-[#8E8E93] text-xs mt-0.5 mb-3">{user?.email}</p>
                <motion.button whileTap={{ scale: 0.96 }} onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'rgba(123,97,255,0.15)', border: '1px solid rgba(123,97,255,0.3)', color: '#7B61FF' }}>
                  <Edit3 size={13} />
                  Ändern
                </motion.button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
          </div>
        </div>

        {/* Username */}
        <div className="rounded-3xl px-5 py-5"
          style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-4">Nutzername</p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-xl px-3 focus-within:border-[#7B61FF] transition-colors"
              style={{ background: 'rgba(28,28,30,0.9)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
              <AtSign size={14} className="text-[#8E8E93] flex-shrink-0" />
              <input
                value={username}
                onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                onKeyDown={e => e.key === 'Enter' && saveUsername()}
                className="flex-1 bg-transparent text-white text-sm py-3 outline-none"
                placeholder="Nutzername…"
                style={{ caretColor: '#7B61FF' }}
              />
            </div>
            <motion.button whileTap={{ scale: 0.96 }} onClick={saveUsername}
              disabled={loading || !username.trim() || username === user?.username}
              className="px-4 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-40 flex items-center gap-1.5"
              style={{ background: saved ? '#2ECC71' : 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
              {loading ? '…' : saved ? <><Check size={13} /> Ok</> : <><Save size={13} /> Save</>}
            </motion.button>
          </div>
        </div>

        {/* Account info */}
        <div className="rounded-3xl px-5 py-5"
          style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-4">Konto</p>
          <div className="space-y-3.5">
            {[
              { label: 'E-Mail',        value: user?.email ?? '—' },
              { label: 'Mitglied seit', value: user?.created_at
                  ? new Date(user.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
                  : '—' },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-sm text-[#8E8E93]">{r.label}</span>
                <span className="text-sm text-white font-semibold truncate ml-4 max-w-[58%] text-right">{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Logout */}
        <motion.button whileTap={{ scale: 0.97 }} onClick={signOut}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-2"
          style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)' }}>
          <LogOut size={15} className="text-red-400" />
          <span className="text-red-400 font-bold text-sm">Abmelden</span>
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Add friend screen ─────────────────────────────────────────────────────────
function AddFriendScreen({ onBack }) {
  const { sendRequest, acceptRequest } = useApp()
  const toast = useToast()
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [acted,   setActed]   = useState({})
  const abortRef = useRef(null)

  useEffect(() => {
    if (query.length < 1) { setResults([]); return }
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setLoading(true)
      try {
        const data = await api.search(query, ctrl.signal)
        if (!ctrl.signal.aborted)
          setResults((data.users ?? []).map(u => ({ ...formatUser(u), status: u.status })))
      } catch (err) {
        if (err.name !== 'AbortError') setResults([])
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleAction = async u => {
    if (u.status === 'incoming') {
      acceptRequest(u)
      setActed(p => ({ ...p, [u.id]: 'accepted' }))
      toast?.show(`Du bist jetzt mit ${u.name} befreundet! 🎉`, 'success')
    } else {
      await sendRequest(u)
      setActed(p => ({ ...p, [u.id]: 'sent' }))
      toast?.show(`Anfrage an ${u.name} gesendet.`, 'info')
    }
  }

  const btnStyle = u => {
    const s = acted[u.id] ?? u.status
    if (s === 'friend')   return { label: 'Befreundet',       cls: 'text-[#2ECC71]',  bg: 'rgba(46,204,113,0.15)',  border: 'rgba(46,204,113,0.3)',  disabled: true,  icon: <Check size={11}/> }
    if (s === 'sent')     return { label: 'Gesendet',         cls: 'text-[#8E8E93]',  bg: 'rgba(58,58,60,0.6)',     border: 'rgba(58,58,60,0.6)',    disabled: true,  icon: <Check size={11}/> }
    if (s === 'accepted') return { label: 'Befreundet',       cls: 'text-[#2ECC71]',  bg: 'rgba(46,204,113,0.15)',  border: 'rgba(46,204,113,0.3)',  disabled: true,  icon: <Check size={11}/> }
    if (s === 'incoming') return { label: 'Annehmen',         cls: 'text-white',       bg: '#2ECC71',                border: '#2ECC71',               disabled: false, icon: <Check size={11}/> }
    return                       { label: 'Anfrage senden',   cls: 'text-white',       bg: '#7B61FF',                border: '#7B61FF',               disabled: false, icon: <UserPlus size={11}/> }
  }

  return (
    <motion.div key="add-friend" {...slide} className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>
      <div className="flex items-center gap-3 px-5 pt-14 pb-5">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-xl font-black text-white">Freund hinzufügen</span>
      </div>

      {/* Search bar */}
      <div className="px-5 mb-5">
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 focus-within:border-[#7B61FF] transition-all"
          style={{ background: 'rgba(28,28,30,0.9)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
          <Search size={16} className="text-[#8E8E93] flex-shrink-0" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Name oder @username suchen…"
            className="flex-1 bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none"
            style={{ caretColor: '#7B61FF' }} />
          {query.length > 0 && (
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setQuery('')}>
              <X size={14} className="text-[#8E8E93]" />
            </motion.button>
          )}
        </div>
      </div>

      <div className="px-5">
        {query.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-[#1C1C1E] flex items-center justify-center mx-auto mb-4">
              <Search size={24} className="text-[#3A3A3C]" />
            </div>
            <p className="text-white font-semibold text-sm">Freunde finden</p>
            <p className="text-[#8E8E93] text-xs mt-1">Gib einen Namen ein, um zu suchen</p>
          </div>
        )}
        {query.length > 0 && loading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: '#7B61FF', borderTopColor: 'transparent' }} />
          </div>
        )}
        {query.length > 0 && !loading && results.length === 0 && (
          <div className="text-center py-12">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-white font-semibold text-sm">Niemanden gefunden</p>
            <p className="text-[#8E8E93] text-xs mt-1">für „{query}"</p>
          </div>
        )}
        <div className="space-y-2.5">
          <AnimatePresence>
            {results.map((u, i) => {
              const btn = btnStyle(u)
              return (
                <motion.div key={u.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3.5 rounded-2xl p-3.5"
                  style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <UserAvatar user={u} size={46} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{u.name}</p>
                    <p className="text-xs text-[#8E8E93] mt-0.5">@{u.name.toLowerCase()}</p>
                  </div>
                  <motion.button whileTap={{ scale: 0.88 }} onClick={() => handleAction(u)}
                    disabled={btn.disabled}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold flex-shrink-0 ${btn.cls}`}
                    style={{ background: btn.bg, border: `1.5px solid ${btn.border}` }}>
                    {btn.icon} {btn.label}
                  </motion.button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main profile screen ───────────────────────────────────────────────────────
function ProfileMain({ onAddFriend, onSettings, onReveal }) {
  const { me, friends, requests, groups, myVlogs, myStreak, presences, acceptRequest, declineRequest, removeFriend } = useApp()
  const { user, signOut } = useAuth()
  const toast = useToast()
  const [confirmRemove, setConfirmRemove] = useState(null)

  const displayName  = user?.username ?? user?.email?.split('@')[0] ?? me?.name ?? '?'
  const displayEmail = user?.email ?? ''

  const getOnlineStatus = uid => {
    const ts = presences[uid]
    if (!ts) return { label: 'Offline', online: false }
    const diff = Date.now() - ts
    if (diff < 2 * 60_000)  return { label: 'Online',                               online: true  }
    if (diff < 60 * 60_000) return { label: `Vor ${Math.floor(diff / 60_000)} Min.`, online: false }
    return                         { label: 'Offline',                               online: false }
  }

  const STATS = [
    { label: 'Vlogs',   value: myVlogs.length,                            color: '#7B61FF' },
    { label: 'Streak',  value: myStreak > 0 ? `${myStreak}` : '0',        color: '#FF9F43' },
    { label: 'Freunde', value: friends.length,                             color: '#00D9FF' },
    { label: 'Gruppen', value: groups.length,                              color: '#2ECC71' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.28 }}
      className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>

      {/* ── Banner + Avatar header ── */}
      <div className="relative">
        {/* Banner */}
        <div className="h-44 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${me?.color ?? '#7B61FF'}55 0%, rgba(0,217,255,0.25) 100%)`,
          }}>
          {/* Glow orbs inside banner */}
          <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full blur-3xl pointer-events-none"
            style={{ background: `${me?.color ?? '#7B61FF'}50` }} />
          <div className="absolute -bottom-6 right-0 w-36 h-36 rounded-full blur-2xl pointer-events-none"
            style={{ background: 'rgba(0,217,255,0.35)' }} />
          {/* Noise texture overlay */}
          <div className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")',
            }} />
          {/* Settings button */}
          <div className="absolute top-14 right-5 z-10">
            <motion.button whileTap={{ scale: 0.88 }} onClick={onSettings}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <Settings size={16} className="text-white/80" />
            </motion.button>
          </div>
        </div>

        {/* Avatar overlapping banner */}
        <div className="px-5 flex items-end justify-between -mt-12 relative z-10 mb-4">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => onReveal?.(user?.id)}>
            <div className="relative">
              <div className="w-[88px] h-[88px] rounded-[24px] overflow-hidden"
                style={{
                  border: '3px solid #0A0A0B',
                  boxShadow: `0 0 28px ${me?.color ?? '#7B61FF'}55, 0 8px 24px rgba(0,0,0,0.6)`,
                }}>
                <UserAvatar user={{ ...me, avatar: avatarUrl(user?.avatar) }} size={82} fontSize={28} />
              </div>
              {myStreak > 0 && (
                <div className="absolute -bottom-1.5 -right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black text-white border-2 border-[#0A0A0B]"
                  style={{ background: 'linear-gradient(135deg, #FF9F43, #FF6B6B)' }}>
                  🔥 {myStreak}
                </div>
              )}
            </div>
          </motion.button>

          {/* Quick action buttons */}
          <div className="flex gap-2 mb-1">
            <motion.button whileTap={{ scale: 0.96 }} onClick={onAddFriend}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-sm font-bold"
              style={{
                background: 'linear-gradient(135deg, #7B61FF, #00D9FF)',
                boxShadow: '0 0 16px rgba(123,97,255,0.4)',
              }}>
              <UserPlus size={14} className="text-white" />
              <span className="text-white">Hinzufügen</span>
            </motion.button>
          </div>
        </div>

        {/* Name + stats */}
        <div className="px-5">
          <h2 className="text-white font-black text-[22px] leading-tight">{displayName}</h2>
          <p className="text-[#8E8E93] text-sm mt-0.5">{displayEmail}</p>

          {/* Stats */}
          <div className="flex mt-5 pb-5 gap-1"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {STATS.map((s, i) => (
              <motion.div key={s.label}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className="flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl"
                style={{ background: `${s.color}12`, border: `1px solid ${s.color}20` }}>
                <span className="font-black text-xl leading-tight" style={{ color: s.color }}>
                  {s.label === 'Streak' && myStreak > 0 ? `${s.value}` : s.value}
                </span>
                {s.label === 'Streak' && myStreak > 0
                  ? <span className="text-[10px] font-bold" style={{ color: s.color }}>🔥 Streak</span>
                  : <span className="text-[10px] font-semibold text-[#8E8E93]">{s.label}</span>
                }
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Friend requests ── */}
      <AnimatePresence>
        {requests.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} className="px-5 mt-5 overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-black text-white">Freundschaftsanfragen</span>
              <div className="w-5 h-5 rounded-full bg-[#7B61FF] flex items-center justify-center">
                <span className="text-white text-[10px] font-black">{requests.length}</span>
              </div>
            </div>
            <div className="space-y-2">
              <AnimatePresence>
                {requests.map((u, i) => (
                  <motion.div key={u.id}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 rounded-2xl p-3.5"
                    style={{ background: 'rgba(123,97,255,0.1)', border: '1px solid rgba(123,97,255,0.22)' }}>
                    <UserAvatar user={u} size={44} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{u.name}</p>
                      <p className="text-xs text-[#8E8E93]">möchte dein Freund sein</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <motion.button whileTap={{ scale: 0.88 }}
                        onClick={() => { acceptRequest(u); toast?.show(`Du bist jetzt mit ${u.name} befreundet! 🎉`, 'success') }}
                        className="w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
                        <Check size={14} className="text-white" />
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.88 }} onClick={() => declineRequest(u.id)}
                        className="w-9 h-9 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                        <X size={14} className="text-[#8E8E93]" />
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Friends list ── */}
      <div className="px-5 mt-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-black text-white">Freunde · {friends.length}</span>
          <motion.button whileTap={{ scale: 0.88 }} onClick={onAddFriend}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: 'rgba(123,97,255,0.15)', border: '1px solid rgba(123,97,255,0.3)', color: '#7B61FF' }}>
            <UserPlus size={12} />
            Hinzufügen
          </motion.button>
        </div>

        {friends.length === 0 ? (
          <motion.button whileTap={{ scale: 0.97 }} onClick={onAddFriend}
            className="w-full py-6 rounded-2xl flex flex-col items-center gap-3"
            style={{ border: '1.5px dashed rgba(123,97,255,0.3)', background: 'rgba(123,97,255,0.05)' }}>
            <div className="w-12 h-12 rounded-2xl bg-[#7B61FF]/15 flex items-center justify-center">
              <UserPlus size={20} className="text-[#7B61FF]/70" />
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-sm">Noch keine Freunde</p>
              <p className="text-[#8E8E93] text-xs mt-0.5">Finde Freunde und lade sie ein</p>
            </div>
          </motion.button>
        ) : (
          <div className="space-y-2.5">
            <AnimatePresence>
              {friends.map((u, i) => {
                const status = getOnlineStatus(u.id)
                return (
                  <motion.div key={u.id} layout
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ delay: i * 0.04, layout: { duration: 0.2 } }}
                    className="flex items-center gap-3 rounded-2xl p-3.5"
                    style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="relative flex-shrink-0">
                      <UserAvatar user={u} size={46} />
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                        style={{
                          background: status.online ? '#2ECC71' : '#3A3A3C',
                          borderColor: '#0A0A0B',
                        }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{u.name}</p>
                      <p className="text-xs font-medium mt-0.5" style={{ color: status.online ? '#2ECC71' : '#8E8E93' }}>
                        {status.label}
                      </p>
                    </div>

                    {confirmRemove === u.id ? (
                      <div className="flex items-center gap-1.5">
                        <motion.button whileTap={{ scale: 0.88 }}
                          onClick={() => { removeFriend(u.id); setConfirmRemove(null); toast?.show('Freund entfernt.', 'info') }}
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(255,59,48,0.15)', border: '1px solid rgba(255,59,48,0.35)' }}>
                          <Check size={12} className="text-red-400" />
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.88 }} onClick={() => setConfirmRemove(null)}
                          className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                          <X size={12} className="text-[#8E8E93]" />
                        </motion.button>
                      </div>
                    ) : (
                      <motion.button whileTap={{ scale: 0.85 }} onClick={() => setConfirmRemove(u.id)}
                        className="w-8 h-8 rounded-full bg-[#1C1C1E] flex items-center justify-center">
                        <Trash2 size={13} className="text-[#3A3A3C]" />
                      </motion.button>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── My vlogs ── */}
      <div className="px-5 mt-5">
        <span className="text-sm font-black text-white block mb-3">
          Meine Tage {myVlogs.length > 0 ? `· ${myVlogs.length}` : ''}
        </span>
        {myVlogs.length === 0 ? (
          <div className="rounded-2xl p-6 flex flex-col items-center gap-2"
            style={{ border: '1.5px dashed rgba(255,255,255,0.08)' }}>
            <span className="text-3xl">🎬</span>
            <p className="text-[#8E8E93] text-sm text-center">Noch keinen Tag aufgenommen</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {myVlogs.map((v, i) => (
              <motion.div key={v.id}
                initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onReveal?.(null, v.id)}
                className="flex items-center gap-3 rounded-2xl p-3 cursor-pointer"
                style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="w-12 h-14 rounded-xl overflow-hidden flex-shrink-0 relative"
                  style={{ background: `${me?.color ?? '#7B61FF'}18` }}>
                  {v.thumbnail
                    ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-xl">{v.emoji}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{v.title ?? 'Mein Tag'}</p>
                  <p className="text-xs text-[#8E8E93] mt-0.5">{v.date} · {v.clipCount} Clips · {Math.round(v.duration)}s</p>
                  {v.reactions?.some(r => r.count > 0) && (
                    <p className="text-xs text-[#8E8E93] mt-0.5">
                      {v.reactions.filter(r => r.count > 0).map(r => `${r.type} ${r.count}`).join('  ')}
                    </p>
                  )}
                </div>
                {v.status === 'processing'
                  ? <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: '#7B61FF', borderTopColor: 'transparent' }} />
                      <span className="text-[10px] text-[#7B61FF] font-bold">KI…</span>
                    </div>
                  : <div className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, rgba(123,97,255,0.2), rgba(0,217,255,0.15))', border: '1px solid rgba(123,97,255,0.2)' }}>
                      <Play size={13} className="text-[#7B61FF] ml-0.5" fill="#7B61FF" />
                    </div>
                }
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Logout */}
      <div className="px-5 mt-6">
        <motion.button whileTap={{ scale: 0.97 }} onClick={signOut}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-2"
          style={{ background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.18)' }}>
          <LogOut size={15} className="text-red-400" />
          <span className="text-red-400 font-bold text-sm">Abmelden</span>
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function ProfileView({ onReveal }) {
  const [screen, setScreen] = useState('main')
  return (
    <AnimatePresence mode="wait">
      {screen === 'main'       && <ProfileMain     key="main"       onAddFriend={() => setScreen('add-friend')} onSettings={() => setScreen('settings')} onReveal={onReveal} />}
      {screen === 'add-friend' && <AddFriendScreen key="add-friend" onBack={() => setScreen('main')} />}
      {screen === 'settings'   && <SettingsScreen  key="settings"   onBack={() => setScreen('main')} />}
    </AnimatePresence>
  )
}
