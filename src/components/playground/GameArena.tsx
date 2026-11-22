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
function WorldBox({ world, mode, children, className, style, focusX }: { world: { w: number; h: number }; mode: 'fit' | 'cover'; children: ReactNode; className?: string; style?: CSSProperties; focusX?: number }) {
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
        <div className="absolute overflow-hidden" style={{ width: world.w, height: world.h,
          // focusX: 잘리는 cover에서 그 x(세계 좌표)를 가운데에 두고 따라간다(양 끝에선 멈춤)
          left: focusX === undefined ? (box.w - world.w * k) / 2 : Math.min(0, Math.max(box.w - world.w * k, box.w / 2 - focusX * k)), top: (box.h - world.h * k) / 2, transform: `scale(${k})`, transformOrigin: '0 0' }}>
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
  actions?: ReactNode // 위 줄 오른쪽 추가 버튼(새 판 등)
  // 폰 가로에서 경기장 양옆에 둘 조작(왼손·오른손). 정사각형에 가까운 경기장(폭탄·축구)용 — 있으면 아래 조작 칸 대신 쓴다
  sides?: { left: ReactNode; right: ReactNode }
  portraitFit?: boolean // 폰 세로에서 경기장을 자르지 않고 다 보이게(격자 맵 등)
  z?: number // 층(기본 300 = 경기). 광장·퇴근길은 290 — 그 위에 경기·로비 창이 뜬다
  // 폰 가로 야구식: 경기장이 화면 전체(cover), 위 줄·조작은 그 위에 반투명으로. 경기장 world 비율을 화면에 맞춰 주면 잘림 없이 꽉 찬다
  overlay?: ReactNode
  focusX?: number // 폰 가로(overlay)에서 카메라가 따라갈 x(세계 좌표) — 폭을 못 바꾸는 경기장(퇴근길)용
}

export default function GameArena(p: GameArenaProps) {
  const { layout } = p
  if (typeof document === 'undefined') return null
  const wide = layout === 'wide', portrait = layout === 'portrait'
  const btn = 'flex items-center justify-center gap-1 rounded-xl border text-[14px]'
  if (layout === 'landscape' && p.overlay) {
    return createPortal(
      <div className="fixed inset-0 select-none overflow-hidden" style={{ zIndex: p.z ?? 300, height: '100dvh', background: AR.bg, color: AR.text }}>
        <WorldBox world={p.world} mode="cover" className="absolute inset-0" focusX={p.focusX}>{p.scene}</WorldBox>
        {/* 노치·홈바를 피해 버튼을 놓는다 */}
        <div className="pointer-events-none absolute inset-0 z-10" style={{ padding: 'max(6px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left))' }}>
          <div className="relative h-full w-full">
            <div className="pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-1.5">
              <button type="button" aria-label={p.backLabel ?? '광장으로'} onMouseDown={e => e.preventDefault()} onClick={p.onBack}
                className={`${btn} h-9 w-9 shrink-0`} style={{ background: AR.glass, borderColor: AR.glassLine }}><Icon d={BACK} size={18} /></button>
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">{p.status}</div>
              {p.actions}
              <FullscreenButton glass />
              <button type="button" aria-label="닫기" onMouseDown={e => e.preventDefault()} onClick={p.onClose}
                className={`${btn} h-9 w-9 shrink-0`} style={{ background: AR.glass, borderColor: AR.glassLine }}><Icon d={CLOSE} size={18} /></button>
            </div>
            {p.overlay}
          </div>
        </div>
      </div>,
      document.body,
    )
  }
  return createPortal(
    <div className="fixed inset-0 flex select-none flex-col overflow-hidden"
      style={{ zIndex: p.z ?? 300, height: '100dvh', background: AR.bg, color: AR.text, padding: 'env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)' }}>
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
          {p.actions}
          {wide && p.onWindow && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={p.onWindow} className={`${btn} h-9 px-3.5`} style={{ background: AR.card, borderColor: AR.line, color: AR.sub }}>창 모드로</button>
          )}
          <FullscreenButton glass={!wide} />
          <button type="button" aria-label="닫기" onMouseDown={e => e.preventDefault()} onClick={p.onClose}
            className={`${btn} ${wide ? 'h-9 w-9' : 'h-10 w-10 border-transparent'}`} style={wide ? { background: AR.card, borderColor: AR.line, color: AR.sub } : { color: AR.sub }}>
            <Icon d={CLOSE} size={wide ? 16 : 20} />
          </button>
        </div>
      </div>

      {portrait ? (
        <>
          {/* 세로: 경기장 양옆을 잘라 크게 — 카메라가 주인공을 가운데에 둔다 */}
          {p.portraitFit
            ? <WorldBox world={p.world} mode="fit" className="relative w-full shrink-0" style={{ aspectRatio: `${p.world.w / p.world.h}`, maxHeight: '54dvh' }}>{p.scene}</WorldBox>
            : <WorldBox world={p.world} mode="cover" className="relative w-full shrink-0" style={{ aspectRatio: '1.45', maxHeight: '46dvh' }}>{p.scene}</WorldBox>}
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-3 pt-2.5" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            {p.status && <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">{p.status}</div>}
            {p.deck}
          </div>
        </>
      ) : (
        layout === 'landscape' && p.sides ? (
          // 폰 가로 + 양옆 조작: 왼손 | 경기장 | 오른손
          <div className="flex min-h-0 flex-1 items-stretch" style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
            <div className="flex shrink-0 flex-col items-center justify-end gap-2 pb-5 pl-5 pr-3">{p.sides.left}</div>
            <WorldBox world={p.world} mode="fit" className="relative min-w-0 flex-1">{p.scene}</WorldBox>
            <div className="flex shrink-0 flex-col items-center justify-end gap-2 px-3 pb-2">{p.sides.right}</div>
          </div>
        ) : <>
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
  const bg = tone === 'hot' ? '#FACC15' : tone === 'warn' ? '#7F1D1D' : AR.glass
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

// 가상 조이스틱(2026-11-22) — 손잡이를 끌어 방향을 고른다. 끌고 있는 동안 그 방향이 눌린 상태, 손을 떼면 가운데로 돌아가며 모두 뗌.
//  · 가운데 일정 거리(dead) 안은 아무 방향도 아님 — 살짝 닿았을 때 움직이지 않게
//  · four = 더 많이 기운 한 축만(포격전: 이동하다 각도가 같이 바뀌거나 그 반대가 없게), eight = 대각선 허용, h = 좌우만(레이스·퇴근길)
//  · 원 밖으로 끌어도 손가락을 놓지 않으면 계속 그 방향(pointer capture)
export function Joystick({ onDir, size = 120, disabled, mode = 'four', labels }: {
  onDir: (dir: 'up' | 'down' | 'left' | 'right', down: boolean) => void
  size?: number; disabled?: boolean; mode?: 'four' | 'eight' | 'h'
  labels?: { up?: string; down?: string; left?: string; right?: string }
}) {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null)
  const held = useRef({ up: false, down: false, left: false, right: false })
  const center = useRef({ x: 0, y: 0 })
  const R = size / 2, KNOB = Math.round(size * 0.42), MAXD = R - KNOB / 2, DEAD = R * 0.28
  const apply = (next: { up: boolean; down: boolean; left: boolean; right: boolean }) => {
    for (const d of ['up', 'down', 'left', 'right'] as const) {
      if (held.current[d] !== next[d]) { held.current[d] = next[d]; onDir(d, next[d]) }
    }
  }
  const releaseAll = () => { setKnob(null); apply({ up: false, down: false, left: false, right: false }) }
  const move = (cx: number, cy: number) => {
    let dx = cx - center.current.x, dy = cy - center.current.y
    const dist = Math.hypot(dx, dy)
    if (mode === 'h') dy = 0
    const len = Math.hypot(dx, dy)
    if (len > MAXD) { dx = (dx / len) * MAXD; dy = (dy / len) * MAXD }
    setKnob({ x: dx, y: dy })
    if ((mode === 'h' ? Math.abs(cx - center.current.x) : dist) < DEAD) { apply({ up: false, down: false, left: false, right: false }); return }
    const ax = Math.abs(dx), ay = Math.abs(dy)
    if (mode === 'h') {
      apply({ left: dx < -DEAD, right: dx > DEAD, up: false, down: false })
    } else if (mode === 'four') {
      const horiz = ax >= ay
      apply({ left: horiz && dx < 0, right: horiz && dx > 0, up: !horiz && dy < 0, down: !horiz && dy > 0 })
    } else {
      const t = Math.max(ax, ay) * 0.45 // 한쪽으로 확실히 기울었으면 다른 축은 무시
      apply({ left: dx < 0 && ax > t, right: dx > 0 && ax > t, up: dy < 0 && ay > t, down: dy > 0 && ay > t })
    }
  }
  // 차례가 끝나 막히면 눌린 방향만 뗀다(손잡이는 아래에서 disabled면 가운데로 그림)
  useEffect(() => { if (disabled) apply({ up: false, down: false, left: false, right: false }) }, [disabled]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = disabled ? null : knob
  const lab = (pos: CSSProperties, text?: string) => text
    ? <span className="pointer-events-none absolute text-[10.5px] font-bold text-white/70" style={pos}>{text}</span> : null
  return (
    <div aria-label="조이스틱" role="application"
      className={`relative shrink-0 touch-none select-none rounded-full border-2 ${disabled ? 'opacity-35' : ''}`}
      style={{ width: size, height: size, background: 'radial-gradient(circle, rgba(15,23,42,0.14) 0%, rgba(15,23,42,0.32) 100%)', borderColor: 'rgba(255,255,255,0.3)', WebkitTapHighlightColor: 'transparent' }}
      onPointerDown={e => {
        if (disabled) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        const r = e.currentTarget.getBoundingClientRect()
        center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        move(e.clientX, e.clientY)
      }}
      onPointerMove={e => { if (knob && !disabled) move(e.clientX, e.clientY) }}
      onPointerUp={releaseAll} onPointerCancel={releaseAll} onLostPointerCapture={releaseAll}
      onContextMenu={e => e.preventDefault()}>
      {/* 방향 표시(가장자리 작은 삼각형 + 뜻) */}
      {mode !== 'h' && <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[11px] text-white/60">▲</span>}
      {mode !== 'h' && <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[11px] text-white/60">▼</span>}
      <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[11px] text-white/60">◀</span>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-white/60">▶</span>
      {lab({ left: '50%', top: -16, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }, labels?.up)}
      {lab({ left: '50%', bottom: -16, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }, labels?.down)}
      {lab({ right: '100%', top: '50%', transform: 'translate(-3px,-50%)', whiteSpace: 'nowrap' }, labels?.left)}
      {lab({ left: '100%', top: '50%', transform: 'translate(3px,-50%)', whiteSpace: 'nowrap' }, labels?.right)}
      <span className="pointer-events-none absolute rounded-full border-2 border-white/60 shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
        style={{ width: KNOB, height: KNOB, left: R - KNOB / 2 + (shown?.x ?? 0) - 2, top: R - KNOB / 2 + (shown?.y ?? 0) - 2, background: shown ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.18)', transition: shown ? 'none' : 'left 0.12s, top 0.12s' }} />
    </div>
  )
}

// 방향 십자(누르고 있는 동안 그 방향) — 폭탄·축구처럼 상하좌우로 걷는 게임용. size = 버튼 한 칸(px)
// 2026-11-22 휴대폰 조작은 전부 조이스틱으로 — DPad는 이제 같은 자리 크기의 8방향 조이스틱(옛 십자는 DPadButtons로 남김)
export function DPad({ onDir, size = 56, disabled }: { onDir: (dir: 'up' | 'down' | 'left' | 'right', down: boolean) => void; size?: number; disabled?: boolean }) {
  return <Joystick size={Math.round(size * 2.3)} disabled={disabled} mode="eight" onDir={onDir} />
}

export function DPadButtons({ onDir, size = 56, disabled }: { onDir: (dir: 'up' | 'down' | 'left' | 'right', down: boolean) => void; size?: number; disabled?: boolean }) {
  const b = (d: 'up' | 'down' | 'left' | 'right', label: string) => (
    <HoldButton ariaLabel={{ up: '위로', down: '아래로', left: '왼쪽', right: '오른쪽' }[d]} disabled={disabled} onHold={v => onDir(d, v)} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>{label}</HoldButton>
  )
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
      <span />{b('up', '▲')}<span />
      {b('left', '◀')}<span />{b('right', '▶')}
      <span />{b('down', '▼')}<span />
    </div>
  )
}

// ── ⛶ 크게(진짜 전체화면, 2026-11-22) ──
// 안드로이드(삼성 인터넷·크롬)·PC = 브라우저 전체화면(주소창·상태바 숨김) + 폰이면 가로 고정.
// 아이폰 사파리 = 페이지 전체화면을 막아 둬서 "홈 화면에 추가" 안내. 홈 화면 앱으로 열었으면(이미 주소창 없음) 버튼을 숨긴다.
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> }
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
const fsDoc = () => document as FsDoc
export const isFullscreen = () => typeof document !== 'undefined' && !!(fsDoc().fullscreenElement ?? fsDoc().webkitFullscreenElement)
const canFullscreen = () => typeof document !== 'undefined' && !!(fsDoc().fullscreenEnabled || fsDoc().webkitFullscreenEnabled)
const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export async function enterFullscreen() {
  const el = document.documentElement as FsEl
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
    else await el.webkitRequestFullscreen?.()
  } catch { return }
  // 폰이면 가로로 고정(안 되는 기기는 조용히 넘어감)
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
  if (isTouch()) await o?.lock?.('landscape').catch(() => {})
}
export async function exitFullscreen() {
  if (!isFullscreen()) return
  try { (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.() } catch { /* 고정 안 했으면 무시 */ }
  try {
    if (document.exitFullscreen) await document.exitFullscreen()
    else await fsDoc().webkitExitFullscreen?.()
  } catch { /* 이미 풀림 */ }
}

function FullscreenButton({ glass }: { glass?: boolean }) {
  const [on, setOn] = useState(isFullscreen)
  const [tip, setTip] = useState(false)
  const [hidden] = useState(isStandalone)
  useEffect(() => {
    const ch = () => setOn(isFullscreen())
    document.addEventListener('fullscreenchange', ch)
    document.addEventListener('webkitfullscreenchange', ch)
    return () => { document.removeEventListener('fullscreenchange', ch); document.removeEventListener('webkitfullscreenchange', ch) }
  }, [])
  if (hidden) return null
  const click = () => {
    if (!canFullscreen()) { setTip(t => !t); return }
    if (on) void exitFullscreen(); else void enterFullscreen()
  }
  return (
    <>
      <button type="button" aria-label={on ? '전체화면 끄기' : '전체화면(크게)'} title={on ? '전체화면 끄기' : '주소창 없이 크게'} onMouseDown={e => e.preventDefault()} onClick={click}
        className="flex h-9 shrink-0 items-center justify-center gap-1 rounded-xl border px-2.5 text-[13px] font-semibold"
        style={glass ? { background: AR.glass, borderColor: AR.glassLine, color: AR.text } : { background: AR.card, borderColor: AR.line, color: AR.sub }}>
        {on ? '⤡ 작게' : '⛶ 크게'}
      </button>
      {tip && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-x-3 top-16 z-[400] mx-auto max-w-[420px] rounded-2xl border p-4 text-[13.5px] leading-relaxed shadow-2xl" style={{ background: AR.card, borderColor: AR.line, color: AR.text }}>
          <p className="mb-1.5 text-[15px] font-extrabold">📱 아이폰은 홈 화면 앱으로 크게</p>
          <p style={{ color: AR.sub }}>사파리는 웹페이지가 주소창을 숨기지 못하게 막아 두었어요. 아래 <b>공유(□↑)</b> 버튼 → <b>홈 화면에 추가</b> → 홈 화면의 <b>인사관리팀</b> 아이콘으로 열면 주소창 없이 앱처럼 크게 보여요.</p>
          <button type="button" onClick={() => setTip(false)} className="mt-3 h-10 w-full rounded-xl text-[14px] font-bold" style={{ background: AR.blue, color: '#fff' }}>알겠어요</button>
        </div>,
        document.body,
      )}
    </>
  )
}
