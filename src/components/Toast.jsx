import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import { CheckCircle, AlertCircle, Info, X, Zap } from 'lucide-react'

const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

const TYPES = {
  success: {
    icon: CheckCircle,
    color: '#2ECC71',
    bg:   'rgba(46,204,113,0.12)',
    bar:  'linear-gradient(90deg, #2ECC71, #00D9FF)',
    border: 'rgba(46,204,113,0.28)',
  },
  error: {
    icon: AlertCircle,
    color: '#FF453A',
    bg:   'rgba(255,69,58,0.12)',
    bar:  'linear-gradient(90deg, #FF453A, #FF9F43)',
    border: 'rgba(255,69,58,0.28)',
  },
  info: {
    icon: Info,
    color: '#7B61FF',
    bg:   'rgba(123,97,255,0.12)',
    bar:  'linear-gradient(90deg, #7B61FF, #00D9FF)',
    border: 'rgba(123,97,255,0.28)',
  },
  spark: {
    icon: Zap,
    color: '#FF9F43',
    bg:   'rgba(255,159,67,0.12)',
    bar:  'linear-gradient(90deg, #FF9F43, #FFD93D)',
    border: 'rgba(255,159,67,0.28)',
  },
}

function ToastItem({ toast, onDismiss, duration }) {
  const cfg  = TYPES[toast.type] ?? TYPES.info
  const Icon = cfg.icon
  const x    = useMotionValue(0)
  const opacity = useTransform(x, [-80, 0, 80], [0, 1, 0])

  // Progress bar width (drains over duration)
  const [barWidth, setBarWidth] = useState(100)
  useEffect(() => {
    const start = Date.now()
    const raf = () => {
      const elapsed = Date.now() - start
      const pct = Math.max(0, 100 - (elapsed / duration) * 100)
      setBarWidth(pct)
      if (pct > 0) requestAnimationFrame(raf)
    }
    const id = requestAnimationFrame(raf)
    return () => cancelAnimationFrame(id)
  }, [duration])

  return (
    <motion.div
      layout
      style={{ x, opacity }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 60) onDismiss() }}
      initial={{ opacity: 0, y: -28, scale: 0.88 }}
      animate={{ opacity: 1,  y: 0,   scale: 1   }}
      exit={{    opacity: 0,  y: -16, scale: 0.92, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', damping: 22, stiffness: 380 }}
      className="pointer-events-auto rounded-2xl overflow-hidden shadow-2xl cursor-grab active:cursor-grabbing"
      style={{
        background:      'rgba(18,18,20,0.97)',
        backdropFilter:  'blur(20px)',
        border:          `1px solid ${cfg.border}`,
        boxShadow:       `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${cfg.border}`,
      }}>

      {/* Body */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <motion.div
          initial={{ scale: 0.5, rotate: -20 }}
          animate={{ scale: 1,   rotate: 0   }}
          transition={{ type: 'spring', damping: 14, stiffness: 260, delay: 0.08 }}
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: cfg.bg }}>
          <Icon size={15} style={{ color: cfg.color }} />
        </motion.div>

        <span className="text-white text-sm flex-1 leading-snug font-semibold">{toast.message}</span>

        <motion.button
          whileTap={{ scale: 0.82 }}
          onClick={onDismiss}
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ml-1"
          style={{ background: 'rgba(44,44,46,0.8)' }}>
          <X size={11} className="text-[#8E8E93]" />
        </motion.button>
      </div>

      {/* Drain bar */}
      <div className="h-[2px] w-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-none"
          style={{
            width:      `${barWidth}%`,
            background: cfg.bar,
            transition: 'width 0.1s linear',
          }}
        />
      </div>
    </motion.div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const show = useCallback((message, type = 'info', duration = 3800) => {
    const id = ++idRef.current
    setToasts(p => [...p.slice(-3), { id, message, type, duration }])   // max 4 visible
    const timer = setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), duration)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = useCallback(id => setToasts(p => p.filter(t => t.id !== id)), [])

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 w-full max-w-[360px] px-4 pointer-events-none"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <AnimatePresence mode="sync">
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} duration={t.duration ?? 3800} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}
