import { motion } from 'framer-motion'

export default function ProgressRing({ progress, size = 180, strokeWidth = 8 }) {
  const r = (size - strokeWidth * 2) / 2
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(progress, 100) / 100) * c

  return (
    <svg width={size} height={size} className="absolute inset-0" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7B61FF" />
          <stop offset="100%" stopColor="#00D9FF" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#2C2C2E" strokeWidth={strokeWidth} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="url(#rg)" strokeWidth={strokeWidth}
        strokeLinecap="round" strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}
