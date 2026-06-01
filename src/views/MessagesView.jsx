// v1 — Direct messages
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Send, MessageCircle } from 'lucide-react'
import { useApp, formatUser } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const page = {
  initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 }, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
}

function AvatarCircle({ user, size = 10 }) {
  if (user?.avatar) return (
    <img src={user.avatar} alt={user.name}
      className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0`} />
  )
  return (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}
      style={{ background: `linear-gradient(135deg, ${user?.color ?? '#7B61FF'}, ${user?.color ?? '#7B61FF'}88)` }}>
      {user?.initials ?? '?'}
    </div>
  )
}

function timeAgo(ts) {
  const diff = Date.now() - ts
  if (diff < 60_000)  return 'Gerade eben'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} Min.`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} Std.`
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

// ── Conversation view ─────────────────────────────────────────────────────────
function ConversationView({ friend, onBack }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [text,     setText]     = useState('')
  const [sending,  setSending]  = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    api.messages.conversation(friend.id).then(d => {
      if (d.messages) setMessages(d.messages)
    })
  }, [friend.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    try {
      const { message } = await api.messages.send(friend.id, trimmed)
      if (message) setMessages(p => [...p, message])
    } catch {}
    setSending(false)
  }

  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  return (
    <motion.div key={`convo-${friend.id}`} {...page}
      className="flex flex-col min-h-screen bg-[#0A0A0B]">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 border-b border-[#2C2C2E] flex-shrink-0">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <AvatarCircle user={friend} size={10} />
        <span className="text-white font-semibold text-base">{friend.name}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 pb-28">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <MessageCircle size={32} className="text-[#3A3A3C]" />
            <p className="text-[#8E8E93] text-sm">Schreibe als Erster</p>
          </div>
        )}
        {messages.map((m, i) => {
          const isMe = m.from_id === user?.id
          return (
            <motion.div key={m.id ?? i}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                isMe
                  ? 'text-white rounded-br-md'
                  : 'text-white rounded-bl-md bg-[#1C1C1E]'
              }`}
                style={isMe ? { background: 'linear-gradient(135deg, #7B61FF, #5B45CC)' } : {}}>
                {m.text}
              </div>
            </motion.div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] px-4 pb-8 pt-3 bg-[#0A0A0B]/95 backdrop-blur-xl border-t border-[#2C2C2E]">
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-3 focus-within:border-[#7B61FF] transition-colors">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={onKey}
              placeholder="Nachricht…"
              rows={1}
              className="w-full bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none resize-none leading-relaxed"
              style={{ maxHeight: 96 }}
            />
          </div>
          <motion.button whileTap={{ scale: 0.88 }} onClick={send}
            disabled={!text.trim() || sending}
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
            <Send size={17} className="text-white" style={{ transform: 'translateX(1px)' }} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Conversation list ─────────────────────────────────────────────────────────
function ConversationList({ onSelect }) {
  const { friends, getUser, clearUnread } = useApp()
  const [convos,  setConvos]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    clearUnread()
    api.messages.conversations().then(d => {
      if (d.conversations) setConvos(d.conversations)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Build list: active conversations first, then all friends
  const convoMap = new Map(convos.map(c => [c.partner_id, c]))
  const friendsWithConvo = friends.map(f => ({ friend: f, convo: convoMap.get(f.id) ?? null }))
    .sort((a, b) => (b.convo?.created_at ?? 0) - (a.convo?.created_at ?? 0))

  return (
    <motion.div key="list" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.28 }}
      className="min-h-screen bg-[#0A0A0B] pb-28">

      <div className="px-5 pt-14 pb-5">
        <span className="text-[22px] font-bold text-white">Nachrichten</span>
      </div>

      {loading && (
        <div className="flex justify-center pt-16">
          <div className="w-7 h-7 rounded-full border-2 border-[#7B61FF] border-t-transparent animate-spin" />
        </div>
      )}

      {!loading && friends.length === 0 && (
        <div className="flex flex-col items-center pt-20 gap-3 px-8">
          <MessageCircle size={40} className="text-[#3A3A3C]" />
          <p className="text-white font-semibold text-center">Noch keine Freunde</p>
          <p className="text-[#8E8E93] text-sm text-center">Füge Freunde hinzu, um Nachrichten zu senden</p>
        </div>
      )}

      {!loading && friends.length > 0 && (
        <div className="px-5 space-y-2">
          {friendsWithConvo.map(({ friend, convo }, i) => (
            <motion.div key={friend.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(friend)}
              className="flex items-center gap-3 bg-[#141415] border border-[#2C2C2E] rounded-2xl p-3.5 cursor-pointer">
              <div className="relative">
                <AvatarCircle user={friend} size={11} />
                {convo?.unread > 0 && (
                  <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#7B61FF] flex items-center justify-center">
                    <span className="text-[9px] text-white font-bold">{Math.min(convo.unread, 9)}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{friend.name}</p>
                {convo ? (
                  <p className={`text-xs truncate mt-0.5 ${convo.unread > 0 ? 'text-white font-medium' : 'text-[#8E8E93]'}`}>
                    {convo.text}
                  </p>
                ) : (
                  <p className="text-xs text-[#3A3A3C] mt-0.5">Noch keine Nachrichten</p>
                )}
              </div>
              {convo && (
                <span className="text-[10px] text-[#8E8E93] flex-shrink-0">{timeAgo(convo.created_at)}</span>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ── Root MessagesView ─────────────────────────────────────────────────────────
export default function MessagesView() {
  const [selected, setSelected] = useState(null)

  return (
    <AnimatePresence mode="wait">
      {!selected && (
        <ConversationList key="list" onSelect={setSelected} />
      )}
      {selected && (
        <ConversationView key={`convo-${selected.id}`} friend={selected} onBack={() => setSelected(null)} />
      )}
    </AnimatePresence>
  )
}
