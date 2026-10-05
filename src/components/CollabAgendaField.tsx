'use client'

// 회의 안건 공동 편집 필드. broadcast는 "누가 지금 편집 중인지" 알려주는 presence 표시 용도로만 쓴다.
// 예전엔 상대의 typing 이벤트로 내 textarea를 읽기 전용으로 바꾸고 내 text를 상대 text로 덮었는데,
// 두 사람이 거의 동시에 입력을 시작하면 서로의 저장 안 된 입력이 상대 텍스트로 바뀌어 사라졌다.
// 이제 상대 이벤트는 내 입력값을 절대 건드리지 않는다. 데이터 정합성은 broadcast가 아니라 DB 기준이다 —
// 상대가 실제로 저장을 마치면 'saved' 신호만 받고, 최신값은 부모가 서버에서 다시 읽어 판단한다(onSyncRequest).
// 실제 서버 저장/충돌 감지는 이 컴포넌트가 하지 않고 onBlur로 부모에 위임한다.

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// 부모가 서버 최신값을 받아온 뒤 "지금 이 필드에 미저장 입력이 있는지"를 판단할 때 쓴다.
// 그 사이 다른 회의로 전환됐으면 null을 돌려준다(엉뚱한 필드를 리셋하지 않도록).
export type AgendaFieldSnapshot = { meetingId: string; getText: () => string | null }

type Props = {
  meetingId: string | null
  initialText: string
  resetToken: string | number
  authorName: string
  onChange?: (text: string) => void
  onBlur: (text: string) => void
  // 이 회의 안건 저장이 성공할 때마다 부모가 n을 올린다 → 다른 사람 화면에 'saved' 신호를 보낸다.
  savedSignal?: { meetingId: string; n: number } | null
  // 편집 세션 시작(마운트/리셋) 시, 그리고 상대가 저장을 마쳤다는 신호를 받았을 때 호출된다.
  onSyncRequest?: (snapshot: AgendaFieldSnapshot) => void
  rows?: number
  placeholder?: string
  className?: string
  // 편집 중 표시줄과 textarea를 감싸는 div의 클래스 — flex 레이아웃 안에 들어갈 때(크게 보기) 쓴다.
  wrapperClassName?: string
}

const TYPING_THROTTLE_MS = 150
const REMOTE_IDLE_TIMEOUT_MS = 6000

export default function CollabAgendaField({
  meetingId, initialText, resetToken, authorName, onChange, onBlur, savedSignal, onSyncRequest, rows = 10, placeholder, className = '', wrapperClassName,
}: Props) {
  const [text, setText] = useState(initialText)
  const [remoteAuthor, setRemoteAuthor] = useState<string | null>(null)
  const textRef = useRef(initialText)
  const meetingIdRef = useRef(meetingId)
  const onSyncRequestRef = useRef(onSyncRequest)
  const lastSentAtRef = useRef(0)
  const pendingSendRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remoteIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const lastSentSavedNRef = useRef<number | null>(savedSignal?.n ?? null)

  // 부모 값(initialText = 마지막으로 알고 있는 서버 값)이 바뀌었을 때, 이 필드에 미저장 입력이 없으면(이전
  // 부모 값과 같으면) 새 값을 따라간다. 다른 화면에서 같은 회의 안건이 저장돼 baseline만 바뀌고 이 필드는
  // 옛 텍스트로 남으면, 다음 blur 때 옛 텍스트가 "변경"으로 보여 저장될 수 있기 때문이다.
  const [prevInitialText, setPrevInitialText] = useState(initialText)
  if (initialText !== prevInitialText) {
    setPrevInitialText(initialText)
    if (text === prevInitialText) setText(initialText)
  }

  useEffect(() => {
    meetingIdRef.current = meetingId
    onSyncRequestRef.current = onSyncRequest
    textRef.current = text
  })

  function requestSync() {
    const mid = meetingIdRef.current
    if (!mid || !onSyncRequestRef.current) return
    onSyncRequestRef.current({ meetingId: mid, getText: () => (meetingIdRef.current === mid ? textRef.current : null) })
  }

  // 편집 세션이 바뀔 때만(다른 회의로 전환, 충돌 해소 후 서버값 채택 등) 내부 텍스트를 초기화한다 — 매 렌더마다
  // initialText로 리셋하면 내가 타이핑하는 도중에 부모 리렌더로 글자가 날아간다.
  useEffect(() => {
    setText(initialText)
    textRef.current = initialText
    requestSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetToken이 바뀔 때만 의도적으로 리셋
  }, [resetToken])

  useEffect(() => {
    if (!meetingId) return
    const supabase = createClient()
    const channel = supabase.channel(`agenda-collab-${meetingId}`, { config: { broadcast: { self: false } } })
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        // presence 표시만 갱신한다 — payload.text는 (구버전 클라이언트 호환용으로 아직 실려 오지만) 쓰지 않는다.
        const p = payload as { authorName?: string }
        setRemoteAuthor(p.authorName || '팀원')
        if (remoteIdleTimerRef.current) clearTimeout(remoteIdleTimerRef.current)
        // 상대가 탭을 닫는 등 stop 없이 사라지면 표시가 안 꺼질 수 있어, 일정 시간 조용하면 자동 해제한다.
        remoteIdleTimerRef.current = setTimeout(() => setRemoteAuthor(null), REMOTE_IDLE_TIMEOUT_MS)
      })
      .on('broadcast', { event: 'stop' }, () => {
        if (remoteIdleTimerRef.current) clearTimeout(remoteIdleTimerRef.current)
        setRemoteAuthor(null)
      })
      .on('broadcast', { event: 'saved' }, () => {
        // 상대 저장이 DB에 반영됐다는 신호일 뿐 — 내용은 부모가 서버에서 다시 읽는다.
        requestSync()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      if (remoteIdleTimerRef.current) clearTimeout(remoteIdleTimerRef.current)
      if (pendingSendRef.current) clearTimeout(pendingSendRef.current)
      setRemoteAuthor(null)
    }
  }, [meetingId])

  // 부모가 이 회의 안건 저장 성공을 알려오면 다른 사람에게 'saved'를 보낸다.
  useEffect(() => {
    if (!savedSignal || savedSignal.meetingId !== meetingId) return
    if (lastSentSavedNRef.current === savedSignal.n) return
    lastSentSavedNRef.current = savedSignal.n
    channelRef.current?.send({ type: 'broadcast', event: 'saved', payload: {} })
  }, [savedSignal, meetingId])

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
    textRef.current = next
    onChange?.(next)
    broadcastTyping(next)
  }

  function handleBlur() {
    if (pendingSendRef.current) { clearTimeout(pendingSendRef.current); pendingSendRef.current = null }
    channelRef.current?.send({ type: 'broadcast', event: 'stop', payload: { text } })
    onBlur(text)
  }

  return (
    <div className={wrapperClassName}>
      {remoteAuthor && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-[#4C7FE0]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4C7FE0] animate-pulse flex-shrink-0" />
          {remoteAuthor}님이 안건을 편집 중입니다.
        </div>
      )}
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
    </div>
  )
}
