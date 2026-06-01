// v5
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, CheckCircle, LogOut, UserPlus, Trash2, Check, X,
  ChevronLeft, Search, AtSign, Save,
} from 'lucide-react'
import { useApp, formatUser } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const page = {
  initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 }, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
}

function Avatar({ user, size = 10 }) {
  return (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}
      style={{ background: `linear-gradient(135deg, ${user.color}, ${user.color}88)` }}>
      {user.initials}
    </div>
  )
}

// ── Settings screen ───────────────────────────────────────────────────────────
function SettingsScreen({ onBack }) {
  const { user, updateUser, signOut } = useAuth()
  const [username, setUsername] = useState(user?.username ?? '')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [saved,    setSaved]    = useState(false)

  const saveUsername = async () => {
    if (!username.trim() || username === user?.username) return
    setLoading(true); setError(''); setSaved(false)
    const data = await api.updateUsername(username.trim())
    setLoading(false)
    if (data.error) { setError(data.error); return }
    updateUser(data.user, data.token)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <motion.div key="settings" {...page} className="min-h-screen bg-[#0A0A0B] pb-28">
      <div className="flex items-center gap-3 px-5 pt-14 pb-6">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-lg font-bold text-white">Einstellungen</span>
      </div>

      <div className="px-5 space-y-4">
        {/* Username change */}
        <div className="bg-[#141415] border border-[#2C2C2E] rounded-2xl p-4">
          <p className="text-xs text-[#8E8E93] font-semibold uppercase tracking-wider mb-3">Nutzername</p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-3 focus-within:border-[#7B61FF] transition-colors">
              <AtSign size={14} className="text-[#8E8E93] flex-shrink-0" />
              <input
                value={username}
                onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                onKeyDown={e => e.key === 'Enter' && saveUsername()}
                className="flex-1 bg-transparent text-white text-sm py-2.5 outline-none"
                placeholder="Nutzername…"
              />
            </div>
            <motion.button whileTap={{ scale: 0.96 }} onClick={saveUsername}
              disabled={loading || !username.trim() || username === user?.username}
              className="px-4 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-40 flex items-center gap-1.5 transition-colors"
              style={{ background: saved ? '#2ECC71' : 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
              {loading ? '…' : saved ? <><Check size={14} /> Gespeichert</> : <><Save size={14} /> Speichern</>}
            </motion.button>
          </div>
          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-xs mt-2">{error}</motion.p>
          )}
        </div>

        {/* Account info */}
        <div className="bg-[#141415] border border-[#2C2C2E] rounded-2xl p-4">
          <p className="text-xs text-[#8E8E93] font-semibold uppercase tracking-wider mb-3">Konto</p>
          <div className="space-y-3">
            {[
              { label: 'E-Mail',        value: user?.email ?? '—' },
              { label: 'Mitglied seit', value: user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '—' },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-sm text-[#8E8E93]">{r.label}</span>
                <span className="text-sm text-white font-medium">{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Logout */}
        <motion.button whileTap={{ scale: 0.97 }} onClick={signOut}
          className="w-full py-4 rounded-2xl border border-red-500/30 flex items-center justify-center gap-2">
          <LogOut size={15} className="text-red-400" />
          <span className="text-red-400 font-medium text-sm">Abmelden</span>
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Add friend screen ─────────────────────────────────────────────────────────
function AddFriendScreen({ onBack }) {
  const { sendRequest, acceptRequest } = useApp()
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [acted,   setActed]   = useState({})

  useEffect(() => {
    if (query.length < 1) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await api.search(query)
        setResults((data.users ?? []).map(u => ({ ...formatUser(u), status: u.status })))
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleAction = async u => {
    if (u.status === 'incoming') {
      acceptRequest(u); setActed(p => ({ ...p, [u.id]: 'accepted' }))
    } else {
      await sendRequest(u); setActed(p => ({ ...p, [u.id]: 'sent' }))
    }
  }

  const btnStyle = u => {
    const s = acted[u.id] ?? u.status
    if (s === 'friend')   return { label: 'Befreundet',       cls: 'bg-[#2ECC71]/20 text-[#2ECC71] border border-[#2ECC71]/40', disabled: true,  icon: <Check size={11}/> }
    if (s === 'sent')     return { label: 'Anfrage gesendet', cls: 'bg-[#3A3A3C] text-[#8E8E93]',                               disabled: true,  icon: <Check size={11}/> }
    if (s === 'accepted') return { label: 'Befreundet',       cls: 'bg-[#2ECC71]/20 text-[#2ECC71] border border-[#2ECC71]/40', disabled: true,  icon: <Check size={11}/> }
    if (s === 'incoming') return { label: 'Annehmen',         cls: 'bg-[#2ECC71] text-white',                                   disabled: false, icon: <Check size={11}/> }
    return                       { label: 'Anfrage senden',   cls: 'bg-[#7B61FF] text-white',                                   disabled: false, icon: <UserPlus size={11}/> }
  }

  return (
    <motion.div key="add-friend" {...page} className="min-h-screen bg-[#0A0A0B] pb-28">
      <div className="flex items-center gap-3 px-5 pt-14 pb-5">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-lg font-bold text-white">Freund hinzufügen</span>
      </div>

      <div className="px-5 mb-5">
        <div className="flex items-center gap-3 bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-3.5">
          <Search size={16} className="text-[#8E8E93] flex-shrink-0" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Name suchen…"
            className="flex-1 bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none" />
          {query.length > 0 && (
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setQuery('')}>
              <X size={14} className="text-[#8E8E93]" />
            </motion.button>
          )}
        </div>
      </div>

      <div className="px-5">
        {query.length === 0 && (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-full bg-[#1C1C1E] flex items-center justify-center mx-auto mb-3">
              <Search size={22} className="text-[#3A3A3C]" />
            </div>
            <p className="text-[#8E8E93] text-sm">Gib einen Namen ein, um zu suchen</p>
          </div>
        )}
        {query.length > 0 && loading && (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" />
          </div>
        )}
        {query.length > 0 && !loading && results.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#8E8E93] text-sm">Niemanden gefunden</p>
          </div>
        )}
        <div className="space-y-2">
          <AnimatePresence>
            {results.map((u, i) => {
              const btn = btnStyle(u)
              return (
                <motion.div key={u.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 bg-[#141415] border border-[#2C2C2E] rounded-2xl p-3.5">
                  <Avatar user={u} size={11} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{u.name}</p>
                    <p className="text-xs text-[#8E8E93]">daylo · {u.name.toLowerCase()}</p>
                  </div>
                  <motion.button whileTap={{ scale: 0.88 }} onClick={() => handleAction(u)}
                    disabled={btn.disabled}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-colors ${btn.cls}`}>
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
function ProfileMain({ onAddFriend, onSettings }) {
  const { me, friends, requests, groups, myVlogs, presences, acceptRequest, declineRequest, removeFriend } = useApp()
  const { user, signOut } = useAuth()
  const [confirmRemove, setConfirmRemove] = useState(null)

  const displayName  = user?.username ?? user?.email?.split('@')[0] ?? me?.name ?? '?'
  const displayEmail = user?.email ?? ''
  const initials     = displayName.slice(0, 2).toUpperCase()

  const getOnlineStatus = uid => {
    const ts = presences[uid]
    if (!ts) return { label: 'Offline', online: false }
    const diff = Date.now() - ts
    if (diff < 2 * 60_000) return { label: 'Online', online: true }
    if (diff < 60 * 60_000) return { label: `Vor ${Math.floor(diff / 60_000)} Min.`, online: false }
    return { label: 'Offline', online: false }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.28 }}
      className="min-h-screen bg-[#0A0A0B] pb-28">

      <div className="flex items-center justify-between px-5 pt-14 pb-5">
        <span className="text-[22px] font-bold text-white">Profil</span>
        <motion.button whileTap={{ scale: 0.88 }} onClick={onSettings}
          className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center">
          <Settings size={16} className="text-[#8E8E93]" />
        </motion.button>
      </div>

      {/* Profile card */}
      <div className="mx-5 mb-5 rounded-3xl bg-[#141415] border border-[#2C2C2E] p-6 flex flex-col items-center relative overflow-hidden">
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${me?.color ?? '#7B61FF'}20 0%, transparent 70%)` }} />
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-3"
          style={{ background: `linear-gradient(135deg, ${me?.color ?? '#7B61FF'}, #1aab5a)` }}>
          {initials}
        </div>
        <h2 className="text-white font-bold text-xl">{displayName}</h2>
        <p className="text-[#8E8E93] text-sm mt-0.5">{displayEmail}</p>
        <div className="flex gap-8 mt-5 pt-4 border-t border-[#2C2C2E] w-full justify-around">
          {[
            { label: 'Vlogs',   value: myVlogs.length },
            { label: 'Freunde', value: friends.length },
            { label: 'Gruppen', value: groups.length  },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center gap-0.5">
              <span className="text-white font-bold text-2xl">{s.value}</span>
              <span className="text-[#8E8E93] text-xs">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Friend requests */}
      {requests.length > 0 && (
        <div className="px-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-white">Freundschaftsanfragen</span>
            <span className="w-5 h-5 rounded-full bg-[#7B61FF] text-white text-[10px] font-bold flex items-center justify-center">
              {requests.length}
            </span>
          </div>
          <div className="space-y-2">
            <AnimatePresence>
              {requests.map((u, i) => (
                <motion.div key={u.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 bg-[#141415] border border-[#2C2C2E] rounded-2xl p-3.5">
                  <Avatar user={u} size={11} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{u.name}</p>
                    <p className="text-xs text-[#8E8E93]">möchte dein Freund sein</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <motion.button whileTap={{ scale: 0.88 }} onClick={() => acceptRequest(u)}
                      className="w-8 h-8 rounded-full bg-[#7B61FF] flex items-center justify-center">
                      <Check size={14} className="text-white" />
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.88 }} onClick={() => declineRequest(u.id)}
                      className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                      <X size={14} className="text-[#8E8E93]" />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Friends list */}
      <div className="px-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">Freunde · {friends.length}</span>
          <motion.button whileTap={{ scale: 0.88 }} onClick={onAddFriend}
            className="flex items-center gap-1.5 bg-[#7B61FF]/15 border border-[#7B61FF]/30 px-3 py-1.5 rounded-full">
            <UserPlus size={13} className="text-[#7B61FF]" />
            <span className="text-xs text-[#7B61FF] font-semibold">Hinzufügen</span>
          </motion.button>
        </div>

        {friends.length === 0 ? (
          <motion.button whileTap={{ scale: 0.97 }} onClick={onAddFriend}
            className="w-full py-5 rounded-2xl border border-dashed border-[#2C2C2E] flex flex-col items-center gap-2">
            <UserPlus size={20} className="text-[#3A3A3C]" />
            <span className="text-sm text-[#8E8E93]">Noch keine Freunde – Hinzufügen</span>
          </motion.button>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {friends.map((u, i) => {
                const status = getOnlineStatus(u.id)
                return (
                  <motion.div key={u.id}
                    layout
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ delay: i * 0.04, layout: { duration: 0.2 } }}
                    className="flex items-center gap-3 bg-[#141415] border border-[#2C2C2E] rounded-2xl p-3.5">
                    <div className="relative">
                      <Avatar user={u} size={11} />
                      <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#141415]"
                        style={{ background: status.online ? '#2ECC71' : '#3A3A3C' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{u.name}</p>
                      <p className="text-xs text-[#8E8E93]">{status.label}</p>
                    </div>

                    {confirmRemove === u.id ? (
                      <div className="flex items-center gap-1.5">
                        <motion.button whileTap={{ scale: 0.88 }}
                          onClick={() => { removeFriend(u.id); setConfirmRemove(null) }}
                          className="w-7 h-7 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                          <Check size={11} className="text-red-400" />
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.88 }}
                          onClick={() => setConfirmRemove(null)}
                          className="w-7 h-7 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                          <X size={11} className="text-[#8E8E93]" />
                        </motion.button>
                      </div>
                    ) : (
                      <motion.button whileTap={{ scale: 0.85 }}
                        onClick={() => setConfirmRemove(u.id)}
                        className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                        <Trash2 size={13} className="text-[#8E8E93]" />
                      </motion.button>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* My vlogs */}
      <div className="px-5 mb-5">
        <span className="text-sm font-semibold text-white block mb-3">Meine Tage</span>
        {myVlogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#2C2C2E] p-6 flex flex-col items-center gap-2">
            <span className="text-3xl">🎬</span>
            <p className="text-[#8E8E93] text-sm text-center">Du hast noch keinen Tag aufgenommen</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {myVlogs.map((v, i) => (
                <motion.div key={v.id}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 bg-[#141415] border border-[#2C2C2E] rounded-2xl p-3.5">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                    style={{ background: `${me?.color ?? '#7B61FF'}15` }}>
                    {v.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">Mein Tag</p>
                    <p className="text-xs text-[#8E8E93] mt-0.5">{v.date} · {v.clips} Clips · {v.duration}s</p>
                  </div>
                  {v.status === 'processing' ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" />
                      <span className="text-[10px] text-[#7B61FF] font-medium">Schnitt…</span>
                    </div>
                  ) : (
                    <CheckCircle size={16} className="text-[#2ECC71] flex-shrink-0" />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Logout */}
      <div className="px-5">
        <motion.button whileTap={{ scale: 0.97 }} onClick={signOut}
          className="w-full py-4 rounded-2xl border border-[#2C2C2E] flex items-center justify-center gap-2">
          <LogOut size={15} className="text-red-400" />
          <span className="text-red-400 font-medium text-sm">Abmelden</span>
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Root ProfileView ──────────────────────────────────────────────────────────
export default function ProfileView() {
  const { signOut } = useAuth()
  const [screen, setScreen] = useState('main')

  // Pass signOut properly to ProfileMain
  const wrappedProfileMain = (
    <ProfileMain
      key="main"
      onAddFriend={() => setScreen('add-friend')}
      onSettings={() => setScreen('settings')}
    />
  )

  return (
    <AnimatePresence mode="wait">
      {screen === 'main'       && wrappedProfileMain}
      {screen === 'add-friend' && <AddFriendScreen key="add-friend" onBack={() => setScreen('main')} />}
      {screen === 'settings'   && <SettingsScreen  key="settings"  onBack={() => setScreen('main')} />}
    </AnimatePresence>
  )
}
