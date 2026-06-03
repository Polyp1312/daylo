import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

const STYLES = {
  success: { icon: CheckCircle, color: '#2ECC71', bg: 'rgba(46,204,113,0.12)', border: 'rgba(46,204,113,0.25)' },
  error:   { icon: AlertCircle, color: '#FF453A', bg: 'rgba(255,69,58,0.12)',  border: 'rgba(255,69,58,0.25)'  },
  info:    { icon: Info,        color: '#7B61FF', bg: 'rgba(123,97,255,0.12)', border: 'rgba(123,97,255,0.25)' },
}

function ToastItem({ toast, onDismiss }) {
  const { icon: Icon, color, bg, border } = STYLES[toast.type] ?? STYLES.info
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.92 }}
      animate={{ opacity: 1, y: 0,   scale: 1    }}
      exit={{    opacity: 0, y: -12, scale: 0.95 }}
      transition={{ type: 'spring', damping: 24, stiffness: 360 }}
      className="pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl"
      style={{ background: 'rgba(20,20,21,0.96)', backdropFilter: 'blur(16px)', border: `1px solid ${border}` }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: bg }}>
        <Icon size={16} style={{ color }} />
      </div>
      <span className="text-white text-sm flex-1 leading-snug font-medium">{toast.message}</span>
      <motion.button whileTap={{ scale: 0.85 }} onClick={onDismiss}
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(44,44,46,0.8)' }}>
        <X size={11} className="text-[#8E8E93]" />
      </motion.button>
    </motion.div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const show = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++idRef.current
    setToasts(p => [...p, { id, message, type }])
    const timer = setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), duration)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = useCallback(id => setToasts(p => p.filter(t => t.id !== id)), [])

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="fixed top-safe-top top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 w-full max-w-[360px] px-4 pointer-events-none">
        <AnimatePresence mode="sync">
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}
