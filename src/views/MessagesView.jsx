import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Send, MessageCircle, UserPlus, Search } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import UserAvatar from '../components/UserAvatar'
import { api } from '../lib/api'

const fwd = {
  initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 }, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
}
const back = {
  initial: { opacity: 0, y: 22 }, animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 }, transition: { duration: 0.28 },
}

function timeAgo(ts) {
  const diff = Date.now() - ts
  if (diff < 60_000)    return 'Jetzt'
  if (diff < 3600_000)  return `${Math.floor(diff / 60_000)}m`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function formatTimestamp(ts) {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' · ' +
         d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// ── Conversation view ─────────────────────────────────────────────────────────
function ConversationView({ friend, onBack }) {
  const { user }      = useAuth()
  const { presences } = useApp()
  const toast         = useToast()
  const [messages, setMessages] = useState([])
  const [text,     setText]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [loading,  setLoading]  = useState(true)
  const bottomRef   = useRef(null)
  const textareaRef = useRef(null)
  const lastMsgId   = useRef(null)

  const fetchMessages = useCallback(async (scrollToBottom = false) => {
    const d = await api.messages.conversation(friend.id).catch(() => null)
    if (!d?.messages) return
    setMessages(d.messages)
    setLoading(false)
    const newest = d.messages[d.messages.length - 1]?.id
    if (scrollToBottom || newest !== lastMsgId.current) {
      lastMsgId.current = newest
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: scrollToBottom ? 'instant' : 'smooth' }), 50)
    }
  }, [friend.id])

  useEffect(() => {
    fetchMessages(true)
    const t = setInterval(() => fetchMessages(false), 3_000)
    return () => clearInterval(t)
  }, [fetchMessages])

  const handleInput = e => {
    setText(e.target.value)
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 112) + 'px' }
  }

  const send = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const optimistic = {
      id: `opt-${Date.now()}`,
      from_id: user?.id, to_id: friend.id,
      text: trimmed, created_at: Date.now(),
      from_name: user?.username ?? '?', optimistic: true,
    }
    setMessages(p => [...p, optimistic])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    try {
      const { message, error } = await api.messages.send(friend.id, trimmed)
      if (error) throw new Error(error)
      setMessages(p => p.map(m => m.id === optimistic.id
        ? { ...message, from_name: user?.username ?? '?' } : m))
    } catch (err) {
      setMessages(p => p.filter(m => m.id !== optimistic.id))
      setText(trimmed)
      toast?.show(err.message || 'Senden fehlgeschlagen.', 'error')
    }
    setSending(false)
  }

  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  const onlineTs    = presences[friend.id]
  const isOnline    = onlineTs && Date.now() - onlineTs < 2 * 60_000
  const onlineLabel = isOnline
    ? 'Online'
    : onlineTs ? `Vor ${Math.floor((Date.now() - onlineTs) / 60_000)} Min.` : 'Offline'

  // Group consecutive messages from same sender
  const grouped = messages.map((m, i) => ({
    ...m,
    first: i === 0 || messages[i - 1].from_id !== m.from_id,
    last:  i === messages.length - 1 || messages[i + 1]?.from_id !== m.from_id,
  }))

  return (
    <motion.div key={`convo-${friend.id}`} {...fwd}
      className="flex flex-col h-screen" style={{ background: '#0A0A0B' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 flex-shrink-0"
        style={{
          background: 'rgba(10,10,11,0.96)',
          backdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <motion.button whileTap={{ scale: 0.96 }} className="relative flex-shrink-0">
          <UserAvatar user={friend} size={40} />
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0A0A0B]"
            style={{ background: isOnline ? '#2ECC71' : '#3A3A3C' }} />
        </motion.button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-base truncate">{friend.name}</p>
          <p className="text-xs font-medium mt-0.5" style={{ color: isOnline ? '#2ECC71' : '#8E8E93' }}>
            {onlineLabel}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {loading && (
          <div className="flex justify-center pt-16">
            <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: '#7B61FF', borderTopColor: 'transparent' }} />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 pb-16">
            <div className="w-16 h-16 rounded-2xl bg-[#1C1C1E] flex items-center justify-center">
              <MessageCircle size={26} className="text-[#3A3A3C]" />
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-sm">{friend.name}</p>
              <p className="text-[#8E8E93] text-xs mt-1">Schreib als Erster ✌️</p>
            </div>
          </div>
        )}

        <div className="space-y-0">
          {grouped.map((m, i) => {
            const isMe = m.from_id === user?.id
            return (
              <motion.div key={m.id ?? i}
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: m.optimistic ? 0.6 : 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18 }}
                className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'} ${m.first ? 'mt-4' : 'mt-0.5'}`}>

                {!isMe && (
                  <div style={{ width: 28, flexShrink: 0 }}>
                    {m.last ? <UserAvatar user={friend} size={28} /> : null}
                  </div>
                )}

                <div className="flex flex-col" style={{ maxWidth: '76%' }}>
                  <div className="px-4 py-2.5 text-sm leading-relaxed text-white"
                    style={isMe ? {
                      background: 'linear-gradient(135deg, #7B61FF, #5B45CC)',
                      borderRadius: 20,
                      borderBottomRightRadius: m.last ? 6 : 20,
                      borderTopRightRadius: m.first ? 6 : 20,
                    } : {
                      background: 'rgba(28,28,30,0.9)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 20,
                      borderBottomLeftRadius: m.last ? 6 : 20,
                      borderTopLeftRadius: m.first ? 6 : 20,
                    }}>
                    {m.text}
                  </div>
                  {m.last && (
                    <span className={`text-[10px] text-[#3A3A3C] mt-1.5 ${isMe ? 'text-right' : 'ml-1'}`}>
                      {formatTimestamp(m.created_at)}
                    </span>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] px-4 pb-8 pt-3"
        style={{
          background: 'rgba(10,10,11,0.97)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
        <div className="flex items-end gap-2.5">
          <div className="flex-1 rounded-2xl px-4 py-3 focus-within:border-[#7B61FF]/60 transition-all"
            style={{ background: 'rgba(28,28,30,0.9)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
            <textarea
              ref={textareaRef}
              value={text}
              onInput={handleInput}
              onChange={handleInput}
              onKeyDown={onKey}
              placeholder="Nachricht…"
              rows={1}
              maxLength={1000}
              className="w-full bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none resize-none leading-relaxed"
              style={{ maxHeight: 112, minHeight: 20, caretColor: '#7B61FF' }}
            />
          </div>
          <motion.button whileTap={{ scale: 0.85 }} onClick={send}
            disabled={!text.trim() || sending}
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, #7B61FF, #00D9FF)',
              boxShadow: text.trim() ? '0 0 16px rgba(123,97,255,0.5)' : 'none',
            }}>
            <Send size={17} className="text-white" style={{ transform: 'translateX(1px)' }} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Conversation list ─────────────────────────────────────────────────────────
function ConversationList({ onSelect, onFindFriends }) {
  const { friends, clearUnread, presences } = useApp()
  const [convos,  setConvos]  = useState([])
  const [loading, setLoading] = useState(true)
  const [query,   setQuery]   = useState('')

  useEffect(() => {
    clearUnread()
    api.messages.conversations().then(d => {
      if (d.conversations) setConvos(d.conversations)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const convoMap = new Map(convos.map(c => [c.partner_id, c]))
  const filtered = friends
    .filter(f => !query || f.name.toLowerCase().includes(query.toLowerCase()))
    .map(f => ({ friend: f, convo: convoMap.get(f.id) ?? null }))
    .sort((a, b) => (b.convo?.created_at ?? 0) - (a.convo?.created_at ?? 0))

  const totalUnread = convos.reduce((s, c) => s + (c.unread ?? 0), 0)

  return (
    <motion.div key="list" {...back} className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>

      {/* Header */}
      <div className="px-5 pt-14 pb-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-black text-white tracking-tight">Nachrichten</h1>
            {totalUnread > 0 && (
              <div className="w-6 h-6 rounded-full bg-[#7B61FF] flex items-center justify-center"
                style={{ boxShadow: '0 0 12px rgba(123,97,255,0.5)' }}>
                <span className="text-[11px] text-white font-black">{Math.min(totalUnread, 9)}</span>
              </div>
            )}
          </div>
          {onFindFriends && (
            <motion.button whileTap={{ scale: 0.88 }} onClick={onFindFriends}
              className="w-9 h-9 rounded-full bg-[#1C1C1E] flex items-center justify-center">
              <UserPlus size={16} className="text-[#8E8E93]" />
            </motion.button>
          )}
        </div>

        {/* Search */}
        {friends.length > 3 && (
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(28,28,30,0.9)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
            <Search size={15} className="text-[#8E8E93] flex-shrink-0" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Suchen…"
              className="flex-1 bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none"
              style={{ caretColor: '#7B61FF' }} />
          </div>
        )}
      </div>

      {loading && (
        <div className="flex justify-center pt-12">
          <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: '#7B61FF', borderTopColor: 'transparent' }} />
        </div>
      )}

      {!loading && friends.length === 0 && (
        <div className="flex flex-col items-center pt-16 gap-5 px-8">
          <div className="w-20 h-20 rounded-3xl bg-[#1C1C1E] flex items-center justify-center"
            style={{ boxShadow: '0 0 40px rgba(123,97,255,0.08)' }}>
            <MessageCircle size={32} className="text-[#3A3A3C]" />
          </div>
          <div className="text-center">
            <p className="text-white font-black text-base">Noch keine Freunde</p>
            <p className="text-[#8E8E93] text-sm mt-1.5 leading-relaxed">
              Füge Freunde hinzu, um Nachrichten zu senden
            </p>
          </div>
          {onFindFriends && (
            <motion.button whileTap={{ scale: 0.96 }} onClick={onFindFriends}
              className="px-6 py-3.5 rounded-2xl font-black text-white text-sm flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 24px rgba(123,97,255,0.4)' }}>
              <UserPlus size={15} className="text-white" />
              Freunde finden
            </motion.button>
          )}
        </div>
      )}

      {!loading && friends.length > 0 && (
        <div className="px-5 space-y-2">
          {filtered.map(({ friend, convo }, i) => {
            const onlineTs = presences[friend.id]
            const isOnline = onlineTs && Date.now() - onlineTs < 2 * 60_000
            const hasUnread = (convo?.unread ?? 0) > 0

            return (
              <motion.div key={friend.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(friend)}
                className="flex items-center gap-3.5 rounded-2xl p-3.5 cursor-pointer relative overflow-hidden"
                style={{
                  background: hasUnread
                    ? 'linear-gradient(135deg, rgba(123,97,255,0.1), rgba(0,217,255,0.05))'
                    : 'rgba(20,20,21,0.9)',
                  border: `1px solid ${hasUnread ? 'rgba(123,97,255,0.3)' : 'rgba(255,255,255,0.05)'}`,
                }}>

                {/* Avatar with online dot */}
                <div className="relative flex-shrink-0">
                  <UserAvatar user={friend} size={48} />
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[#0A0A0B]"
                    style={{ background: isOnline ? '#2ECC71' : '#3A3A3C' }} />
                  {hasUnread && (
                    <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#0A0A0B]"
                      style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
                      <span className="text-[9px] text-white font-black">{Math.min(convo.unread, 9)}</span>
                    </div>
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className={`text-sm font-black truncate ${hasUnread ? 'text-white' : 'text-white'}`}>
                      {friend.name}
                    </p>
                    {convo && (
                      <span className="text-[10px] text-[#8E8E93] flex-shrink-0 font-medium">
                        {timeAgo(convo.created_at)}
                      </span>
                    )}
                  </div>
                  {convo ? (
                    <p className={`text-xs truncate ${hasUnread ? 'text-white font-semibold' : 'text-[#8E8E93]'}`}>
                      {convo.from_id !== friend.id ? 'Du: ' : ''}{convo.text}
                    </p>
                  ) : (
                    <p className="text-xs text-[#3A3A3C]">Noch keine Nachrichten</p>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function MessagesView({ onFindFriends }) {
  const [selected, setSelected] = useState(null)

  return (
    <AnimatePresence mode="wait">
      {!selected
        ? <ConversationList key="list"    onSelect={setSelected} onFindFriends={onFindFriends} />
        : <ConversationView key={`c-${selected.id}`} friend={selected} onBack={() => setSelected(null)} />
      }
    </AnimatePresence>
  )
}
