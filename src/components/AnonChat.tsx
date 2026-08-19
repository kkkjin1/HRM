'use client'

import { useEffect, useState } from 'react'
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

// 오늘 날짜(chat_date)로만 필터링 — 어제 것부터는 화면에서 안 보인다(실제 삭제는 아직 안 함,
// 나중에 배치 정리 추가 예정). 익명은 화면상의 약속일 뿐 DB엔 author_id가 남는다(anon_chat.sql 참고).
export default function AnonChat() {
  const { me } = useCurrentMember()
  const [today, setToday] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

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
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5">
      <div className="mb-3">
        <p className="text-[12px] text-[#9C9C96]">🕵️ 오늘의 익명 채팅</p>
        <p className="text-[10.5px] text-[#B0B0AA] mt-0.5">여기 남긴 이야기는 오늘 하루만 보여요.</p>
      </div>

      <div className="space-y-2 max-h-[260px] overflow-y-auto mb-3">
        {!loaded ? (
          <p className="text-[12.5px] text-[#9C9C96]">불러오는 중...</p>
        ) : messages.length === 0 ? (
          <p className="text-[12.5px] text-[#9C9C96] py-4 text-center">아직 오늘의 이야기가 없어요.</p>
        ) : (
          messages.map(m => (
            <div key={m.id} className="bg-[#F7F7F5] rounded-xl px-3 py-2 max-w-[80%]">
              <p className="text-[13px] text-[#1F1F1D] leading-relaxed whitespace-pre-wrap">{m.body}</p>
              <p className="text-[10px] text-[#B0B0AA] mt-1">{fmtTime(m.created_at)}</p>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send() }}
        className="flex gap-1.5"
      >
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="익명으로 한마디 남기기..."
          disabled={!me}
          className="flex-1 text-[13px] border border-[#E8E8E4] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5B54C4] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim() || !me}
          className="text-[12.5px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-40 rounded-lg px-3.5 py-2 flex-shrink-0"
        >
          보내기
        </button>
      </form>
    </div>
  )
}
