'use client'

// 운동장 경기 공통 풀화면 틀(2026-11-22) — 야구 풀화면(baseball/arena.tsx)과 같은 원칙으로 만든 운동장판.
//  · 웹 창·모달이 아니라 게임 화면: 남색 바탕, 위 줄(← 광장 · 제목 · 상황 알약 · 닫기), 경기장, 조작 칸
//  · 화면 전체를 확대하지 않는다 — 경기장(고정 크기 세계)만 크게, 버튼·글씨는 원래 크기
//  · 배치 3가지
//    - wide(PC): 위 줄 · 경기장(남는 곳은 어두운 여백) · 아래 조작 카드
//    - landscape(폰 가로): 얇은 위 줄 · 경기장 · 아래 조작 한 줄(엄지 양쪽)
//    - portrait(폰 세로): 위 줄 · 경기장(양옆을 잘라 크게) · 아래 큰 버튼(엄지 자리)
// 키보드 조작은 각 게임이 그대로 갖고, 이 틀은 화면 배치와 터치 버튼 자리만 맡는다.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AR } from '@/components/baseball/arena'

export { AR }
export type GameLayout = 'wide' | 'portrait' | 'landscape'

const isTouch = () => typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)

// 야구와 같은 기준: 세로로 길면 portrait, 터치 기기 가로면 landscape, 나머지 wide
export function useGameLayout(): GameLayout {
  const read = (): GameLayout => {
    if (typeof window === 'undefined') return 'wide'
    const w = window.innerWidth, h = window.innerHeight
    if (w <= h * 1.15) return 'portrait'
    return isTouch() || h < 480 ? 'landscape' : 'wide'
  }
  const [layout, setLayout] = useState<GameLayout>(read)
  useEffect(() => {
    const on = () => setLayout(read())
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on) }
  }, [])
  return layout
}

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
}
const BACK = 'M15 18l-6-6 6-6'
const CLOSE = 'M6 6l12 12M18 6L6 18'

// 고정 크기 세계(world.w × world.h)를 상자에 맞춰 키운다.
// fit = 다 보이게(남는 곳 여백), cover = 꽉 채우게(넘치는 양옆은 잘림 — 카메라가 주인공을 가운데에 두는 게임용)
function WorldBox({ world, mode, children, className, style }: { world: { w: number; h: number }; mode: 'fit' | 'cover'; children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const k = box.w && box.h ? (mode === 'fit' ? Math.min(box.w / world.w, box.h / world.h) : Math.max(box.w / world.w, box.h / world.h)) : 0
  return (
    <div ref={ref} className={`overflow-hidden isolate ${className ?? 'relative'}`} style={style}>
      {k > 0 && (
        <div className="absolute overflow-hidden" style={{ width: world.w, height: world.h, left: (box.w - world.w * k) / 2, top: (box.h - world.h * k) / 2, transform: `scale(${k})`, transformOrigin: '0 0' }}>
          {children}
        </div>
      )}
    </div>
  )
}

export type GameArenaProps = {
  layout: GameLayout
  title: string
  sub?: string
  backLabel?: string
  onBack: () => void
  onClose: () => void
  onWindow?: () => void // PC: 예전 창으로
  world: { w: number; h: number }
  scene: ReactNode
  status?: ReactNode // 위 줄 상황 알약(체력·시간·점수 등). 폰 세로는 경기장 아래 첫 줄
  deck?: ReactNode // 조작 칸
}

export default function GameArena(p: GameArenaProps) {
  const { layout } = p
  if (typeof document === 'undefined') return null
  const wide = layout === 'wide', portrait = layout === 'portrait'
  const btn = 'flex items-center justify-center gap-1 rounded-xl border text-[14px]'
  return createPortal(
    <div className="fixed inset-0 z-[300] flex select-none flex-col overflow-hidden"
      style={{ height: '100dvh', background: AR.bg, color: AR.text, padding: 'env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)' }}>
      {/* 위 줄 */}
      <div className={`flex shrink-0 items-center ${wide ? 'h-14 gap-3 border-b px-5' : portrait ? 'h-12 gap-1 px-2' : 'h-11 gap-2 px-3'}`} style={{ borderColor: '#1E2B40' }}>
        {wide ? (
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={p.onBack} className={`${btn} h-9 shrink-0 pl-2.5 pr-3.5`} style={{ background: AR.card, borderColor: AR.line }}>
            <Icon d={BACK} size={16} /> {p.backLabel ?? '광장'}
          </button>
        ) : (
          <button type="button" aria-label={p.backLabel ?? '광장으로'} onMouseDown={e => e.preventDefault()} onClick={p.onBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><Icon d={BACK} size={22} /></button>
        )}
        <div className={`flex min-w-0 items-baseline gap-2 ${portrait ? 'flex-1 justify-center' : 'shrink-0'}`}>
          <span className={`truncate font-extrabold ${wide ? 'text-[17px]' : 'text-[15px]'}`}>{p.title}</span>
          {p.sub && wide && <span className="truncate text-[13.5px]" style={{ color: AR.muted }}>{p.sub}</span>}
        </div>
        {!portrait && p.status && <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">{p.status}</div>}
        <div className={`flex shrink-0 items-center gap-2 ${portrait ? '' : 'ml-auto'}`}>
          {wide && p.onWindow && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={p.onWindow} className={`${btn} h-9 px-3.5`} style={{ background: AR.card, borderColor: AR.line, color: AR.sub }}>창 모드로</button>
          )}
          <button type="button" aria-label="닫기" onMouseDown={e => e.preventDefault()} onClick={p.onClose}
            className={`${btn} ${wide ? 'h-9 w-9' : 'h-10 w-10 border-transparent'}`} style={wide ? { background: AR.card, borderColor: AR.line, color: AR.sub } : { color: AR.sub }}>
            <Icon d={CLOSE} size={wide ? 16 : 20} />
          </button>
        </div>
      </div>

      {portrait ? (
        <>
          {/* 세로: 경기장 양옆을 잘라 크게 — 카메라가 주인공을 가운데에 둔다 */}
          <WorldBox world={p.world} mode="cover" className="relative w-full shrink-0" style={{ aspectRatio: '1.45', maxHeight: '46dvh' }}>{p.scene}</WorldBox>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-3 pt-2.5" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            {p.status && <div className="flex flex-wrap items-center gap-1.5">{p.status}</div>}
            {p.deck}
          </div>
        </>
      ) : (
        <>
          <WorldBox world={p.world} mode="fit" className="relative min-h-0 flex-1">{p.scene}</WorldBox>
          {p.deck && (
            <div className={`shrink-0 ${wide ? 'px-5 pb-4 pt-3' : 'px-3 pt-1.5'}`} style={{ paddingBottom: wide ? undefined : 'max(8px, env(safe-area-inset-bottom))' }}>{p.deck}</div>
          )}
        </>
      )}
    </div>,
    document.body,
  )
}

// 위 줄 상황 알약
export function Pill({ children, tone, title }: { children: ReactNode; tone?: 'warn' | 'hot' | 'blue' | 'red'; title?: string }) {
  const bg = tone === 'hot' ? '#FACC15' : tone === 'warn' ? '#7F1D1D' : AR.card
  const color = tone === 'hot' ? '#1F2933' : tone === 'warn' ? '#FECACA' : tone === 'blue' ? '#BFD4FF' : tone === 'red' ? '#FFC9CB' : AR.text
  return <span title={title} className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold" style={{ background: bg, color }}>{children}</span>
}

// 누르고 있는 동안 켜지는 버튼(이동·각도·힘 모으기) — 터치·마우스 공통
export function HoldButton({ children, onHold, disabled, className, style, tone = 'tile', ariaLabel }: {
  children: ReactNode; onHold: (down: boolean) => void; disabled?: boolean; className?: string; style?: CSSProperties; tone?: 'tile' | 'red' | 'blue'; ariaLabel?: string
}) {
  const [down, setDown] = useState(false)
  const release = () => { if (!down) return; setDown(false); onHold(false) }
  const bg = tone === 'red' ? AR.red : tone === 'blue' ? AR.blue : down ? '#2A3F62' : AR.tile
  return (
    <button type="button" aria-label={ariaLabel} disabled={disabled} onMouseDown={e => e.preventDefault()}
      onPointerDown={e => { if (disabled) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDown(true); onHold(true) }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release} onContextMenu={e => e.preventDefault()}
      className={`flex touch-none select-none items-center justify-center border font-extrabold ${className?.includes('rounded-') ? '' : 'rounded-xl'} transition-[filter] disabled:opacity-35 ${down ? 'brightness-110' : ''} ${className ?? ''}`}
      style={{ background: bg, borderColor: tone === 'tile' ? AR.line : bg, color: '#fff', WebkitTapHighlightColor: 'transparent', ...style }}>
      {children}
    </button>
  )
}
