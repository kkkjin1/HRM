'use client'

// 풀화면 경기 화면(개인전·대결) 틀과 조작 부품 — 어두운 남색 바탕의 게임 화면.
// 배치 3가지(목업 2026-10-25 합의):
// - wide(PC): 위 줄 · 경기장(화면 폭에 맞춤, 남는 곳은 어두운 여백) · 아래 조작 카드
// - portrait(폰 세로): 위 줄 · 경기장(양옆을 잘라 크게) · 그 아래 큰 버튼들(멈춤·스윙은 맨 아래 엄지 자리)
// - landscape(폰 가로): 경기장이 화면 전체, 버튼은 그 위에 반투명으로(왼쪽 엄지 = 구종·노림, 오른쪽 엄지 = 코스·동그란 버튼)
// 화면 전체를 zoom으로 키우지 않는다 — 경기장만 크게, 버튼·글씨는 원래 크기(예전 2.6배 확대가 웹페이지처럼 보였다).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { VIEW_H, VIEW_TOP, VIEW_W } from '@/components/baseball/scene'
import { CATEGORY_LABEL, HEIGHT_LABEL, PITCH_TYPES, type HeightBand, type PitchCategory, type PitchType, type ReadGuess } from '@/lib/baseball'
import { HEIGHTS, SIDES, SPEEDS, sideLabel, type HeightChoice, type SideChoice, type SpeedChoice } from '@/lib/baseballDuel'

export type ArenaLayout = 'wide' | 'portrait' | 'landscape'
export type ArenaChrome = {
  layout: ArenaLayout
  onBack: () => void
  onClose: () => void
  onWindow?: () => void // PC: 예전 떠 있는 창으로
}

const SCENE_ASPECT = VIEW_W / (VIEW_H - VIEW_TOP)

// 색 — 남색 바탕 위 흰 글씨. 회색 글씨도 바탕 대비 4.5:1 이상
export const AR = {
  bg: '#0E1726', card: '#162236', tile: '#1C2A41', line: '#2A3A54', text: '#F4F6F8', sub: '#C9D3E0', muted: '#9AA8BA',
  blue: '#4C8DFF', red: '#E5484D', glass: 'rgba(14,23,38,0.78)', glassLine: 'rgba(255,255,255,0.14)',
}

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  )
}
const BACK = 'M15 18l-6-6 6-6'
const CLOSE = 'M6 6l12 12M18 6L6 18'

// 경기장 상자: fit = 상자 안에 다 보이게(남는 곳 여백), cover = 상자를 꽉 채우게(넘치는 양옆·위아래는 잘림, 세로는 위쪽 40% 기준)
function SceneBox({ mode, children, className, style }: { mode: 'fit' | 'cover'; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const w = box.w && box.h ? (mode === 'fit' ? Math.min(box.w, box.h * SCENE_ASPECT) : Math.max(box.w, box.h * SCENE_ASPECT)) : 0
  const h = w / SCENE_ASPECT
  return (
    // 위치(position)는 부르는 쪽이 정한다 — relative와 absolute를 같이 주면 relative가 이겨 높이가 0이 됐다
    // isolate: 경기장 안의 3D·HUD 층(z-index)이 이 상자 밖 버튼·카드 위로 올라오지 않게
    <div ref={ref} className={`overflow-hidden isolate ${className ?? 'relative'}`} style={style}>
      {w > 0 && (
        <div className="absolute" style={{ width: w, left: (box.w - w) / 2, top: mode === 'fit' ? (box.h - h) / 2 : (box.h - h) * 0.4 }}>{children}</div>
      )}
    </div>
  )
}

const glassBtn = 'flex items-center justify-center gap-1 rounded-xl border text-[14px]'

// 틀: 위 줄 + 경기장 + 조작. landscape는 조작(overlay)을 경기장 위에 띄운다.
// chip = 경기장 왼쪽 아래(가로는 위쪽)에 띄우는 볼카운트·주자 요약, topRight = 위 줄 오른쪽 추가 버튼(기권 등)
export function Arena({ chrome, title, sub, scene, chip, deck, overlay, topRight }: {
  chrome: ArenaChrome; title: string; sub?: string; scene: ReactNode; chip?: ReactNode
  deck?: ReactNode; overlay?: ReactNode; topRight?: ReactNode
}) {
  const { layout } = chrome
  if (layout === 'landscape') {
    return (
      <div className="relative w-full h-full overflow-hidden select-none" style={{ background: AR.bg, color: AR.text }}>
        <SceneBox mode="cover" className="absolute inset-0">{scene}</SceneBox>
        {/* 아이폰 노치·홈바 자리를 피해 버튼을 놓는다 */}
        <div className="absolute inset-0 z-10 pointer-events-none" style={{ padding: 'max(8px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))' }}>
          <div className="relative w-full h-full">
            <div className="absolute left-0 top-0 flex items-center gap-2 pointer-events-auto">
              <button type="button" onClick={chrome.onBack} className={`${glassBtn} h-10 pl-2 pr-3.5`} style={{ background: AR.glass, borderColor: AR.glassLine }}>
                <Icon d={BACK} /> 목록
              </button>
              {chip}
            </div>
            <div className="absolute right-0 top-0 flex items-center gap-2 pointer-events-auto">
              {topRight}
              <button type="button" aria-label="닫기" onClick={chrome.onClose} className={`${glassBtn} w-10 h-10`} style={{ background: AR.glass, borderColor: AR.glassLine }}>
                <Icon d={CLOSE} />
              </button>
            </div>
            {overlay}
          </div>
        </div>
      </div>
    )
  }

  const wide = layout === 'wide'
  return (
    <div className="flex flex-col w-full h-full overflow-hidden select-none" style={{ background: AR.bg, color: AR.text, paddingTop: 'env(safe-area-inset-top)' }}>
      <div className={`flex-shrink-0 flex items-center ${wide ? 'h-14 px-5 gap-3.5 border-b' : 'h-12 px-2 gap-1'}`} style={{ borderColor: '#1E2B40' }}>
        {wide ? (
          <button type="button" onClick={chrome.onBack} className={`${glassBtn} h-9 pl-2.5 pr-3.5`} style={{ background: AR.card, borderColor: AR.line }}>
            <Icon d={BACK} size={16} /> 목록
          </button>
        ) : (
          <button type="button" aria-label="목록으로" onClick={chrome.onBack} className="w-11 h-11 flex items-center justify-center rounded-xl"><Icon d={BACK} size={22} /></button>
        )}
        <div className={`min-w-0 flex items-baseline gap-2.5 ${wide ? '' : 'flex-1 justify-center'}`}>
          <span className={`font-extrabold truncate ${wide ? 'text-[17px]' : 'text-[15px]'}`}>{title}</span>
          {sub && <span className="text-[14px] truncate" style={{ color: AR.muted }}>{sub}</span>}
        </div>
        {/* PC는 볼카운트·주자 알약을 위 줄에 — 경기장 왼쪽 아래엔 타자 카드가 뜬다 */}
        {wide && chip && <div className="ml-2 flex-shrink-0">{chip}</div>}
        <div className={`flex items-center gap-2 ${wide ? 'ml-auto' : ''}`}>
          {topRight}
          {wide && chrome.onWindow && (
            <button type="button" onClick={chrome.onWindow} className={`${glassBtn} h-9 px-3.5`} style={{ background: AR.card, borderColor: AR.line, color: AR.sub }}>창 모드로</button>
          )}
          <button type="button" aria-label="닫기" onClick={chrome.onClose} className={`${glassBtn} ${wide ? 'w-9 h-9' : 'w-11 h-11 border-transparent'}`} style={wide ? { background: AR.card, borderColor: AR.line, color: AR.sub } : { color: AR.sub }}>
            <Icon d={CLOSE} size={wide ? 16 : 20} />
          </button>
        </div>
      </div>
      {wide ? (
        <div className="relative flex-1 min-h-0">
          <SceneBox mode="fit" className="absolute inset-0">{scene}</SceneBox>
        </div>
      ) : (
        <div className="relative flex-shrink-0">
          {/* 세로: 경기장 양옆을 잘라 크게(가로:세로 ≈ 1.7) — 투수·포수·타자·존이 들어오는 폭 */}
          <SceneBox mode="cover" style={{ aspectRatio: '1.7', maxHeight: '42dvh', width: '100%' }}>{scene}</SceneBox>
        </div>
      )}
      <div className={wide ? 'flex-shrink-0 px-5 pt-4 pb-5' : 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-3.5 pt-3 flex flex-col'}
        style={wide ? undefined : { paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        {/* 세로: 볼카운트 알약은 경기장 아래 첫 줄 — 경기장 아래쪽엔 결과 자막이 뜬다 */}
        {!wide && chip && <div className="mb-2.5">{chip}</div>}
        {deck}
      </div>
    </div>
  )
}

// 볼카운트·아웃·주자 요약 알약
// compact(폰 가로) = 주자만 — 볼·스트라이크·아웃은 경기장 전광판에 있고, 가로에선 자리가 좁아 전광판과 겹친다
export function SituationChip({ balls, strikes, outs, bases, compact }: { balls: number; strikes: number; outs: number; bases: [boolean, boolean, boolean]; compact?: boolean }) {
  const on = ['1루', '2루', '3루'].filter((_, i) => bases[i])
  const runners = on.length ? `주자 ${on.join('·')}` : '주자 없음'
  return (
    <span className="inline-flex items-center h-8 px-3 rounded-full text-[13px] font-medium whitespace-nowrap" style={{ background: AR.glass, color: AR.text }}>
      {compact ? runners : `${balls}B ${strikes}S · ${outs}아웃 · ${runners}`}
    </span>
  )
}

// 카드(wide 조작 칸)
export function DeckCard({ label, children, className }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-4 flex flex-col gap-3 min-w-0 ${className ?? ''}`} style={{ background: AR.card }}>
      {label && <span className="text-[13px]" style={{ color: AR.muted }}>{label}</span>}
      {children}
    </div>
  )
}

// 선택 버튼(구종·구속·노림). glass = 가로 모드 경기장 위
export function ChoiceBtn({ on, onClick, disabled, children, className, glass, title }: {
  on: boolean; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string; glass?: boolean; title?: string
}) {
  const style = on
    ? { background: AR.blue, borderColor: AR.blue, color: '#FFFFFF' }
    : glass ? { background: AR.glass, borderColor: AR.glassLine, color: AR.text } : { background: AR.tile, borderColor: AR.line, color: AR.text }
  return (
    <button type="button" title={title} disabled={disabled}
      // 눌러도 포커스가 남지 않게 — 남으면 Space(스윙·멈춤)가 이 버튼을 다시 누른다
      onMouseDown={e => e.preventDefault()} onClick={onClick}
      className={`rounded-xl border transition-colors disabled:opacity-40 ${on ? 'font-bold' : ''} ${className ?? ''}`} style={style}>
      {children}
    </button>
  )
}

// 구종 타일 — 이름 + 구속 범위
export function PitchTiles({ types, value, onPick, cols = 2, size = 'lg', glass, disabled }: {
  types: PitchType[]; value: PitchType; onPick: (t: PitchType) => void; cols?: 1 | 2; size?: 'lg' | 'md' | 'sm'; glass?: boolean; disabled?: boolean
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {types.map(t => {
        const def = PITCH_TYPES[t]
        const label = def.label.replace(/\(.*\)/, '')
        return (
          <ChoiceBtn key={t} on={t === value} onClick={() => onPick(t)} glass={glass} disabled={disabled}
            className={size === 'lg' ? 'text-left px-4 py-2.5 flex flex-col gap-0.5' : size === 'md' ? 'h-[52px] text-[16px] font-bold' : 'h-[42px] text-[14px] font-bold'}>
            {size === 'lg' ? (
              <>
                <span className="text-[18px] font-bold">{label}</span>
                <span className="text-[13px]" style={{ color: t === value ? '#E6EEFF' : AR.muted }}>{def.min}–{def.max}km/h</span>
              </>
            ) : label}
          </ChoiceBtn>
        )
      })}
    </div>
  )
}

const HEIGHT_KEYS = Object.keys(HEIGHTS) as HeightChoice[]
const SIDE_KEYS = Object.keys(SIDES) as SideChoice[]
// 5×5 코스판(투수 시점): 가운데 3×3 = 스트라이크존
export function AimPad({ height, side, onPick, batsLeft, cell = 28, glass, disabled }: {
  height: HeightChoice; side: SideChoice; onPick: (h: HeightChoice, s: SideChoice) => void; batsLeft: boolean; cell?: number; glass?: boolean; disabled?: boolean
}) {
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(5, ${cell}px)` }}>
      {HEIGHT_KEYS.map(hk => SIDE_KEYS.map(sk => {
        const zone = !SIDES[sk].ball && hk !== 'highBall' && hk !== 'lowBall'
        const on = hk === height && sk === side
        return (
          <button key={`${hk}-${sk}`} type="button" disabled={disabled} aria-label={`${HEIGHTS[hk].label} · ${sideLabel(sk, batsLeft)}`} aria-pressed={on}
            onMouseDown={e => e.preventDefault()} onClick={() => onPick(hk, sk)}
            className="rounded-[5px] border disabled:opacity-40"
            style={{
              height: Math.round(cell * 0.9),
              background: on ? AR.red : zone ? '#2E4F86' : glass ? 'rgba(255,255,255,0.08)' : AR.tile,
              borderColor: on ? AR.red : zone ? '#4C78C0' : glass ? 'rgba(255,255,255,0.18)' : AR.line,
            }} />
        )
      }))}
    </div>
  )
}

const SPEED_KEYS = Object.keys(SPEEDS) as SpeedChoice[]
export function SpeedBtns({ type, value, onPick, vertical, glass, compact, disabled }: {
  type: PitchType; value: SpeedChoice; onPick: (k: SpeedChoice) => void; vertical?: boolean; glass?: boolean; compact?: boolean; disabled?: boolean
}) {
  const def = PITCH_TYPES[type]
  return (
    <div className={vertical ? 'flex flex-col gap-1.5 flex-1' : 'grid grid-cols-3 gap-2'}>
      {SPEED_KEYS.map(k => (
        <ChoiceBtn key={k} on={k === value} onClick={() => onPick(k)} glass={glass} disabled={disabled}
          className={`${vertical ? 'flex-1 min-h-[30px]' : 'h-11'} ${compact ? 'text-[12px] px-2' : 'text-[15px]'}`}>
          {SPEEDS[k].label}{k === value && !compact ? ` ${Math.round(def.min + (def.max - def.min) * SPEEDS[k].ratio)}` : ''}
        </ChoiceBtn>
      ))}
    </div>
  )
}

// 큰 주 버튼(던지기·멈춤·스윙). press = 누르는 순간(pointerdown)에 실행 — 스윙·멈춤은 손을 뗄 때면 늦다
export function ActionBtn({ label, sub, onPress, tone = 'red', shape = 'bar', size = 58, disabled, press }: {
  label: ReactNode; sub?: ReactNode; onPress: () => void; tone?: 'red' | 'blue'; shape?: 'bar' | 'round'; size?: number; disabled?: boolean; press?: boolean
}) {
  const bg = tone === 'red' ? AR.red : AR.blue
  const handlers = press
    ? { onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); if (!disabled) onPress() } }
    : { onClick: onPress }
  return (
    <button type="button" disabled={disabled} {...handlers}
      className={`touch-none flex flex-col items-center justify-center gap-0.5 text-white font-extrabold disabled:opacity-40 active:brightness-90 ${shape === 'round' ? 'rounded-full border-[3px] border-white/85 shadow-[0_6px_18px_rgba(0,0,0,0.35)]' : 'w-full rounded-2xl'}`}
      style={shape === 'round' ? { width: size, height: size, background: bg } : { height: size, background: bg }}>
      <span style={{ fontSize: shape === 'round' ? Math.round(size / 5) : size >= 100 ? 30 : 20 }}>{label}</span>
      {sub && <span className="text-[13px] font-medium" style={{ color: '#FFE4E4' }}>{sub}</span>}
    </button>
  )
}

const CATS: (PitchCategory | null)[] = ['FAST', 'BREAK', 'DROP', null]
const BANDS: (HeightBand | null)[] = ['HIGH', 'MID', 'LOW', null]
// 타자 노림(어두운 톤) — 구종 계열·높이. 공이 출발하면 잠긴다
export function ReadChips({ value, onChange, locked, glass, compact }: {
  value: ReadGuess; onChange: (patch: Partial<ReadGuess>) => void; locked: boolean; glass?: boolean; compact?: boolean
}) {
  const cls = compact ? 'h-9 px-2.5 text-[12.5px]' : 'h-11 px-3 text-[14px]'
  return (
    <div className={`flex flex-col gap-2 transition-opacity ${locked ? 'opacity-50' : ''}`} data-read-locked={locked || undefined}>
      <div className="flex flex-wrap gap-1.5">
        {CATS.map(c => (
          <ChoiceBtn key={c ?? 'none'} on={value.category === c} onClick={() => onChange({ category: c })} disabled={locked} glass={glass} className={cls}>
            {c ? CATEGORY_LABEL[c] : compact ? '안 노림' : '구종 안 노림'}
          </ChoiceBtn>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {BANDS.map(b => (
          <ChoiceBtn key={b ?? 'none'} on={value.height === b} onClick={() => onChange({ height: b })} disabled={locked} glass={glass} className={cls}>
            {b ? HEIGHT_LABEL[b] : compact ? '안 노림' : '높이 안 노림'}
          </ChoiceBtn>
        ))}
      </div>
    </div>
  )
}

// 가로 모드 경기장 위 작은 안내(반투명)
export function GlassNote({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center px-2.5 h-7 rounded-lg text-[12px] whitespace-nowrap" style={{ background: AR.glass, color: AR.text }}>{children}</span>
}
