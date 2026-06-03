import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { api } from '../lib/api'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

// ── User formatting ───────────────────────────────────────────────────────────
const PALETTE = ['#7B61FF','#FF6B9D','#00D9FF','#FF9F43','#2ECC71','#FF453A','#BF5AF2','#32ADE6','#FF6B35','#30B0C7','#34C759']
function deriveColor(id = '') {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
export function formatUser(u) {
  const name = u.username ?? u.email?.split('@')[0] ?? '?'
  const raw  = u.avatar ?? null
  const avatar = raw
    ? (raw.startsWith('/') || raw.startsWith('http') ? raw : `/uploads/avatars/${raw}`)
    : null
  const color = u.color ?? deriveColor(u.id)
  return { id: u.id, name, initials: name.slice(0, 2).toUpperCase(), color, avatar }
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

  const [friends,         setFriends]         = useState([])
  const [requests,        setRequests]         = useState([])
  const [groups,          setGroups]           = useState([])
  const [myVlogs,         setMyVlogs]          = useState([])
  const [myStreak,        setMyStreak]         = useState(0)
  const [notifications,   setNotifications]    = useState([])
  const [presences,       setPresences]        = useState({})
  const [unreadMessages,  setUnreadMessages]   = useState(0)
  const [unreadGroupMsgs, setUnreadGroupMsgs]  = useState(0)

  const friendsRef    = useRef(friends)
  const isVisibleRef  = useRef(!document.hidden)

  useEffect(() => { friendsRef.current = friends }, [friends])

  // Track page visibility — pause polling when tab is hidden
  useEffect(() => {
    const handle = () => { isVisibleRef.current = !document.hidden }
    document.addEventListener('visibilitychange', handle)
    return () => document.removeEventListener('visibilitychange', handle)
  }, [])

  // ── Initial data load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) {
      setFriends([]); setRequests([]); setNotifications([]); setPresences({})
      setGroups([]); setUnreadMessages(0); setUnreadGroupMsgs(0)
      setMyVlogs([]); setMyStreak(0)
      return
    }
    api.friends.list().then(d => { if (d.friends) setFriends(d.friends.map(formatUser)) })
    api.friends.requests().then(d => { if (d.requests) setRequests(d.requests.map(formatUser)) })
    api.groups.list().then(d => { if (d.groups) setGroups(d.groups) })
    api.vlogs.myList().then(d => {
      if (d.vlogs)          setMyVlogs(d.vlogs)
      if (d.streak != null) setMyStreak(d.streak)
    })
    api.messages.unreadCount().then(d => { if (d.count != null) setUnreadMessages(d.count) })
    api.groups.unreadCount().then(d => { if (d.count != null) setUnreadGroupMsgs(d.count) })
    api.notifications.list().then(d => { if (d.notifications) setNotifications(d.notifications) })
  }, [uid])

  // ── Consolidated polling interval ────────────────────────────────────────────
  // One timer for all soft-real-time updates (notifications, unread counts, presence)
  useEffect(() => {
    if (!uid) return
    let tick = 0

    const poll = async () => {
      if (!isVisibleRef.current) return  // skip when tab is hidden

      // Every tick (15s): unread counts + presence ping
      api.messages.unreadCount().then(d => { if (d.count != null) setUnreadMessages(d.count) })
      api.groups.unreadCount().then(d => { if (d.count != null) setUnreadGroupMsgs(d.count) })
      api.presence.ping()

      // Every 2nd tick (30s): notifications + presence data
      if (tick % 2 === 0) {
        api.notifications.list().then(d => { if (d.notifications) setNotifications(d.notifications) })
        const ids = friendsRef.current.map(f => f.id)
        if (ids.length) {
          api.presence.get(ids).then(d => { if (d.presences) setPresences(d.presences) })
        }
      }

      // Every 4th tick (60s): group list refresh (rotation advances)
      if (tick % 4 === 0) {
        api.groups.list().then(d => { if (d.groups) setGroups(d.groups) })
      }

      tick++
    }

    // Initial ping
    api.presence.ping()

    const t = setInterval(poll, 15_000)
    return () => clearInterval(t)
  }, [uid])

  // ── Poll vlogs while processing ──────────────────────────────────────────────
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

  // ── Push notification setup ──────────────────────────────────────────────────
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
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        })
        if (cancelled) return
        await api.push.subscribe(JSON.parse(JSON.stringify(sub)))
      } catch (err) {
        if (!cancelled) console.warn('Push-Setup fehlgeschlagen:', err.message)
      }
    }
    setupPush()
    return () => { cancelled = true }
  }, [uid])

  // ── Friends ───────────────────────────────────────────────────────────────────
  const acceptRequest = useCallback(requester => {
    setRequests(p => p.filter(r => r.id !== requester.id))
    setFriends(p => p.some(f => f.id === requester.id) ? p : [...p, requester])
    api.friends.accept(requester.id)
  }, [])

  const declineRequest = useCallback(id => {
    setRequests(p => p.filter(r => r.id !== id))
    api.friends.decline(id)
  }, [])

  const sendRequest  = useCallback(userObj => api.friends.request(userObj.id), [])
  const removeFriend = useCallback(id => {
    setFriends(p => p.filter(f => f.id !== id))
    api.friends.remove(id)
  }, [])

  // ── Groups ────────────────────────────────────────────────────────────────────
  const reloadGroups = useCallback(() =>
    api.groups.list().then(d => { if (d.groups) setGroups(d.groups) }), [])

  const createGroup = useCallback(async (name, emoji) => {
    const { group } = await api.groups.create(name, emoji)
    if (group) setGroups(p => [...p, group])
    return group?.id
  }, [])

  const deleteGroup = useCallback(async id => {
    await api.groups.delete(id)
    setGroups(p => p.filter(g => g.id !== id))
  }, [])

  const renameGroup = useCallback(async (id, name) => {
    const { group } = await api.groups.update(id, { name })
    if (group) setGroups(p => p.map(g => g.id === id ? group : g))
  }, [])

  const updateGroup = useCallback(async (id, body) => {
    const { group } = await api.groups.update(id, body)
    if (group) setGroups(p => p.map(g => g.id === id ? group : g))
  }, [])

  const addMember = useCallback(async (groupId, u) => {
    if (!friends.some(f => f.id === u.id)) setFriends(p => [...p, u])
    const { group } = await api.groups.addMember(groupId, u.id)
    if (group) setGroups(p => p.map(g => g.id === groupId ? group : g))
  }, [friends])

  const removeMember = useCallback(async (groupId, memberId) => {
    const { group } = await api.groups.removeMember(groupId, memberId)
    if (group) setGroups(p => p.map(g => g.id === groupId ? group : g))
    else setGroups(p => p.filter(g => g.id !== groupId))
  }, [])

  // ── Group chat ────────────────────────────────────────────────────────────────
  const fetchGroupMessages = useCallback(async (groupId) => {
    const { messages } = await api.groups.messages(groupId)
    setGroups(p => p.map(g => g.id === groupId ? { ...g, unreadCount: 0 } : g))
    api.groups.unreadCount().then(d => { if (d.count != null) setUnreadGroupMsgs(d.count) })
    return messages ?? []
  }, [])

  const sendGroupMessage = useCallback(async (groupId, text, replyToId = null) => {
    const { message } = await api.groups.sendMessage(groupId, text, replyToId)
    return message ?? null
  }, [])

  // ── Vlogs ─────────────────────────────────────────────────────────────────────
  const addVlog = useCallback(vlog => setMyVlogs(p => [vlog, ...p]), [])

  const deleteVlog = useCallback(async vlogId => {
    await api.vlogs.delete(vlogId)
    setMyVlogs(p => p.filter(v => v.id !== vlogId))
  }, [])

  // ── Messages ──────────────────────────────────────────────────────────────────
  const clearUnread = useCallback(() => setUnreadMessages(0), [])

  const markNotificationsRead = useCallback(() => {
    setNotifications(p => p.map(n => ({ ...n, read: true })))
    api.notifications.markRead()
  }, [])

  // ── Derived values ────────────────────────────────────────────────────────────
  const me = useMemo(() => user ? formatUser(user) : null, [user])
  const userCache = useMemo(() => {
    const cache = {}
    if (me) cache[me.id] = me
    for (const f of friends) cache[f.id] = f
    // Include group members so non-friend group mates show up correctly
    for (const g of groups) {
      for (const m of (g.members ?? [])) {
        if (!cache[m.id]) cache[m.id] = formatUser(m)
      }
    }
    return cache
  }, [me, friends, groups])

  const getUser   = useCallback(id => userCache[id] ?? { id, name: '?', initials: '??', color: '#3A3A3C', avatar: null }, [userCache])
  const friendIds = useMemo(() => friends.map(f => f.id), [friends])

  return (
    <Ctx.Provider value={{
      me, friends, friendIds, requests, groups, myVlogs, myStreak,
      notifications, presences, unreadMessages, unreadGroupMsgs,
      getUser, acceptRequest, declineRequest, sendRequest, removeFriend,
      createGroup, deleteGroup, renameGroup, updateGroup, addMember, removeMember, reloadGroups,
      fetchGroupMessages, sendGroupMessage,
      addVlog, deleteVlog, markNotificationsRead, clearUnread,
    }}>
      {children}
    </Ctx.Provider>
  )
}
