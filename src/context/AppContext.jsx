// v7 — server-side groups + unread messages
import { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from './AuthContext'
import { api } from '../lib/api'

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
  return { id: u.id, name, initials: name.slice(0, 2).toUpperCase(), color: deriveColor(u.id), avatar: u.avatar ?? null }
}

function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function AppProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.id ?? ''

  const [friends,        setFriends]        = useState([])
  const [requests,       setRequests]       = useState([])
  const [groups,         setGroups]         = useState([])
  const [myVlogs,        setMyVlogs]        = useState([])
  const [myStreak,       setMyStreak]       = useState(0)
  const [notifications,  setNotifications]  = useState([])
  const [presences,      setPresences]      = useState({})
  const [unreadMessages, setUnreadMessages] = useState(0)

  const friendsRef = useRef(friends)
  useEffect(() => { friendsRef.current = friends }, [friends])

  // Load everything when user changes
  useEffect(() => {
    if (!uid) {
      setFriends([]); setRequests([]); setNotifications([]); setPresences({}); setGroups([]); setUnreadMessages(0)
      return
    }
    api.friends.list().then(d => { if (d.friends) setFriends(d.friends.map(formatUser)) })
    api.friends.requests().then(d => { if (d.requests) setRequests(d.requests.map(formatUser)) })
    api.groups.list().then(d => { if (d.groups) setGroups(d.groups) })
    api.vlogs.myList().then(d => {
      if (d.vlogs)   setMyVlogs(d.vlogs)
      if (d.streak != null) setMyStreak(d.streak)
    })
    api.messages.unreadCount().then(d => { if (d.count != null) setUnreadMessages(d.count) })
  }, [uid])

  // Presence ping + fetch every 60s
  useEffect(() => {
    if (!uid) return
    const ping = () => api.presence.ping()
    const fetchPresence = () => {
      const ids = friendsRef.current.map(f => f.id)
      if (!ids.length) return
      api.presence.get(ids).then(d => { if (d.presences) setPresences(d.presences) })
    }
    ping(); fetchPresence()
    const t1 = setInterval(ping, 60_000)
    const t2 = setInterval(fetchPresence, 60_000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [uid])

  // Notifications: fetch + poll every 30s
  useEffect(() => {
    if (!uid) { setNotifications([]); return }
    const fetch = () => api.notifications.list().then(d => { if (d.notifications) setNotifications(d.notifications) })
    fetch()
    const t = setInterval(fetch, 30_000)
    return () => clearInterval(t)
  }, [uid])

  // Unread messages: poll every 15s
  useEffect(() => {
    if (!uid) return
    const t = setInterval(() => {
      api.messages.unreadCount().then(d => { if (d.count != null) setUnreadMessages(d.count) })
    }, 15_000)
    return () => clearInterval(t)
  }, [uid])

  // Poll vlogs every 5s while processing
  useEffect(() => {
    if (!uid) return
    if (!myVlogs.some(v => v.status === 'processing')) return
    const t = setInterval(() => {
      api.vlogs.myList().then(d => {
        if (d.vlogs)          setMyVlogs(d.vlogs)
        if (d.streak != null) setMyStreak(d.streak)
      })
    }, 5_000)
    return () => clearInterval(t)
  }, [uid, myVlogs])

  // Push setup
  useEffect(() => {
    if (!uid) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    let cancelled = false
    async function setupPush() {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
        if (cancelled) return
        const permission = await Notification.requestPermission()
        if (permission !== 'granted' || cancelled) return
        const existing = await reg.pushManager.getSubscription()
        if (existing) return
        const { key } = await api.push.vapidKey()
        if (!key || cancelled) return
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
        if (cancelled) return
        await api.push.subscribe(JSON.parse(JSON.stringify(sub)))
      } catch (err) { if (!cancelled) console.warn('Push-Setup fehlgeschlagen:', err.message) }
    }
    setupPush()
    return () => { cancelled = true }
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

  const getUser   = id => userCache[id] ?? { id, name: '?', initials: '??', color: '#3A3A3C', avatar: null }
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
    api.friends.remove(id)
  }

  // ── Groups (server-side) ──────────────────────────────────────────────────
  const reloadGroups = () => api.groups.list().then(d => { if (d.groups) setGroups(d.groups) })

  const createGroup = async (name, emoji) => {
    const { group } = await api.groups.create(name, emoji)
    if (group) setGroups(p => [...p, group])
    return group?.id
  }
  const deleteGroup = async id => {
    await api.groups.delete(id)
    setGroups(p => p.filter(g => g.id !== id))
  }
  const renameGroup = async (id, name) => {
    const { group } = await api.groups.update(id, { name })
    if (group) setGroups(p => p.map(g => g.id === id ? group : g))
  }
  const addMember = async (groupId, u) => {
    if (!friendIds.includes(u.id)) setFriends(p => [...p, u])
    const { group } = await api.groups.addMember(groupId, u.id)
    if (group) setGroups(p => p.map(g => g.id === groupId ? group : g))
  }
  const removeMember = async (groupId, memberId) => {
    const { group } = await api.groups.removeMember(groupId, memberId)
    if (group) setGroups(p => p.map(g => g.id === groupId ? group : g))
  }

  // ── Vlogs ─────────────────────────────────────────────────────────────────
  const addVlog    = vlog => setMyVlogs(p => [vlog, ...p])
  const deleteVlog = async vlogId => {
    await api.vlogs.delete(vlogId)
    setMyVlogs(p => p.filter(v => v.id !== vlogId))
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  const clearUnread = () => setUnreadMessages(0)

  return (
    <Ctx.Provider value={{
      me, friends, friendIds, requests, groups, myVlogs, myStreak,
      notifications, presences, unreadMessages,
      getUser, acceptRequest, declineRequest, sendRequest, removeFriend,
      createGroup, deleteGroup, renameGroup, addMember, removeMember, reloadGroups,
      addVlog, deleteVlog, markNotificationsRead, clearUnread,
    }}>
      {children}
    </Ctx.Provider>
  )
}
