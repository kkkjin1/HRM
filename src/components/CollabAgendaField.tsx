'use client'

// 회의 안건 공동 편집 필드. 동시 편집은 칸 잠금(lib/useFieldLocks)으로 막는다 — 다른 사람이 쓰는 중이면
// 이 칸은 읽기 전용이 되고 그 사람이 치는 글(lock.preview)이 보인다. 잠금이 풀리면 부모가 서버 최신값을
// 다시 읽는 동안(lock.kind === 'syncing')까지 읽기 전용으로 두고, 그 뒤 syncNonce로 최신값을 반영한다.
// broadcast 'saved'는 그대로 둔다: 상대가 저장을 마쳤다는 신호를 받으면 부모가 서버에서 다시 읽는다(onSyncRequest).
// 실제 서버 저장/충돌 감지는 이 컴포넌트가 하지 않고 onBlur로 부모에 위임한다.

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FieldLock } from '@/lib/useFieldLocks'

// 부모가 서버 최신값을 받아온 뒤 "지금 이 필드에 미저장 입력이 있는지"를 판단할 때 쓴다.
// 그 사이 다른 회의로 전환됐으면 null을 돌려준다(엉뚱한 필드를 리셋하지 않도록).
export type AgendaFieldSnapshot = { meetingId: string; getText: () => string | null }

type Props = {
  meetingId: string | null
  initialText: string
  resetToken: string | number
  onChange?: (text: string) => void
  onBlur: (text: string) => void
  // 이 회의 안건 저장이 성공할 때마다 부모가 n을 올린다 → 다른 사람 화면에 'saved' 신호를 보낸다.
  savedSignal?: { meetingId: string; n: number } | null
  // 편집 세션 시작(마운트/리셋) 시, 상대가 저장을 마쳤다는 신호를 받았을 때, syncNonce가 바뀔 때 호출된다.
  onSyncRequest?: (snapshot: AgendaFieldSnapshot) => void
  // 칸 잠금 — 다른 사람이 쓰는 중이거나 방금 풀려 최신값을 읽는 중이면 읽기 전용.
  lock?: FieldLock | null
  // 포커스/입력 시 잠금을 잡는다. false면(남이 먼저 잡음) 입력을 받지 않는다.
  onAcquire?: () => boolean
  // 입력할 때마다 — 다른 사람 화면의 실시간 미리보기용.
  onTyping?: (text: string) => void
  // 잠금이 풀려 부모가 최신값을 다시 읽어야 할 때 올린다.
  syncNonce?: number
  rows?: number
  placeholder?: string
  className?: string
  // 편집 중 표시줄과 textarea를 감싸는 div의 클래스 — flex 레이아웃 안에 들어갈 때(크게 보기) 쓴다.
  wrapperClassName?: string
}

export default function CollabAgendaField({
  meetingId, initialText, resetToken, onChange, onBlur, savedSignal, onSyncRequest, lock, onAcquire, onTyping, syncNonce,
  rows = 10, placeholder, className = '', wrapperClassName,
}: Props) {
  const [text, setText] = useState(initialText)
  const textRef = useRef(initialText)
  const meetingIdRef = useRef(meetingId)
  const onSyncRequestRef = useRef(onSyncRequest)
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

  // 잠금이 풀렸다 → 서버 최신값을 다시 읽게 한다(이 칸은 그동안 읽기 전용이라 미저장 입력이 없다).
  useEffect(() => {
    if (syncNonce === undefined || syncNonce === 0) return
    requestSync()
  }, [syncNonce])

  useEffect(() => {
    if (!meetingId) return
    const supabase = createClient()
    const channel = supabase.channel(`agenda-collab-${meetingId}`, { config: { broadcast: { self: false } } })
    channelRef.current = channel
    channel
      .on('broadcast', { event: 'saved' }, () => {
        // 상대 저장이 DB에 반영됐다는 신호일 뿐 — 내용은 부모가 서버에서 다시 읽는다.
        requestSync()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [meetingId])

  // 부모가 이 회의 안건 저장 성공을 알려오면 다른 사람에게 'saved'를 보낸다.
  useEffect(() => {
    if (!savedSignal || savedSignal.meetingId !== meetingId) return
    if (lastSentSavedNRef.current === savedSignal.n) return
    lastSentSavedNRef.current = savedSignal.n
    channelRef.current?.send({ type: 'broadcast', event: 'saved', payload: {} })
  }, [savedSignal, meetingId])

  function handleChange(next: string) {
    if (lock) return
    if (onAcquire && !onAcquire()) return
    setText(next)
    textRef.current = next
    onChange?.(next)
    onTyping?.(next)
  }

  const readOnly = !!lock
  const shown = lock?.kind === 'other' && lock.preview !== null ? lock.preview : text

  return (
    <div className={wrapperClassName}>
      {lock && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-[#4C7FE0]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4C7FE0] animate-pulse flex-shrink-0" />
          {lock.kind === 'other' ? `${lock.name}님이 안건을 수정 중입니다 — 끝나면 최신 내용으로 바뀝니다.` : '최신 내용을 불러오는 중…'}
        </div>
      )}
      <textarea
        value={shown}
        readOnly={readOnly}
        onFocus={() => { if (!lock) onAcquire?.() }}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => onBlur(text)}
        rows={rows}
        placeholder={placeholder}
        className={`${className} ${readOnly ? 'bg-[#F7F9FC] text-[#5B6570] cursor-not-allowed' : ''}`}
      />
    </div>
  )
}
