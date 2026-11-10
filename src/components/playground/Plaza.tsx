'use client'

// 운동장 🏟 광장 — 운동장을 열면 먼저 나오는 공용 공간. 접속한 팀원이 같이 돌아다니고, 문 5개 중 하나 앞에서 Space로 들어간다.
//   🏢 퇴근길(그날의 칼퇴 게임) · 🏎 레이싱 · 🚗 차고 · ⚔ 대결 · 💥 포격전(2026-11-05 대결장에서 분리)
// 단순하게(2026-11-03 사용자 "난잡해, 단순하되 직관적으로"): 배경 장식 없이 문 4개 + 사람들 + 위쪽 소식 한 줄.
// 2026-11-05 사용자 "단순하지 않아도 돼, 세련되게 — 어디로 가는지만 명확하면": 문을 건물 정면 4채(사무실·레이싱 게이트·차고 셔터·경기장)로,
// 간판 = 어디로, 입구 = 들어가는 곳(가까이 가면 불 켜짐). 하늘·먼 도시·돌바닥·가로등·나무 배경.
// 다른 데 가 있는 사람은 캐릭터 대신 그 문 아래에 이름표로 보인다("박주현 · 플레이 중").
// 내 위치는 여기서 계산하고 onMove로 부모에 알린다(부모가 'plaza' 방송). active일 때만 키(←→↑↓·Space)를 잡는다
// — 레이싱·대결·차고 화면이 위에 떠 있을 땐 그 화면이 키를 써야 하니까.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CharacterSprite } from '@/components/baseball/three/Sprite3D'
import type { Equip } from '@/lib/baseballGear'
import { H, W } from '@/lib/playground'

export type PlazaWhere = 'plaza' | 'commute' | 'race' | 'duel' | 'garage' | 'fort' | 'bomb'
export type PlazaSpotKey = 'commute' | 'race' | 'garage' | 'duel' | 'fort' | 'bomb'
export type PlazaPerson = { id: string; name: string; equip: Equip; palette: { bg: string; fg: string }; x: number; z: number; f: 1 | -1; where: PlazaWhere; message: string | null; done: boolean }

const FLOOR_Y = 214 // 바닥 맨 뒤(화면 y). z = 0(뒤) ~ Z_MAX(앞)
const Z_MAX = 70
const SPEED = 190
const DEPTH_SPEED = 100
const REACH = 60
export const PLAZA_SPOTS: { key: PlazaSpotKey; x: number; emoji: string; name: string; color: string; act: string }[] = [
  { key: 'commute', x: 95, emoji: '🏢', name: '퇴근길', color: '#334155', act: '퇴근길 들어가기' },
  { key: 'race', x: 273, emoji: '🏎', name: '레이싱', color: '#DC2626', act: '레이싱' },
  { key: 'garage', x: 451, emoji: '🚗', name: '내 차고', color: '#D97706', act: '내 차 꾸미기' },
  { key: 'duel', x: 629, emoji: '⚔', name: '대결', color: '#2563EB', act: '1:1 대결' },
  { key: 'fort', x: 807, emoji: '💥', name: '포격전', color: '#EA580C', act: '포격전 하기' },
  { key: 'bomb', x: 985, emoji: '🧨', name: '폭탄 놀이터', color: '#F2734F', act: '폭탄 놀이터' },
]
const WHERE_SPOT: Record<Exclude<PlazaWhere, 'plaza'>, PlazaSpotKey> = { commute: 'commute', race: 'race', garage: 'garage', duel: 'duel', fort: 'fort', bomb: 'bomb' }
const footY = (z: number) => FLOOR_Y + z
const PLAZA_FLOOR = 200 // 건물이 서 있는 선(화면 y) — 사람들은 그 앞(FLOOR_Y~)을 걷는다

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
        // 초당 5번(통신 한도 — 다른 사람 화면은 transition으로 이어 그림)
        if (now - lastSent > 200 || !next.moving) { lastSent = now; propsRef.current.onMove(Math.round(next.x), Math.round(next.z), next.f) }
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
    <div className="absolute inset-0 overflow-hidden" style={{ width: W, height: H, background: 'linear-gradient(180deg, #BFDBFE 0%, #E0ECFF 38%, #F5F8FF 62%)' }}>
      {/* 먼 도시 실루엣 + 구름(옅게) */}
      <div className="pointer-events-none absolute inset-x-0" style={{ top: 70, height: 130, opacity: 0.35,
        background: 'linear-gradient(#94A3B8,#94A3B8) 2% 100%/70px 60% no-repeat, linear-gradient(#94A3B8,#94A3B8) 9% 100%/50px 85% no-repeat, linear-gradient(#94A3B8,#94A3B8) 26% 100%/60px 45% no-repeat, linear-gradient(#94A3B8,#94A3B8) 49% 100%/80px 70% no-repeat, linear-gradient(#94A3B8,#94A3B8) 73% 100%/56px 55% no-repeat, linear-gradient(#94A3B8,#94A3B8) 97% 100%/64px 80% no-repeat' }} />
      {[[120, 30, 1], [520, 18, 0.8], [880, 40, 1.1]].map(([x, y, k], i) => (
        <span key={i} className="pointer-events-none absolute rounded-full bg-white/80" style={{ left: x, top: y, width: 70 * k, height: 18 * k, boxShadow: `${24 * k}px -8px 0 2px rgba(255,255,255,0.8)` }} />
      ))}
      {/* 광장 바닥: 돌바닥 타일(원근) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: PLAZA_FLOOR, background: 'linear-gradient(#E7E1D5, #D9D1C2)' }} />
      <div className="pointer-events-none absolute bottom-0" style={{ top: PLAZA_FLOOR, left: -200, right: -200, transformOrigin: 'top', transform: 'perspective(260px) rotateX(38deg)',
        backgroundImage: 'linear-gradient(90deg, rgba(120,104,82,0.18) 1px, transparent 1px), linear-gradient(rgba(120,104,82,0.16) 1px, transparent 1px)', backgroundSize: '60px 26px' }} />
      <div className="pointer-events-none absolute inset-x-0" style={{ top: PLAZA_FLOOR, height: 6, background: 'linear-gradient(rgba(15,23,42,0.12), transparent)' }} />
      {/* 건물 사이 가로등·나무 */}
      {[184, 362, 540, 718, 896].map(x => (
        <div key={x} className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center" style={{ left: x, top: PLAZA_FLOOR - 92 }}>
          <span className="h-3 w-5 rounded-t-md bg-[#FDE68A] shadow-[0_0_16px_6px_rgba(253,230,138,0.6)]" />
          <span className="h-[80px] w-[3px] bg-[#475569]" />
        </div>
      ))}
      {/* 건물 5채 — 간판(어디로) + 입구(들어가는 곳) */}
      {PLAZA_SPOTS.map(s => <Facade key={s.key} spot={s} near={near?.key === s.key} hot={props.hot === s.key} sub={props.subs[s.key]} away={awayAt(s.key)} />)}

      {props.news && (
        <div className="pointer-events-none absolute bottom-2.5 left-3 z-40 max-w-[330px]">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#0F172A]/85 py-1 pl-1.5 pr-3 text-[11px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.7)]">
            <span className="shrink-0 rounded-full bg-[#FACC15] px-1.5 text-[10px] font-black text-[#0F172A]">소식</span><span className="truncate">{props.news}</span>
          </span>
        </div>
      )}

      {/* 광장에 있는 사람들 — 뒤(z 작음)부터 */}
      {[...here].sort((a, b) => a.z - b.z).map(p => (
        <div key={p.id} className={`absolute ${p.isMe ? 'z-30' : 'z-20 transition-[left,top] duration-200 ease-linear'}`}
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

// 건물 정면 — 종류마다 생김새가 달라 어디로 가는지 한눈에: 🏢 사무실(퇴근길) · 🏁 레이싱 게이트 · 🔧 차고 셔터 · ⚔ 경기장
// 가까이 가면 입구에 불이 켜지고 바닥에 빛이 번지며 'Space 들어가기'가 뜬다. 모집 중(hot)이면 간판 테두리가 깜빡인다.
function Facade({ spot: s, near, hot, sub, away }: { spot: (typeof PLAZA_SPOTS)[number]; near: boolean; hot: boolean; sub: string; away: PlazaPerson[] }) {
  const BW = 164, BH = 176, top = PLAZA_FLOOR - BH
  const body: Record<PlazaSpotKey, string> = {
    commute: 'linear-gradient(180deg, #E2E8F0, #CBD5E1)',
    race: 'linear-gradient(180deg, #FEE2E2, #FECACA)',
    garage: 'linear-gradient(180deg, #FEF3C7, #FDE68A)',
    duel: 'linear-gradient(180deg, #DBEAFE, #BFDBFE)',
    fort: 'linear-gradient(180deg, #FFEDD5, #FED7AA)',
    bomb: 'linear-gradient(180deg, #FFF1E6, #FFD9C2)',
  }
  const roof: Record<PlazaSpotKey, CSSProperties> = {
    commute: { background: '#334155' },
    race: { backgroundImage: 'repeating-conic-gradient(#111827 0 25%, #F9FAFB 0 50%)', backgroundSize: '14px 14px' }, // 체크무늬
    garage: { background: '#B45309' },
    duel: { background: '#1D4ED8' },
    fort: { backgroundImage: 'repeating-linear-gradient(90deg, #9A3412 0 16px, #C2410C 16px 18px)' }, // 성벽 띠
    bomb: { backgroundImage: 'repeating-linear-gradient(90deg, #F2734F 0 14px, #FFD34D 14px 28px)' }, // 놀이공원 줄무늬 차양
  }
  return (
    <div className="absolute" style={{ left: s.x - BW / 2, top, width: BW, height: BH }}>
      {/* 지붕 띠 */}
      <div className="absolute inset-x-[-6px] top-0 h-[14px] rounded-t-lg shadow-sm" style={roof[s.key]} />
      {/* 몸체 */}
      <div className="absolute inset-x-0 bottom-0 top-[14px] overflow-hidden rounded-b-md" style={{ background: body[s.key], boxShadow: 'inset 0 -10px 18px -12px rgba(15,23,42,0.35)' }}>
        {s.key === 'commute' && [0, 1].map(side => (
          <div key={side} className="absolute top-[64px] grid grid-cols-2 gap-1.5" style={{ [side ? 'right' : 'left']: 12 }}>
            {Array.from({ length: 6 }, (_, i) => <span key={i} className="h-[14px] w-[16px] rounded-[3px] bg-[#93C5FD]" style={{ opacity: 0.55 + ((i * 37) % 40) / 100 }} />)}
          </div>
        ))}
        {s.key === 'race' && <>
          <span className="absolute left-3 top-[70px] text-[26px]">🏁</span>
          <span className="absolute right-3 top-[70px] text-[26px]" style={{ transform: 'scaleX(-1)' }}>🏁</span>
        </>}
        {s.key === 'garage' && <>
          <span className="absolute left-3 top-[72px] text-[22px]">🔧</span>
          <span className="absolute right-3 top-[72px] text-[22px]">🛞</span>
        </>}
        {s.key === 'bomb' && <>
          <span className="absolute left-3 top-[72px] text-[22px]">🎈</span>
          <span className="absolute right-3 top-[72px] text-[22px]">🐾</span>
        </>}
        {s.key === 'fort' && <>
          <span className="absolute left-3 top-[72px] text-[24px]">🏹</span>
          <span className="absolute right-3 top-[72px] text-[24px]">🎯</span>
        </>}
        {s.key === 'duel' && [0, 1].map(side => (
          <span key={side} className="absolute top-[58px] h-[56px] w-[22px] rounded-b-md" style={{ [side ? 'right' : 'left']: 14, background: side ? '#DC2626' : '#2563EB', clipPath: 'polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)' }} />
        ))}
      </div>
      {/* 간판 */}
      <div className="absolute left-1/2 top-[22px] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl bg-white px-2.5 py-1.5 shadow-[0_6px_14px_-8px_rgba(15,23,42,0.6)]"
        style={{ boxShadow: hot ? `0 0 0 2px ${s.color}` : undefined, animation: hot ? 'pg-pulse 1.2s ease-out infinite' : undefined, ['--pg-c' as string]: `${s.color}88` }}>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[17px]" style={{ background: `${s.color}1A` }}>{s.emoji}</span>
        <span className="flex flex-col leading-tight">
          <span className="text-[13.5px] font-extrabold tracking-tight text-[#0F172A]">{s.name}</span>
          <span className="max-w-[104px] truncate text-[10px] font-semibold" style={{ color: hot ? s.color : '#64748B' }}>{sub}</span>
        </span>
      </div>
      {/* 입구 */}
      <div className="absolute bottom-0 left-1/2 h-[64px] w-[74px] -translate-x-1/2 overflow-hidden rounded-t-[37px] transition-all duration-200"
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
