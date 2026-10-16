'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useWidgetOpen } from '@/lib/useWidgetOpen'

type ChatRow = {
  id: string
  chat_date: string
  author_id: string
  body: string
  created_at: string
  // SOS로 보낸 메시지 — 모든 팀원에게 1회 팝업(SosPopup)으로 뜬다. R&R의 "살려주세요"를 대신한다.
  is_sos?: boolean
}

export const SOS_DEFAULT_BODY = '도움이 필요해요! 🆘'

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
  const todayRef = useRef<string | null>(null)
  const [messages, setMessages] = useState<ChatRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useWidgetOpen('anon-chat')

  useEffect(() => {
    let active = true
    const supabase = createClient()

    async function loadForDate(dateStr: string) {
      todayRef.current = dateStr
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
    }

    ;(async () => {
      const { data: dateData } = await supabase.rpc('today_date')
      const dateStr = dateData as string | null
      if (!active || !dateStr) return
      await loadForDate(dateStr)
    })()

    // 위젯이 페이지에 계속 떠 있는 채로(탭을 하루 종일 켜두는 경우) 자정이 지나면
    // today가 갱신되지 않아 전날 채팅이 계속 보이던 버그 — 주기적으로 서버 날짜를
    // 다시 확인해서 날짜가 바뀌면 그 날짜로 목록을 새로 불러온다.
    const dateCheckId = setInterval(async () => {
      const { data } = await supabase.rpc('today_date')
      const dateStr = data as string | null
      if (active && dateStr && dateStr !== todayRef.current) {
        await loadForDate(dateStr)
      }
    }, 60_000)

    const channel = supabase
      .channel('fun-anon-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anon_chat' }, payload => {
        const row = payload.new as ChatRow
        // 날짜 갱신이 안 된 다른 탭에서 어제 날짜로 잘못 보낸 메시지가 실시간으로
        // 넘어와도, 오늘 날짜가 아니면 화면에 얹지 않는다.
        if (row.chat_date !== todayRef.current) return
        setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]))
      })
      .subscribe()

    return () => {
      active = false
      clearInterval(dateCheckId)
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length, open])

  // sos: 전송 옆 SOS 버튼 — 익명 그대로, 모든 팀원에게 팝업으로 알린다. 입력이 비어 있으면 기본 문구로 보낸다.
  async function send(sos = false) {
    if ((!sos && !draft.trim()) || !me || !today || busy) return
    const body = draft.trim() || SOS_DEFAULT_BODY
    if (sos && !confirm(`SOS로 보낼까요?

"${body}"

익명으로, 모든 팀원에게 팝업으로 한 번 뜹니다.`)) return
    setBusy(true)
    setDraft('')
    const supabase = createClient()
    const { data, error } = await supabase
      .from('anon_chat')
      .insert({ chat_date: today, author_id: me.id, body, is_sos: sos })
      .select()
      .single()
    if (data) setMessages(prev => [...prev, data as ChatRow])
    else if (error) { setDraft(body); alert('보내지 못했습니다. 잠시 후 다시 시도해주세요.') }
    setBusy(false)
  }

  // 노트북 폭에서는 홈 카드를 덮지 않게 기본으로 접어 작은 버튼만 둔다. 접어도 언마운트하지 않아 실시간 수신은 계속된다.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="오늘의 익명 채팅 펼치기"
        className="hidden lg:flex fixed left-4 bottom-4 z-40 items-center gap-1 bg-white/70 backdrop-blur-sm border border-[#E8E8E4] rounded-full px-3 py-1.5 text-[11px] text-[#6B6B66] opacity-[0.5] hover:opacity-100 transition-opacity duration-200 shadow-sm"
      >
        🕵️ {messages.length > 0 && <span className="font-semibold text-[#5B54C4]">{messages.length}</span>}
      </button>
    )
  }

  return (
    <div
      style={{ width: 200, height: 220 }}
      className="hidden lg:flex fixed left-4 bottom-4 z-40 flex-col bg-white/70 backdrop-blur-sm border border-[#E8E8E4] rounded-xl px-3 py-2.5 opacity-[0.35] hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 resize overflow-auto min-w-[160px] min-h-[130px] max-w-[420px] max-h-[70vh]"
    >
      <div className="flex items-center justify-between flex-shrink-0 mb-1.5">
        <p className="text-[10.5px] text-[#9C9C96]">🕵️ 오늘의 익명 채팅</p>
        <button onClick={() => setOpen(false)} title="접기" className="text-[12px] leading-none text-[#B0B0AA] hover:text-[#4A4A46] px-1">–</button>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 space-y-1 overflow-y-auto mb-1.5">
        {!loaded ? (
          <p className="text-[11px] text-[#9C9C96]">불러오는 중...</p>
        ) : messages.length === 0 ? (
          <p className="text-[11px] text-[#B0B0AA]">아직 오늘의 이야기가 없어요.</p>
        ) : (
          messages.map(m => (
            <div key={m.id} className={`rounded-lg px-2 py-1 ${m.is_sos ? 'bg-red-50 border border-red-200' : 'bg-[#F7F7F5]/80'}`}>
              <p className={`text-[11px] leading-snug whitespace-pre-wrap break-words ${m.is_sos ? 'text-red-700 font-medium' : 'text-[#1F1F1D]'}`}>{m.is_sos && <span className="font-bold">SOS · </span>}{m.body}</p>
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
        <button
          type="button"
          onClick={() => { void send(true) }}
          disabled={busy || !me}
          title="SOS — 익명으로 모든 팀원에게 팝업 알림"
          className="text-[10.5px] font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 rounded-md px-1.5 py-1 flex-shrink-0"
        >
          SOS
        </button>
      </form>
    </div>
  )
}
