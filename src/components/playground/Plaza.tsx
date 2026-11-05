'use client'

// 운동장 🏟 광장 — 운동장을 열면 먼저 나오는 공용 공간. 접속한 팀원이 같이 돌아다니고, 문 4개 중 하나 앞에서 Space로 들어간다.
//   🏢 퇴근길(그날의 칼퇴 게임) · 🏎 레이싱 · 🚗 차고 · ⚔ 대결
// 단순하게(2026-11-03 사용자 "난잡해, 단순하되 직관적으로"): 배경 장식 없이 문 4개 + 사람들 + 위쪽 소식 한 줄.
// 2026-11-05 다듬기: 문 = 흰 카드(위 색 띠 + 연한 색 아이콘 칸), 가까이 가면 살짝 떠오르고 색 테두리, 모집 중이면 맥박 테두리. 장식은 늘리지 않음.
// 다른 데 가 있는 사람은 캐릭터 대신 그 문 아래에 이름표로 보인다("박주현 · 플레이 중").
// 내 위치는 여기서 계산하고 onMove로 부모에 알린다(부모가 'plaza' 방송). active일 때만 키(←→↑↓·Space)를 잡는다
// — 레이싱·대결·차고 화면이 위에 떠 있을 땐 그 화면이 키를 써야 하니까.

import { useEffect, useRef, useState } from 'react'
import { CharacterSprite } from '@/components/baseball/three/Sprite3D'
import type { Equip } from '@/lib/baseballGear'
import { H, W } from '@/lib/playground'

export type PlazaWhere = 'plaza' | 'commute' | 'race' | 'duel' | 'garage'
export type PlazaSpotKey = 'commute' | 'race' | 'garage' | 'duel'
export type PlazaPerson = { id: string; name: string; equip: Equip; palette: { bg: string; fg: string }; x: number; z: number; f: 1 | -1; where: PlazaWhere; message: string | null; done: boolean }

const FLOOR_Y = 214 // 바닥 맨 뒤(화면 y). z = 0(뒤) ~ Z_MAX(앞)
const Z_MAX = 70
const SPEED = 190
const DEPTH_SPEED = 100
const REACH = 70
export const PLAZA_SPOTS: { key: PlazaSpotKey; x: number; emoji: string; name: string; color: string; act: string }[] = [
  { key: 'commute', x: 150, emoji: '🏢', name: '퇴근길', color: '#334155', act: '퇴근길 들어가기' },
  { key: 'race', x: 410, emoji: '🏎', name: '레이싱', color: '#DC2626', act: '레이싱' },
  { key: 'garage', x: 670, emoji: '🚗', name: '내 차고', color: '#D97706', act: '내 차 꾸미기' },
  { key: 'duel', x: 930, emoji: '⚔', name: '대결', color: '#2563EB', act: '1:1 대결' },
]
const WHERE_SPOT: Record<Exclude<PlazaWhere, 'plaza'>, PlazaSpotKey> = { commute: 'commute', race: 'race', garage: 'garage', duel: 'duel' }
const footY = (z: number) => FLOOR_Y + z

export function plazaSpawn(i: number) {
  return { x: 540 + ((i * 53) % 180) - 90, z: 28 + ((i * 23) % 30) }
}

export default function Plaza(props: {
  active: boolean
  me: PlazaPerson | null
  others: PlazaPerson[]
  subs: Record<PlazaSpotKey, string> // 문 아래 한 줄(오늘의 퇴근길 이름·모집 남은 초·코인 등)
  hot: PlazaSpotKey | null // 강조할 문(레이스 모집 중 등)
  news: string | null
  onMove: (x: number, z: number, f: 1 | -1) => void
  onEnter: (spot: PlazaSpotKey) => void
}) {
  const [pos, setPos] = useState(() => ({ x: props.me?.x ?? 540, z: props.me?.z ?? 40, f: (props.me?.f ?? 1) as 1 | -1, moving: false }))
  const posRef = useRef(pos)
  const keys = useRef(new Set<string>())
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props })
  useEffect(() => { if (!props.active) keys.current.clear() }, [props.active])

  const nearSpot = (x: number) => PLAZA_SPOTS.find(s => Math.abs(s.x - x) < REACH) ?? null

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
        const s = nearSpot(posRef.current.x)
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
      const dz = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0)
      const p = posRef.current
      if (dx || dz || p.moving) {
        const next = {
          x: Math.max(24, Math.min(W - 24, p.x + dx * SPEED * dt)),
          z: Math.max(0, Math.min(Z_MAX, p.z + dz * DEPTH_SPEED * dt)),
          f: (dx ? (dx > 0 ? 1 : -1) : p.f) as 1 | -1,
          moving: !!(dx || dz),
        }
        posRef.current = next
        setPos(next)
        const now = Date.now()
        if (now - lastSent > 80 || !next.moving) { lastSent = now; propsRef.current.onMove(Math.round(next.x), Math.round(next.z), next.f) }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const near = nearSpot(pos.x)
  const me = props.me
  const here = [
    ...props.others.filter(o => o.where === 'plaza').map(o => ({ ...o, isMe: false })),
    ...(me ? [{ ...me, x: pos.x, z: pos.z, f: pos.f, isMe: true }] : []),
  ]
  const awayAt = (spot: PlazaSpotKey) => props.others.filter(o => o.where !== 'plaza' && WHERE_SPOT[o.where as Exclude<PlazaWhere, 'plaza'>] === spot)

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ width: W, height: H, background: 'linear-gradient(180deg, #EEF4FF 0%, #F8FAFC 60%, #ECE7DE 60%, #E4DED3 100%)' }}>
      {/* 바닥 원근 줄(아주 옅게) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: '60%', backgroundImage: 'repeating-linear-gradient(90deg, rgba(15,23,42,0.035) 0 1px, transparent 1px 90px)', maskImage: 'linear-gradient(to bottom, transparent, black)' }} />
      <div className="pointer-events-none absolute inset-x-0" style={{ top: '60%', height: 1, background: 'rgba(15,23,42,0.08)' }} />
      {/* 문 4개 */}
      {PLAZA_SPOTS.map(s => {
        const isNear = near?.key === s.key
        const isHot = props.hot === s.key
        const away = awayAt(s.key)
        return (
          <div key={s.key} className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: s.x, top: 26 }}>
            <div className="relative flex h-[132px] w-[160px] flex-col items-center justify-center gap-1 overflow-hidden rounded-[22px] bg-white transition-all duration-200"
              style={{
                transform: isNear ? 'translateY(-4px)' : undefined,
                boxShadow: isNear ? `0 0 0 3px ${s.color}, 0 16px 28px -12px ${s.color}99` : '0 0 0 1px rgba(15,23,42,0.06), 0 8px 20px -10px rgba(15,23,42,0.3)',
                animation: isHot && !isNear ? 'pg-pulse 1.2s ease-out infinite' : undefined,
                ['--pg-c' as string]: `${s.color}66`,
              }}>
              <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: s.color }} />
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-[28px] leading-none" style={{ background: `${s.color}14`, animation: isHot ? 'pg-bob 700ms ease-in-out infinite' : undefined }}>{s.emoji}</span>
              <span className="text-[14.5px] font-extrabold tracking-tight text-[#0F172A]">{s.name}</span>
              <span className="max-w-[144px] truncate rounded-full px-2 py-[1px] text-[10.5px] font-semibold"
                style={isHot ? { background: s.color, color: '#FFFFFF' } : { background: '#F1F5F9', color: '#64748B' }}>{props.subs[s.key]}</span>
            </div>
            <span className="mt-1 h-1.5 w-[120px] rounded-full bg-black/[0.06]" />
            {away.length > 0 && (
              <div className="mt-1 flex max-w-[170px] flex-wrap justify-center gap-0.5">
                {away.map(a => <span key={a.id} className="rounded-full bg-[#0F172A]/85 px-2 py-[1px] text-[9.5px] font-semibold text-white">{a.name} · {s.key === 'garage' ? '꾸미는 중' : '하는 중'}</span>)}
              </div>
            )}
          </div>
        )
      })}

      {props.news && (
        <div className="pointer-events-none absolute inset-x-0 top-1.5 text-center">
          <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-[#0F172A] shadow-sm ring-1 ring-black/5">📢 {props.news}</span>
        </div>
      )}

      {/* 광장에 있는 사람들 — 뒤(z 작음)부터 */}
      {[...here].sort((a, b) => a.z - b.z).map(p => (
        <div key={p.id} className={`absolute ${p.isMe ? 'z-30' : 'z-20 transition-[left,top] duration-100 ease-linear'}`}
          style={{ left: p.x, top: footY(p.z), transform: 'translate(-50%, -100%)' }}>
          <div className="flex flex-col items-center">
            {p.message && <span className="mb-0.5 max-w-[150px] truncate rounded-lg bg-white px-1.5 py-0.5 text-[10px] text-[#1F2933] shadow">{p.message}</span>}
            <span className={`mb-[1px] whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10px] font-semibold shadow ${p.isMe ? 'bg-[#E0A526] text-white' : 'bg-white text-[#1F2933]'}`}>
              {p.done ? '☀️ ' : ''}{p.name}
            </span>
            <div style={{ transform: `scaleX(${p.f})`, animation: p.isMe && pos.moving ? 'pg-bob 300ms ease-in-out infinite' : undefined }}>
              <CharacterSprite equip={p.equip} name={p.name} size={44} colorBg={p.palette.bg} colorFg={p.palette.fg} />
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
            <span className="ml-0.5">걷기 · 문 앞에서</span>
            <kbd className="rounded-md border border-b-2 border-[#CBD5E1] bg-white px-1.5 text-[10px] font-bold leading-[14px] text-[#334155]">Space</kbd>
          </span>
        )}
      </div>
    </div>
  )
}
