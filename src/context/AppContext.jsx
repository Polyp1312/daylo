// v5
import { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from './AuthContext'
import { api } from '../lib/api'
import { saveVlogClips, deleteVlogClips } from '../lib/videoDB'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

// ── User formatting ───────────────────────────────────────────────────────────
const PALETTE = ['#7B61FF','#FF6B9D','#00D9FF','#FF9F43','#2ECC71','#FF453A','#BF5AF2','#32ADE6','#FF6B35','#30B0C7','#34C759']
function deriveColor(id = '') {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
export function formatUser(u) {
  const name = u.username ?? u.email?.split('@')[0] ?? '?'
  return { id: u.id, name, initials: name.slice(0, 2).toUpperCase(), color: deriveColor(u.id) }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const TODAY    = () => new Date().toISOString().slice(0, 10)
const EMOJIS   = ['🌅','🎬','🏋️','🌄','🎉','🎵','🏖️','🌙','🍕','🎮','🚀','🌸']
const randEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
const storeKey  = uid => `daylo_app_${uid}`

function load(uid) {
  try {
    const s = JSON.parse(localStorage.getItem(storeKey(uid)) || '{}')
    const now = Date.now()
    return {
      groups:  s.groups  ?? [],
      myVlogs: (s.myVlogs ?? []).map(v =>
        v.status === 'processing' && now - v.createdAt > 60_000 ? { ...v, status: 'ready' } : v
      ),
    }
  } catch { return { groups: [], myVlogs: [] } }
}
function persist(uid, state) { localStorage.setItem(storeKey(uid), JSON.stringify(state)) }

function advanceRotation(groups) {
  const today = TODAY()
  return groups.map(g => {
    if (!g.rotation?.length || g.lastRotationDate === today) return g
    return { ...g, todayIdx: ((g.todayIdx ?? 0) + 1) % g.rotation.length, lastRotationDate: today }
  })
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function AppProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.id ?? ''

  const [friends,       setFriends]       = useState([])
  const [requests,      setRequests]      = useState([])
  const [groups,        setGroups]        = useState(() => advanceRotation(load(uid).groups))
  const [myVlogs,       setMyVlogs]       = useState(() => load(uid).myVlogs)
  const [notifications, setNotifications] = useState([])
  const [presences,     setPresences]     = useState({})

  const friendsRef = useRef(friends)
  useEffect(() => { friendsRef.current = friends }, [friends])

  // Load friends, requests, groups, vlogs when user changes
  useEffect(() => {
    if (!uid) {
      setFriends([]); setRequests([]); setNotifications([]); setPresences({})
      return
    }
    api.friends.list().then(data => { if (data.friends) setFriends(data.friends.map(formatUser)) })
    api.friends.requests().then(data => { if (data.requests) setRequests(data.requests.map(formatUser)) })
    const d = load(uid)
    setGroups(advanceRotation(d.groups))
    setMyVlogs(d.myVlogs)
  }, [uid])

  // Persist groups + vlogs
  useEffect(() => {
    if (!uid) return
    persist(uid, { groups, myVlogs })
  }, [uid, groups, myVlogs])

  // Presence ping + fetch, poll every 60 s
  useEffect(() => {
    if (!uid) return
    const ping = () => api.presence.ping()
    const fetchPresence = () => {
      const ids = friendsRef.current.map(f => f.id)
      if (!ids.length) return
      api.presence.get(ids).then(data => { if (data.presences) setPresences(data.presences) })
    }
    ping(); fetchPresence()
    const t1 = setInterval(ping, 60_000)
    const t2 = setInterval(fetchPresence, 60_000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [uid])

  // Notifications: fetch + poll every 30 s
  useEffect(() => {
    if (!uid) { setNotifications([]); return }
    const fetch = () => api.notifications.list().then(data => {
      if (data.notifications) setNotifications(data.notifications)
    })
    fetch()
    const t = setInterval(fetch, 30_000)
    return () => clearInterval(t)
  }, [uid])

  const markNotificationsRead = () => {
    setNotifications(p => p.map(n => ({ ...n, read: true })))
    api.notifications.markRead()
  }

  const me = useMemo(() => user ? formatUser(user) : null, [user])

  const userCache = useMemo(() => {
    const cache = {}
    if (me) cache[me.id] = me
    for (const f of friends) cache[f.id] = f
    return cache
  }, [me, friends])

  const getUser   = id => userCache[id] ?? { id, name: '?', initials: '??', color: '#3A3A3C' }
  const friendIds = friends.map(f => f.id)

  // ── Friends ───────────────────────────────────────────────────────────────
  const acceptRequest = requester => {
    setRequests(p => p.filter(r => r.id !== requester.id))
    setFriends(p => friendIds.includes(requester.id) ? p : [...p, requester])
    api.friends.accept(requester.id)
  }
  const declineRequest = id => {
    setRequests(p => p.filter(r => r.id !== id))
    api.friends.decline(id)
  }
  const sendRequest  = userObj => api.friends.request(userObj.id)
  const removeFriend = id => {
    setFriends(p => p.filter(f => f.id !== id))
    setGroups(p => p.map(g => ({
      ...g,
      memberIds: g.memberIds.filter(m => m !== id),
      rotation:  g.rotation.filter(m => m !== id),
    })))
    api.friends.remove(id)
  }

  // ── Groups ────────────────────────────────────────────────────────────────
  const createGroup  = (name, emoji) => {
    const id = Date.now()
    setGroups(p => [...p, { id, name, emoji: emoji || '👥', memberIds: [uid], rotation: [uid], todayIdx: 0, lastRotationDate: TODAY() }])
    return id
  }
  const deleteGroup  = id        => setGroups(p => p.filter(g => g.id !== id))
  const renameGroup  = (id, nm)  => setGroups(p => p.map(g => g.id === id ? { ...g, name: nm } : g))
  const addMember    = (gid, u)  => {
    if (!friendIds.includes(u.id)) setFriends(p => [...p, u])
    setGroups(p => p.map(g => {
      if (g.id !== gid || g.memberIds.includes(u.id)) return g
      return { ...g, memberIds: [...g.memberIds, u.id], rotation: [...g.rotation, u.id] }
    }))
  }
  const removeMember = (gid, mid) => setGroups(p => p.map(g => {
    if (g.id !== gid) return g
    const todayId     = g.rotation[g.todayIdx % g.rotation.length]
    const newRotation = g.rotation.filter(m => m !== mid)
    const newIdx      = Math.max(0, newRotation.indexOf(todayId))
    return { ...g, memberIds: g.memberIds.filter(m => m !== mid), rotation: newRotation, todayIdx: newIdx }
  }))

  // ── Vlogs ─────────────────────────────────────────────────────────────────
  const addVlog = async (clips) => {
    const duration = Math.round(clips.reduce((s, c) => s + (c.duration ?? 0), 0))
    const id       = Date.now()
    const vlog = {
      id, createdAt: Date.now(),
      date:  new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      clips: clips.length, duration, emoji: randEmoji(), status: 'processing',
    }
    // Save blobs to IndexedDB (fire-and-forget, non-blocking)
    saveVlogClips(id, clips.map(c => ({ blob: c.blob, thumbUrl: c.thumbUrl, duration: c.duration })))
      .catch(e => console.warn('IndexedDB save failed:', e))
    setMyVlogs(p => [vlog, ...p])
    setTimeout(() => setMyVlogs(p => p.map(v => v.id === id ? { ...v, status: 'ready' } : v)), 4000)
  }

  const deleteVlog = async (vlogId) => {
    deleteVlogClips(vlogId).catch(() => {})
    setMyVlogs(p => p.filter(v => v.id !== vlogId))
  }

  return (
    <Ctx.Provider value={{
      me, friends, friendIds, requests, groups, myVlogs,
      notifications, presences,
      getUser, acceptRequest, declineRequest, sendRequest, removeFriend,
      createGroup, deleteGroup, renameGroup, addMember, removeMember,
      addVlog, deleteVlog, markNotificationsRead,
    }}>
      {children}
    </Ctx.Provider>
  )
}
