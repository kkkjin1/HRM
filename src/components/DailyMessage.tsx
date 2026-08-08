'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { MESSAGE_PRESETS, QUICK_REACTIONS, DOODLE_PALETTE, fillPreset } from '@/lib/data'
import { toggleReaction, type Reactions } from '@/lib/reactions'

type DayMessageRow = {
  date: string
  sender_id: string | null
  receiver_id: string | null
  message: string | null
  msg_status: 'pending' | 'written' | 'passed' | 'hidden'
  message_reactions: Reactions
}

const ALL_PRESETS = Object.values(MESSAGE_PRESETS).flat()

export default function DailyMessage() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me, loaded: meLoaded } = useCurrentMember()
  const [row, setRow] = useState<DayMessageRow | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'idle' | 'editing'>('idle')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data } = await supabase.rpc('ensure_day')
      const ensured = Array.isArray(data) ? data[0] : data
      if (!ensured) { if (active) setLoaded(true); return }
      const { data: full } = await supabase
        .from('day_state')
        .select('date, sender_id, receiver_id, message, msg_status, message_reactions')
        .eq('date', ensured.date)
        .maybeSingle()
      if (active) {
        setRow((full as DayMessageRow) ?? { ...ensured, message_reactions: {} })
        setLoaded(true)
      }
    })()

    const channel = supabase
      .channel('day_state-message')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_state' }, payload => {
        const next = payload.new as DayMessageRow | undefined
        if (next) setRow(next)
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  function nameOf(id: string | null) {
    return members.find(m => m.id === id)?.name ?? ''
  }

  async function updateRow(patch: Partial<DayMessageRow>) {
    if (!row || busy) return
    setBusy(true)
    const supabase = createClient()
    await supabase.from('day_state').update(patch).eq('date', row.date)
    setRow(prev => (prev ? { ...prev, ...patch } : prev))
    setBusy(false)
  }

  function pickRandomPreset() {
    const template = ALL_PRESETS[Math.floor(Math.random() * ALL_PRESETS.length)]
    setDraft(fillPreset(template, nameOf(row?.receiver_id ?? null)))
    setMode('editing')
  }

  function startWrite() {
    setDraft('')
    setMode('editing')
  }

  async function sendMessage() {
    if (!draft.trim()) return
    await updateRow({ message: draft.trim(), msg_status: 'written' })
    setMode('idle')
  }

  async function passToday() {
    await updateRow({ msg_status: 'passed' })
  }

  async function hideCard() {
    await updateRow({ msg_status: 'hidden' })
  }

  async function toggleEmoji(emoji: string) {
    if (!row || !me) return
    const next = toggleReaction(row.message_reactions ?? {}, emoji, me.id)
    await updateRow({ message_reactions: next })
  }

  if (!loaded || !membersLoaded || !meLoaded) return null
  if (!row || !row.sender_id || !row.receiver_id) return null // 멤버 2명 미만
  if (row.msg_status === 'passed' || row.msg_status === 'hidden') return null

  const isSender = me?.id === row.sender_id
  const isReceiver = me?.id === row.receiver_id
  const senderName = nameOf(row.sender_id)
  const receiverName = nameOf(row.receiver_id)
  const senderMember = members.find(m => m.id === row.sender_id)
  const avatarColor = DOODLE_PALETTE[(senderMember?.color_key ?? 0) % 8]

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 w-full">
      <p className="text-[12px] text-[#9C9C96] mb-3">오늘의 한마디</p>

      {row.msg_status === 'pending' && isSender && mode === 'idle' && (
        <div>
          <p className="text-[14px] text-[#1F1F1D] mb-3">{receiverName}님에게 한마디를 남겨보세요.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={pickRandomPreset} className="text-[13px] text-[#5B54C4] bg-[#EEEDFE] hover:bg-[#E4E2FB] rounded-lg px-3 py-2">랜덤 추천</button>
            <button onClick={startWrite} className="text-[13px] text-[#1F1F1D] border border-[#E8E8E4] hover:bg-[#F7F7F5] rounded-lg px-3 py-2">직접 쓰기</button>
            <button onClick={passToday} disabled={busy} className="text-[13px] text-[#9C9C96] hover:text-[#6B6B66] rounded-lg px-3 py-2">오늘은 패스</button>
          </div>
        </div>
      )}

      {row.msg_status === 'pending' && isSender && mode === 'editing' && (
        <div>
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            placeholder={`${receiverName}님에게 남길 한마디...`}
            className="w-full text-[13.5px] border border-[#E8E8E4] rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#5B54C4] resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setMode('idle')} className="text-[13px] text-[#6B6B66] px-3 py-1.5">취소</button>
            <button
              onClick={sendMessage}
              disabled={busy || !draft.trim()}
              className="text-[13px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-40 rounded-lg px-3.5 py-1.5"
            >
              보내기
            </button>
          </div>
        </div>
      )}

      {row.msg_status === 'pending' && !isSender && (
        <p className="text-[14px] text-[#6B6B66]">
          <span className="text-[#1F1F1D] font-medium">{senderName}</span>님이{' '}
          <span className="text-[#1F1F1D] font-medium">{receiverName}</span>님에게 한마디를 남길 예정이에요.
        </p>
      )}

      {row.msg_status === 'written' && (
        <div>
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0"
              style={{ background: avatarColor.bg, color: avatarColor.fg }}
            >
              {senderName.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[#9C9C96] mb-1">{senderName} → {receiverName}</p>
              <p className="text-[14.5px] text-[#1F1F1D] leading-relaxed whitespace-pre-wrap">{row.message}</p>
              <div className="flex items-center gap-1.5 mt-3">
                {QUICK_REACTIONS.map(emoji => {
                  const reactedBy = row.message_reactions?.[emoji] ?? []
                  const mine = !!me && reactedBy.includes(me.id)
                  return (
                    <button
                      key={emoji}
                      onClick={() => toggleEmoji(emoji)}
                      disabled={!me}
                      className={`text-[12px] rounded-full px-2 py-1 border transition-colors ${
                        mine ? 'bg-[#EEEDFE] border-[#5B54C4] text-[#5B54C4]' : 'border-[#E8E8E4] text-[#6B6B66] hover:bg-[#F7F7F5]'
                      }`}
                    >
                      {emoji} {reactedBy.length > 0 && reactedBy.length}
                    </button>
                  )
                })}
              </div>
            </div>
            {isReceiver && (
              <button onClick={hideCard} className="text-[11.5px] text-[#9C9C96] hover:text-red-500 flex-shrink-0">내리기</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
