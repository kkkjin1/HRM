'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'

type ChatRow = {
  id: string
  chat_date: string
  author_id: string
  body: string
  created_at: string
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

// fixed로 떠 있어서 기존 레이아웃 비율/흐름엔 전혀 관여하지 않는다. 평소엔 옅게 비쳐 보이다가
// 마우스를 올리거나(hover) 입력창에 포커스가 있을 때만(focus-within) 또렷해진다 — 어느 탭에
// 있든 방해되지 않으면서도 필요할 때만 눈에 들어오게. 네이티브 CSS resize라 우측 하단
// 모서리를 드래그하면 크기 조절 가능(min/max 범위 내). 오늘 날짜(chat_date)로만 필터링 —
// 어제 것부터는 화면에서 안 보인다(실제 삭제는 아직 안 함, 나중에 배치 정리 추가 예정).
export default function AnonChat() {
  const { me } = useCurrentMember()
  const [today, setToday] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data: dateData } = await supabase.rpc('today_date')
      const dateStr = dateData as string | null
      if (!active || !dateStr) return
      setToday(dateStr)

      const { data } = await supabase
        .from('anon_chat')
        .select('*')
        .eq('chat_date', dateStr)
        .order('created_at', { ascending: true })
      if (active) {
        setMessages((data as ChatRow[]) ?? [])
        setLoaded(true)
      }
    })()

    const channel = supabase
      .channel('fun-anon-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anon_chat' }, payload => {
        const row = payload.new as ChatRow
        setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]))
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  async function send() {
    if (!draft.trim() || !me || !today || busy) return
    setBusy(true)
    const body = draft.trim()
    setDraft('')
    const supabase = createClient()
    const { data } = await supabase
      .from('anon_chat')
      .insert({ chat_date: today, author_id: me.id, body })
      .select()
      .single()
    if (data) setMessages(prev => [...prev, data as ChatRow])
    setBusy(false)
  }

  return (
    <div
      style={{ width: 200, height: 220 }}
      className="hidden lg:flex fixed left-4 bottom-4 z-40 flex-col bg-white/70 backdrop-blur-sm border border-[#E8E8E4] rounded-xl px-3 py-2.5 opacity-[0.35] hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 resize overflow-auto min-w-[160px] min-h-[130px] max-w-[420px] max-h-[70vh]"
    >
      <p className="text-[10.5px] text-[#9C9C96] flex-shrink-0 mb-1.5">🕵️ 오늘의 익명 채팅</p>

      <div ref={listRef} className="flex-1 min-h-0 space-y-1 overflow-y-auto mb-1.5">
        {!loaded ? (
          <p className="text-[11px] text-[#9C9C96]">불러오는 중...</p>
        ) : messages.length === 0 ? (
          <p className="text-[11px] text-[#B0B0AA]">아직 오늘의 이야기가 없어요.</p>
        ) : (
          messages.map(m => (
            <div key={m.id} className="bg-[#F7F7F5]/80 rounded-lg px-2 py-1">
              <p className="text-[11px] text-[#1F1F1D] leading-snug whitespace-pre-wrap break-words">{m.body}</p>
              <p className="text-[9px] text-[#B0B0AA]">{fmtTime(m.created_at)}</p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={e => { e.preventDefault(); send() }} className="flex-shrink-0 flex gap-1">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="익명으로 한마디..."
          disabled={!me}
          className="flex-1 min-w-0 text-[11px] border border-[#E8E8E4] rounded-md px-2 py-1 bg-white/90 focus:outline-none focus:border-[#5B54C4] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim() || !me}
          className="text-[10.5px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-40 rounded-md px-2 py-1 flex-shrink-0"
        >
          전송
        </button>
      </form>
    </div>
  )
}
