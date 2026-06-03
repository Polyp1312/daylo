import { motion } from 'framer-motion'

export default function ProgressRing({ progress, size = 180, strokeWidth = 8 }) {
  const r      = (size - strokeWidth * 2) / 2
  const c      = 2 * Math.PI * r
  const offset = c - (Math.min(progress, 100) / 100) * c
  const pct    = Math.min(progress, 100)
  const done   = pct >= 100

  const gradId  = `rg-${size}`   // unique per size so multiple rings don't clash
  const glowId  = `glow-${size}`

  return (
    <svg width={size} height={size} className="absolute inset-0" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={done ? '#2ECC71' : '#7B61FF'} />
          <stop offset="100%" stopColor={done ? '#00D9FF' : '#00D9FF'} />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={done ? '4' : '2.5'} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="rgba(44,44,46,0.7)"
        strokeWidth={strokeWidth}
      />

      {/* Progress arc */}
      {pct > 0 && (
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          filter={pct > 10 ? `url(#${glowId})` : undefined}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.85, ease: [0.34, 1.56, 0.64, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}

      {/* Completion sparkle dot at the tip */}
      {pct > 5 && pct < 100 && (
        <motion.circle
          r={strokeWidth / 2 + 0.5}
          fill="#00D9FF"
          filter={`url(#${glowId})`}
          animate={{
            cx: size / 2 + r * Math.cos((2 * Math.PI * pct / 100) - Math.PI / 2),
            cy: size / 2 + r * Math.sin((2 * Math.PI * pct / 100) - Math.PI / 2),
          }}
          transition={{ duration: 0.85, ease: [0.34, 1.56, 0.64, 1] }}
        />
      )}
    </svg>
  )
}
