'use client'

// 운동장 🏟 광장 — 운동장을 열면 먼저 나오는 공용 공간. 접속한 팀원이 같이 돌아다니고, 건물 앞에서 Space로 들어간다.
// 2026-11-19 ⚾ 야구장·⚽ 축구장까지 8채 → 한 줄이 너무 길어 두 줄(4+4)로(사용자 선택):
//   뒷줄 🏢 퇴근길 · 🏎 레이싱 · 🚗 차고 · ⚔ 대결   /   앞줄 💥 포격전 · 🧨 폭탄 놀이터 · ⚾ 야구장 · ⚽ 축구장
//   길이 두 개(뒷줄 앞 길 · 앞줄 앞 길)이고, 앞줄 건물 사이 골목으로 위아래 길을 오간다. 건물 앞(같은 길)에서 Space.
// 이전: 2026-11-03 "단순하되 직관적으로" → 2026-11-05 "세련되게, 어디로 가는지만 명확하면"(건물 정면·간판·입구 불).
// 다른 데 가 있는 사람은 캐릭터 대신 그 건물 위에 이름표로 보인다("박주현 · 하는 중").
// 내 위치는 여기서 계산하고 onMove로 부모에 알린다(부모가 'plaza' 방송, z = 발 위치 - STREET1_TOP). active일 때만 키를 잡는다.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CharacterSprite } from '@/components/baseball/three/Sprite3D'
import type { Equip } from '@/lib/baseballGear'
import { W } from '@/lib/playground'

export type PlazaWhere = 'plaza' | 'commute' | 'race' | 'duel' | 'garage' | 'fort' | 'bomb' | 'soccer' | 'baseball'
export type PlazaSpotKey = 'commute' | 'race' | 'garage' | 'duel' | 'fort' | 'bomb' | 'soccer' | 'baseball'
export type PlazaPerson = { id: string; name: string; equip: Equip; palette: { bg: string; fg: string }; x: number; z: number; f: 1 | -1; where: PlazaWhere; message: string | null; done: boolean }

export const PLAZA_H = 420 // 광장 높이(다른 장면은 H=320) — 두 줄이라 더 높다
const BW = 196 // 건물 폭
const BH = 136 // 건물 높이
const ROW_FLOOR = { 1: 168, 2: 360 } as const // 건물이 서 있는 선(화면 y)
const STREET = { 1: [174, 214], 2: [366, 408] } as const // 걷는 길(발 위치 y 범위)
const COLS = [135, 405, 675, 945]
const SPEED = 190
const DEPTH_SPEED = 110
const REACH = BW / 2 - 6
export const PLAZA_SPOTS: { key: PlazaSpotKey; row: 1 | 2; x: number; emoji: string; name: string; color: string; act: string }[] = [
  { key: 'commute', row: 1, x: COLS[0], emoji: '🏢', name: '퇴근길', color: '#334155', act: '퇴근길 들어가기' },
  { key: 'race', row: 1, x: COLS[1], emoji: '🏎', name: '레이싱', color: '#DC2626', act: '레이싱' },
  { key: 'garage', row: 1, x: COLS[2], emoji: '🚗', name: '내 차고', color: '#D97706', act: '내 차 꾸미기' },
  { key: 'duel', row: 1, x: COLS[3], emoji: '⚔', name: '대결', color: '#2563EB', act: '1:1 대결' },
  { key: 'fort', row: 2, x: COLS[0], emoji: '💥', name: '포격전', color: '#EA580C', act: '포격전 하기' },
  { key: 'bomb', row: 2, x: COLS[1], emoji: '🧨', name: '폭탄 놀이터', color: '#F2734F', act: '폭탄 놀이터' },
  { key: 'baseball', row: 2, x: COLS[2], emoji: '⚾', name: '야구장', color: '#B91C1C', act: '비거리 야구' },
  { key: 'soccer', row: 2, x: COLS[3], emoji: '⚽', name: '축구장', color: '#16A34A', act: 'PK · 미니 축구' },
]
const WHERE_SPOT: Record<Exclude<PlazaWhere, 'plaza'>, PlazaSpotKey> = { commute: 'commute', race: 'race', garage: 'garage', duel: 'duel', fort: 'fort', bomb: 'bomb', soccer: 'soccer', baseball: 'baseball' }
const STREET1_TOP = STREET[1][0]
const footY = (z: number) => STREET1_TOP + z

// 골목: 앞줄 건물 사이(와 양 끝) — 여기서만 위아래 길을 오갈 수 있다
const inAlley = (x: number) => COLS.every(c => Math.abs(x - c) > BW / 2 + 10)
const inStreet = (y: number, r: 1 | 2) => y >= STREET[r][0] && y <= STREET[r][1]
function walkable(x: number, y: number) {
  if (x < 24 || x > W - 24) return false
  return inStreet(y, 1) || inStreet(y, 2) || (inAlley(x) && y >= STREET[1][0] && y <= STREET[2][1])
}
function nearSpot(x: number, y: number) {
  const row: 1 | 2 | null = inStreet(y, 1) ? 1 : inStreet(y, 2) ? 2 : null
  if (!row) return null
  return PLAZA_SPOTS.find(s => s.row === row && Math.abs(s.x - x) < REACH) ?? null
}

export function plazaSpawn(i: number) {
  return { x: 540 + ((i * 53) % 160) - 80, z: 8 + ((i * 23) % 30) } // 뒷줄 앞 길, 가운데 골목 근처
}

export default function Plaza(props: {
  active: boolean
  me: PlazaPerson | null
  others: PlazaPerson[]
  subs: Partial<Record<PlazaSpotKey, string>> // 간판 아래 한 줄(오늘의 퇴근길 이름·모집 중 등)
  hot: PlazaSpotKey | null // 강조할 건물(모집 중 등)
  news: string | null
  onMove: (x: number, z: number, f: 1 | -1) => void
  onEnter: (spot: PlazaSpotKey) => void
  // 고르기 모드(휴대폰, 2026-11-22): 캐릭터를 걷지 않고 건물을 탭하면 바로 들어가고, ◀▶▲▼로 고른 건물(selected)을 강조
  pick?: { selected: PlazaSpotKey }
}) {
  const [pos, setPos] = useState(() => {
    const x = props.me?.x ?? 540
    const y = footY(props.me?.z ?? 20)
    return walkable(x, y) ? { x, y, f: (props.me?.f ?? 1) as 1 | -1, moving: false } : { x: 540, y: footY(20), f: 1 as 1 | -1, moving: false }
  })
  const posRef = useRef(pos)
  const keys = useRef(new Set<string>())
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props })
  useEffect(() => { if (!props.active) keys.current.clear() }, [props.active])

  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
    }
    const MOVE = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
    function down(e: KeyboardEvent) {
      if (!propsRef.current.active || typing(e.target)) return
      if (MOVE.includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); keys.current.add(e.key); return }
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault(); e.stopImmediatePropagation()
        if (e.repeat) return
        const s = nearSpot(posRef.current.x, posRef.current.y)
        if (s) { keys.current.clear(); propsRef.current.onEnter(s.key) }
      }
    }
    function up(e: KeyboardEvent) {
      if (!MOVE.includes(e.key)) return
      keys.current.delete(e.key)
      if (propsRef.current.active) e.stopImmediatePropagation()
    }
    const blur = () => keys.current.clear()
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur) }
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastSent = 0
    const loop = (t: number) => {
      const dt = Math.min(50, t - last) / 1000
      last = t
      const k = keys.current
      const dx = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0)
      const dy = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0)
      const p = posRef.current
      if (dx || dy || p.moving) {
        const nx = p.x + dx * SPEED * dt
        const ny = p.y + dy * DEPTH_SPEED * dt
        // 막히면 한 축씩(길 가장자리를 따라 미끄러지게)
        let x = p.x, y = p.y
        if (walkable(nx, ny)) { x = nx; y = ny }
        else if (walkable(nx, p.y)) x = nx
        else if (walkable(p.x, ny)) y = ny
        const next = { x, y, f: (dx ? (dx > 0 ? 1 : -1) : p.f) as 1 | -1, moving: !!(dx || dy) }
        posRef.current = next
        setPos(next)
        const now = Date.now()
        // 초당 5번(통신 한도 — 다른 사람 화면은 transition으로 이어 그림)
        if (now - lastSent > 200 || !next.moving) { lastSent = now; propsRef.current.onMove(Math.round(next.x), Math.round(next.y - STREET1_TOP), next.f) }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const near = props.pick ? PLAZA_SPOTS.find(sp => sp.key === props.pick!.selected) ?? null : nearSpot(pos.x, pos.y)
  const me = props.me
  const here = [
    ...props.others.filter(o => o.where === 'plaza').map(o => ({ ...o, y: footY(o.z), isMe: false })),
    ...(me ? [{ ...me, x: pos.x, y: pos.y, f: pos.f, isMe: true }] : []),
  ]
  const awayAt = (spot: PlazaSpotKey) => props.others.filter(o => o.where !== 'plaza' && WHERE_SPOT[o.where as Exclude<PlazaWhere, 'plaza'>] === spot)

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ width: W, height: PLAZA_H, background: 'linear-gradient(180deg, #BFDBFE 0%, #E0ECFF 30%, #F5F8FF 40%)' }}>
      {[[60, 6, 0.8], [520, 2, 0.7], [900, 8, 0.9]].map(([x, y, k], i) => (
        <span key={i} className="pointer-events-none absolute rounded-full bg-white/80" style={{ left: x, top: y, width: 60 * k, height: 14 * k, boxShadow: `${20 * k}px -6px 0 2px rgba(255,255,255,0.8)` }} />
      ))}
      {/* 바닥(돌길) — 뒷줄 앞부터 끝까지 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: ROW_FLOOR[1], background: 'linear-gradient(#E7E1D5, #D9D1C2)' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: ROW_FLOOR[1],
        backgroundImage: 'linear-gradient(90deg, rgba(120,104,82,0.14) 1px, transparent 1px), linear-gradient(rgba(120,104,82,0.12) 1px, transparent 1px)', backgroundSize: '54px 24px' }} />
      <div className="pointer-events-none absolute inset-x-0" style={{ top: ROW_FLOOR[1], height: 6, background: 'linear-gradient(rgba(15,23,42,0.12), transparent)' }} />
      {/* 골목(앞줄 건물 사이 — 위아래 길을 오가는 곳): 흰 점선 */}
      {[22, 270, 540, 810, 1058].map(cx => (
        <div key={cx} className="pointer-events-none absolute" style={{ left: cx - 3, top: STREET[1][1] + 8, width: 6, height: STREET[2][0] - STREET[1][1] - 16, background: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.9) 0 10px, transparent 10px 20px)', borderRadius: 3 }} />
      ))}

      {PLAZA_SPOTS.map(s => <Facade key={s.key} spot={s} near={near?.key === s.key} hot={props.hot === s.key} sub={props.subs[s.key] ?? ''} away={awayAt(s.key)}
        onTap={props.pick ? () => props.onEnter(s.key) : undefined} />)}

      {props.news && (
        <div className="pointer-events-none absolute bottom-2.5 left-3 z-40 max-w-[330px]">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#0F172A]/85 py-1 pl-1.5 pr-3 text-[11px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.7)]">
            <span className="shrink-0 rounded-full bg-[#FACC15] px-1.5 text-[10px] font-black text-[#0F172A]">소식</span><span className="truncate">{props.news}</span>
          </span>
        </div>
      )}

      {/* 광장에 있는 사람들 — 뒤(위)부터 */}
      {[...here].sort((a, b) => a.y - b.y).map(p => (
        <div key={p.id} className={`absolute ${p.isMe ? 'z-30' : 'z-20 transition-[left,top] duration-200 ease-linear'}`}
          style={{ left: p.x, top: p.y, transform: 'translate(-50%, -100%)' }}>
          <div className="flex flex-col items-center">
            {p.message && <span className="mb-0.5 max-w-[150px] truncate rounded-lg bg-white px-1.5 py-0.5 text-[10px] text-[#1F2933] shadow">{p.message}</span>}
            <span className={`mb-[1px] whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10px] font-semibold shadow ${p.isMe ? 'bg-[#E0A526] text-white' : 'bg-white text-[#1F2933]'}`}>
              {p.done ? '☀️ ' : ''}{p.name}
            </span>
            <div style={{ transform: `scaleX(${p.f})`, animation: p.isMe && pos.moving ? 'pg-bob 300ms ease-in-out infinite' : undefined }}>
              <CharacterSprite equip={p.equip} name={p.name} size={40} colorBg={p.palette.bg} colorFg={p.palette.fg} />
            </div>
          </div>
        </div>
      ))}

      <div className="pointer-events-none absolute inset-x-0 bottom-2 z-40 text-center">
        {near && me ? (
          <span className="inline-flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3.5 text-[12px] font-bold text-white shadow-[0_8px_18px_-8px_rgba(15,23,42,0.6)]" style={{ background: near.color }}>
            <kbd className="rounded-md bg-white/25 px-1.5 py-[1px] text-[10.5px] font-extrabold">Space</kbd>{near.act}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] text-[#475569] shadow-sm ring-1 ring-black/5">
            {['←', '→', '↑', '↓'].map(k => <kbd key={k} className="rounded-md border border-b-2 border-[#CBD5E1] bg-white px-1 text-[10px] font-bold leading-[14px] text-[#334155]">{k}</kbd>)}
            <span className="ml-0.5">걷기 · 점선 골목으로 앞뒤 길 · 건물 앞에서</span>
            <kbd className="rounded-md border border-b-2 border-[#CBD5E1] bg-white px-1.5 text-[10px] font-bold leading-[14px] text-[#334155]">Space</kbd>
          </span>
        )}
      </div>
    </div>
  )
}

// 건물 정면 — 종류마다 생김새가 달라 어디로 가는지 한눈에: 🏢 사무실(퇴근길) · 🏁 레이싱 게이트 · 🔧 차고 셔터 · ⚔ 경기장
// 가까이 가면 입구에 불이 켜지고 바닥에 빛이 번지며 'Space 들어가기'가 뜬다. 모집 중(hot)이면 간판 테두리가 깜빡인다.
function Facade({ spot: s, near, hot, sub, away, onTap }: { spot: (typeof PLAZA_SPOTS)[number]; near: boolean; hot: boolean; sub: string; away: PlazaPerson[]; onTap?: () => void }) {
  const top = ROW_FLOOR[s.row] - BH
  const body: Record<PlazaSpotKey, string> = {
    commute: 'linear-gradient(180deg, #E2E8F0, #CBD5E1)',
    race: 'linear-gradient(180deg, #FEE2E2, #FECACA)',
    garage: 'linear-gradient(180deg, #FEF3C7, #FDE68A)',
    duel: 'linear-gradient(180deg, #DBEAFE, #BFDBFE)',
    fort: 'linear-gradient(180deg, #FFEDD5, #FED7AA)',
    bomb: 'linear-gradient(180deg, #FFF1E6, #FFD9C2)',
    soccer: 'linear-gradient(180deg, #DCFCE7, #BBF7D0)',
    baseball: 'linear-gradient(180deg, #FFFFFF, #E2E8F0)',
  }
  const roof: Record<PlazaSpotKey, CSSProperties> = {
    commute: { background: '#334155' },
    race: { backgroundImage: 'repeating-conic-gradient(#111827 0 25%, #F9FAFB 0 50%)', backgroundSize: '14px 14px' }, // 체크무늬
    garage: { background: '#B45309' },
    duel: { background: '#1D4ED8' },
    fort: { backgroundImage: 'repeating-linear-gradient(90deg, #9A3412 0 16px, #C2410C 16px 18px)' }, // 성벽 띠
    bomb: { backgroundImage: 'repeating-linear-gradient(90deg, #F2734F 0 14px, #FFD34D 14px 28px)' }, // 놀이공원 줄무늬 차양
    soccer: { backgroundImage: 'repeating-linear-gradient(90deg, #15803D 0 14px, #F8FAFC 14px 28px)' }, // 경기장 지붕 줄무늬
    baseball: { backgroundImage: 'repeating-linear-gradient(90deg, #B91C1C 0 6px, #FFFFFF 6px 18px)' }, // 야구공 실밥
  }
  return (
    <div className={`absolute ${onTap ? 'cursor-pointer' : ''}`} style={{ left: s.x - BW / 2, top, width: BW, height: BH }}
      onClick={onTap} role={onTap ? 'button' : undefined} aria-label={onTap ? `${s.name} 들어가기` : undefined}>
      {/* 지붕 띠 */}
      <div className="absolute inset-x-[-6px] top-0 h-[14px] rounded-t-lg shadow-sm" style={roof[s.key]} />
      {/* 몸체 */}
      <div className="absolute inset-x-0 bottom-0 top-[14px] overflow-hidden rounded-b-md" style={{ background: body[s.key], boxShadow: 'inset 0 -10px 18px -12px rgba(15,23,42,0.35)' }}>
        {s.key === 'commute' && [0, 1].map(side => (
          <div key={side} className="absolute top-[54px] grid grid-cols-2 gap-1.5" style={{ [side ? 'right' : 'left']: 12 }}>
            {Array.from({ length: 6 }, (_, i) => <span key={i} className="h-[14px] w-[16px] rounded-[3px] bg-[#93C5FD]" style={{ opacity: 0.55 + ((i * 37) % 40) / 100 }} />)}
          </div>
        ))}
        {s.key === 'race' && <>
          <span className="absolute left-3 top-[58px] text-[26px]">🏁</span>
          <span className="absolute right-3 top-[58px] text-[26px]" style={{ transform: 'scaleX(-1)' }}>🏁</span>
        </>}
        {s.key === 'garage' && <>
          <span className="absolute left-3 top-[60px] text-[22px]">🔧</span>
          <span className="absolute right-3 top-[60px] text-[22px]">🛞</span>
        </>}
        {s.key === 'bomb' && <>
          <span className="absolute left-3 top-[60px] text-[22px]">🎈</span>
          <span className="absolute right-3 top-[60px] text-[22px]">🐾</span>
        </>}
        {s.key === 'baseball' && <>
          <span className="absolute left-3 top-[60px] text-[22px]">🧢</span>
          <span className="absolute right-3 top-[60px] text-[22px]">⚾</span>
        </>}
        {s.key === 'soccer' && <>
          <span className="absolute left-3 top-[60px] text-[22px]">🥅</span>
          <span className="absolute right-3 top-[60px] text-[22px]">⚽</span>
        </>}
        {s.key === 'fort' && <>
          <span className="absolute left-3 top-[60px] text-[24px]">🏹</span>
          <span className="absolute right-3 top-[60px] text-[24px]">🎯</span>
        </>}
        {s.key === 'duel' && [0, 1].map(side => (
          <span key={side} className="absolute top-[52px] h-[50px] w-[22px] rounded-b-md" style={{ [side ? 'right' : 'left']: 14, background: side ? '#DC2626' : '#2563EB', clipPath: 'polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)' }} />
        ))}
      </div>
      {/* 간판 */}
      <div className="absolute left-1/2 top-[22px] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl bg-white px-2.5 py-1.5 shadow-[0_6px_14px_-8px_rgba(15,23,42,0.6)]"
        style={{ boxShadow: hot ? `0 0 0 2px ${s.color}` : undefined, animation: hot ? 'pg-pulse 1.2s ease-out infinite' : undefined, ['--pg-c' as string]: `${s.color}88` }}>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[17px]" style={{ background: `${s.color}1A` }}>{s.emoji}</span>
        <span className="flex flex-col leading-tight">
          <span className="text-[13.5px] font-extrabold tracking-tight text-[#0F172A]">{s.name}</span>
          <span className="max-w-[130px] truncate text-[10px] font-semibold" style={{ color: hot ? s.color : '#64748B' }}>{sub}</span>
        </span>
      </div>
      {/* 입구 */}
      <div className="absolute bottom-0 left-1/2 h-[54px] w-[70px] -translate-x-1/2 overflow-hidden rounded-t-[35px] transition-all duration-200"
        style={{ background: near ? `linear-gradient(180deg, ${s.color}, #FDE68A)` : 'linear-gradient(180deg, #1E293B, #0F172A)', boxShadow: near ? `0 0 22px 4px ${s.color}88` : 'inset 0 4px 10px rgba(0,0,0,0.5)' }}>
        {s.key === 'garage' && !near && <span className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(#475569 0 3px, #334155 3px 7px)' }} />}
        <span className="absolute inset-x-0 bottom-1 text-center text-[16px] font-black" style={{ color: near ? '#0F172A' : 'rgba(255,255,255,0.35)', animation: near ? 'pg-bob 700ms ease-in-out infinite' : undefined }}>▲</span>
      </div>
      {/* 입구 앞 바닥 빛 */}
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[50%]" style={{ top: BH - 4, width: near ? 150 : 110, height: 22, background: near ? `radial-gradient(${s.color}66, transparent 70%)` : 'radial-gradient(rgba(15,23,42,0.14), transparent 70%)' }} />
      {away.length > 0 && (
        <div className="absolute inset-x-[-20px] flex flex-wrap justify-center gap-0.5" style={{ top: -18 }}>
          {away.map(a => <span key={a.id} className="rounded-full bg-[#0F172A]/85 px-2 py-[1px] text-[9.5px] font-semibold text-white">{a.name} · {s.key === 'garage' ? '꾸미는 중' : '하는 중'}</span>)}
        </div>
      )}
    </div>
  )
}
