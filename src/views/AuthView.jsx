// v5
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ChevronLeft, AlertCircle, CheckCircle, RefreshCw, Hash, AtSign } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const slide = (dir = 1) => ({
  initial:    { opacity: 0, x: dir * 40 },
  animate:    { opacity: 1, x: 0 },
  exit:       { opacity: 0, x: dir * -40 },
  transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
})

function Input({ icon: Icon, type = 'text', placeholder, value, onChange, action }) {
  return (
    <div className="flex items-center gap-3 bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-3.5 focus-within:border-[#7B61FF] transition-colors">
      <Icon size={16} className="text-[#8E8E93] flex-shrink-0" />
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="flex-1 bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none"
        autoCapitalize="none" autoCorrect="off"
      />
      {action}
    </div>
  )
}

function ErrorBox({ msg }) {
  if (!msg) return null
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3">
      <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
      <p className="text-red-400 text-sm leading-snug">{msg}</p>
    </motion.div>
  )
}

// ── Welcome ───────────────────────────────────────────────────────────────────

function Welcome({ onLogin, onRegister }) {
  return (
    <motion.div key="welcome" {...slide(0)}
      className="min-h-screen bg-[#0A0A0B] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', damping: 16, stiffness: 200 }}>
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6 mx-auto"
            style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 60px rgba(123,97,255,0.4)' }}>
            <span className="text-4xl">🎬</span>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex items-baseline gap-0.5 justify-center mb-2">
            <span className="text-4xl font-bold tracking-tight text-white">daylo</span>
            <span className="text-4xl font-bold text-[#7B61FF]">.</span>
          </div>
          <p className="text-[#8E8E93] text-base">Jeden Tag. Eine Person. Dein Leben.</p>
        </motion.div>
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="px-6 pb-14 space-y-3">
        <motion.button whileTap={{ scale: 0.97 }} onClick={onRegister}
          className="w-full py-4 rounded-2xl font-bold text-white text-base"
          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
          Konto erstellen
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={onLogin}
          className="w-full py-4 rounded-2xl font-semibold text-white text-base bg-[#1C1C1E] border border-[#2C2C2E]">
          Anmelden
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

// ── Register ──────────────────────────────────────────────────────────────────

function Register({ onBack, onSuccess }) {
  const { signUp } = useAuth()
  const [username, setUsername] = useState('')
  const [email,   setEmail]   = useState('')
  const [pw,      setPw]      = useState('')
  const [pwConf,  setPwConf]  = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const validate = () => {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return 'Nutzername: 3–20 Zeichen, nur Buchstaben, Zahlen und _'
    if (!email.includes('@')) return 'Bitte eine gültige E-Mail-Adresse eingeben.'
    if (pw.length < 8)        return 'Passwort muss mindestens 8 Zeichen lang sein.'
    if (pw !== pwConf)        return 'Passwörter stimmen nicht überein.'
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

  const showEye = (
    <button type="button" onClick={() => setShowPw(p => !p)} className="ml-1">
      {showPw ? <EyeOff size={15} className="text-[#8E8E93]" /> : <Eye size={15} className="text-[#8E8E93]" />}
    </button>
  )

  return (
    <motion.div key="register" {...slide(1)}
      className="min-h-screen bg-[#0A0A0B] flex flex-col px-6 pt-14 pb-10">
      <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
        className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-8">
        <ChevronLeft size={18} className="text-white" />
      </motion.button>
      <h1 className="text-white text-3xl font-bold mb-1">Konto erstellen</h1>
      <p className="text-[#8E8E93] text-sm mb-8">Kostenlos · Keine Kreditkarte nötig</p>
      <div className="space-y-3 mb-4">
        <Input icon={AtSign} type="text" placeholder="Nutzername (z.B. niclas_23)"
          value={username} onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))} />
        <Input icon={Mail} type="email" placeholder="E-Mail-Adresse"
          value={email} onChange={e => setEmail(e.target.value)} />
        <Input icon={Lock} type={showPw ? 'text' : 'password'} placeholder="Passwort (min. 8 Zeichen)"
          value={pw} onChange={e => setPw(e.target.value)} action={showEye} />
        <Input icon={Lock} type={showPw ? 'text' : 'password'} placeholder="Passwort bestätigen"
          value={pwConf} onChange={e => setPwConf(e.target.value)} />
      </div>
      <ErrorBox msg={error} />
      {pw.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {[
            { label: 'Mindestens 8 Zeichen',       ok: pw.length >= 8 },
            { label: 'Passwörter stimmen überein', ok: pw === pwConf && pwConf.length > 0 },
          ].map(r => (
            <div key={r.label} className="flex items-center gap-2">
              <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 ${r.ok ? 'bg-[#2ECC71]' : 'bg-[#2C2C2E]'}`}>
                {r.ok && <CheckCircle size={9} className="text-white" />}
              </div>
              <span className={`text-xs ${r.ok ? 'text-[#2ECC71]' : 'text-[#8E8E93]'}`}>{r.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex-1" />
      <motion.button whileTap={{ scale: 0.97 }} onClick={handleSubmit} disabled={loading}
        className="w-full py-4 rounded-2xl font-bold text-white text-base mt-6 disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
        {loading ? <><RefreshCw size={16} className="animate-spin" /> Wird erstellt…</> : 'Konto erstellen →'}
      </motion.button>
    </motion.div>
  )
}

// ── Login ─────────────────────────────────────────────────────────────────────

function Login({ onBack, onRegister }) {
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
    if (e) setError(e.message)
  }

  return (
    <motion.div key="login" {...slide(-1)}
      className="min-h-screen bg-[#0A0A0B] flex flex-col px-6 pt-14 pb-10">
      <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
        className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-8">
        <ChevronLeft size={18} className="text-white" />
      </motion.button>
      <h1 className="text-white text-3xl font-bold mb-1">Willkommen zurück</h1>
      <p className="text-[#8E8E93] text-sm mb-8">Melde dich mit deiner E-Mail an</p>
      <div className="space-y-3 mb-4">
        <Input icon={Mail} type="email" placeholder="E-Mail-Adresse"
          value={email} onChange={e => setEmail(e.target.value)} />
        <Input icon={Lock} type={showPw ? 'text' : 'password'} placeholder="Passwort"
          value={pw} onChange={e => setPw(e.target.value)}
          action={
            <button type="button" onClick={() => setShowPw(p => !p)} className="ml-1">
              {showPw ? <EyeOff size={15} className="text-[#8E8E93]" /> : <Eye size={15} className="text-[#8E8E93]" />}
            </button>
          } />
      </div>
      <ErrorBox msg={error} />
      <div className="flex-1" />
      <div className="space-y-3 mt-6">
        <motion.button whileTap={{ scale: 0.97 }} onClick={handleSubmit} disabled={loading}
          className="w-full py-4 rounded-2xl font-bold text-white text-base disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
          {loading ? <><RefreshCw size={16} className="animate-spin" /> Anmelden…</> : 'Anmelden →'}
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={onRegister}
          className="w-full py-3.5 rounded-2xl font-semibold text-[#7B61FF] text-sm bg-[#7B61FF]/10 border border-[#7B61FF]/20">
          Noch kein Konto? Registrieren
        </motion.button>
      </div>
    </motion.div>
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

  return (
    <motion.div key="verify" {...slide(1)}
      className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center px-6 text-center">

      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 14, stiffness: 180, delay: 0.1 }}
        className="w-24 h-24 rounded-3xl bg-[#7B61FF]/15 border border-[#7B61FF]/30 flex items-center justify-center mb-6">
        <Mail size={40} className="text-[#7B61FF]" />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h2 className="text-white font-bold text-2xl mb-2">E-Mail bestätigen</h2>
        <p className="text-[#8E8E93] text-sm leading-relaxed">
          Wir haben einen Code an <span className="text-white font-medium">{email}</span> gesendet.
        </p>
      </motion.div>

      {previewUrl && (
        <motion.a
          href={previewUrl} target="_blank" rel="noopener noreferrer"
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-5 w-full flex items-center gap-3 bg-[#7B61FF]/10 border border-[#7B61FF]/30 rounded-2xl px-4 py-3.5 text-left">
          <Mail size={18} className="text-[#7B61FF] flex-shrink-0" />
          <div>
            <p className="text-[#7B61FF] text-sm font-semibold">E-Mail ansehen →</p>
            <p className="text-[#8E8E93] text-xs">Klicke hier um deinen Code zu sehen</p>
          </div>
        </motion.a>
      )}

      <div className="mt-4 w-full space-y-3">
        <Input icon={Hash} type="text" placeholder="6-stelligen Code eingeben"
          value={input}
          onChange={e => setInput(e.target.value.replace(/\D/g, '').slice(0, 6))} />

        <ErrorBox msg={error} />

        <motion.button whileTap={{ scale: 0.97 }} onClick={handleVerify} disabled={loading}
          className="w-full py-4 rounded-2xl font-bold text-white text-base disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
          {loading ? <><RefreshCw size={16} className="animate-spin" /> Prüfe Code…</> : 'Bestätigen →'}
        </motion.button>

        <motion.button whileTap={{ scale: 0.97 }} onClick={onBack}
          className="w-full py-3 rounded-2xl text-[#8E8E93] text-sm">
          ← Zurück zur Anmeldung
        </motion.button>
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
    <div className="min-h-screen bg-[#0A0A0B] flex justify-center">
      <div className="w-full max-w-[390px] min-h-screen overflow-hidden">
        <AnimatePresence mode="wait">
          {screen === 'welcome'  && <Welcome  key="welcome"  onLogin={() => setScreen('login')} onRegister={() => setScreen('register')} />}
          {screen === 'register' && <Register key="register" onBack={() => setScreen('welcome')}
            onSuccess={(email, url) => { setRegEmail(email); setPreviewUrl(url || ''); setScreen('verify') }} />}
          {screen === 'login'    && <Login    key="login"    onBack={() => setScreen('welcome')} onRegister={() => setScreen('register')} />}
          {screen === 'verify'   && <VerifyEmail key="verify" email={regEmail} previewUrl={previewUrl} onBack={() => setScreen('login')} />}
        </AnimatePresence>
      </div>
    </div>
  )
}
