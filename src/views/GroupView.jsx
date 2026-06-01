// v3
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, UserPlus, ChevronLeft, Users, Check, Pencil, X, Crown } from 'lucide-react'
import { useApp } from '../context/AppContext'

const page = {
  initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 }, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
}
const pageBack = {
  initial: { opacity: 0, x: -40 }, animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 30 }, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
}

const EMOJIS = ['🎬', '🎮', '🏋️', '🌍', '🎵', '🍕', '🏄', '⚽', '🎭', '🚀', '🎨', '📚', '🏕️', '🎯', '🌅', '🐉']

// ── Avatar chip ─────────────────────────────────────────────────────────────
function Avatar({ user, size = 10 }) {
  return (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}
      style={{ background: `linear-gradient(135deg, ${user.color}, ${user.color}88)` }}>
      {user.initials}
    </div>
  )
}

// ── Group list ───────────────────────────────────────────────────────────────
function GroupList({ onSelect, onCreate }) {
  const { groups, getUser } = useApp()

  return (
    <motion.div key="list" {...pageBack} className="min-h-screen bg-[#0A0A0B] pb-28">
      <div className="flex items-center justify-between px-5 pt-14 pb-5">
        <span className="text-[22px] font-bold text-white">Gruppen</span>
        <motion.button whileTap={{ scale: 0.88 }} onClick={onCreate}
          className="flex items-center gap-1.5 bg-[#7B61FF] px-3.5 py-2 rounded-full">
          <Plus size={14} className="text-white" />
          <span className="text-white text-sm font-semibold">Neu</span>
        </motion.button>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-8 pt-20 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-[#1C1C1E] flex items-center justify-center text-3xl">👥</div>
          <p className="text-white font-semibold text-center">Noch keine Gruppe</p>
          <p className="text-[#8E8E93] text-sm text-center">Erstelle eine Gruppe und lade Freunde ein.</p>
          <motion.button whileTap={{ scale: 0.96 }} onClick={onCreate}
            className="mt-2 px-6 py-3 rounded-2xl font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
            Gruppe erstellen
          </motion.button>
        </div>
      ) : (
        <div className="px-5 space-y-3">
          {groups.map((g, i) => {
            const today = getUser(g.rotation[g.todayIdx] ?? g.memberIds[0])
            return (
              <motion.div key={g.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(g.id)}
                className="flex items-center gap-4 bg-[#141415] border border-[#2C2C2E] rounded-2xl p-4 cursor-pointer">
                <div className="w-12 h-12 rounded-2xl bg-[#1C1C1E] flex items-center justify-center text-2xl flex-shrink-0">
                  {g.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate">{g.name}</p>
                  <p className="text-xs text-[#8E8E93] mt-0.5">{g.memberIds.length} Mitglieder</p>
                </div>
                {today && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-[#7B61FF] font-semibold">HEUTE</p>
                      <p className="text-xs text-[#8E8E93]">{today.name}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                      style={{ background: `linear-gradient(135deg, ${today.color}, ${today.color}88)` }}>
                      {today.initials}
                    </div>
                  </div>
                )}
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
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎬')

  const submit = async () => {
    if (!name.trim()) return
    const id = await createGroup(name.trim(), emoji)
    if (id) onCreated(id)
  }

  return (
    <motion.div key="create" {...page} className="min-h-screen bg-[#0A0A0B] pb-28">
      <div className="flex items-center gap-3 px-5 pt-14 pb-6">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-lg font-bold text-white">Neue Gruppe</span>
      </div>

      {/* Emoji picker */}
      <div className="px-5 mb-5">
        <p className="text-xs text-[#8E8E93] font-semibold uppercase tracking-wider mb-3">Emoji</p>
        <div className="grid grid-cols-8 gap-2">
          {EMOJIS.map(e => (
            <motion.button key={e} whileTap={{ scale: 0.85 }} onClick={() => setEmoji(e)}
              className={`aspect-square rounded-xl text-xl flex items-center justify-center transition-colors ${
                emoji === e ? 'bg-[#7B61FF]/30 ring-2 ring-[#7B61FF]' : 'bg-[#1C1C1E]'
              }`}>
              {e}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Name input */}
      <div className="px-5 mb-6">
        <p className="text-xs text-[#8E8E93] font-semibold uppercase tracking-wider mb-3">Name</p>
        <div className="flex items-center gap-3 bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-3.5">
          <span className="text-2xl">{emoji}</span>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Gruppenname…"
            maxLength={30}
            className="flex-1 bg-transparent text-white placeholder-[#3A3A3C] text-base outline-none"
          />
        </div>
      </div>

      <div className="px-5">
        <motion.button whileTap={{ scale: 0.97 }} onClick={submit}
          disabled={!name.trim()}
          className="w-full py-4 rounded-2xl font-semibold text-white disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #7B61FF, #00D9FF)' }}>
          Gruppe erstellen
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Group detail ─────────────────────────────────────────────────────────────
function GroupDetail({ groupId, onBack, onAddMember }) {
  const { groups, me, getUser, removeMember, deleteGroup, renameGroup } = useApp()
  const group = groups.find(g => g.id === groupId)
  const [confirmRemove, setConfirmRemove] = useState(null) // userId to confirm remove
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(group?.name ?? '')
  const [copied, setCopied] = useState(false)

  if (!group) { onBack(); return null }

  const todayUserId = group.rotation[group.todayIdx] ?? group.memberIds[0]

  const saveEdit = async () => {
    if (editName.trim()) await renameGroup(groupId, editName.trim())
    setEditing(false)
  }

  const copyCode = () => {
    navigator.clipboard.writeText(`DAYLO-${group.name.toUpperCase().replace(/\s/g, '').slice(0,6)}42`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div key={`detail-${groupId}`} {...page} className="min-h-screen bg-[#0A0A0B] pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-5">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        {editing ? (
          <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
            onBlur={saveEdit} onKeyDown={e => e.key === 'Enter' && saveEdit()}
            className="flex-1 bg-[#1C1C1E] text-white font-bold text-lg px-3 py-1.5 rounded-xl outline-none border border-[#7B61FF]" />
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xl">{group.emoji}</span>
            <span className="text-lg font-bold text-white truncate">{group.name}</span>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => { setEditName(group.name); setEditing(true) }}>
              <Pencil size={14} className="text-[#8E8E93]" />
            </motion.button>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="px-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">{group.memberIds.length} Mitglieder</span>
          <motion.button whileTap={{ scale: 0.88 }} onClick={onAddMember}
            className="flex items-center gap-1.5 bg-[#7B61FF]/15 border border-[#7B61FF]/30 px-3 py-1.5 rounded-full">
            <UserPlus size={13} className="text-[#7B61FF]" />
            <span className="text-xs text-[#7B61FF] font-semibold">Hinzufügen</span>
          </motion.button>
        </div>

        <div className="space-y-2">
          <AnimatePresence>
            {group.memberIds.map((uid, i) => {
              const u = getUser(uid)
              if (!u) return null
              const isMe = uid === me?.id
              const isToday = uid === todayUserId
              const isFirst = i === 0

              return (
                <motion.div key={uid}
                  layout
                  initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex items-center gap-3 p-3 rounded-2xl ${
                    isToday ? 'bg-[#7B61FF]/10 border border-[#7B61FF]/25' : 'bg-[#1C1C1E]'
                  }`}>

                  <Avatar user={u} size={10} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white truncate">{u.name}{isMe ? ' (Du)' : ''}</span>
                      {isFirst && <Crown size={12} className="text-[#FF9F43] flex-shrink-0" />}
                      {isToday && <span className="text-[10px] bg-[#7B61FF] text-white px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">HEUTE</span>}
                    </div>
                    <p className="text-xs text-[#8E8E93]">
                      {isToday ? 'Nimmt heute auf' : `+${i}d in der Rotation`}
                    </p>
                  </div>

                  {!isMe && (
                    confirmRemove === uid ? (
                      <div className="flex items-center gap-2">
                        <motion.button whileTap={{ scale: 0.88 }}
                          onClick={async () => { await removeMember(groupId, uid); setConfirmRemove(null) }}
                          className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                          <Check size={13} className="text-red-400" />
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.88 }}
                          onClick={() => setConfirmRemove(null)}
                          className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                          <X size={13} className="text-[#8E8E93]" />
                        </motion.button>
                      </div>
                    ) : (
                      <motion.button whileTap={{ scale: 0.85 }}
                        onClick={() => setConfirmRemove(uid)}
                        className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                        <Trash2 size={13} className="text-[#8E8E93]" />
                      </motion.button>
                    )
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Invite code */}
      <div className="px-5 mb-4">
        <div className="rounded-2xl bg-[#141415] border border-[#2C2C2E] p-4">
          <p className="text-xs text-[#8E8E93] mb-2 font-semibold">Einladungscode</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-[#1C1C1E] rounded-xl px-3 py-2.5 font-mono text-white font-bold tracking-widest text-sm">
              DAYLO-{group.name.toUpperCase().replace(/\s/g, '').slice(0, 6)}42
            </div>
            <motion.button whileTap={{ scale: 0.88 }} onClick={copyCode}
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: copied ? '#2ECC71' : '#7B61FF' }}>
              {copied ? <Check size={16} className="text-white" /> : <Plus size={16} className="text-white rotate-45" />}
            </motion.button>
          </div>
        </div>
      </div>

      {/* Delete group */}
      <div className="px-5">
        {confirmDelete ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4">
            <p className="text-white font-semibold text-sm mb-1">Gruppe wirklich löschen?</p>
            <p className="text-[#8E8E93] text-xs mb-3">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.96 }} onClick={async () => { await deleteGroup(groupId); onBack() }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm">
                Löschen
              </motion.button>
              <motion.button whileTap={{ scale: 0.96 }} onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#2C2C2E] text-white font-semibold text-sm">
                Abbrechen
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setConfirmDelete(true)}
            className="w-full py-3.5 rounded-2xl border border-red-500/30 flex items-center justify-center gap-2">
            <Trash2 size={15} className="text-red-400" />
            <span className="text-red-400 font-medium text-sm">Gruppe löschen</span>
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

// ── Add member ────────────────────────────────────────────────────────────────
function AddMember({ groupId, onBack }) {
  const { groups, getUser, friends, addMember } = useApp()
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
    <motion.div key="add-member" {...page} className="min-h-screen bg-[#0A0A0B] pb-28">
      <div className="flex items-center gap-3 px-5 pt-14 pb-5">
        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} className="text-white" />
        </motion.button>
        <span className="text-lg font-bold text-white">Mitglied hinzufügen</span>
      </div>

      {/* Search */}
      <div className="px-5 mb-4">
        <div className="flex items-center gap-3 bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-3">
          <Users size={16} className="text-[#8E8E93] flex-shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Freund suchen…"
            className="flex-1 bg-transparent text-white placeholder-[#3A3A3C] text-sm outline-none" />
        </div>
      </div>

      <div className="px-5 space-y-2">
        {eligible.length === 0 && (
          <div className="text-center py-10">
            <p className="text-[#8E8E93] text-sm">
              {friends.length === 0
                ? 'Füge zuerst Freunde hinzu.'
                : query
                ? 'Niemanden gefunden.'
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
                className="flex items-center gap-3 bg-[#141415] border border-[#2C2C2E] rounded-2xl p-3.5">
                <Avatar user={u} size={11} />
                <span className="text-sm font-semibold text-white flex-1">{u.name}</span>
                <motion.button whileTap={{ scale: 0.88 }} onClick={() => handleAdd(u)}
                  disabled={isAdded}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold text-xs transition-colors ${
                    isAdded
                      ? 'bg-[#2ECC71]/20 border border-[#2ECC71]/40 text-[#2ECC71]'
                      : 'bg-[#7B61FF] text-white'
                  }`}>
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

// ── Root GroupView (router) ───────────────────────────────────────────────────
export default function GroupView() {
  const [screen, setScreen] = useState('list') // list | create | detail | add-member
  const [groupId, setGroupId] = useState(null)

  return (
    <AnimatePresence mode="wait">
      {screen === 'list' && (
        <GroupList key="list"
          onSelect={id => { setGroupId(id); setScreen('detail') }}
          onCreate={() => setScreen('create')} />
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
          onAddMember={() => setScreen('add-member')} />
      )}
      {screen === 'add-member' && (
        <AddMember key="add-member"
          groupId={groupId}
          onBack={() => setScreen('detail')} />
      )}
    </AnimatePresence>
  )
}
