'use client'

// 회의 안건 실시간 공동 편집 필드. Notion처럼 글자 단위로 정교하게 병합하진 않는 대신,
// "소프트 락 + 라이브 미러링"으로 접근한다 — 누군가 이 필드를 쓰기 시작하면 그 순간
// 다른 사람 화면에서는 이 필드가 보기 전용으로 잠기고, 타이핑 내용이 실시간으로 그대로
// 비친다. 그 사람이 손을 떼야(blur) 비로소 다른 사람이 이어 쓸 수 있어서, "두 사람이
// 정말 같은 순간에 타이핑해서 뒤섞이는" 상황 자체가 애초에 거의 생기지 않는다.
// 실제 서버 저장/충돌 감지는 이 컴포넌트가 하지 않고 onBlur로 부모에 위임한다 — 부모가
// 이미 갖고 있는 저장 로직(안건 동시편집 충돌 감지)을 그대로 재사용하기 위함.

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type RemoteTyping = { authorName: string; text: string }

type Props = {
  meetingId: string | null
  initialText: string
  resetToken: string | number
  authorName: string
  onChange?: (text: string) => void
  onBlur: (text: string) => void
  rows?: number
  placeholder?: string
  className?: string
}

const TYPING_THROTTLE_MS = 150
const REMOTE_IDLE_TIMEOUT_MS = 6000

export default function CollabAgendaField({
  meetingId, initialText, resetToken, authorName, onChange, onBlur, rows = 10, placeholder, className = '',
}: Props) {
  const [text, setText] = useState(initialText)
  const [remote, setRemote] = useState<RemoteTyping | null>(null)
  const lastSentAtRef = useRef(0)
  const pendingSendRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remoteIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  // 편집 세션이 바뀔 때만(다른 회의로 전환 등) 내부 텍스트를 초기화한다 — 매 렌더마다
  // initialText로 리셋하면 내가 타이핑하는 도중에 부모 리렌더로 글자가 날아간다.
  useEffect(() => {
    setText(initialText)
    setRemote(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetToken이 바뀔 때만 의도적으로 리셋
  }, [resetToken])

  useEffect(() => {
    if (!meetingId) return
    const supabase = createClient()
    const channel = supabase.channel(`agenda-collab-${meetingId}`, { config: { broadcast: { self: false } } })
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        setRemote(payload as RemoteTyping)
        if (remoteIdleTimerRef.current) clearTimeout(remoteIdleTimerRef.current)
        // 상대가 탭을 닫는 등 stop 없이 사라지면 락이 안 풀릴 수 있어, 일정 시간 조용하면 자동 해제한다.
        remoteIdleTimerRef.current = setTimeout(() => setRemote(null), REMOTE_IDLE_TIMEOUT_MS)
      })
      .on('broadcast', { event: 'stop' }, ({ payload }) => {
        const p = payload as { text: string }
        if (remoteIdleTimerRef.current) clearTimeout(remoteIdleTimerRef.current)
        setRemote(null)
        setText(p.text)
        onChange?.(p.text)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      if (remoteIdleTimerRef.current) clearTimeout(remoteIdleTimerRef.current)
      if (pendingSendRef.current) clearTimeout(pendingSendRef.current)
    }
  }, [meetingId]) // eslint-disable-line react-hooks/exhaustive-deps -- onChange는 매 렌더 바뀔 수 있어 의도적으로 제외

  function broadcastTyping(nextText: string) {
    if (!channelRef.current) return
    const send = () => {
      lastSentAtRef.current = Date.now()
      channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { authorName, text: nextText } })
    }
    if (Date.now() - lastSentAtRef.current >= TYPING_THROTTLE_MS) {
      if (pendingSendRef.current) { clearTimeout(pendingSendRef.current); pendingSendRef.current = null }
      send()
    } else if (!pendingSendRef.current) {
      pendingSendRef.current = setTimeout(() => { pendingSendRef.current = null; send() }, TYPING_THROTTLE_MS)
    }
  }

  function handleChange(next: string) {
    setText(next)
    onChange?.(next)
    broadcastTyping(next)
  }

  function handleBlur() {
    if (pendingSendRef.current) { clearTimeout(pendingSendRef.current); pendingSendRef.current = null }
    channelRef.current?.send({ type: 'broadcast', event: 'stop', payload: { text } })
    onBlur(text)
  }

  if (remote) {
    return (
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-[#4C7FE0]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4C7FE0] animate-pulse flex-shrink-0" />
          {remote.authorName}님이 편집 중...
        </div>
        <textarea
          readOnly
          value={remote.text}
          rows={rows}
          className={`${className} bg-[#FAFBFB] text-[#9AA5B1] cursor-not-allowed`}
        />
      </div>
    )
  }

  return (
    <textarea
      value={text}
      onChange={e => handleChange(e.target.value)}
      onBlur={handleBlur}
      rows={rows}
      placeholder={placeholder}
      className={className}
    />
  )
}
