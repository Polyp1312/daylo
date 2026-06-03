import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, LogOut, UserPlus, Trash2, Check, X, ChevronLeft, ChevronRight,
  Search, AtSign, Save, Camera, Edit3, Play, MessageCircle, Clock,
  Mail, Lock, CalendarDays, Bell, Eye, EyeOff, Shield, Info,
  Video, AlertTriangle, Palette, Users, KeyRound,
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
const slideUp = {
  initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 }, transition: { duration: 0.24 },
}

const ACCENT_COLORS = [
  '#7B61FF', '#BF5AF2', '#FF6B9D', '#FF453A',
  '#FF9F43', '#FFD60A', '#2ECC71', '#34C759',
  '#00D9FF', '#32ADE6', '#30B0C7', '#FF6B35',
]
const DEFAULT_NOTIF = { friendRequests: true, messages: true, groupMessages: true, vlogUploads: true, dailyReminder: true }

// ── Shared UI atoms ───────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <motion.button
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0"
      style={{ width: 46, height: 28 }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{ backgroundColor: checked ? '#7B61FF' : '#3A3A3C' }}
        transition={{ duration: 0.2 }} />
      <motion.div
        className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-md"
        animate={{ x: checked ? 21 : 3 }}
        transition={{ type: 'spring', damping: 22, stiffness: 360 }} />
    </motion.button>
  )
}

function SettingsSection({ title, children }) {
  return (
    <div className="mb-5">
      {title && (
        <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-2 px-5">
          {title}
        </p>
      )}
      <div className="mx-5 rounded-2xl overflow-hidden"
        style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {children}
      </div>
    </div>
  )
}

function SettingsRow({ icon: Icon, iconBg, iconColor, label, sublabel, value, onTap, toggle, last, dangerous }) {
  return (
    <motion.div
      whileTap={onTap ? { backgroundColor: 'rgba(255,255,255,0.03)' } : {}}
      onClick={onTap}
      className={`flex items-center gap-3 px-4 py-3.5 ${onTap ? 'cursor-pointer active:opacity-70' : ''}`}
      style={{ borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
      {Icon && (
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg ?? 'rgba(123,97,255,0.15)' }}>
          <Icon size={15} style={{ color: iconColor ?? (dangerous ? '#FF453A' : '#fff') }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className={`block text-sm font-semibold ${dangerous ? 'text-red-400' : 'text-white'}`}>
          {label}
        </span>
        {sublabel && <span className="block text-xs text-[#8E8E93] mt-0.5">{sublabel}</span>}
      </div>
      {value !== undefined && (
        <span className="text-sm text-[#8E8E93] flex-shrink-0 truncate max-w-[160px] text-right">{value}</span>
      )}
      {toggle && <Toggle checked={toggle.checked} onChange={toggle.onChange} />}
      {onTap && !toggle && (
        <ChevronRight size={14} className="text-[#3A3A3C] flex-shrink-0" />
      )}
    </motion.div>
  )
}

// ── Change password sub-screen ────────────────────────────────────────────────
function ChangePasswordScreen({ onBack }) {
  const toast = useToast()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [showCur,   setShowCur]   = useState(false)
  const [showNew,   setShowNew]   = useState(false)

  const strength = pw => {
    if (!pw) return 0
    let s = 0
    if (pw.length >= 8)  s++
    if (pw.length >= 12) s++
    if (/[A-Z]/.test(pw)) s++
    if (/[0-9]/.test(pw)) s++
    if (/[^a-zA-Z0-9]/.test(pw)) s++
    return Math.min(s, 4)
  }
  const str = strength(newPw)
  const strColors = ['#3A3A3C','#FF453A','#FF9F43','#FFD60A','#2ECC71']
  const strLabels = ['','Schwach','Mittel','Gut','Stark']

  const save = async () => {
    if (!currentPw || !newPw || !confirmPw) { toast?.show('Alle Felder ausfüllen.', 'error'); return }
    if (newPw !== confirmPw) { toast?.show('Passwörter stimmen nicht überein.', 'error'); return }
    if (newPw.length < 8) { toast?.show('Mindestens 8 Zeichen erforderlich.', 'error'); return }
    setLoading(true)
    const d = await api.auth.changePassword(currentPw, newPw).catch(e => ({ error: e.message }))
    setLoading(false)
    if (d.error) { toast?.show(d.error, 'error'); return }
    toast?.show('Passwort erfolgreich geändert! 🔒', 'success')
    onBack()
  }

  const PwField = ({ label, value, onChange, show, onToggle, autoFocus }) => (
    <div>
      <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 focus-within:border-[#7B61FF]/60 transition-all"
        style={{ background: 'rgba(28,28,30,0.9)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
        <KeyRound size={14} className="text-[#8E8E93] flex-shrink-0" />
        <input
          autoFocus={autoFocus} type={show ? 'text' : 'password'}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          className="flex-1 bg-transparent text-white text-sm outline-none"
          style={{ caretColor: '#7B61FF' }}
          onKeyDown={e => e.key === 'Enter' && save()}
        />
        <motion.button whileTap={{ scale: 0.85 }} onClick={onToggle} className="flex-shrink-0">
          {show ? <EyeOff size={14} className="text-[#8E8E93]" /> : <Eye size={14} className="text-[#8E8E93]" />}
        </motion.button>
      </div>
    </div>
  )

  return (
    <motion.div key="change-pw" {...slide} className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>
      <div className="flex items-center gap-3 px-5 pt-14 pb-6">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <div>
          <span className="text-xl font-black text-white">Passwort ändern</span>
        </div>
      </div>

      <div className="px-5 space-y-4">
        <PwField label="Aktuelles Passwort" value={currentPw} onChange={setCurrentPw}
          show={showCur} onToggle={() => setShowCur(p => !p)} autoFocus />

        <div>
          <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-2">Neues Passwort</p>
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 focus-within:border-[#7B61FF]/60 transition-all mb-2"
            style={{ background: 'rgba(28,28,30,0.9)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
            <KeyRound size={14} className="text-[#8E8E93] flex-shrink-0" />
            <input type={showNew ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)}
              placeholder="••••••••" className="flex-1 bg-transparent text-white text-sm outline-none"
              style={{ caretColor: '#7B61FF' }} onKeyDown={e => e.key === 'Enter' && save()} />
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowNew(p => !p)} className="flex-shrink-0">
              {showNew ? <EyeOff size={14} className="text-[#8E8E93]" /> : <Eye size={14} className="text-[#8E8E93]" />}
            </motion.button>
          </div>
          {/* Strength bar */}
          {newPw.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1 flex-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className="flex-1 h-1 rounded-full transition-all"
                    style={{ background: i <= str ? strColors[str] : 'rgba(58,58,60,0.6)' }} />
                ))}
              </div>
              <span className="text-[10px] font-bold" style={{ color: strColors[str] }}>{strLabels[str]}</span>
            </div>
          )}
        </div>

        <div>
          <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-2">Passwort bestätigen</p>
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all"
            style={{
              background: 'rgba(28,28,30,0.9)',
              border: `1.5px solid ${confirmPw && confirmPw !== newPw ? 'rgba(255,69,58,0.5)' : 'rgba(255,255,255,0.07)'}`,
            }}>
            <KeyRound size={14} className="text-[#8E8E93] flex-shrink-0" />
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              placeholder="••••••••" className="flex-1 bg-transparent text-white text-sm outline-none"
              style={{ caretColor: '#7B61FF' }} onKeyDown={e => e.key === 'Enter' && save()} />
            {confirmPw && confirmPw === newPw && <Check size={14} className="text-[#2ECC71] flex-shrink-0" />}
          </div>
          {confirmPw && confirmPw !== newPw && (
            <p className="text-[11px] text-red-400 mt-1.5">Passwörter stimmen nicht überein</p>
          )}
        </div>

        <motion.button whileTap={{ scale: 0.97 }} onClick={save}
          disabled={loading || !currentPw || !newPw || !confirmPw || newPw !== confirmPw}
          className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-40 mt-2"
          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 20px rgba(123,97,255,0.35)' }}>
          {loading ? 'Speichern…' : 'Passwort ändern'}
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Delete account sub-screen ─────────────────────────────────────────────────
function DeleteAccountScreen({ onBack, onDeleted }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleDelete = async () => {
    if (confirm !== 'LÖSCHEN') { toast?.show('Gib "LÖSCHEN" ein.', 'error'); return }
    if (!password) { toast?.show('Passwort eingeben.', 'error'); return }
    setLoading(true)
    const d = await api.auth.deleteAccount(password).catch(e => ({ error: e.message }))
    setLoading(false)
    if (d.error) { toast?.show(d.error, 'error'); return }
    onDeleted()
  }

  const ready = confirm === 'LÖSCHEN' && password.length > 0

  return (
    <motion.div key="delete-acc" {...slide} className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>
      <div className="flex items-center gap-3 px-5 pt-14 pb-6">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-xl font-black text-white">Konto löschen</span>
      </div>

      <div className="px-5 space-y-4">
        {/* Warning */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5"
          style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.25)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,69,58,0.15)' }}>
              <AlertTriangle size={18} className="text-red-400" />
            </div>
            <p className="text-white font-black text-sm">Dieser Schritt ist unumkehrbar</p>
          </div>
          <ul className="space-y-1.5">
            {[
              'Alle Vlogs und Videos',
              'Alle Nachrichten und Gruppenverläufe',
              'Alle Freundschaften und Gruppen',
              'Dein gesamtes Konto und Profil',
            ].map(item => (
              <li key={item} className="flex items-center gap-2 text-xs text-[#8E8E93]">
                <X size={10} className="text-red-400 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Password field */}
        <div>
          <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-2">Passwort bestätigen</p>
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
            style={{ background: 'rgba(28,28,30,0.9)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
            <KeyRound size={14} className="text-[#8E8E93] flex-shrink-0" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Dein Passwort"
              className="flex-1 bg-transparent text-white text-sm outline-none"
              style={{ caretColor: '#FF453A' }} />
          </div>
        </div>

        {/* Confirmation text */}
        <div>
          <p className="text-xs text-[#8E8E93] mb-2">
            Tippe <span className="font-black text-red-400">LÖSCHEN</span> zur Bestätigung
          </p>
          <div className="rounded-2xl px-4 py-3.5"
            style={{
              background: 'rgba(28,28,30,0.9)',
              border: `1.5px solid ${confirm === 'LÖSCHEN' ? 'rgba(255,69,58,0.6)' : 'rgba(255,255,255,0.07)'}`,
            }}>
            <input value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="LÖSCHEN"
              className="w-full bg-transparent text-red-400 text-sm font-bold outline-none tracking-widest"
              style={{ caretColor: '#FF453A' }} />
          </div>
        </div>

        <motion.button whileTap={{ scale: 0.97 }} onClick={handleDelete}
          disabled={!ready || loading}
          className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-40"
          style={{ background: ready ? '#FF453A' : 'rgba(255,69,58,0.4)' }}>
          {loading ? 'Löschen…' : '🗑️ Konto endgültig löschen'}
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Main settings screen ──────────────────────────────────────────────────────
function SettingsScreen({ onBack }) {
  const { user, updateUser, signOut } = useAuth()
  const { me } = useApp()
  const toast  = useToast()
  const fileRef = useRef(null)

  const [subView, setSubView] = useState('main')

  // Profile fields
  const [username,   setUsername]   = useState(user?.username ?? '')
  const [bio,        setBio]        = useState(user?.bio ?? '')
  const [accentColor, setAccentColor] = useState(user?.color ?? me?.color ?? '#7B61FF')
  const [avatarSrc,  setAvatarSrc]  = useState(avatarUrl(user?.avatar))
  const [avatarLoad, setAvatarLoad] = useState(false)

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try { return { ...DEFAULT_NOTIF, ...JSON.parse(user?.notif_prefs || '{}') } }
    catch { return { ...DEFAULT_NOTIF } }
  })

  // Privacy
  const [searchable, setSearchable] = useState(user?.searchable !== false)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => { setAvatarSrc(avatarUrl(user?.avatar)) }, [user?.avatar])

  const saveProfile = async () => {
    if (saving) return
    setSaving(true)
    const tasks = []

    if (username.trim() && username !== user?.username) {
      tasks.push(
        api.updateUsername(username.trim()).then(d => {
          if (d.error) throw new Error(d.error)
          updateUser(d.user, d.token)
        })
      )
    }

    const settingsBody = {}
    if (bio.trim() !== (user?.bio ?? '')) settingsBody.bio = bio.trim()
    if (accentColor !== (user?.color ?? me?.color)) settingsBody.color = accentColor
    if (Object.keys(settingsBody).length) {
      tasks.push(api.auth.settings(settingsBody).then(() => {
        updateUser({ ...user, ...settingsBody }, null)
      }))
    }

    if (!tasks.length) { setSaving(false); toast?.show('Keine Änderungen.', 'info'); return }

    try {
      await Promise.all(tasks)
      setSaved(true)
      toast?.show('Profil gespeichert!', 'success')
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      toast?.show(err.message || 'Fehler beim Speichern.', 'error')
    }
    setSaving(false)
  }

  const toggleNotif = async key => {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] }
    setNotifPrefs(next)
    await api.auth.settings({ notifPrefs: next }).catch(() => {})
  }

  const toggleSearchable = async () => {
    const next = !searchable
    setSearchable(next)
    await api.auth.settings({ searchable: next }).catch(() => {
      setSearchable(!next)
    })
  }

  const pickAccentColor = async color => {
    setAccentColor(color)
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
      setAvatarSrc(url + '?t=' + Date.now())
      updateUser({ ...user, avatar: url }, null)
      toast?.show('Profilbild aktualisiert!', 'success')
    } catch (err) {
      setAvatarSrc(avatarUrl(user?.avatar))
      toast?.show(err.message || 'Upload fehlgeschlagen.', 'error')
    }
    setAvatarLoad(false)
    URL.revokeObjectURL(preview)
  }

  const initials = (user?.username ?? 'ME').slice(0, 2).toUpperCase()
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'

  const profileDirty = (username.trim() && username !== user?.username) ||
    bio.trim() !== (user?.bio ?? '') ||
    accentColor !== (user?.color ?? me?.color ?? '#7B61FF')

  return (
    <AnimatePresence mode="wait">
      {subView === 'main' && (
        <motion.div key="settings-main" {...slide} className="min-h-screen pb-28 overflow-x-hidden" style={{ background: '#0A0A0B' }}>

          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-14 pb-6">
            <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
              className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
              <ChevronLeft size={18} className="text-white" />
            </motion.button>
            <div className="flex-1">
              <span className="text-xl font-black text-white">Einstellungen</span>
            </div>
          </div>

          {/* ─ Profile card ─ */}
          <div className="px-5 mb-6">
            <div className="rounded-3xl p-5 relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${accentColor}18 0%, rgba(0,217,255,0.04) 100%)`,
                border: `1px solid ${accentColor}30`,
              }}>
              {/* Glow */}
              <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl pointer-events-none"
                style={{ background: `${accentColor}25` }} />

              <div className="relative flex items-start gap-4">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  <div className="relative cursor-pointer" onClick={() => fileRef.current?.click()}>
                    <div className="w-[76px] h-[76px] rounded-2xl overflow-hidden border-2"
                      style={{ borderColor: accentColor + '60' }}>
                      {avatarSrc
                        ? <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-white font-black text-xl"
                            style={{ background: `linear-gradient(135deg, ${accentColor}, #00D9FF)` }}>
                            {initials}
                          </div>
                      }
                    </div>
                    <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl flex items-center justify-center border-2 border-[#0A0A0B]"
                      style={{ background: `linear-gradient(135deg, ${accentColor}, #00D9FF)` }}>
                      {avatarLoad
                        ? <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        : <Camera size={12} className="text-white" />}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  </div>
                </div>

                {/* Username + bio */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 focus-within:border-opacity-100 transition-all"
                    style={{ background: 'rgba(28,28,30,0.7)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
                    <AtSign size={13} className="text-[#8E8E93] flex-shrink-0" />
                    <input
                      value={username}
                      onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                      placeholder="Nutzername…"
                      className="flex-1 bg-transparent text-white text-sm font-semibold outline-none"
                      style={{ caretColor: accentColor }}
                    />
                  </div>
                  <div className="rounded-xl px-3 py-2.5 transition-all"
                    style={{ background: 'rgba(28,28,30,0.7)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
                    <textarea
                      value={bio} onChange={e => setBio(e.target.value)} rows={2} maxLength={120}
                      placeholder="Bio — kurz vorstellen…"
                      className="w-full bg-transparent text-white text-xs outline-none resize-none leading-relaxed placeholder-[#3A3A3C]"
                      style={{ caretColor: accentColor }}
                    />
                    <p className="text-[9px] text-right mt-0.5" style={{ color: bio.length > 100 ? '#FF9F43' : '#3A3A3C' }}>
                      {bio.length}/120
                    </p>
                  </div>
                </div>
              </div>

              {/* Accent color picker */}
              <div className="mt-4">
                <p className="text-[10px] text-[#8E8E93] font-bold uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                  <Palette size={10} />
                  Akzentfarbe
                </p>
                <div className="flex gap-2 flex-wrap">
                  {ACCENT_COLORS.map(c => (
                    <motion.button key={c} whileTap={{ scale: 0.82 }}
                      onClick={() => pickAccentColor(c)}
                      className="w-7 h-7 rounded-full relative"
                      style={{ background: c, boxShadow: accentColor === c ? `0 0 0 2px #0A0A0B, 0 0 0 4px ${c}` : 'none' }}>
                      {accentColor === c && (
                        <Check size={12} className="text-white absolute inset-0 m-auto" />
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Save button */}
              <motion.button whileTap={{ scale: 0.97 }} onClick={saveProfile}
                disabled={saving || !profileDirty}
                className="w-full mt-4 py-3 rounded-2xl font-black text-white text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: saved ? '#2ECC71' : `linear-gradient(135deg, ${accentColor}, #00D9FF)` }}>
                {saving ? (
                  <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Speichern…</>
                ) : saved ? (
                  <><Check size={14} /> Gespeichert!</>
                ) : (
                  <><Save size={14} /> Profil speichern</>
                )}
              </motion.button>
            </div>
          </div>

          {/* ─ Konto ─ */}
          <SettingsSection title="Konto">
            <SettingsRow icon={Mail} iconBg="rgba(0,217,255,0.15)" iconColor="#00D9FF"
              label="E-Mail" value={user?.email} />
            <SettingsRow icon={KeyRound} iconBg="rgba(123,97,255,0.15)" iconColor="#7B61FF"
              label="Passwort ändern"
              sublabel="Regelmäßig ändern für mehr Sicherheit"
              onTap={() => setSubView('change-password')} />
            <SettingsRow icon={CalendarDays} iconBg="rgba(46,204,113,0.15)" iconColor="#2ECC71"
              label="Mitglied seit" value={memberSince} last />
          </SettingsSection>

          {/* ─ Benachrichtigungen ─ */}
          <SettingsSection title="Benachrichtigungen">
            <SettingsRow icon={UserPlus} iconBg="rgba(123,97,255,0.15)" iconColor="#7B61FF"
              label="Freundschaftsanfragen"
              sublabel="Wenn jemand dir eine Anfrage sendet"
              toggle={{ checked: notifPrefs.friendRequests, onChange: () => toggleNotif('friendRequests') }} />
            <SettingsRow icon={MessageCircle} iconBg="rgba(0,217,255,0.15)" iconColor="#00D9FF"
              label="Neue Nachrichten"
              sublabel="Direkte Nachrichten von Freunden"
              toggle={{ checked: notifPrefs.messages, onChange: () => toggleNotif('messages') }} />
            <SettingsRow icon={Users} iconBg="rgba(191,90,242,0.15)" iconColor="#BF5AF2"
              label="Gruppen-Aktivität"
              sublabel="Nachrichten in deinen Gruppen"
              toggle={{ checked: notifPrefs.groupMessages, onChange: () => toggleNotif('groupMessages') }} />
            <SettingsRow icon={Video} iconBg="rgba(255,159,67,0.15)" iconColor="#FF9F43"
              label="Vlog-Uploads"
              sublabel="Wenn ein Freund seinen Tag postet"
              toggle={{ checked: notifPrefs.vlogUploads, onChange: () => toggleNotif('vlogUploads') }} />
            <SettingsRow icon={Bell} iconBg="rgba(52,199,89,0.15)" iconColor="#34C759"
              label="Tägliche Erinnerung"
              sublabel="Abends: hast du heute aufgenommen?"
              toggle={{ checked: notifPrefs.dailyReminder, onChange: () => toggleNotif('dailyReminder') }}
              last />
          </SettingsSection>

          {/* ─ Datenschutz ─ */}
          <SettingsSection title="Datenschutz">
            <SettingsRow icon={Search} iconBg="rgba(50,173,230,0.15)" iconColor="#32ADE6"
              label="In Suche auffindbar"
              sublabel="Andere können dich nach Name suchen"
              toggle={{ checked: searchable, onChange: toggleSearchable }} />
            <SettingsRow icon={Shield} iconBg="rgba(46,204,113,0.15)" iconColor="#2ECC71"
              label="Passwort-geschützt"
              sublabel="Dein Account ist verschlüsselt gespeichert"
              value="Aktiv" last />
          </SettingsSection>

          {/* ─ Über ─ */}
          <SettingsSection title="Über daylo">
            <SettingsRow icon={Info} iconBg="rgba(123,97,255,0.15)" iconColor="#7B61FF"
              label="Version" value="1.0.0" />
            <SettingsRow icon={Mail} iconBg="rgba(255,107,61,0.15)" iconColor="#FF6B35"
              label="Feedback senden"
              sublabel="Hilf uns, daylo zu verbessern"
              onTap={() => {
                window.location.href = 'mailto:feedback@daylo.app?subject=daylo Feedback'
              }} last />
          </SettingsSection>

          {/* ─ Aktionen ─ */}
          <div className="px-5 space-y-3 pb-4">
            <motion.button whileTap={{ scale: 0.97 }} onClick={signOut}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2"
              style={{ background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.22)' }}>
              <LogOut size={15} className="text-orange-400" />
              <span className="text-orange-400 font-bold text-sm">Abmelden</span>
            </motion.button>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setSubView('delete-account')}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2"
              style={{ background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.18)' }}>
              <Trash2 size={15} className="text-red-400" />
              <span className="text-red-400 font-bold text-sm">Konto löschen</span>
            </motion.button>
          </div>
        </motion.div>
      )}

      {subView === 'change-password' && (
        <ChangePasswordScreen key="change-pw" onBack={() => setSubView('main')} />
      )}
      {subView === 'delete-account' && (
        <DeleteAccountScreen key="delete-acc" onBack={() => setSubView('main')} onDeleted={signOut} />
      )}
    </AnimatePresence>
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
    if (s === 'friend')   return { label: 'Befreundet',     cls: 'text-[#2ECC71]', bg: 'rgba(46,204,113,0.15)', border: 'rgba(46,204,113,0.3)', disabled: true,  icon: <Check size={11}/> }
    if (s === 'sent')     return { label: 'Gesendet',       cls: 'text-[#8E8E93]', bg: 'rgba(58,58,60,0.6)',    border: 'rgba(58,58,60,0.6)',   disabled: true,  icon: <Check size={11}/> }
    if (s === 'accepted') return { label: 'Befreundet',     cls: 'text-[#2ECC71]', bg: 'rgba(46,204,113,0.15)', border: 'rgba(46,204,113,0.3)', disabled: true,  icon: <Check size={11}/> }
    if (s === 'incoming') return { label: 'Annehmen',       cls: 'text-white',     bg: '#2ECC71',               border: '#2ECC71',              disabled: false, icon: <Check size={11}/> }
    return                       { label: 'Anfrage senden', cls: 'text-white',     bg: '#7B61FF',               border: '#7B61FF',              disabled: false, icon: <UserPlus size={11}/> }
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

// ── Friend profile screen ─────────────────────────────────────────────────────
function FriendProfileScreen({ friend, onBack, onMessage }) {
  const { presences } = useApp()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.users.profile(friend.id).then(d => {
      if (!d.error) setProfile(d)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [friend.id])

  const isOnline = presences[friend.id] && Date.now() - presences[friend.id] < 2 * 60_000

  return (
    <motion.div key="friend-profile" {...slide} className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>
      <div className="flex items-center gap-3 px-5 pt-14 pb-5">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-xl font-black text-white">Profil</span>
      </div>
      <div className="px-5 flex flex-col items-center gap-4 mb-6">
        <div className="relative">
          <UserAvatar user={friend} size={88} fontSize={28} />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0A0A0B]"
            style={{ background: isOnline ? '#2ECC71' : '#3A3A3C' }} />
        </div>
        <div className="text-center">
          <h2 className="text-white font-black text-[22px]">{friend.name}</h2>
          <p className="text-xs font-semibold mt-1" style={{ color: isOnline ? '#2ECC71' : '#8E8E93' }}>
            {isOnline ? '● Online' : '○ Offline'}
          </p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => onMessage?.(friend)}
          className="flex items-center gap-2 px-6 py-2.5 rounded-2xl font-bold text-white text-sm"
          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 16px rgba(123,97,255,0.4)' }}>
          <MessageCircle size={14} className="text-white" />
          Nachricht schreiben
        </motion.button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: '#7B61FF', borderTopColor: 'transparent' }} />
        </div>
      ) : profile && (
        <div className="px-5 space-y-4">
          <div className="flex gap-2">
            {[
              { label: 'Vlogs',  value: profile.vlogCount,                                  color: '#7B61FF' },
              { label: 'Streak', value: profile.streak > 0 ? `🔥 ${profile.streak}` : '0', color: '#FF9F43' },
            ].map(s => (
              <div key={s.label} className="flex-1 flex flex-col items-center gap-1 py-5 rounded-2xl"
                style={{ background: `${s.color}12`, border: `1px solid ${s.color}20` }}>
                <span className="font-black text-2xl leading-tight" style={{ color: s.color }}>{s.value}</span>
                <span className="text-[10px] font-semibold text-[#8E8E93]">{s.label}</span>
              </div>
            ))}
          </div>
          {profile.mutualGroups?.length > 0 && (
            <div className="rounded-2xl p-4"
              style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-3">
                Gemeinsame Gruppen · {profile.mutualGroups.length}
              </p>
              <div className="space-y-2.5">
                {profile.mutualGroups.map(g => (
                  <div key={g.id} className="flex items-center gap-3">
                    <span className="text-2xl">{g.emoji}</span>
                    <span className="text-sm font-semibold text-white">{g.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

// ── Main profile screen ───────────────────────────────────────────────────────
function ProfileMain({ onAddFriend, onSettings, onReveal, onOpenMessage, onViewFriend }) {
  const { me, friends, requests, groups, myVlogs, myStreak, presences, acceptRequest, declineRequest, removeFriend } = useApp()
  const { user, signOut } = useAuth()
  const toast = useToast()
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [sentRequests,  setSentRequests]  = useState([])

  useEffect(() => {
    api.friends.sent().then(d => { if (d.sent) setSentRequests(d.sent.map(formatUser)) }).catch(() => {})
  }, [])

  const handleCancelRequest = async id => {
    await api.friends.cancelRequest(id).catch(() => {})
    setSentRequests(p => p.filter(r => r.id !== id))
    toast?.show('Anfrage zurückgezogen.', 'info')
  }

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

  const onlineFriends = friends.filter(f => {
    const ts = presences[f.id]
    return ts && Date.now() - ts < 2 * 60_000
  })

  const STATS = [
    { label: 'Vlogs',   value: myVlogs.length,  color: '#7B61FF' },
    { label: 'Streak',  value: myStreak > 0 ? `${myStreak}` : '0', color: '#FF9F43' },
    { label: 'Freunde', value: friends.length,   color: '#00D9FF' },
    { label: 'Gruppen', value: groups.length,    color: '#2ECC71' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.28 }}
      className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>

      {/* Banner */}
      <div className="relative">
        <div className="h-44 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${me?.color ?? '#7B61FF'}55 0%, rgba(0,217,255,0.25) 100%)` }}>
          <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full blur-3xl pointer-events-none"
            style={{ background: `${me?.color ?? '#7B61FF'}50` }} />
          <div className="absolute -bottom-6 right-0 w-36 h-36 rounded-full blur-2xl pointer-events-none"
            style={{ background: 'rgba(0,217,255,0.35)' }} />
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")' }} />
          <div className="absolute top-14 right-5 z-10">
            <motion.button whileTap={{ scale: 0.88 }} onClick={onSettings}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <Settings size={16} className="text-white/80" />
            </motion.button>
          </div>
        </div>

        <div className="px-5 flex items-end justify-between -mt-12 relative z-10 mb-4">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => onReveal?.(user?.id)}>
            <div className="relative">
              <div className="w-[88px] h-[88px] rounded-[24px] overflow-hidden"
                style={{ border: '3px solid #0A0A0B', boxShadow: `0 0 28px ${me?.color ?? '#7B61FF'}55, 0 8px 24px rgba(0,0,0,0.6)` }}>
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
          <div className="flex gap-2 mb-1">
            <motion.button whileTap={{ scale: 0.96 }} onClick={onAddFriend}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 16px rgba(123,97,255,0.4)' }}>
              <UserPlus size={14} className="text-white" />
              <span className="text-white">Hinzufügen</span>
            </motion.button>
          </div>
        </div>

        <div className="px-5">
          <h2 className="text-white font-black text-[22px] leading-tight">{displayName}</h2>
          {user?.bio
            ? <p className="text-[#8E8E93] text-sm mt-0.5 mb-0.5">{user.bio}</p>
            : <p className="text-[#8E8E93] text-sm mt-0.5">{displayEmail}</p>
          }
          <div className="flex mt-5 pb-5 gap-1"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {STATS.map((s, i) => (
              <motion.div key={s.label}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className="flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl"
                style={{ background: `${s.color}12`, border: `1px solid ${s.color}20` }}>
                <span className="font-black text-xl leading-tight" style={{ color: s.color }}>
                  {s.label === 'Streak' && myStreak > 0 ? s.value : s.value}
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

      {/* Online friends */}
      <AnimatePresence>
        {onlineFriends.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} className="px-5 mt-5 overflow-hidden">
            <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2ECC71] inline-block" />
              Gerade online · {onlineFriends.length}
            </p>
            <div className="flex gap-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {onlineFriends.map(f => (
                <motion.button key={f.id} whileTap={{ scale: 0.94 }}
                  onClick={() => onOpenMessage?.(f)}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <div className="relative">
                    <UserAvatar user={f} size={46} />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0A0A0B]"
                      style={{ background: '#2ECC71' }} />
                  </div>
                  <span className="text-[10px] text-[#8E8E93] font-medium truncate max-w-[50px] text-center">{f.name}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friend requests */}
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
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ delay: i * 0.05 }}
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

      {/* Sent requests */}
      <AnimatePresence>
        {sentRequests.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} className="px-5 mt-5 overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-black text-white">Gesendete Anfragen</span>
              <span className="text-xs text-[#8E8E93] font-semibold">{sentRequests.length}</span>
            </div>
            <div className="space-y-2">
              {sentRequests.map((u, i) => (
                <motion.div key={u.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 rounded-2xl p-3.5"
                  style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <UserAvatar user={u} size={42} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{u.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock size={10} className="text-[#8E8E93]" />
                      <p className="text-xs text-[#8E8E93]">Anfrage ausstehend</p>
                    </div>
                  </div>
                  <motion.button whileTap={{ scale: 0.85 }} onClick={() => handleCancelRequest(u.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.25)', color: '#FF453A' }}>
                    Zurückziehen
                  </motion.button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friends list */}
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
                    className="flex items-center gap-3 rounded-2xl p-3.5 cursor-pointer"
                    style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(255,255,255,0.05)' }}
                    onClick={() => onViewFriend?.(u)}>
                    <div className="relative flex-shrink-0">
                      <UserAvatar user={u} size={46} />
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                        style={{ background: status.online ? '#2ECC71' : '#3A3A3C', borderColor: '#0A0A0B' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{u.name}</p>
                      <p className="text-xs font-medium mt-0.5" style={{ color: status.online ? '#2ECC71' : '#8E8E93' }}>
                        {status.label}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <motion.button whileTap={{ scale: 0.85 }} onClick={() => onOpenMessage?.(u)}
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(123,97,255,0.15)', border: '1px solid rgba(123,97,255,0.25)' }}>
                        <MessageCircle size={13} className="text-[#7B61FF]" />
                      </motion.button>
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
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* My vlogs */}
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
export default function ProfileView({ onReveal, onOpenMessage }) {
  const [screen,  setScreen]  = useState('main')
  const [friendForProfile, setFriendForProfile] = useState(null)

  return (
    <AnimatePresence mode="wait">
      {screen === 'main' && (
        <ProfileMain key="main"
          onAddFriend={() => setScreen('add-friend')}
          onSettings={() => setScreen('settings')}
          onReveal={onReveal}
          onOpenMessage={onOpenMessage}
          onViewFriend={f => { setFriendForProfile(f); setScreen('friend-profile') }} />
      )}
      {screen === 'add-friend' && (
        <AddFriendScreen key="add-friend" onBack={() => setScreen('main')} />
      )}
      {screen === 'settings' && (
        <SettingsScreen key="settings" onBack={() => setScreen('main')} />
      )}
      {screen === 'friend-profile' && friendForProfile && (
        <FriendProfileScreen key={`fp-${friendForProfile.id}`}
          friend={friendForProfile}
          onBack={() => setScreen('main')}
          onMessage={f => { onOpenMessage?.(f); setScreen('main') }} />
      )}
    </AnimatePresence>
  )
}
