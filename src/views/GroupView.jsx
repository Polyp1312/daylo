import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, UserPlus, ChevronLeft, Users, Check, Pencil, X, Crown,
  MessageCircle, Send, LogOut, Play, CornerUpLeft, Link, Copy,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'
import UserAvatar from '../components/UserAvatar'
import { api } from '../lib/api'

const fwd  = { initial: { opacity: 0, x: 40  }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -30 }, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }
const back = { initial: { opacity: 0, x: -40 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x:  30 }, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }

const EMOJIS = ['🎬', '🎮', '🏋️', '🌍', '🎵', '🍕', '🏄', '⚽', '🎭', '🚀', '🎨', '📚', '🏕️', '🎯', '🌅', '🐉']
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🔥', '🥺']

function formatTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// ── Group list ───────────────────────────────────────────────────────────────
function GroupList({ onSelect, onCreate, onOpenChat, onJoinByCode }) {
  const { groups, getUser } = useApp()
  const totalUnread = groups.reduce((s, g) => s + (g.unreadCount ?? 0), 0)

  return (
    <motion.div key="list" {...back} className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>
      <div className="flex items-center justify-between px-5 pt-14 pb-5">
        <div className="flex items-center gap-2.5">
          <span className="text-[26px] font-black text-white tracking-tight">Gruppen</span>
          {totalUnread > 0 && (
            <div className="w-6 h-6 rounded-full bg-[#7B61FF] flex items-center justify-center shadow-lg"
              style={{ boxShadow: '0 0 12px rgba(123,97,255,0.5)' }}>
              <span className="text-[11px] text-white font-black">{Math.min(totalUnread, 9)}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <motion.button whileTap={{ scale: 0.88 }} onClick={onJoinByCode}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-sm font-bold"
            style={{ background: 'rgba(0,217,255,0.12)', border: '1px solid rgba(0,217,255,0.3)', color: '#00D9FF' }}>
            <Link size={14} />
            <span>Beitreten</span>
          </motion.button>
          <motion.button whileTap={{ scale: 0.88 }} onClick={onCreate}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 16px rgba(123,97,255,0.4)' }}>
            <Plus size={14} className="text-white" />
            <span className="text-white">Neu</span>
          </motion.button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-8 pt-16 gap-4">
          <div className="w-20 h-20 rounded-3xl bg-[#1C1C1E] flex items-center justify-center text-4xl"
            style={{ boxShadow: '0 0 40px rgba(123,97,255,0.1)' }}>
            👥
          </div>
          <div className="text-center">
            <p className="text-white font-black text-base">Noch keine Gruppe</p>
            <p className="text-[#8E8E93] text-sm mt-1">Erstelle eine Gruppe und lade deine Freunde ein.</p>
          </div>
          <motion.button whileTap={{ scale: 0.96 }} onClick={onCreate}
            className="mt-1 px-6 py-3.5 rounded-2xl font-black text-white text-sm"
            style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 24px rgba(123,97,255,0.4)' }}>
            Gruppe erstellen
          </motion.button>
        </div>
      ) : (
        <div className="px-5 space-y-3">
          {groups.map((g, i) => {
            const todayUser    = getUser(g.rotation[g.todayIdx % Math.max(g.rotation.length, 1)] ?? g.memberIds[0])
            const hasUnread    = (g.unreadCount ?? 0) > 0
            const previewMembers = g.memberIds.slice(0, 3).map(id => getUser(id)).filter(Boolean)

            return (
              <motion.div key={g.id}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(g.id)}
                className="rounded-2xl p-4 cursor-pointer relative overflow-hidden"
                style={{
                  background: hasUnread
                    ? 'linear-gradient(135deg, rgba(123,97,255,0.12), rgba(0,217,255,0.06))'
                    : 'rgba(20,20,21,0.9)',
                  border: `1px solid ${hasUnread ? 'rgba(123,97,255,0.35)' : 'rgba(255,255,255,0.06)'}`,
                }}>

                {hasUnread && (
                  <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                    style={{ background: 'rgba(123,97,255,0.25)' }} />
                )}

                <div className="relative flex items-center gap-3.5">
                  {/* Group emoji */}
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 relative"
                    style={{
                      background: hasUnread ? 'rgba(123,97,255,0.2)' : 'rgba(28,28,30,0.8)',
                      border: `1.5px solid ${hasUnread ? 'rgba(123,97,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    }}>
                    {g.emoji}
                    {hasUnread && (
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#0A0A0B]"
                        style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
                        <span className="text-[9px] text-white font-black">{Math.min(g.unreadCount, 9)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-black text-white text-base truncate">{g.name}</p>
                    {hasUnread ? (
                      <p className="text-xs font-bold mt-0.5" style={{ color: '#7B61FF' }}>
                        {g.unreadCount} neue {g.unreadCount === 1 ? 'Nachricht' : 'Nachrichten'}
                      </p>
                    ) : (
                      <p className="text-xs text-[#8E8E93] mt-0.5">{g.memberIds.length} Mitglieder</p>
                    )}
                    <div className="flex items-center gap-[-6px] mt-2">
                      {previewMembers.map((m, idx) => (
                        <div key={m.id} className="rounded-full border-2 border-[#0A0A0B]"
                          style={{ marginLeft: idx > 0 ? -8 : 0, zIndex: previewMembers.length - idx }}>
                          <UserAvatar user={m} size={20} />
                        </div>
                      ))}
                      {g.memberIds.length > 3 && (
                        <div className="w-5 h-5 rounded-full bg-[#2C2C2E] flex items-center justify-center border-2 border-[#0A0A0B]"
                          style={{ marginLeft: -8 }}>
                          <span className="text-[8px] text-[#8E8E93] font-bold">+{g.memberIds.length - 3}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right side: today indicator or direct chat button */}
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    {todayUser && !hasUnread && (
                      <div className="flex flex-col items-center gap-1">
                        <div className="relative">
                          <UserAvatar user={todayUser} size={32} />
                          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#7B61FF] border-2 border-[#0A0A0B] flex items-center justify-center">
                            <span className="text-[6px] text-white font-black">▶</span>
                          </div>
                        </div>
                        <span className="text-[9px] font-black text-[#7B61FF] uppercase tracking-wide">Heute</span>
                      </div>
                    )}
                    {/* Direct chat button */}
                    <motion.button whileTap={{ scale: 0.82 }}
                      onClick={e => { e.stopPropagation(); onOpenChat(g.id) }}
                      className="w-9 h-9 rounded-full flex items-center justify-center relative"
                      style={{
                        background: hasUnread ? 'rgba(123,97,255,0.8)' : 'rgba(44,44,46,0.9)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}>
                      <MessageCircle size={15} className="text-white" />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}

// ── Create group ─────────────────────────────────────────────────────────────
function CreateGroup({ onBack, onCreated }) {
  const { createGroup } = useApp()
  const toast = useToast()
  const [name,  setName]  = useState('')
  const [emoji, setEmoji] = useState('🎬')

  const submit = async () => {
    if (!name.trim()) return
    try {
      const id = await createGroup(name.trim(), emoji)
      if (id) onCreated(id)
    } catch (e) {
      toast?.show(e.message, 'error')
    }
  }

  return (
    <motion.div key="create" {...fwd} className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>
      <div className="flex items-center gap-3 px-5 pt-14 pb-6">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-xl font-black text-white">Neue Gruppe</span>
      </div>

      <div className="flex justify-center mb-8">
        <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl"
          style={{
            background: 'linear-gradient(135deg, rgba(123,97,255,0.2), rgba(0,217,255,0.15))',
            border: '1.5px solid rgba(123,97,255,0.3)',
            boxShadow: '0 0 40px rgba(123,97,255,0.2)',
          }}>
          {emoji}
        </div>
      </div>

      <div className="px-5 mb-5">
        <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-3">Emoji wählen</p>
        <div className="grid grid-cols-8 gap-2">
          {EMOJIS.map(e => (
            <motion.button key={e} whileTap={{ scale: 0.82 }} onClick={() => setEmoji(e)}
              className="aspect-square rounded-xl text-2xl flex items-center justify-center transition-all"
              style={{
                background: emoji === e ? 'rgba(123,97,255,0.25)' : 'rgba(28,28,30,0.8)',
                border: `1.5px solid ${emoji === e ? 'rgba(123,97,255,0.6)' : 'rgba(255,255,255,0.07)'}`,
                boxShadow: emoji === e ? '0 0 12px rgba(123,97,255,0.3)' : 'none',
              }}>
              {e}
            </motion.button>
          ))}
        </div>
      </div>

      <div className="px-5 mb-6">
        <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-3">Gruppenname</p>
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
          style={{ background: 'rgba(28,28,30,0.9)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
          <span className="text-2xl">{emoji}</span>
          <input
            autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Gruppenname…" maxLength={30}
            className="flex-1 bg-transparent text-white placeholder-[#3A3A3C] text-base font-semibold outline-none"
            style={{ caretColor: '#7B61FF' }}
          />
        </div>
      </div>

      <div className="px-5">
        <motion.button whileTap={{ scale: 0.97 }} onClick={submit} disabled={!name.trim()}
          className="w-full py-4 rounded-2xl font-black text-white text-base disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, #7B61FF, #00D9FF)',
            boxShadow: name.trim() ? '0 0 24px rgba(123,97,255,0.4)' : 'none',
          }}>
          Gruppe erstellen
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Group detail ─────────────────────────────────────────────────────────────
function GroupDetail({ groupId, onBack, onAddMember, onOpenChat, onReveal }) {
  const { groups, me, getUser, removeMember, deleteGroup, renameGroup, updateGroup, presences } = useApp()
  const toast = useToast()
  const group = groups.find(g => g.id === groupId)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmLeave,  setConfirmLeave]  = useState(false)
  const [editing,       setEditing]       = useState(false)
  const [editName,      setEditName]      = useState(group?.name ?? '')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [inviteCode,    setInviteCode]    = useState(null)

  const handleShareInvite = async () => {
    try {
      const { code } = await api.groups.inviteCode(groupId)
      setInviteCode(code)
      if (navigator.share) {
        await navigator.share({ title: `daylo — ${group?.name}`, text: `Tritt meiner daylo-Gruppe bei! Code: ${code}` })
      } else {
        await navigator.clipboard.writeText(code)
        toast?.show(`Code kopiert: ${code}`, 'success')
      }
    } catch {}
  }

  if (!group) { onBack(); return null }

  const isCreator   = group.creatorId === me?.id
  const todayUserId = group.rotation[group.todayIdx % Math.max(group.rotation.length, 1)] ?? group.memberIds[0]
  const hasUnread   = (group.unreadCount ?? 0) > 0

  const isOnline = id => {
    const t = presences?.[id]
    return t && Date.now() - t < 3 * 60 * 1000
  }

  const daysUntilTurn = uid => {
    const rotLen = group.rotation.length
    if (!rotLen) return null
    const pos = group.rotation.indexOf(uid)
    if (pos === -1) return null
    return ((pos - (group.todayIdx % rotLen) + rotLen) % rotLen)
  }

  const saveEdit = async () => {
    if (editName.trim()) await renameGroup(groupId, editName.trim())
    setEditing(false)
  }

  return (
    <motion.div key={`detail-${groupId}`} {...fwd} className="min-h-screen pb-28 relative" style={{ background: '#0A0A0B' }}>

      {/* Emoji picker overlay */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setShowEmojiPicker(false)}>
            <motion.div
              initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              className="w-full p-5 rounded-t-3xl"
              style={{ background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.08)' }}
              onClick={e => e.stopPropagation()}>
              <p className="text-white font-black text-sm mb-4 text-center">Emoji ändern</p>
              <div className="grid grid-cols-8 gap-2 mb-4">
                {EMOJIS.map(e => (
                  <motion.button key={e} whileTap={{ scale: 0.82 }}
                    onClick={async () => { await updateGroup(groupId, { emoji: e }); setShowEmojiPicker(false) }}
                    className="aspect-square rounded-xl text-2xl flex items-center justify-center"
                    style={{
                      background: group.emoji === e ? 'rgba(123,97,255,0.25)' : 'rgba(44,44,46,0.8)',
                      border: `1.5px solid ${group.emoji === e ? 'rgba(123,97,255,0.6)' : 'rgba(255,255,255,0.07)'}`,
                    }}>
                    {e}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="relative">
        <div className="h-32 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(123,97,255,0.25), rgba(0,217,255,0.12))' }}>
          <div className="absolute -top-8 -left-8 w-40 h-40 rounded-full blur-3xl"
            style={{ background: 'rgba(123,97,255,0.3)' }} />
        </div>

        <div className="absolute top-0 inset-x-0 flex items-center justify-between px-5 pt-14">
          <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)' }}>
            <ChevronLeft size={18} className="text-white" />
          </motion.button>

          <motion.button whileTap={{ scale: 0.88 }} onClick={onOpenChat}
            className="relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: hasUnread ? 'rgba(123,97,255,0.8)' : 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(12px)',
            }}>
            <MessageCircle size={18} className="text-white" />
            {hasUnread && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-[#0A0A0B] flex items-center justify-center">
                <span className="text-[8px] text-white font-black">{Math.min(group.unreadCount, 9)}</span>
              </div>
            )}
          </motion.button>
        </div>

        {/* Group info */}
        <div className="px-5 -mt-8 relative z-10 flex items-end gap-4 mb-4">
          <motion.div
            whileTap={isCreator ? { scale: 0.92 } : {}}
            onClick={isCreator ? () => setShowEmojiPicker(true) : undefined}
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 border-2 border-[#0A0A0B] relative"
            style={{
              background: 'rgba(28,28,30,0.95)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              cursor: isCreator ? 'pointer' : 'default',
            }}>
            {group.emoji}
            {isCreator && (
              <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#7B61FF] border-2 border-[#0A0A0B] flex items-center justify-center">
                <Pencil size={8} className="text-white" />
              </div>
            )}
          </motion.div>
          <div className="pb-1 flex-1 min-w-0">
            {editing ? (
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                onBlur={saveEdit} onKeyDown={e => e.key === 'Enter' && saveEdit()}
                className="w-full bg-[#1C1C1E] text-white font-black text-xl px-3 py-1.5 rounded-xl outline-none border border-[#7B61FF]" />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-white font-black text-xl truncate">{group.name}</span>
                {isCreator && (
                  <motion.button whileTap={{ scale: 0.85 }} onClick={() => { setEditName(group.name); setEditing(true) }}>
                    <Pencil size={13} className="text-[#8E8E93]" />
                  </motion.button>
                )}
              </div>
            )}
            <p className="text-[#8E8E93] text-xs mt-0.5">{group.memberIds.length} Mitglieder</p>
          </div>
        </div>
      </div>

      {/* Chat shortcut */}
      <div className="px-5 mb-4">
        <motion.button whileTap={{ scale: 0.98 }} onClick={onOpenChat}
          className="w-full flex items-center gap-3 p-4 rounded-2xl"
          style={{
            background: hasUnread ? 'rgba(123,97,255,0.12)' : 'rgba(20,20,21,0.9)',
            border: `1px solid ${hasUnread ? 'rgba(123,97,255,0.35)' : 'rgba(255,255,255,0.06)'}`,
          }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: hasUnread ? 'rgba(123,97,255,0.8)' : 'rgba(44,44,46,0.8)' }}>
            <MessageCircle size={18} className="text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-sm text-white">Gruppen-Chat</p>
            {hasUnread
              ? <p className="text-xs font-bold text-[#7B61FF] mt-0.5">{group.unreadCount} neue {group.unreadCount === 1 ? 'Nachricht' : 'Nachrichten'}</p>
              : <p className="text-xs text-[#8E8E93] mt-0.5">Schreib deiner Gruppe</p>
            }
          </div>
          <ChevronLeft size={16} className="text-[#8E8E93] rotate-180" />
        </motion.button>
      </div>

      {/* Members */}
      <div className="px-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-black text-white">{group.memberIds.length} Mitglieder</span>
          <div className="flex gap-2">
            <motion.button whileTap={{ scale: 0.88 }} onClick={handleShareInvite}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(0,217,255,0.12)', border: '1px solid rgba(0,217,255,0.3)', color: '#00D9FF' }}>
              <Link size={12} />
              {inviteCode ? inviteCode : 'Einladen'}
            </motion.button>
            {isCreator && (
              <motion.button whileTap={{ scale: 0.88 }} onClick={onAddMember}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: 'rgba(123,97,255,0.15)', border: '1px solid rgba(123,97,255,0.3)', color: '#7B61FF' }}>
                <UserPlus size={12} />
                Hinzufügen
              </motion.button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <AnimatePresence>
            {group.memberIds.map((uid, i) => {
              const u = getUser(uid)
              if (!u) return null
              const isMe            = uid === me?.id
              const isToday         = uid === todayUserId
              const isCreatorMember = uid === group.creatorId
              const days            = daysUntilTurn(uid)
              const online          = isOnline(uid)

              return (
                <motion.div key={uid} layout
                  initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3 p-3 rounded-2xl"
                  style={{
                    background: isToday
                      ? 'linear-gradient(135deg, rgba(123,97,255,0.15), rgba(0,217,255,0.08))'
                      : 'rgba(20,20,21,0.9)',
                    border: `1px solid ${isToday ? 'rgba(123,97,255,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  }}>
                  <div className="relative flex-shrink-0">
                    <UserAvatar user={u} size={42} />
                    {online && !isToday && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#2ECC71] border-2 border-[#0A0A0B]" />
                    )}
                    {isToday && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#7B61FF] border-2 border-[#0A0A0B] flex items-center justify-center">
                        <span className="text-[7px] text-white font-black">▶</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white truncate">{u.name}{isMe ? ' (Du)' : ''}</span>
                      {isCreatorMember && <Crown size={11} className="text-[#FF9F43] flex-shrink-0" />}
                      {isToday && (
                        <span className="text-[9px] font-black text-white px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
                          HEUTE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8E8E93] mt-0.5">
                      {isToday ? 'Nimmt heute auf'
                        : days === null ? 'Nicht in Rotation'
                        : days === 0 ? 'Heute dran'
                        : days === 1 ? 'Morgen dran'
                        : `In ${days} Tagen`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {onReveal && (
                      <motion.button whileTap={{ scale: 0.85 }} onClick={() => onReveal(uid)}
                        className="w-8 h-8 rounded-2xl flex items-center justify-center"
                        style={{ background: 'rgba(123,97,255,0.2)', border: '1px solid rgba(123,97,255,0.3)' }}>
                        <Play size={12} className="text-[#7B61FF] ml-0.5" fill="#7B61FF" />
                      </motion.button>
                    )}
                    {isCreator && !isMe && (
                      confirmRemove === uid ? (
                        <div className="flex gap-1.5">
                          <motion.button whileTap={{ scale: 0.88 }}
                            onClick={async () => { await removeMember(groupId, uid); setConfirmRemove(null) }}
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(255,59,48,0.15)', border: '1px solid rgba(255,59,48,0.35)' }}>
                            <Check size={12} className="text-red-400" />
                          </motion.button>
                          <motion.button whileTap={{ scale: 0.88 }} onClick={() => setConfirmRemove(null)}
                            className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                            <X size={12} className="text-[#8E8E93]" />
                          </motion.button>
                        </div>
                      ) : (
                        <motion.button whileTap={{ scale: 0.85 }} onClick={() => setConfirmRemove(uid)}
                          className="w-8 h-8 rounded-full bg-[#1C1C1E] flex items-center justify-center">
                          <Trash2 size={12} className="text-[#3A3A3C]" />
                        </motion.button>
                      )
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Rotation schedule */}
      {group.rotation.length > 1 && (
        <div className="px-5 mb-4">
          <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-3">Rotationsplan</p>
          <div className="space-y-2">
            {Array.from({ length: Math.min(group.rotation.length, 14) }, (_, i) => {
              const rotLen = group.rotation.length
              const rotPos = (group.todayIdx % rotLen + i) % rotLen
              const uid    = group.rotation[rotPos]
              const u      = getUser(uid)
              const date   = new Date(); date.setDate(date.getDate() + i)
              const label  = i === 0 ? 'Heute' : i === 1 ? 'Morgen'
                : date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{
                    background: i === 0 ? 'rgba(123,97,255,0.12)' : 'rgba(20,20,21,0.9)',
                    border: `1px solid ${i === 0 ? 'rgba(123,97,255,0.25)' : 'rgba(255,255,255,0.04)'}`,
                  }}>
                  <UserAvatar user={u} size={30} />
                  <span className={`flex-1 text-sm font-semibold ${i === 0 ? 'text-white' : 'text-[#8E8E93]'}`}>{u?.name ?? '?'}</span>
                  <span className={`text-xs font-bold ${i === 0 ? 'text-[#7B61FF]' : 'text-[#3A3A3C]'}`}>{label}</span>
                  {i === 0 && <div className="w-2 h-2 rounded-full bg-[#7B61FF] flex-shrink-0" />}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Leave / Delete */}
      <div className="px-5">
        {!isCreator && (
          confirmLeave ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-2xl p-4 mb-4"
              style={{ background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.25)' }}>
              <p className="text-white font-bold text-sm mb-1">Gruppe wirklich verlassen?</p>
              <p className="text-[#8E8E93] text-xs mb-4">Du kannst nur wieder beitreten wenn dich jemand einlädt.</p>
              <div className="flex gap-2">
                <motion.button whileTap={{ scale: 0.96 }}
                  onClick={async () => { await removeMember(groupId, me.id); onBack() }}
                  className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-bold text-sm">
                  Verlassen
                </motion.button>
                <motion.button whileTap={{ scale: 0.96 }} onClick={() => setConfirmLeave(false)}
                  className="flex-1 py-3 rounded-xl bg-[#2C2C2E] text-white font-bold text-sm">
                  Abbrechen
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirmLeave(true)}
              className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 mb-3"
              style={{ border: '1px solid rgba(255,149,0,0.25)', background: 'rgba(255,149,0,0.06)' }}>
              <LogOut size={14} className="text-orange-400" />
              <span className="text-orange-400 font-bold text-sm">Gruppe verlassen</span>
            </motion.button>
          )
        )}

        {isCreator && (
          confirmDelete ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-2xl p-4"
              style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)' }}>
              <p className="text-white font-bold text-sm mb-1">Gruppe wirklich löschen?</p>
              <p className="text-[#8E8E93] text-xs mb-4">Alle Nachrichten und Mitglieder werden entfernt.</p>
              <div className="flex gap-2">
                <motion.button whileTap={{ scale: 0.96 }}
                  onClick={async () => { await deleteGroup(groupId); onBack() }}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm">
                  Löschen
                </motion.button>
                <motion.button whileTap={{ scale: 0.96 }} onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-3 rounded-xl bg-[#2C2C2E] text-white font-bold text-sm">
                  Abbrechen
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirmDelete(true)}
              className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2"
              style={{ border: '1px solid rgba(255,59,48,0.2)', background: 'rgba(255,59,48,0.05)' }}>
              <Trash2 size={14} className="text-red-400" />
              <span className="text-red-400 font-bold text-sm">Gruppe löschen</span>
            </motion.button>
          )
        )}
      </div>
    </motion.div>
  )
}

// ── Group chat ────────────────────────────────────────────────────────────────
function GroupChat({ groupId, onBack }) {
  const { groups, me, getUser, fetchGroupMessages, sendGroupMessage } = useApp()
  const toast    = useToast()
  const group    = groups.find(g => g.id === groupId)
  const [messages,         setMessages]         = useState([])
  const [text,             setText]             = useState('')
  const [loading,          setLoading]          = useState(true)
  const [sending,          setSending]          = useState(false)
  const [replyTo,          setReplyTo]          = useState(null)   // { id, text, from_name }
  const [showReactionFor,  setShowReactionFor]  = useState(null)   // message id
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    setLoading(true)
    fetchGroupMessages(groupId).then(msgs => {
      setMessages(msgs ?? [])
      setLoading(false)
    })
  }, [groupId])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [messages])

  useEffect(() => {
    const t = setInterval(() => {
      fetchGroupMessages(groupId).then(msgs => setMessages(msgs ?? []))
    }, 5_000)
    return () => clearInterval(t)
  }, [groupId])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    const currentReplyTo = replyTo
    setSending(true); setText(''); setReplyTo(null)
    try {
      const msg = await sendGroupMessage(groupId, trimmed, currentReplyTo?.id ?? null)
      if (msg) {
        setMessages(p => [...p, msg])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    } catch (err) {
      setText(trimmed)
      setReplyTo(currentReplyTo)
      toast?.show(err.message || 'Senden fehlgeschlagen.', 'error')
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const handleReact = async (msgId, emoji) => {
    setShowReactionFor(null)
    try {
      const { reactions } = await api.groups.reactMessage(groupId, msgId, emoji)
      if (reactions) setMessages(p => p.map(m => m.id === msgId ? { ...m, reactions } : m))
    } catch {}
  }

  const handleMsgTap = msgId => {
    setShowReactionFor(p => p === msgId ? null : msgId)
  }

  if (!group) { onBack(); return null }

  let lastSenderId = null
  let lastDate     = null

  return (
    <motion.div key="chat" {...fwd} className="flex flex-col h-screen" style={{ background: '#0A0A0B' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 flex-shrink-0"
        style={{
          background: 'rgba(10,10,11,0.95)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: 'rgba(28,28,30,0.9)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {group.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-black truncate">{group.name}</p>
          <p className="text-xs text-[#8E8E93] mt-0.5">{group.memberIds.length} Mitglieder</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5"
        onClick={() => setShowReactionFor(null)}>
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: '#7B61FF', borderTopColor: 'transparent' }} />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="text-5xl">{group.emoji}</div>
            <p className="text-white font-black text-base">Noch keine Nachrichten</p>
            <p className="text-[#8E8E93] text-sm text-center">Schreib die erste Nachricht!</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe       = msg.user_id === me?.id
          const sender     = getUser(msg.user_id)
          const senderName = msg.from_name ?? sender?.name ?? '?'
          const showName   = !isMe && msg.user_id !== lastSenderId
          const msgDate    = new Date(msg.created_at).toDateString()
          const showDate   = msgDate !== lastDate
          lastSenderId     = msg.user_id
          lastDate         = msgDate
          const isActive   = showReactionFor === msg.id

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-5">
                  <span className="text-[10px] text-[#8E8E93] px-3 py-1.5 rounded-full font-semibold"
                    style={{ background: 'rgba(28,28,30,0.9)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {new Date(msg.created_at).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </span>
                </div>
              )}

              <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'} mb-0.5`}>
                {!isMe && showName
                  ? <UserAvatar user={sender} size={28} />
                  : !isMe ? <div style={{ width: 28, flexShrink: 0 }} />
                  : null}

                <div className={`max-w-[76%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {showName && (
                    <span className="text-[11px] text-[#8E8E93] mb-1 px-1 font-semibold">{senderName}</span>
                  )}

                  {/* Bubble */}
                  <motion.div
                    whileTap={{ scale: 0.97 }}
                    onClick={e => { e.stopPropagation(); handleMsgTap(msg.id) }}
                    className="px-4 py-2.5 rounded-2xl text-sm text-white leading-snug break-words cursor-pointer select-none"
                    style={isMe
                      ? { background: isActive ? 'linear-gradient(135deg, #9B7BFF, #7B61FF)' : 'linear-gradient(135deg, #7B61FF, #9B7BFF)', borderBottomRightRadius: 6 }
                      : { background: isActive ? 'rgba(44,44,46,0.95)' : 'rgba(28,28,30,0.9)', border: '1px solid rgba(255,255,255,0.06)', borderBottomLeftRadius: 6 }
                    }>

                    {/* Reply preview */}
                    {msg.replyTo && (
                      <div className="rounded-lg px-2.5 py-1.5 mb-2 -mx-0.5"
                        style={{
                          background: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.15)',
                          borderLeft: '2.5px solid rgba(255,255,255,0.35)',
                        }}>
                        <p className="text-[10px] font-bold text-white/70 mb-0.5 truncate">{msg.replyTo.from_name}</p>
                        <p className="text-[11px] text-white/55 truncate">{msg.replyTo.text}</p>
                      </div>
                    )}
                    {msg.text}
                  </motion.div>

                  {/* Timestamp */}
                  <span className="text-[10px] text-[#3A3A3C] mt-1 px-1">{formatTime(msg.created_at)}</span>

                  {/* Reactions display */}
                  {msg.reactions?.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {msg.reactions.map(r => (
                        <motion.button key={r.emoji} whileTap={{ scale: 0.85 }}
                          onClick={e => { e.stopPropagation(); handleReact(msg.id, r.emoji) }}
                          className="flex items-center gap-1 rounded-full px-2 py-0.5"
                          style={{
                            background: r.mine ? 'rgba(123,97,255,0.3)' : 'rgba(28,28,30,0.95)',
                            border: `1px solid ${r.mine ? 'rgba(123,97,255,0.55)' : 'rgba(255,255,255,0.08)'}`,
                          }}>
                          <span className="text-sm leading-none">{r.emoji}</span>
                          <span className="text-[10px] font-bold text-white">{r.count}</span>
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Reaction / reply picker */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.88, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.88, y: -6 }}
                    transition={{ duration: 0.16 }}
                    onClick={e => e.stopPropagation()}
                    className={`flex items-center gap-1.5 mb-2 ${isMe ? 'justify-end pr-2' : 'justify-start pl-10'}`}>
                    <div className="flex items-center gap-1 p-1.5 rounded-2xl"
                      style={{ background: 'rgba(28,28,30,0.98)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                      {REACTION_EMOJIS.map(e => (
                        <motion.button key={e} whileTap={{ scale: 0.75 }}
                          onClick={() => handleReact(msg.id, e)}
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xl hover:bg-white/10 transition-colors">
                          {e}
                        </motion.button>
                      ))}
                      {/* Reply button */}
                      <div className="w-px h-6 bg-white/10 mx-0.5" />
                      <motion.button whileTap={{ scale: 0.75 }}
                        onClick={() => {
                          setReplyTo({ id: msg.id, text: msg.text, from_name: senderName })
                          setShowReactionFor(null)
                          setTimeout(() => inputRef.current?.focus(), 50)
                        }}
                        className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
                        <CornerUpLeft size={15} className="text-[#8E8E93]" />
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply context bar */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="flex items-center gap-2.5 px-4 py-2.5 flex-shrink-0"
            style={{
              background: 'rgba(28,28,30,0.98)',
              borderTop: '1px solid rgba(123,97,255,0.25)',
            }}>
            <CornerUpLeft size={13} className="text-[#7B61FF] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#7B61FF] font-bold mb-0.5">{replyTo.from_name}</p>
              <p className="text-[11px] text-[#8E8E93] truncate">{replyTo.text}</p>
            </div>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setReplyTo(null)}>
              <X size={14} className="text-[#8E8E93]" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 pb-8 flex items-center gap-2.5"
        style={{
          background: 'rgba(10,10,11,0.96)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
        <div className="flex-1 rounded-2xl px-4 py-3 focus-within:border-[#7B61FF]/60 transition-all"
          style={{ background: 'rgba(28,28,30,0.9)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={replyTo ? 'Antworten…' : 'Nachricht an die Gruppe…'}
            maxLength={500}
            className="w-full bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none"
            style={{ caretColor: '#7B61FF' }}
          />
        </div>
        <motion.button whileTap={{ scale: 0.85 }} onClick={handleSend}
          disabled={!text.trim() || sending}
          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: text.trim() ? '0 0 16px rgba(123,97,255,0.5)' : 'none' }}>
          <Send size={16} className="text-white" style={{ transform: 'translateX(1px)' }} />
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Add member ────────────────────────────────────────────────────────────────
function AddMember({ groupId, onBack }) {
  const { groups, friends, addMember } = useApp()
  const group = groups.find(g => g.id === groupId)
  const [added, setAdded] = useState([])
  const [query, setQuery] = useState('')

  if (!group) { onBack(); return null }

  const eligible = friends.filter(f =>
    !group.memberIds.includes(f.id) &&
    f.name.toLowerCase().includes(query.toLowerCase())
  )

  const handleAdd = async u => {
    await addMember(groupId, u)
    setAdded(p => [...p, u.id])
  }

  return (
    <motion.div key="add-member" {...fwd} className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>
      <div className="flex items-center gap-3 px-5 pt-14 pb-5">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-xl font-black text-white">Mitglied hinzufügen</span>
      </div>

      <div className="px-5 mb-4">
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
          style={{ background: 'rgba(28,28,30,0.9)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
          <Users size={16} className="text-[#8E8E93] flex-shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)} autoFocus
            placeholder="Freund suchen…"
            className="flex-1 bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none"
            style={{ caretColor: '#7B61FF' }} />
        </div>
      </div>

      <div className="px-5 space-y-2.5">
        {eligible.length === 0 && (
          <div className="text-center py-10">
            <p className="text-[#8E8E93] text-sm">
              {friends.length === 0 ? 'Füge zuerst Freunde hinzu.'
                : query ? 'Niemanden gefunden.'
                : 'Alle Freunde sind bereits in der Gruppe.'}
            </p>
          </div>
        )}
        <AnimatePresence>
          {eligible.map((u, i) => {
            const isAdded = added.includes(u.id)
            return (
              <motion.div key={u.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }} transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 rounded-2xl p-3.5"
                style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <UserAvatar user={u} size={46} />
                <span className="text-sm font-bold text-white flex-1">{u.name}</span>
                <motion.button whileTap={{ scale: 0.88 }} onClick={() => handleAdd(u)} disabled={isAdded}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full font-bold text-xs"
                  style={isAdded
                    ? { background: 'rgba(46,204,113,0.15)', border: '1px solid rgba(46,204,113,0.3)', color: '#2ECC71' }
                    : { background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', color: 'white' }}>
                  {isAdded ? <><Check size={12} /> Hinzugefügt</> : <><Plus size={12} /> Hinzufügen</>}
                </motion.button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Join by code ──────────────────────────────────────────────────────────────
function JoinByCode({ onBack, onJoined }) {
  const { reloadGroups } = useApp()
  const toast = useToast()
  const [code,    setCode]    = useState('')
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)

  const handlePreview = async () => {
    if (code.trim().length < 4) return
    setLoading(true)
    const d = await api.groups.previewCode(code.trim()).catch(() => ({}))
    setLoading(false)
    if (d.error) { toast?.show(d.error, 'error'); return }
    setPreview(d)
  }

  const handleJoin = async () => {
    setJoining(true)
    const d = await api.groups.joinByCode(code.trim()).catch(e => ({ error: e.message }))
    setJoining(false)
    if (d.error) { toast?.show(d.error, 'error'); return }
    await reloadGroups()
    toast?.show(`Gruppe beigetreten! 🎉`, 'success')
    onJoined(d.group.id)
  }

  return (
    <motion.div key="join-code" {...fwd} className="min-h-screen pb-28" style={{ background: '#0A0A0B' }}>
      <div className="flex items-center gap-3 px-5 pt-14 pb-6">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-xl font-black text-white">Gruppe beitreten</span>
      </div>

      <div className="px-5 space-y-4">
        <div>
          <p className="text-[11px] text-[#8E8E93] font-bold uppercase tracking-widest mb-3">Einladungscode eingeben</p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-3 rounded-2xl px-4 py-3.5"
              style={{ background: 'rgba(28,28,30,0.9)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
              <Link size={14} className="text-[#8E8E93] flex-shrink-0" />
              <input
                autoFocus value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setPreview(null) }}
                onKeyDown={e => e.key === 'Enter' && handlePreview()}
                placeholder="z.B. A1B2C3D4"
                maxLength={8}
                className="flex-1 bg-transparent text-white placeholder-[#3A3A3C] text-sm font-mono font-bold outline-none tracking-widest"
                style={{ caretColor: '#00D9FF' }}
              />
            </div>
            <motion.button whileTap={{ scale: 0.94 }} onClick={handlePreview}
              disabled={loading || code.trim().length < 4}
              className="px-4 py-3.5 rounded-2xl font-bold text-sm disabled:opacity-40"
              style={{ background: 'rgba(0,217,255,0.15)', border: '1px solid rgba(0,217,255,0.3)', color: '#00D9FF' }}>
              {loading ? '…' : 'Suchen'}
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-5"
              style={{ background: 'rgba(20,20,21,0.9)', border: '1px solid rgba(0,217,255,0.2)' }}>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: 'rgba(0,217,255,0.12)', border: '1px solid rgba(0,217,255,0.25)' }}>
                  {preview.group?.emoji ?? '👥'}
                </div>
                <div>
                  <p className="text-white font-black text-lg">{preview.group?.name}</p>
                  <p className="text-[#8E8E93] text-sm">{preview.group?.memberCount} Mitglieder</p>
                </div>
              </div>
              {preview.alreadyMember ? (
                <p className="text-[#FF9F43] text-sm font-semibold text-center py-2">Du bist bereits Mitglied dieser Gruppe.</p>
              ) : (
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleJoin} disabled={joining}
                  className="w-full py-3.5 rounded-2xl font-black text-white text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)', boxShadow: '0 0 20px rgba(123,97,255,0.35)' }}>
                  {joining ? 'Beitreten…' : `${preview.group?.emoji} Gruppe beitreten`}
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function GroupView({ onReveal }) {
  const [screen,  setScreen]  = useState('list')
  const [groupId, setGroupId] = useState(null)

  return (
    <AnimatePresence mode="wait">
      {screen === 'list' && (
        <GroupList key="list"
          onSelect={id => { setGroupId(id); setScreen('detail') }}
          onCreate={() => setScreen('create')}
          onJoinByCode={() => setScreen('join-code')}
          onOpenChat={id => { setGroupId(id); setScreen('chat') }} />
      )}
      {screen === 'create' && (
        <CreateGroup key="create"
          onBack={() => setScreen('list')}
          onCreated={id => { setGroupId(id); setScreen('detail') }} />
      )}
      {screen === 'detail' && (
        <GroupDetail key={`detail-${groupId}`}
          groupId={groupId}
          onBack={() => setScreen('list')}
          onAddMember={() => setScreen('add-member')}
          onOpenChat={() => setScreen('chat')}
          onReveal={onReveal} />
      )}
      {screen === 'chat' && (
        <GroupChat key={`chat-${groupId}`}
          groupId={groupId}
          onBack={() => setScreen('detail')} />
      )}
      {screen === 'add-member' && (
        <AddMember key="add-member"
          groupId={groupId}
          onBack={() => setScreen('detail')} />
      )}
      {screen === 'join-code' && (
        <JoinByCode key="join-code"
          onBack={() => setScreen('list')}
          onJoined={id => { setGroupId(id); setScreen('detail') }} />
      )}
    </AnimatePresence>
  )
}
