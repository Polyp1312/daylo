import { useState } from 'react'

export function avatarUrl(avatar) {
  if (!avatar) return null
  if (avatar.startsWith('/') || avatar.startsWith('http')) return avatar
  return `/uploads/avatars/${avatar}`
}

// Richer, more varied palette — 14 colours so initials feel personal
const PALETTE = [
  ['#7B61FF', '#00D9FF'],  // purple → cyan
  ['#FF6B9D', '#FF9F43'],  // pink → orange
  ['#2ECC71', '#00D9FF'],  // green → cyan
  ['#FF453A', '#FF9F43'],  // red → orange
  ['#BF5AF2', '#7B61FF'],  // violet → purple
  ['#00D9FF', '#2ECC71'],  // cyan → green
  ['#FF9F43', '#FFD93D'],  // orange → yellow
  ['#32ADE6', '#00D9FF'],  // blue → cyan
  ['#FF6B35', '#FF9F43'],  // coral → orange
  ['#34C759', '#2ECC71'],  // lime → green
  ['#5E5CE6', '#BF5AF2'],  // indigo → violet
  ['#FF375F', '#FF6B9D'],  // rose → pink
  ['#30B0C7', '#32ADE6'],  // teal → blue
  ['#AC8E68', '#FF9F43'],  // tan → orange
]

function colorPair(id = '') {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export default function UserAvatar({ user, size = 40, className = '', fontSize, border }) {
  const [imgError, setImgError] = useState(false)
  const url  = avatarUrl(user?.avatar)
  const fs   = fontSize ?? Math.max(10, Math.round(size * 0.35))
  const [c1, c2] = colorPair(user?.id ?? '')

  const style = {
    width: size, height: size, flexShrink: 0,
    ...(border ? { border } : {}),
  }

  if (url && !imgError) {
    return (
      <img
        src={url}
        alt={user?.name ?? ''}
        onError={() => setImgError(true)}
        style={style}
        className={`rounded-full object-cover ${className}`}
      />
    )
  }

  // Fallback: gradient initials
  return (
    <div
      style={{
        ...style,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        fontSize: fs,
      }}
      className={`rounded-full flex items-center justify-center text-white font-black select-none ${className}`}
    >
      {(user?.initials ?? user?.name?.slice(0, 2)?.toUpperCase() ?? '?')}
    </div>
  )
}
