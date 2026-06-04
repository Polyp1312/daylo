import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ChevronLeft, AlertCircle, CheckCircle, RefreshCw, Hash, AtSign, KeyRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const slide = (dir = 1) => ({
  initial:    { opacity: 0, x: dir * 36 },
  animate:    { opacity: 1, x: 0 },
  exit:       { opacity: 0, x: dir * -36 },
  transition: { duration: 0.26, ease: [0.4, 0, 0.2, 1] },
})

// ── Input field ───────────────────────────────────────────────────────────────
function Input({ icon: Icon, type = 'text', placeholder, value, onChange, action, autoFocus }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 focus-within:border-[#7B61FF] transition-all"
      style={{
        background: 'rgba(28,28,30,0.8)',
        border: '1.5px solid rgba(255,255,255,0.07)',
      }}>
      <Icon size={16} className="text-[#8E8E93] flex-shrink-0" />
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        autoFocus={autoFocus}
        className="flex-1 bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none"
        autoCapitalize="none" autoCorrect="off"
        style={{ caretColor: '#7B61FF' }}
      />
      {action}
    </div>
  )
}

function ErrorBox({ msg }) {
  if (!msg) return null
  return (
    <motion.div initial={{ opacity: 0, y: -6, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
      className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-2xl px-4 py-3 overflow-hidden">
      <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-red-400 text-sm leading-snug">{msg}</p>
    </motion.div>
  )
}

// ── Floating orb ─────────────────────────────────────────────────────────────
function Orb({ color, size, top, left, right, bottom, delay = 0, duration = 16 }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size, height: size,
        top, left, right, bottom,
        background: `radial-gradient(circle, ${color}, transparent 70%)`,
        filter: 'blur(40px)',
      }}
      animate={{ scale: [1, 1.2, 0.9, 1.1, 1], opacity: [0.6, 0.9, 0.5, 0.8, 0.6] }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  )
}

// ── Welcome ───────────────────────────────────────────────────────────────────
function Welcome({ onLogin, onRegister }) {
  const FEATURES = [
    { icon: '🎬', text: '60 Sekunden täglich aufnehmen' },
    { icon: '✨', text: 'KI-Schnitt & Filter inklusive' },
    { icon: '👥', text: 'Deine Crew sieht deinen Tag' },
  ]

  return (
    <motion.div key="welcome" {...slide(0)}
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: '#060608' }}>

      {/* Ambient orbs */}
      <Orb color="#7B61FF55" size={400} top="-10%" left="-20%" duration={18} />
      <Orb color="#00D9FF33" size={320} bottom="20%" right="-15%" delay={5} duration={14} />
      <Orb color="#FF6B9D22" size={240} top="40%" right="10%" delay={8} duration={20} />

      {/* Subtle grid overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
        backgroundSize: '44px 44px',
      }} />

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pt-20 pb-10">

        {/* Logo */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 14, stiffness: 160, delay: 0.1 }}
          className="relative mb-8">

          {/* Pulse rings */}
          {[1.35, 1.65].map((s, i) => (
            <motion.div key={i}
              className="absolute inset-0 rounded-[32px]"
              style={{ border: `1.5px solid rgba(123,97,255,${0.35 - i * 0.15})` }}
              animate={{ scale: [1, s, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
            />
          ))}

          <div className="w-28 h-28 rounded-[32px] flex items-center justify-center relative"
            style={{
              background: 'linear-gradient(135deg, #7B61FF 0%, #00D9FF 100%)',
              boxShadow: '0 0 60px rgba(123,97,255,0.55), 0 0 120px rgba(0,217,255,0.15), 0 20px 48px rgba(0,0,0,0.5)',
            }}>
            <span className="text-5xl select-none">🎬</span>
          </div>
        </motion.div>

        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="text-center mb-10">
          <div className="flex items-baseline gap-0.5 justify-center mb-3">
            <span className="font-black tracking-tighter text-white" style={{ fontSize: 52, lineHeight: 1 }}>daylo</span>
            <span className="font-black text-[#7B61FF]" style={{ fontSize: 52, lineHeight: 1 }}>.</span>
          </div>
          <p className="text-[#8E8E93] text-base font-medium">Jeden Tag. Eine Person. Dein Leben.</p>
        </motion.div>

        {/* Feature highlights */}
        <div className="w-full space-y-2.5">
          {FEATURES.map((f, i) => (
            <motion.div key={f.text}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
              className="flex items-center gap-3.5 px-4 py-3 rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                backdropFilter: 'blur(8px)',
              }}>
              <span className="text-xl select-none">{f.icon}</span>
              <span className="text-white/75 text-sm font-medium">{f.text}</span>
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#7B61FF]/60 flex-shrink-0" />
            </motion.div>
          ))}
        </div>
      </div>

      {/* CTA buttons */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75, duration: 0.45 }}
        className="px-6 pb-14 space-y-3">
        <motion.button whileTap={{ scale: 0.97 }} onClick={onRegister}
          className="w-full py-4 rounded-2xl font-black text-white text-base relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #7B61FF 0%, #00D9FF 100%)',
            boxShadow: '0 0 32px rgba(123,97,255,0.45), 0 8px 24px rgba(0,0,0,0.4)',
          }}>
          <span className="relative z-10">Jetzt loslegen →</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={onLogin}
          className="w-full py-4 rounded-2xl font-semibold text-sm"
          style={{
            color: 'rgba(255,255,255,0.6)',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
          Ich habe schon ein Konto
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

// ── Shared form container ─────────────────────────────────────────────────────
function FormPage({ children, ...animProps }) {
  return (
    <motion.div {...animProps}
      className="min-h-screen flex flex-col px-6 pt-14 pb-10 relative overflow-hidden"
      style={{ background: '#0A0A0B' }}>
      {/* Subtle top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-48 rounded-full blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(123,97,255,0.12), transparent 70%)' }} />
      <div className="relative flex-1 flex flex-col">{children}</div>
    </motion.div>
  )
}

// ── Register ──────────────────────────────────────────────────────────────────
function Register({ onBack, onSuccess }) {
  const { signUp } = useAuth()
  const [username, setUsername] = useState('')
  const [email,    setEmail]    = useState('')
  const [pw,       setPw]       = useState('')
  const [pwConf,   setPwConf]   = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const checks = [
    { label: 'Mindestens 8 Zeichen',       ok: pw.length >= 8 },
    { label: 'Passwörter stimmen überein', ok: pw === pwConf && pwConf.length > 0 },
  ]

  const validate = () => {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return 'Nutzername: 3–20 Zeichen, nur Buchstaben, Zahlen und _'
    if (!email.includes('@'))                    return 'Bitte eine gültige E-Mail-Adresse eingeben.'
    if (pw.length < 8)                           return 'Passwort muss mindestens 8 Zeichen lang sein.'
    if (pw !== pwConf)                           return 'Passwörter stimmen nicht überein.'
    return null
  }

  const handleSubmit = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setLoading(true); setError('')
    const data = await signUp(email, pw, username)
    setLoading(false)
    if (data.error) { setError(data.error); return }
    onSuccess(email, data.previewUrl)
  }

  const eyeBtn = (
    <button type="button" onClick={() => setShowPw(p => !p)} className="ml-1 p-0.5">
      {showPw
        ? <EyeOff size={15} className="text-[#8E8E93]" />
        : <Eye    size={15} className="text-[#8E8E93]" />}
    </button>
  )

  return (
    <FormPage key="register" {...slide(1)}>
      <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
        className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-8 self-start">
        <ChevronLeft size={18} className="text-white" />
      </motion.button>

      <div className="mb-8">
        <h1 className="text-white text-[32px] font-black tracking-tight mb-1.5">Konto erstellen</h1>
        <p className="text-[#8E8E93] text-sm">Kostenlos · Keine Kreditkarte nötig</p>
      </div>

      <div className="space-y-2.5 mb-3">
        <Input icon={AtSign} placeholder="Nutzername (z.B. niclas_23)"
          value={username} autoFocus
          onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))} />
        <Input icon={Mail} type="email" placeholder="E-Mail-Adresse"
          value={email} onChange={e => setEmail(e.target.value)} />
        <Input icon={Lock} type={showPw ? 'text' : 'password'} placeholder="Passwort (min. 8 Zeichen)"
          value={pw} onChange={e => setPw(e.target.value)} action={eyeBtn} />
        <Input icon={Lock} type={showPw ? 'text' : 'password'} placeholder="Passwort bestätigen"
          value={pwConf} onChange={e => setPwConf(e.target.value)} />
      </div>

      <ErrorBox msg={error} />

      <AnimatePresence>
        {pw.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-2 overflow-hidden">
            {checks.map(r => (
              <motion.div key={r.label}
                animate={{ color: r.ok ? '#2ECC71' : '#8E8E93' }}
                className="flex items-center gap-2">
                <motion.div
                  animate={{ backgroundColor: r.ok ? '#2ECC71' : '#3A3A3C' }}
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0">
                  {r.ok && <CheckCircle size={10} className="text-white" />}
                </motion.div>
                <span className="text-xs font-medium">{r.label}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-h-8" />

      <motion.button whileTap={{ scale: 0.97 }} onClick={handleSubmit} disabled={loading}
        className="w-full py-4 rounded-2xl font-black text-white text-base mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 24px rgba(123,97,255,0.35)' }}>
        {loading
          ? <><RefreshCw size={16} className="animate-spin" /> Wird erstellt…</>
          : 'Konto erstellen →'}
      </motion.button>
    </FormPage>
  )
}

// ── Forgot Password ───────────────────────────────────────────────────────────
function ForgotPassword({ onBack }) {
  const [step,    setStep]    = useState('email')  // 'email' | 'code' | 'done'
  const [email,   setEmail]   = useState('')
  const [code,    setCode]    = useState('')
  const [pw,      setPw]      = useState('')
  const [pwConf,  setPwConf]  = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleSendCode = async () => {
    if (!email.includes('@')) { setError('Bitte eine gültige E-Mail eingeben.'); return }
    setLoading(true); setError('')
    await api.forgotPassword(email)
    setLoading(false)
    setStep('code')
  }

  const handleReset = async () => {
    if (code.length !== 6) { setError('Bitte den 6-stelligen Code eingeben.'); return }
    if (pw.length < 8)     { setError('Passwort muss mindestens 8 Zeichen haben.'); return }
    if (pw !== pwConf)     { setError('Passwörter stimmen nicht überein.'); return }
    setLoading(true); setError('')
    const d = await api.resetPassword(email, code, pw)
    setLoading(false)
    if (d.error) { setError(d.error); return }
    setStep('done')
  }

  if (step === 'done') return (
    <FormPage key="fp-done" {...slide(1)}>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-[#2ECC71]/15 border border-[#2ECC71]/30 flex items-center justify-center">
          <CheckCircle size={36} className="text-[#2ECC71]" />
        </div>
        <div>
          <h2 className="text-white font-black text-2xl mb-2">Passwort geändert!</h2>
          <p className="text-[#8E8E93] text-sm">Du kannst dich jetzt mit deinem neuen Passwort anmelden.</p>
        </div>
        <motion.button whileTap={{ scale: 0.97 }} onClick={onBack}
          className="w-full py-4 rounded-2xl font-black text-white"
          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
          Zum Login →
        </motion.button>
      </div>
    </FormPage>
  )

  return (
    <FormPage key="forgot-pw" {...slide(1)}>
      <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
        className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-8 self-start">
        <ChevronLeft size={18} className="text-white" />
      </motion.button>

      <div className="mb-8">
        <h1 className="text-white text-[30px] font-black tracking-tight mb-1.5">Passwort vergessen</h1>
        <p className="text-[#8E8E93] text-sm">
          {step === 'email'
            ? 'Wir schicken dir einen Reset-Code per E-Mail.'
            : 'Gib den Code und dein neues Passwort ein.'}
        </p>
      </div>

      {step === 'email' && (
        <div className="space-y-3">
          <Input icon={Mail} type="email" placeholder="E-Mail-Adresse" autoFocus
            value={email} onChange={e => setEmail(e.target.value)} />
          <ErrorBox msg={error} />
          <div className="flex-1 min-h-8" />
          <motion.button whileTap={{ scale: 0.97 }} onClick={handleSendCode} disabled={loading}
            className="w-full py-4 rounded-2xl font-black text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Senden…</> : 'Code senden →'}
          </motion.button>
        </div>
      )}

      {step === 'code' && (
        <div className="space-y-3">
          <div className="rounded-2xl px-4 py-3 text-center"
            style={{ background: 'rgba(123,97,255,0.1)', border: '1px solid rgba(123,97,255,0.25)' }}>
            <p className="text-[#7B61FF] text-sm font-semibold">Code an <span className="text-white">{email}</span> gesendet</p>
          </div>
          <Input icon={Hash} placeholder="6-stelliger Code" autoFocus
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,6))} />
          <Input icon={Lock} type={showPw ? 'text' : 'password'} placeholder="Neues Passwort"
            value={pw} onChange={e => setPw(e.target.value)}
            action={<button type="button" onClick={() => setShowPw(p => !p)} className="ml-1 p-0.5">
              {showPw ? <EyeOff size={15} className="text-[#8E8E93]" /> : <Eye size={15} className="text-[#8E8E93]" />}
            </button>} />
          <Input icon={Lock} type="password" placeholder="Passwort bestätigen"
            value={pwConf} onChange={e => setPwConf(e.target.value)} />
          <ErrorBox msg={error} />
          <motion.button whileTap={{ scale: 0.97 }} onClick={handleReset} disabled={loading}
            className="w-full py-4 rounded-2xl font-black text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Ändern…</> : 'Passwort ändern →'}
          </motion.button>
        </div>
      )}
    </FormPage>
  )
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({ onBack, onRegister, onForgot }) {
  const { signIn } = useAuth()
  const [email,   setEmail]   = useState('')
  const [pw,      setPw]      = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async () => {
    if (!email || !pw) { setError('Bitte alle Felder ausfüllen.'); return }
    setLoading(true); setError('')
    const { error: e } = await signIn(email, pw)
    setLoading(false)
    if (e) setError(e.message ?? 'Anmeldung fehlgeschlagen.')
  }

  return (
    <FormPage key="login" {...slide(-1)}>
      <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
        className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-8 self-start">
        <ChevronLeft size={18} className="text-white" />
      </motion.button>

      <div className="mb-8">
        <h1 className="text-white text-[32px] font-black tracking-tight mb-1.5">Willkommen zurück</h1>
        <p className="text-[#8E8E93] text-sm">Schön, dich wieder zu sehen 👋</p>
      </div>

      <div className="space-y-2.5 mb-3">
        <Input icon={Mail} type="email" placeholder="E-Mail-Adresse" autoFocus
          value={email} onChange={e => setEmail(e.target.value)} />
        <Input icon={Lock} type={showPw ? 'text' : 'password'} placeholder="Passwort"
          value={pw} onChange={e => setPw(e.target.value)}
          action={
            <button type="button" onClick={() => setShowPw(p => !p)} className="ml-1 p-0.5">
              {showPw ? <EyeOff size={15} className="text-[#8E8E93]" /> : <Eye size={15} className="text-[#8E8E93]" />}
            </button>
          } />
      </div>

      <ErrorBox msg={error} />

      <div className="flex-1 min-h-8" />

      <div className="space-y-3 mt-4">
        <motion.button whileTap={{ scale: 0.97 }} onClick={handleSubmit} disabled={loading}
          className="w-full py-4 rounded-2xl font-black text-white text-base disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 24px rgba(123,97,255,0.35)' }}>
          {loading ? <><RefreshCw size={16} className="animate-spin" /> Anmelden…</> : 'Anmelden →'}
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={onForgot}
          className="w-full py-3 text-[#8E8E93] text-sm font-medium">
          Passwort vergessen?
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={onRegister}
          className="w-full py-3.5 rounded-2xl font-semibold text-sm"
          style={{ color: '#7B61FF', background: 'rgba(123,97,255,0.1)', border: '1px solid rgba(123,97,255,0.2)' }}>
          Noch kein Konto? Registrieren
        </motion.button>
      </div>
    </FormPage>
  )
}

// ── Verify Email ──────────────────────────────────────────────────────────────
function VerifyEmail({ email, previewUrl, onBack }) {
  const { verifyCode } = useAuth()
  const [input,   setInput]   = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleVerify = async () => {
    if (input.length !== 6) { setError('Bitte den 6-stelligen Code eingeben.'); return }
    setLoading(true); setError('')
    const result = await verifyCode(email, input)
    setLoading(false)
    if (result.error) setError(result.error)
  }

  // Split digits for styled OTP input preview
  const digits = input.padEnd(6, ' ').split('')

  return (
    <motion.div key="verify" {...slide(1)}
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden"
      style={{ background: '#0A0A0B' }}>

      <Orb color="#7B61FF30" size={320} top="-10%" left="-10%" duration={16} />
      <Orb color="#00D9FF20" size={260} bottom="10%" right="-10%" delay={4} duration={13} />

      <div className="relative w-full max-w-sm">

        {/* Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 14, stiffness: 180, delay: 0.1 }}
          className="w-24 h-24 rounded-3xl mx-auto mb-6 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(123,97,255,0.2), rgba(0,217,255,0.15))',
            border: '1.5px solid rgba(123,97,255,0.35)',
            boxShadow: '0 0 40px rgba(123,97,255,0.2)',
          }}>
          <Mail size={36} className="text-[#7B61FF]" />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <h2 className="text-white font-black text-2xl mb-2">E-Mail bestätigen</h2>
          <p className="text-[#8E8E93] text-sm leading-relaxed">
            Wir haben einen Code an{' '}
            <span className="text-white font-semibold">{email}</span>{' '}
            gesendet.
          </p>
        </motion.div>

        {previewUrl && (
          <motion.a
            href={previewUrl} target="_blank" rel="noopener noreferrer"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35 }}
            className="mt-5 w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left block"
            style={{ background: 'rgba(123,97,255,0.1)', border: '1px solid rgba(123,97,255,0.25)' }}>
            <div className="w-9 h-9 rounded-xl bg-[#7B61FF]/20 flex items-center justify-center flex-shrink-0">
              <Mail size={16} className="text-[#7B61FF]" />
            </div>
            <div>
              <p className="text-[#7B61FF] text-sm font-bold">E-Mail ansehen →</p>
              <p className="text-[#8E8E93] text-xs mt-0.5">Klicke hier um deinen Code zu sehen</p>
            </div>
          </motion.a>
        )}

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="mt-6 space-y-4">

          {/* Styled digit display */}
          <div className="flex gap-2 justify-center mb-2">
            {digits.map((d, i) => (
              <div key={i}
                className="w-11 h-13 rounded-xl flex items-center justify-center text-xl font-black transition-all"
                style={{
                  height: 52,
                  background: d.trim() ? 'rgba(123,97,255,0.2)' : 'rgba(28,28,30,0.8)',
                  border: `1.5px solid ${d.trim() ? 'rgba(123,97,255,0.6)' : 'rgba(255,255,255,0.07)'}`,
                  color: d.trim() ? '#ffffff' : 'transparent',
                }}>
                {d.trim() || '·'}
              </div>
            ))}
          </div>

          {/* Hidden actual input */}
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
            style={{ background: 'rgba(28,28,30,0.8)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
            <Hash size={16} className="text-[#8E8E93] flex-shrink-0" />
            <input
              type="text" inputMode="numeric" pattern="[0-9]*"
              value={input}
              onChange={e => setInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              placeholder="6-stelligen Code eingeben"
              autoFocus
              className="flex-1 bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none tracking-widest"
              style={{ caretColor: '#7B61FF' }}
            />
          </div>

          <ErrorBox msg={error} />

          <motion.button whileTap={{ scale: 0.97 }} onClick={handleVerify} disabled={loading || input.length !== 6}
            className="w-full py-4 rounded-2xl font-black text-white text-base disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 24px rgba(123,97,255,0.35)' }}>
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Prüfe Code…</> : 'Bestätigen →'}
          </motion.button>

          <motion.button whileTap={{ scale: 0.97 }} onClick={onBack}
            className="w-full py-3 text-[#8E8E93] text-sm font-medium">
            ← Zurück zur Anmeldung
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function AuthView() {
  const [screen,     setScreen]     = useState('welcome')
  const [regEmail,   setRegEmail]   = useState('')
  const [previewUrl, setPreviewUrl] = useState('')

  return (
    <div className="min-h-screen flex justify-center" style={{ background: '#060608' }}>
      <div className="w-full max-w-[390px] min-h-screen overflow-hidden">
        <AnimatePresence mode="wait">
          {screen === 'welcome'  && <Welcome key="welcome"
            onLogin={() => setScreen('login')}
            onRegister={() => setScreen('register')} />}
          {screen === 'register' && <Register key="register"
            onBack={() => setScreen('welcome')}
            onSuccess={(em, url) => { setRegEmail(em); setPreviewUrl(url || ''); setScreen('verify') }} />}
          {screen === 'login'    && <Login key="login"
            onBack={() => setScreen('welcome')}
            onRegister={() => setScreen('register')}
            onForgot={() => setScreen('forgot')} />}
          {screen === 'verify'   && <VerifyEmail key="verify"
            email={regEmail} previewUrl={previewUrl}
            onBack={() => setScreen('login')} />}
          {screen === 'forgot'   && <ForgotPassword key="forgot"
            onBack={() => setScreen('login')} />}
        </AnimatePresence>
      </div>
    </div>
  )
}
