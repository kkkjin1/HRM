'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayNameFull } from '@/lib/members'
import { DOODLE_PALETTE } from '@/lib/data'
import ClickableAvatar from '@/components/ClickableAvatar'

type Category = '입사' | '퇴사' | '회식' | '기타'

type HistoryEvent = {
  id: string
  event_date: string
  category: Category
  title: string
  memo: string | null
  photo_url: string | null
  author_id: string
  created_at: string
}

type HistoryMemo = {
  id: string
  event_id: string
  author_id: string
  content: string
  created_at: string
}

const CATEGORIES: { key: Category; emoji: string; label: string; color: string }[] = [
  { key: '입사', emoji: '🎉', label: '입사', color: '#059669' },
  { key: '퇴사', emoji: '👋', label: '퇴사', color: '#9C9C96' },
  { key: '회식', emoji: '🍻', label: '회식', color: '#D97706' },
  { key: '기타', emoji: '✨', label: '기타', color: '#7C3AED' },
]

function categoryOf(key: Category) {
  return CATEGORIES.find(c => c.key === key) ?? CATEGORIES[3]
}

function hashString(s: string) {
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function fmtMonthGroup(dateStr: string) {
  return format(parseISO(dateStr), 'yyyy년 M월', { locale: ko })
}

function fmtDay(dateStr: string) {
  return format(parseISO(dateStr), 'M.d (E)', { locale: ko })
}

export default function HistoryTimeline() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [memos, setMemos] = useState<HistoryMemo[]>([])
  const [loaded, setLoaded] = useState(false)
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [today, setToday] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formCategory, setFormCategory] = useState<Category>('입사')
  const [formTitle, setFormTitle] = useState('')
  const [formMemo, setFormMemo] = useState('')
  const [formFile, setFormFile] = useState<File | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [openMemoBox, setOpenMemoBox] = useState<Set<string>>(new Set())
  const [memoDrafts, setMemoDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data: dateData } = await supabase.rpc('today_date')
      const d = (dateData as string | null) ?? new Date().toISOString().slice(0, 10)
      if (!active) return
      setToday(d)
      setFormDate(d)

      const [{ data }, { data: memoData }] = await Promise.all([
        supabase.from('history_events').select('*').order('event_date', { ascending: false }),
        supabase.from('history_memos').select('*').order('created_at', { ascending: true }),
      ])
      if (active) {
        setEvents((data as HistoryEvent[]) ?? [])
        setMemos((memoData as HistoryMemo[]) ?? [])
        setLoaded(true)
      }
    })()

    const channel = supabase
      .channel('fun-history-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'history_events' }, payload => {
        const row = payload.new as HistoryEvent
        setEvents(prev => (prev.some(e => e.id === row.id) ? prev : [row, ...prev]))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'history_events' }, payload => {
        const row = payload.new as HistoryEvent
        setEvents(prev => prev.map(e => (e.id === row.id ? row : e)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'history_events' }, payload => {
        const old = payload.old as { id: string }
        setEvents(prev => prev.filter(e => e.id !== old.id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'history_memos' }, payload => {
        const row = payload.new as HistoryMemo
        setMemos(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'history_memos' }, payload => {
        const old = payload.old as { id: string }
        setMemos(prev => prev.filter(m => m.id !== old.id))
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEvent[]>()
    for (const e of events) {
      const key = fmtMonthGroup(e.event_date)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return Array.from(map.entries())
  }, [events])

  function nameOf(id: string) {
    return displayNameFull(members.find(m => m.id === id)) || '알 수 없음'
  }

  function resetForm() {
    setFormDate(today)
    setFormCategory('입사')
    setFormTitle('')
    setFormMemo('')
    setFormFile(null)
  }

  async function submit() {
    if (!formTitle.trim() || !formDate || !me || busy) return
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('history_events')
      .insert({
        event_date: formDate,
        category: formCategory,
        title: formTitle.trim(),
        memo: formMemo.trim() || null,
        author_id: me.id,
      })
      .select()
      .single()

    if (!error && data) {
      let row = data as HistoryEvent
      setEvents(prev => [row, ...prev])

      if (formFile) {
        const fd = new FormData()
        fd.append('file', formFile)
        fd.append('event_id', row.id)
        const res = await fetch('/api/history-photo', { method: 'POST', body: fd })
        const json = await res.json()
        if (json.ok) {
          row = { ...row, photo_url: json.photo_url }
          setEvents(prev => prev.map(e => (e.id === row.id ? row : e)))
        }
      }
    }

    resetForm()
    setComposing(false)
    setBusy(false)
  }

  async function deleteEvent(e: HistoryEvent) {
    setEvents(prev => prev.filter(x => x.id !== e.id))
    const supabase = createClient()
    await supabase.from('history_events').delete().eq('id', e.id)
  }

  // 이미 기록된 항목에도 나중에 아무나 사진을 붙이거나 바꿀 수 있게 — 작성자로 제한하지 않는다
  // (회식 사진은 보통 찍은 사람이 나중에 올리지, 글쓴 사람이 올리는 게 아니라서).
  async function handlePhotoPick(ev: HistoryEvent, file: File | null) {
    if (!file || !me) return
    setUploadingId(ev.id)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('event_id', ev.id)
    const res = await fetch('/api/history-photo', { method: 'POST', body: fd })
    const json = await res.json()
    if (json.ok) setEvents(prev => prev.map(x => (x.id === ev.id ? { ...x, photo_url: json.photo_url } : x)))
    setUploadingId(null)
  }

  function toggleMemoBox(eventId: string) {
    setOpenMemoBox(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  async function addMemo(eventId: string) {
    const content = (memoDrafts[eventId] ?? '').trim()
    if (!content || !me) return
    const supabase = createClient()
    const { data } = await supabase
      .from('history_memos')
      .insert({ event_id: eventId, author_id: me.id, content })
      .select()
      .single()
    if (data) setMemos(prev => [...prev, data as HistoryMemo])
    setMemoDrafts(prev => ({ ...prev, [eventId]: '' }))
  }

  async function deleteMemo(m: HistoryMemo) {
    setMemos(prev => prev.filter(x => x.id !== m.id))
    const supabase = createClient()
    await supabase.from('history_memos').delete().eq('id', m.id)
  }

  return (
    <div className="max-w-2xl mx-auto w-full space-y-5 py-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500">📖 연혁</p>
        <button
          onClick={() => setComposing(v => !v)}
          className="text-[12.5px] font-medium text-white bg-[#B45309] hover:bg-[#94400A] rounded-lg px-3 py-1.5"
        >
          + 기록 추가
        </button>
      </div>

      {composing && (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                onClick={() => setFormCategory(c.key)}
                className={`text-[13px] rounded-full px-3 py-1.5 flex items-center gap-1 ${
                  formCategory === c.key ? 'bg-[#B45309] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                <span>{c.emoji}</span>{c.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="무슨 일이었나요? (예: 김다슬님 입사)"
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <textarea
            value={formMemo}
            onChange={e => setFormMemo(e.target.value)}
            rows={2}
            placeholder="메모 (선택, 자세한 이야기를 남겨보세요)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
          />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={e => setFormFile(e.target.files?.[0] ?? null)}
            className="text-[12.5px] text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setComposing(false); resetForm() }} className="text-[13px] text-gray-500 px-3 py-1.5">취소</button>
            <button
              onClick={submit}
              disabled={busy || !formTitle.trim() || !formDate || !me}
              className="text-[13px] font-medium text-white bg-[#B45309] hover:bg-[#94400A] disabled:opacity-40 rounded-lg px-4 py-1.5"
            >
              기록하기
            </button>
          </div>
        </div>
      )}

      {!loaded || !membersLoaded ? (
        <p className="text-[13px] text-gray-400 text-center py-8">불러오는 중...</p>
      ) : events.length === 0 ? (
        <p className="text-[13px] text-gray-400 text-center py-8">아직 기록된 연혁이 없습니다.</p>
      ) : (
        <div className="space-y-7">
          {groups.map(([month, monthEvents]) => (
            <div key={month}>
              <p className="text-[12.5px] font-semibold text-gray-400 mb-3">{month}</p>
              <div>
                {monthEvents.map((e, i) => {
                  const cat = categoryOf(e.category)
                  const author = members.find(m => m.id === e.author_id)
                  const isLast = i === monthEvents.length - 1
                  const tilt = e.photo_url ? Math.round(((hashString(e.id) % 100) / 100 - 0.5) * 10 * 10) / 10 : 0
                  return (
                    <div key={e.id} className="flex gap-3">
                      {/* 날짜별로 이어지는 실선 타임라인 */}
                      <div className="flex flex-col items-center flex-shrink-0 w-4 pt-1.5">
                        <span className="w-3 h-3 rounded-full flex-shrink-0 ring-4 ring-white" style={{ background: cat.color }} />
                        {!isLast && <span className="w-0.5 flex-1 mt-0.5" style={{ background: '#E8DDC9' }} />}
                      </div>

                      <div className="flex-1 min-w-0 pb-6 group">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[12.5px] font-medium rounded-full px-2.5 py-1 flex-shrink-0" style={{ background: `${cat.color}1A`, color: cat.color }}>
                              {cat.emoji} {cat.label}
                            </span>
                            <span className="text-[12px] text-gray-400 flex-shrink-0">{fmtDay(e.event_date)}</span>
                            <p className="text-[14px] text-gray-800 font-medium truncate">{e.title}</p>
                            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                              {me && (
                                <label className="text-[11px] text-gray-400 hover:text-[#B45309] cursor-pointer">
                                  {uploadingId === e.id ? '업로드 중...' : e.photo_url ? '사진 변경' : '+ 사진 추가'}
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    className="hidden"
                                    disabled={uploadingId === e.id}
                                    onChange={ev => { handlePhotoPick(e, ev.target.files?.[0] ?? null); ev.target.value = '' }}
                                  />
                                </label>
                              )}
                              {me?.id === e.author_id && (
                                <button onClick={() => deleteEvent(e)} className="text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">삭제</button>
                              )}
                            </div>
                          </div>

                          {e.memo && (
                            <p className="text-[12.5px] text-gray-500 leading-relaxed whitespace-pre-wrap mb-2">{e.memo}</p>
                          )}

                          {e.photo_url && (
                            <div className="flex justify-center py-3 mb-1">
                              {/* 스티커사진(인생네컷) 느낌 — 카테고리 색 톤의 은은한 배경 매트 위에
                                  반투명 프레임을 살짝 기울여 얹고, 그림자도 컬러 글로우로 */}
                              <div
                                className="rounded-2xl p-3"
                                style={{ background: `linear-gradient(135deg, ${cat.color}26, ${cat.color}08)` }}
                              >
                                <div
                                  className="relative bg-white/55 backdrop-blur-sm p-2 pb-7 rounded-xl"
                                  style={{ transform: `rotate(${tilt}deg)`, boxShadow: `0 10px 24px -8px ${cat.color}66` }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={e.photo_url} alt={e.title} className="w-[200px] h-[200px] object-cover rounded-lg" />
                                  <span className="absolute -bottom-1.5 -right-1.5 text-[20px] drop-shadow-sm">{cat.emoji}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <ClickableAvatar member={author} size={18} />
                            <span className="text-[11px] text-gray-400">{nameOf(e.author_id)}님이 기록</span>
                          </div>

                          {/* 다른 사람들이 붙이는 스티커 메모 — 일반 댓글 목록이 아니라 포스트잇처럼 붙여서 보여준다 */}
                          {(() => {
                            const eventMemos = memos.filter(m => m.event_id === e.id)
                            const memoOpen = openMemoBox.has(e.id)
                            return (
                              <div className="mt-3 pt-3 border-t border-dashed border-[#EFEFEB]">
                                <div className="flex flex-wrap gap-2 items-start">
                                  {eventMemos.map(m => {
                                    const palette = DOODLE_PALETTE[hashString(m.id) % DOODLE_PALETTE.length]
                                    const noteTilt = Math.round(((hashString(m.id) % 100) / 100 - 0.5) * 16 * 10) / 10
                                    return (
                                      <div
                                        key={m.id}
                                        className="relative w-[104px] h-[84px] rounded-md px-2 py-1.5 shadow-sm group/note flex flex-col overflow-hidden"
                                        style={{ background: palette.bg, color: palette.fg, transform: `rotate(${noteTilt}deg)` }}
                                      >
                                        {me?.id === m.author_id && (
                                          <button
                                            onClick={() => deleteMemo(m)}
                                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white text-[9px] text-gray-400 hover:text-red-500 shadow opacity-0 group-hover/note:opacity-100 transition-opacity flex items-center justify-center"
                                          >✕</button>
                                        )}
                                        <p className="flex-1 text-[11px] leading-snug whitespace-pre-wrap break-words overflow-hidden">{m.content}</p>
                                        <p className="text-[9px] opacity-60 flex-shrink-0">{nameOf(m.author_id)}</p>
                                      </div>
                                    )
                                  })}

                                  {me && !memoOpen && (
                                    <button
                                      onClick={() => toggleMemoBox(e.id)}
                                      className="w-[104px] h-[84px] rounded-md border border-dashed border-[#D8D8D2] text-[11px] text-[#9C9C96] hover:bg-[#F7F7F5] flex items-center justify-center flex-shrink-0"
                                    >
                                      + 메모
                                    </button>
                                  )}
                                </div>

                                {me && memoOpen && (
                                  <div className="flex gap-1.5 mt-2">
                                    <input
                                      autoFocus
                                      value={memoDrafts[e.id] ?? ''}
                                      onChange={ev => setMemoDrafts(prev => ({ ...prev, [e.id]: ev.target.value }))}
                                      onKeyDown={ev => { if (ev.key === 'Enter') { addMemo(e.id); toggleMemoBox(e.id) } }}
                                      placeholder="스티커 메모 남기기..."
                                      className="flex-1 min-w-0 text-[12px] border border-gray-200 rounded-md px-2 py-1"
                                    />
                                    <button
                                      onClick={() => { addMemo(e.id); toggleMemoBox(e.id) }}
                                      disabled={!(memoDrafts[e.id] ?? '').trim()}
                                      className="text-[11.5px] font-medium text-white bg-[#B45309] hover:bg-[#94400A] disabled:opacity-40 rounded-md px-2.5"
                                    >
                                      붙이기
                                    </button>
                                    <button onClick={() => toggleMemoBox(e.id)} className="text-[11.5px] text-gray-400 px-1">취소</button>
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
