import { useState } from 'react'

export function avatarUrl(avatar) {
  if (!avatar) return null
  if (avatar.startsWith('/') || avatar.startsWith('http')) return avatar
  return `/uploads/avatars/${avatar}`
}

export default function UserAvatar({ user, size = 40, className = '', fontSize }) {
  const [imgError, setImgError] = useState(false)
  const url = avatarUrl(user?.avatar)
  const fs  = fontSize ?? Math.max(10, Math.round(size * 0.35))

  if (url && !imgError) {
    return (
      <img
        src={url}
        alt={user?.name ?? ''}
        onError={() => setImgError(true)}
        style={{ width: size, height: size, flexShrink: 0 }}
        className={`rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      style={{
        width: size, height: size, flexShrink: 0,
        background: `linear-gradient(135deg, ${user?.color ?? '#7B61FF'}, ${user?.color ?? '#7B61FF'}88)`,
        fontSize: fs,
      }}
      className={`rounded-full flex items-center justify-center text-white font-bold select-none ${className}`}
    >
      {user?.initials ?? '?'}
    </div>
  )
}
