'use client'

// 대기실 자리 끌어놓기(방장용) — 마우스·손가락 둘 다.
// 자리 칸을 잡고 다른 칸 위에 놓으면 onDrop(from, to). 조금만 움직이고 떼면 평소 클릭(onClick)이 그대로 동작한다.
// HTML5 drag는 휴대폰에서 안 되므로 pointer 이벤트 + elementFromPoint로 놓을 칸을 찾는다.
// 운동장 창은 zoom으로 축소돼 있어도 elementFromPoint는 화면 좌표라 그대로 맞는다.

import { useId, useRef, useState, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react'
import { createPortal } from 'react-dom'

const MOVE_PX = 6

export function useSeatDrag(enabled: boolean, onDrop: (from: number, to: number) => void) {
  const group = useId()
  const start = useRef<{ i: number; x: number; y: number; label: string } | null>(null)
  const justDragged = useRef(false)
  const [drag, setDrag] = useState<{ from: number; over: number | null; x: number; y: number; label: string } | null>(null)

  const seatAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-seat-drag]') as HTMLElement | null
    if (!el || el.dataset.seatGroup !== group) return null
    const n = Number(el.dataset.seatDrag)
    return Number.isFinite(n) ? n : null
  }

  const seatProps = (i: number, label: string) => {
    if (!enabled) return {}
    return {
      'data-seat-drag': i,
      'data-seat-group': group,
      onPointerDown: (e: RPointerEvent<HTMLElement>) => {
        if (e.button !== 0) return
        start.current = { i, x: e.clientX, y: e.clientY, label }
        justDragged.current = false
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
      },
      onPointerMove: (e: RPointerEvent<HTMLElement>) => {
        const s = start.current
        if (!s) return
        if (!drag && Math.hypot(e.clientX - s.x, e.clientY - s.y) < MOVE_PX) return
        setDrag({ from: s.i, over: seatAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY, label: s.label })
      },
      onPointerUp: (e: RPointerEvent<HTMLElement>) => {
        const s = start.current
        start.current = null
        if (s && drag) {
          justDragged.current = true
          const to = seatAt(e.clientX, e.clientY)
          if (to !== null && to !== s.i) onDrop(s.i, to)
        }
        setDrag(null)
      },
      onPointerCancel: () => { start.current = null; setDrag(null) },
      // 끌어놓은 직후 따라오는 click은 무시(옆 자리와 바꾸기가 한 번 더 일어나지 않게)
      onClickCapture: (e: RMouseEvent<HTMLElement>) => {
        if (justDragged.current) { justDragged.current = false; e.preventDefault(); e.stopPropagation() }
      },
    }
  }

  // 칸에 덧입힐 강조(잡은 칸은 흐리게, 놓을 칸은 파란 테두리)
  const seatClass = (i: number) => !drag ? '' : i === drag.from ? 'opacity-40' : i === drag.over ? 'ring-2 ring-[#2563EB] ring-offset-1' : ''

  const ghost = drag && typeof document !== 'undefined'
    ? createPortal(
      <div className="pointer-events-none fixed z-[325] -translate-x-1/2 -translate-y-[130%] rounded-lg bg-[#0F172A] px-2.5 py-1 text-[12px] font-bold text-white shadow-lg"
        style={{ left: drag.x, top: drag.y }}>
        {drag.label}
      </div>, document.body)
    : null

  // 칸 style에 합쳐 쓸 값(손가락으로 끌 때 화면이 스크롤되지 않게)
  const seatStyle = enabled ? { touchAction: 'none' as const, cursor: 'grab' } : {}

  return { seatProps, seatClass, seatStyle, ghost, dragging: !!drag }
}
