'use client'

// 좁은 칸에 넓은 화면(회의창 등)을 "읽기 전용"으로 띄우는 PDF 뷰어식 보기 틀.
// - 내용은 contentWidth 폭으로 펼쳐 그린다(회의창 안 표들은 좁으면 자기 안에서만 가로로 넘쳐, 바깥에서 옮길 수 없어서).
// - 어디를 눌러도 끌어서 상하좌우로 옮긴다(이 앱은 스크롤바를 전역으로 숨겨서 끌기가 유일한 가로 이동 수단). 휠은 평소처럼 세로 스크롤.
// - 내용은 inert — 클릭·입력·포커스가 안 된다(보기 전용이라 실수로 고치거나 칸 잠금을 잡지 않게).
// - 배율: 기본은 "폭 맞춤"(칸 너비에 맞춰 줄임), −/+로 직접 고르면 그 값. 이 브라우저에 기억한다(storageKey별).
import { useEffect, useRef, useState, type ReactNode } from 'react'

const ZOOM_STEPS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

function readLocal(key: string) { try { return window.localStorage.getItem(key) } catch { return null } }
function writeLocal(key: string, v: string) { try { window.localStorage.setItem(key, v) } catch {} }

export default function PanZoomPane({ storageKey, contentWidth, toolbarLeft, toolbarRight, children }: {
  storageKey: string
  contentWidth: number
  toolbarLeft?: ReactNode
  toolbarRight?: ReactNode
  children: ReactNode
}) {
  const [zoomPref, setZoomPref] = useState<number | 'fit'>('fit')
  const [paneWidth, setPaneWidth] = useState(0)
  const [dragging, setDragging] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  useEffect(() => {
    const z = Number(readLocal(`${storageKey}_zoom`))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ZOOM_STEPS.includes(z)) setZoomPref(z)
  }, [storageKey])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setPaneWidth(el.clientWidth))
    ro.observe(el)
    // 내용이 inert라 휠이 이 칸을 건너뛰고 페이지를 굴린다 — 직접 받아 이 칸을 굴린다(Shift+휠은 가로).
    function onWheel(e: WheelEvent) {
      if (!el || e.ctrlKey) return
      e.preventDefault()
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.clientHeight : 1
      el.scrollLeft += dx * unit
      el.scrollTop += dy * unit
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { ro.disconnect(); el.removeEventListener('wheel', onWheel) }
  }, [])

  const fitZoom = paneWidth ? Math.min(1, Math.max(0.3, paneWidth / contentWidth)) : 1
  const zoom = zoomPref === 'fit' ? fitZoom : zoomPref

  function changeZoom(next: number | 'fit') {
    setZoomPref(next)
    writeLocal(`${storageKey}_zoom`, String(next))
  }
  function step(dir: 1 | -1) {
    const next = dir > 0 ? ZOOM_STEPS.find(z => z > zoom + 0.001) : [...ZOOM_STEPS].reverse().find(z => z < zoom - 0.001)
    if (next) changeZoom(next)
  }

  // 끄는 중 마우스가 칸 밖으로 나가도 이어지게 window에서 받는다.
  useEffect(() => {
    if (!dragging) return
    function onMove(e: MouseEvent) {
      const d = dragRef.current
      const el = scrollRef.current
      if (!d || !el) return
      el.scrollLeft = d.left - (e.clientX - d.x)
      el.scrollTop = d.top - (e.clientY - d.y)
    }
    function onUp() { dragRef.current = null; setDragging(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  const btn = 'h-7 min-w-7 px-1.5 flex items-center justify-center rounded-md text-[12px] font-medium text-[#4B5563] hover:bg-black/[0.05] transition-colors disabled:opacity-30'

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[#EEF0F2] bg-[#FAFBFB]">
        <div className="min-w-0 flex-1">{toolbarLeft}</div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <span className="text-[11px] text-[#9AA3AE] mr-1 hidden 2xl:inline">✋ 끌어서 이동 · 보기 전용</span>
          <button type="button" onClick={() => step(-1)} disabled={zoom <= ZOOM_STEPS[0] + 0.001} title="축소" aria-label="축소" className={btn}>−</button>
          <span className="w-10 text-center text-[12px] text-[#4B5563] tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => step(1)} disabled={zoom >= 1 - 0.001} title="확대" aria-label="확대" className={btn}>+</button>
          <button
            type="button"
            onClick={() => changeZoom('fit')}
            title="칸 너비에 맞추기"
            className={`${btn} ${zoomPref === 'fit' ? '!bg-[#E8EEFB] !text-[#2457C5]' : ''}`}
          >폭 맞춤</button>
          {toolbarRight && <><span className="w-px h-4 bg-[#E5E7EB] mx-1" />{toolbarRight}</>}
        </div>
      </div>
      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 overflow-auto select-none ${dragging ? 'pan-hand-dragging' : 'pan-hand'}`}
        onMouseDown={e => {
          if (e.button !== 0) return
          e.preventDefault()
          const el = scrollRef.current
          if (!el) return
          dragRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
          setDragging(true)
        }}
      >
        <div inert style={{ zoom, width: contentWidth }}>{children}</div>
      </div>
    </div>
  )
}
