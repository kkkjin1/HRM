'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { DOODLE_PALETTE, QUICK_REACTIONS } from '@/lib/data'
import { toggleReaction, type Reactions } from '@/lib/reactions'

type Doodle = {
  id: string
  author_id: string
  body: string
  color_key: number
  tilt: number
  reactions: Reactions
  created_at: string
}

function hashString(s: string) {
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function fmtRelative(iso: string) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return '어제'
  return `${diffDay}일 전`
}

export default function DoodleBoard() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [doodles, setDoodles] = useState<Doodle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data } = await supabase.from('doodle').select('*').order('created_at', { ascending: false }).limit(90)
      if (active && data) setDoodles(data as Doodle[])
      if (active) setLoaded(true)
    })()

    const channel = supabase
      .channel('fun-doodle')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodle' }, payload => {
        const row = payload.new as Doodle
        setDoodles(prev => (prev.some(d => d.id === row.id) ? prev : [row, ...prev]))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodle' }, payload => {
        const row = payload.new as Doodle
        setDoodles(prev => prev.map(d => (d.id === row.id ? row : d)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'doodle' }, payload => {
        const old = payload.old as { id: string }
        setDoodles(prev => prev.filter(d => d.id !== old.id))
      })
      .subscribe()

    const timer = setInterval(() => setTick(t => t + 1), 60000)

    return () => {
      active = false
      supabase.removeChannel(channel)
      clearInterval(timer)
    }
  }, [])

  function nameOf(id: string) {
    return members.find(m => m.id === id)?.name ?? '알 수 없음'
  }
  function memberColor(id: string) {
    const m = members.find(x => x.id === id)
    return DOODLE_PALETTE[(m?.color_key ?? 0) % 8]
  }

  async function addDoodle() {
    if (!draft.trim() || !me || busy) return
    setBusy(true)
    const supabase = createClient()
    const seed = me.id + Date.now().toString()
    const colorKey = hashString(seed) % 8
    const tilt = Math.round((Math.random() * 1.8 - 0.9) * 100) / 100
    const { data } = await supabase
      .from('doodle')
      .insert({ author_id: me.id, body: draft.trim(), color_key: colorKey, tilt })
      .select()
      .single()
    if (data) setDoodles(prev => [data as Doodle, ...prev])
    setDraft('')
    setComposing(false)
    setBusy(false)
  }

  async function toggleEmoji(doodle: Doodle, emoji: string) {
    if (!me) return
    const next = toggleReaction(doodle.reactions ?? {}, emoji, me.id)
    const supabase = createClient()
    await supabase.from('doodle').update({ reactions: next }).eq('id', doodle.id)
    setDoodles(prev => prev.map(d => (d.id === doodle.id ? { ...d, reactions: next } : d)))
  }

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-[#9C9C96]">낙서 보드</p>
        <button
          onClick={() => setComposing(v => !v)}
          className="text-[12.5px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] rounded-lg px-3 py-1.5"
        >
          + 낙서 남기기
        </button>
      </div>

      {composing && (
        <div className="mb-4 bg-[#F7F7F5] rounded-xl p-3">
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={2}
            placeholder="아무 말이나 남겨보세요..."
            className="w-full text-[13.5px] border border-[#E8E8E4] rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#5B54C4] resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setComposing(false)} className="text-[12.5px] text-[#6B6B66] px-3 py-1.5">취소</button>
            <button
              onClick={addDoodle}
              disabled={busy || !draft.trim() || !me}
              className="text-[12.5px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-40 rounded-lg px-3 py-1.5"
            >
              등록
            </button>
          </div>
        </div>
      )}

      {!loaded || !membersLoaded ? (
        <p className="text-[13px] text-[#9C9C96]">불러오는 중...</p>
      ) : doodles.length === 0 ? (
        <p className="text-[13px] text-[#9C9C96] py-6 text-center">아직 낙서가 없습니다.</p>
      ) : (
        <div style={{ columnCount: 3, columnGap: '10px' }}>
          {doodles.map(d => {
            const palette = DOODLE_PALETTE[d.color_key % 8]
            const avatarColor = memberColor(d.author_id)
            return (
              <div
                key={d.id}
                style={{ breakInside: 'avoid', marginBottom: '10px', background: palette.bg, color: palette.fg, transform: `rotate(${d.tilt}deg)` }}
                className="rounded-xl px-3.5 py-3"
              >
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{d.body}</p>
                <div className="flex items-center gap-2 mt-2.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9.5px] font-semibold flex-shrink-0"
                    style={{ background: avatarColor.bg, color: avatarColor.fg }}
                  >
                    {nameOf(d.author_id).slice(0, 1)}
                  </div>
                  <span className="text-[11px] opacity-70">{nameOf(d.author_id)}</span>
                  <span className="text-[11px] opacity-50">· {fmtRelative(d.created_at)}</span>
                </div>
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  {QUICK_REACTIONS.map(emoji => {
                    const reactedBy = d.reactions?.[emoji] ?? []
                    const mine = !!me && reactedBy.includes(me.id)
                    return (
                      <button
                        key={emoji}
                        onClick={() => toggleEmoji(d, emoji)}
                        disabled={!me}
                        className="text-[11px] rounded-full px-1.5 py-0.5"
                        style={{ background: mine ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.05)' }}
                      >
                        {emoji}{reactedBy.length > 0 ? ` ${reactedBy.length}` : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
