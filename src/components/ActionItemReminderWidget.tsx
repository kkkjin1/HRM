'use client'

// AnonChat(좌측하단, 투명도 0.35)과 같은 패턴의 우측하단 상시노출 위젯.
// 강제모달(ActionItemReminderModal)에서 확인·닫기를 해도 항목이 사라지는 게 아니라
// 여기 계속 남아서 하루 중 언제든 다시 훑어볼 수 있게 한다. 좌측 채팅창보다는 조금 더
// 또렷하게(기본 투명도 0.65) — 완전히 무시되지 않도록.
// 노트북 폭에서는 홈 카드를 덮지 않게 기본으로 접어 작은 버튼만 둔다(useWidgetOpen).
// 여기서 바로 완료 체크·삭제도 한다(회의창 액션아이템과 같은 /api/meeting-items).
import { useEffect, useState } from 'react'
import { useMyActionReminders } from '@/lib/useMyActionReminders'
import { useWidgetOpen } from '@/lib/useWidgetOpen'

const SIZE_KEY = 'hrm_action_widget_size'
const DEFAULT_SIZE = { w: 220, h: 200 }
const MIN_W = 180
const MIN_H = 120

export default function ActionItemReminderWidget({ onGoToMeeting, onPrefetchMeeting, onEventsRemoved }: {
  onGoToMeeting?: (meetingId: string) => void
  // 항목에 마우스를 올리거나 포커스하면 그 회의를 미리 받아 둔다(달력과 같은 미리받기).
  onPrefetchMeeting?: (meetingId: string) => void
  // 액션을 지우면 서버가 그 액션이 만든 일정도 같이 지운다 — 캘린더 화면에서도 빼도록 알려준다.
  onEventsRemoved?: (eventIds: string[]) => void
}) {
  const items = useMyActionReminders()
  const [open, setOpen] = useWidgetOpen('action-items')
  // 완료·삭제를 누른 항목은 서버 응답(실시간 재조회)을 기다리지 않고 바로 숨긴다. 실패하면 다시 보인다.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  // 창 크기 — 화면 우측하단에 붙어 있어서 왼쪽 위 모서리를 끌어 넓힌다. 이 브라우저에 기억해 둔다.
  const [size, setSize] = useState(DEFAULT_SIZE)
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SIZE_KEY) ?? 'null') as { w?: number; h?: number } | null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장값은 마운트 뒤에만 읽을 수 있다(SSR 불일치 방지)
      if (saved && Number.isFinite(saved.w) && Number.isFinite(saved.h)) setSize({ w: saved.w as number, h: saved.h as number })
    } catch {}
  }, [])

  const visible = items.filter(i => !hiddenIds.has(i.id))
  if (visible.length === 0) return null

  function onResizeStart(e: React.PointerEvent<HTMLSpanElement>) {
    e.preventDefault()
    const el = e.currentTarget
    const startX = e.clientX
    const startY = e.clientY
    const base = size
    let last = base
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const w = Math.min(Math.max(MIN_W, base.w + (startX - ev.clientX)), window.innerWidth - 40)
      const h = Math.min(Math.max(MIN_H, base.h + (startY - ev.clientY)), window.innerHeight - 40)
      last = { w: Math.round(w), h: Math.round(h) }
      setSize(last)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('lostpointercapture', up)
      try { window.localStorage.setItem(SIZE_KEY, JSON.stringify(last)) } catch {}
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('lostpointercapture', up)
  }

  async function act(id: string, method: 'PATCH' | 'DELETE', failText: string) {
    setError('')
    setHiddenIds(prev => new Set(prev).add(id))
    const res = await fetch('/api/meeting-items', {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(method === 'PATCH' ? { id, done: true } : { id }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) {
      setHiddenIds(prev => { const next = new Set(prev); next.delete(id); return next })
      setError(json?.error ?? failText)
      return
    }
    const removed: string[] = json.removed_event_ids ?? []
    if (removed.length > 0) onEventsRemoved?.(removed)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="내 액션아이템 펼치기"
        className="hidden lg:flex fixed right-4 bottom-4 z-40 items-center gap-1 bg-white/85 backdrop-blur-sm border border-[#E8E8E4] rounded-full px-3 py-1.5 text-[11px] text-[#6B6B66] opacity-[0.65] hover:opacity-100 transition-opacity duration-200 shadow-sm"
      >
        ⏰ <span className="font-semibold text-red-500">{visible.length}</span>
      </button>
    )
  }

  return (
    <div
      style={{ width: size.w, height: size.h }}
      className="hidden lg:flex fixed right-4 bottom-4 z-40 flex-col bg-white/85 backdrop-blur-sm border border-[#E8E8E4] rounded-xl px-3 py-2.5 opacity-[0.65] hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 max-w-[calc(100vw-40px)] max-h-[calc(100vh-40px)]"
    >
      {/* 왼쪽 위 모서리 — 끌어서 창 크기 조절(화면 가운데 쪽으로 넓어진다) */}
      <span
        onPointerDown={onResizeStart}
        title="끌어서 창 크기 조절"
        className="absolute -left-1 -top-1 w-4 h-4 cursor-nwse-resize flex items-start justify-start p-[3px] touch-none"
      >
        <span className="block w-2 h-2 border-l-2 border-t-2 border-[#C4C4BE] rounded-tl-sm" />
      </span>
      <div className="flex items-center justify-between flex-shrink-0 mb-1.5 pl-2">
        <p className="text-[10.5px] text-[#9C9C96]">⏰ 내 액션아이템 ({visible.length})</p>
        <button onClick={() => setOpen(false)} title="접기" className="text-[12px] leading-none text-[#B0B0AA] hover:text-[#4A4A46] px-1">–</button>
      </div>
      {error && <p className="text-[10px] text-red-500 mb-1 flex-shrink-0">{error}</p>}

      <div className="flex-1 min-h-0 space-y-1 overflow-y-auto">
        {visible.map(item => (
          <div
            key={item.id}
            onPointerEnter={() => onPrefetchMeeting?.(item.meetingId)}
            className="group flex items-start gap-1.5 bg-[#F7F7F5]/80 hover:bg-[#EFEFEC] rounded-lg px-2 py-1"
          >
            <input
              type="checkbox"
              checked={false}
              onChange={() => { void act(item.id, 'PATCH', '완료 처리에 실패했습니다.') }}
              title="완료"
              className="flex-shrink-0 mt-[3px] cursor-pointer"
            />
            <button
              onClick={() => onGoToMeeting?.(item.meetingId)}
              onFocus={() => onPrefetchMeeting?.(item.meetingId)}
              title="회의로 이동"
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-[11px] text-[#1F1F1D] leading-snug truncate">{item.content}</p>
              <p className={`text-[9.5px] truncate ${item.overdue ? 'text-red-500' : 'text-amber-600'}`}>
                {item.overdue ? `${item.dueDate} 지남` : '오늘 마감'} · {item.meetingTitle}
              </p>
            </button>
            <button
              onClick={() => { if (confirm(`"${item.content}" 액션아이템을 삭제할까요?\n연결된 일정도 함께 삭제됩니다.`)) void act(item.id, 'DELETE', '삭제에 실패했습니다.') }}
              title="삭제 — 연결된 일정도 함께 삭제됩니다"
              className="flex-shrink-0 text-[10.5px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100 px-0.5"
            >✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
