'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayNameFull } from '@/lib/members'
import ClickableAvatar from '@/components/ClickableAvatar'

type Category = '입사' | '퇴사' | '회식' | '기타'

type HistoryEvent = {
  id: string
  event_date: string
  category: Category
  title: string
  photo_url: string | null
  author_id: string
  created_at: string
}

const CATEGORIES: { key: Category; emoji: string; label: string }[] = [
  { key: '입사', emoji: '🎉', label: '입사' },
  { key: '퇴사', emoji: '👋', label: '퇴사' },
  { key: '회식', emoji: '🍻', label: '회식' },
  { key: '기타', emoji: '✨', label: '기타' },
]

function categoryOf(key: Category) {
  return CATEGORIES.find(c => c.key === key) ?? CATEGORIES[3]
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
  const [loaded, setLoaded] = useState(false)
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [today, setToday] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formCategory, setFormCategory] = useState<Category>('입사')
  const [formTitle, setFormTitle] = useState('')
  const [formFile, setFormFile] = useState<File | null>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data: dateData } = await supabase.rpc('today_date')
      const d = (dateData as string | null) ?? new Date().toISOString().slice(0, 10)
      if (!active) return
      setToday(d)
      setFormDate(d)

      const { data } = await supabase.from('history_events').select('*').order('event_date', { ascending: false })
      if (active) {
        setEvents((data as HistoryEvent[]) ?? [])
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
    setFormFile(null)
  }

  async function submit() {
    if (!formTitle.trim() || !formDate || !me || busy) return
    setBusy(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('history_events')
      .insert({ event_date: formDate, category: formCategory, title: formTitle.trim(), author_id: me.id })
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
        <div className="space-y-6">
          {groups.map(([month, monthEvents]) => (
            <div key={month}>
              <p className="text-[12.5px] font-semibold text-gray-400 mb-2.5">{month}</p>
              <div className="space-y-3">
                {monthEvents.map(e => {
                  const cat = categoryOf(e.category)
                  const author = members.find(m => m.id === e.author_id)
                  return (
                    <div key={e.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 group">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[12.5px] font-medium rounded-full px-2.5 py-1 bg-amber-50 text-amber-700 flex-shrink-0">
                          {cat.emoji} {cat.label}
                        </span>
                        <span className="text-[12px] text-gray-400 flex-shrink-0">{fmtDay(e.event_date)}</span>
                        <p className="text-[14px] text-gray-800 font-medium truncate">{e.title}</p>
                        {me?.id === e.author_id && (
                          <button onClick={() => deleteEvent(e)} className="text-[11px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex-shrink-0">삭제</button>
                        )}
                      </div>
                      {e.photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.photo_url} alt={e.title} className="w-full max-h-[280px] object-cover rounded-xl mb-2" />
                      )}
                      <div className="flex items-center gap-1.5">
                        <ClickableAvatar member={author} size={18} />
                        <span className="text-[11px] text-gray-400">{nameOf(e.author_id)}님이 기록</span>
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
