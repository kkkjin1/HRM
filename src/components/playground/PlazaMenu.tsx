'use client'

// 운동장 🏟 광장 — PC 고르기 화면(2026-11-24).
// 격투장이 생겨 윗줄이 5채가 되자 건물 사이 골목이 24px로 좁아져 PC에서 아랫줄로 거의 못 내려갔다.
// 사용자 결정: 걷기 대신 게임 메뉴처럼 — 어두운 바탕에 아이콘 칸을 방향키로 훅훅 고르고 Enter/Space로 들어간다.
// 같은 날 2차: 왼쪽 = 🚗 내 차고(내 차가 회전판에서 360도) · 가운데 = 게임 4+4 · 오른쪽 = 내 유니폼 입은 캐릭터(3D, 끌어서 돌리기)
//  · ←→ 같은 줄에서 한 칸씩(맨 왼쪽에서 ← = 차고, 맨 오른쪽에서 → = 차고로 돌아감), ↑↓ 윗줄 ↔ 아랫줄
//  · 마우스를 올리면 고르기, 누르면 바로 들어가기
//  · 누가 방을 열면 맨 위 띠에 '참가하기'가 크게 뜨고, 그 칸에도 '모집 중' 표시
// 휴대폰은 예전 Plaza(pick 모드) 그대로.

import dynamic from 'next/dynamic'
import { useEffect, useRef, type ReactNode } from 'react'
import { AR } from '@/components/baseball/arena'
import { Player3DCard, useWebGL } from '@/components/baseball/three/lazy'
import type { Equip } from '@/lib/baseballGear'
import type { CarLook } from '@/lib/raceGarage'
import { W } from '@/lib/playground'
import { PLAZA_H, PLAZA_SPOTS, type PlazaPerson, type PlazaSpotKey } from './Plaza'

const CarTurntable = dynamic(() => import('@/components/playground/race3d/CarTurntable'), { ssr: false })

export type PlazaInvite = {
  id: string
  spot: PlazaSpotKey
  emoji: string
  color: string
  text: string // "박주현님이 포격전 2:2 모집 중"
  sub: string // "2/4명 · 빈자리는 CPU"
  full: boolean
  onJoin: () => void
  onDismiss: () => void
}

// 가운데 게임 4+4
const GRID: PlazaSpotKey[][] = [
  ['commute', 'race', 'duel', 'brawl'],
  ['fort', 'bomb', 'baseball', 'soccer'],
]
const SPOT = new Map(PLAZA_SPOTS.map(s => [s.key, s]))
const TOP = 66 // 위 띠(제목·참가 띠) 아래
const BOTTOM = 40 // 아래 줄
const SIDE_W = 214 // 왼쪽 차고 · 오른쪽 캐릭터 폭
const PAD = 14
const GAP = 12
const MID_L = PAD + SIDE_W + GAP + 4
const MID_W = W - 2 * MID_L
const TW = (MID_W - 3 * GAP) / 4
const TH = (PLAZA_H - TOP - BOTTOM - GAP - 10) / 2
const SIDE_H = TH * 2 + GAP

function posOf(key: PlazaSpotKey): { r: number; c: number } | null {
  for (let r = 0; r < GRID.length; r++) {
    const c = GRID[r].indexOf(key)
    if (c >= 0) return { r, c }
  }
  return null
}

export default function PlazaMenu(props: {
  active: boolean
  selected: PlazaSpotKey
  onSelect: (key: PlazaSpotKey) => void
  onEnter: (key: PlazaSpotKey) => void
  subs: Partial<Record<PlazaSpotKey, string>>
  invites: PlazaInvite[]
  here: { id: string; name: string; isMe: boolean }[] // 지금 광장에 있는 사람
  others: PlazaPerson[] // 다른 데 가 있는 사람은 그 칸에 이름으로
  news: string | null
  me: { name: string; number: number; equip: Equip; color: string; car: CarLook | null; coins: number | null; carName: string } | null
}) {
  const propsRef = useRef(props)
  useEffect(() => { propsRef.current = props })
  const lastRow = useRef(0) // 차고에서 → 하면 마지막에 있던 줄로
  const gl = useWebGL()

  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
    }
    function down(e: KeyboardEvent) {
      const p = propsRef.current
      if (!p.active || typing(e.target) || e.isComposing) return
      const cur = p.selected
      const at = posOf(cur)
      if (at) lastRow.current = at.r
      let next: PlazaSpotKey | null = null
      if (e.key === 'ArrowRight') next = !at ? GRID[lastRow.current][0] : at.c === 3 ? 'garage' : GRID[at.r][at.c + 1]
      else if (e.key === 'ArrowLeft') next = !at ? GRID[lastRow.current][3] : at.c === 0 ? 'garage' : GRID[at.r][at.c - 1]
      else if (e.key === 'ArrowDown') next = at ? GRID[1][at.c] : cur
      else if (e.key === 'ArrowUp') next = at ? GRID[0][at.c] : cur
      else if (e.key === 'Enter' || e.code === 'Space' || e.key === ' ' || e.code === 'NumpadEnter') {
        e.preventDefault(); e.stopImmediatePropagation()
        if (!e.repeat) p.onEnter(cur)
        return
      } else return
      e.preventDefault(); e.stopImmediatePropagation()
      if (next && next !== cur) p.onSelect(next)
    }
    window.addEventListener('keydown', down, true)
    return () => window.removeEventListener('keydown', down, true)
  }, [])

  const hot = new Set(props.invites.map(v => v.spot))
  const me = props.me
  const garage = SPOT.get('garage')!
  const garageSel = props.selected === 'garage'

  return (
    <div className="absolute inset-0 select-none overflow-hidden" style={{ width: W, height: PLAZA_H, color: AR.text,
      background: `radial-gradient(120% 90% at 50% 0%, #1A2B47 0%, ${AR.bg} 62%)` }}>
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(90deg, #fff 1px, transparent 1px), linear-gradient(#fff 1px, transparent 1px)', backgroundSize: '36px 36px' }} />

      {/* 위 띠: 모집 중이면 참가 띠, 없으면 제목 */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-3 px-5" style={{ height: TOP - 8 }}>
        {props.invites.length === 0 ? (
          <p className="text-[13px] font-bold tracking-tight" style={{ color: AR.muted }}>
            어디로 갈까요? <span className="ml-1 font-semibold" style={{ color: AR.sub }}>방을 열면 팀원 화면 맨 위에 참가 버튼이 떠요</span>
          </p>
        ) : props.invites.slice(0, 2).map(v => (
          <div key={v.id} className="flex min-w-0 max-w-[520px] flex-1 items-center gap-3 rounded-2xl py-1.5 pl-2 pr-1.5"
            style={{ background: 'linear-gradient(90deg, rgba(250,204,21,0.18), rgba(250,204,21,0.06))', boxShadow: 'inset 0 0 0 1.5px rgba(250,204,21,0.75), 0 10px 28px -12px rgba(250,204,21,0.55)', animation: 'pg-toast 220ms ease-out' }}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[20px]" style={{ background: v.color, animation: 'pg-bob 800ms ease-in-out infinite' }}>{v.emoji}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-extrabold">{v.text}</p>
              <p className="truncate text-[11px]" style={{ color: AR.sub }}>{v.sub}</p>
            </div>
            <button type="button" disabled={v.full} onMouseDown={e => e.preventDefault()} onClick={v.onJoin}
              className="shrink-0 rounded-xl bg-[#FACC15] px-5 py-2 text-[13.5px] font-black text-[#0F172A] shadow-[0_6px_16px_-6px_rgba(250,204,21,0.9)] transition-transform hover:scale-[1.04] hover:bg-[#FDE047] disabled:opacity-40">
              {v.full ? '꽉 참' : '참가하기'}
            </button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={v.onDismiss}
              className="shrink-0 rounded-lg px-1.5 py-1 text-[11px] font-semibold transition-colors hover:text-white" style={{ color: AR.muted }}>다음에</button>
          </div>
        ))}
      </div>

      {/* 왼쪽: 🚗 내 차고 — 내 차가 회전판 위에서 돈다 */}
      <div role="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onMouseEnter={() => props.onSelect('garage')} onClick={() => props.onEnter('garage')}
        className="absolute flex cursor-pointer flex-col items-center overflow-hidden rounded-[22px]"
        style={{ left: PAD, top: TOP, width: SIDE_W, height: SIDE_H, ...selStyle(garageSel, garage.color, false) }}>
        <div className="flex w-full items-center justify-between px-3.5 pt-3">
          <span className="text-[15px] font-extrabold tracking-tight">🚗 내 차고</span>
          {me?.coins != null && <span className="rounded-full bg-black/30 px-2 py-[1px] text-[11px] font-bold">🪙 {me.coins}</span>}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {me?.car && gl ? <CarTurntable car={me.car} color={me.color} width={SIDE_W} height={SIDE_H - 92} /> : <span className="text-[64px]">🚗</span>}
        </div>
        <p className="text-[12px] font-bold" style={{ color: garageSel ? '#fff' : AR.sub }}>{me?.carName ?? ''}</p>
        <p className="mb-3 mt-0.5 text-[11px]" style={{ color: garageSel ? 'rgba(255,255,255,0.85)' : AR.muted }}>꾸미기 · 부품 · 차 사기</p>
      </div>

      {/* 가운데: 게임 4+4 */}
      {GRID.flatMap((row, r) => row.map((key, c) => {
        const s = SPOT.get(key)!
        const sel = props.selected === key
        const isHot = hot.has(key)
        const away = props.others.filter(o => o.where === key)
        return (
          <button key={key} type="button" onMouseDown={e => e.preventDefault()}
            onMouseEnter={() => props.onSelect(key)} onClick={() => props.onEnter(key)}
            className="absolute flex flex-col items-center justify-center rounded-[20px] text-center outline-none"
            style={{ left: MID_L + c * (TW + GAP), top: TOP + r * (TH + GAP), width: TW, height: TH, ...selStyle(sel, s.color, isHot) }}>
            {away.length > 0 && (
              <span className={`absolute left-2 top-2 truncate rounded-full bg-black/35 px-2 py-[1px] text-[10px] font-semibold ${isHot ? 'max-w-[50%]' : 'max-w-[88%]'}`}>
                {away.map(o => o.name).join(' · ')} 하는 중
              </span>
            )}
            {isHot && (
              <span className="absolute right-2 top-2 rounded-full bg-[#FACC15] px-2 py-[1px] text-[10px] font-black text-[#0F172A]"
                style={{ animation: 'pg-bob 700ms ease-in-out infinite' }}>모집 중</span>
            )}
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-[29px]"
              style={{ background: sel ? 'rgba(255,255,255,0.22)' : s.color + '33', boxShadow: sel ? 'inset 0 0 0 1px rgba(255,255,255,0.35)' : 'none' }}>{s.emoji}</span>
            <span className="mt-2 text-[15px] font-extrabold tracking-tight">{s.name}</span>
            <span className="mt-0.5 w-full truncate px-2.5 text-[11px]" style={{ color: sel ? 'rgba(255,255,255,0.85)' : AR.muted }}>{props.subs[key] ?? ''}</span>
          </button>
        )
      }))}

      {/* 오른쪽: 내 유니폼 입은 캐릭터(야구 장비 그대로, 끌어서 돌리기) */}
      <div className="absolute flex flex-col items-center overflow-hidden rounded-[22px]"
        style={{ left: W - PAD - SIDE_W, top: TOP, width: SIDE_W, height: SIDE_H, background: `linear-gradient(180deg, ${AR.card}, ${AR.bg})`, boxShadow: `0 0 0 1px ${AR.line}` }}>
        <div className="pointer-events-none absolute bottom-10 left-1/2 h-10 w-36 -translate-x-1/2 rounded-[50%]" style={{ background: 'radial-gradient(closest-side, rgba(96,165,250,0.35), transparent)' }} />
        <div className="flex min-h-0 flex-1 items-end justify-center">
          {me && gl ? <Player3DCard look={{ equip: me.equip, name: me.name, number: me.number }} width={SIDE_W - 20} height={SIDE_H - 56} /> : <span className="mb-6 text-[64px]">🧢</span>}
        </div>
        <p className="mb-3 text-[13px] font-extrabold">{me?.name ?? ''} <span className="font-semibold" style={{ color: AR.muted }}>#{me?.number ?? ''}</span></p>
      </div>

      {/* 아래 줄: 광장에 있는 사람 · 조작 안내 · 소식 */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-4" style={{ height: BOTTOM }}>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {props.here.slice(0, 8).map(h => (
            <span key={h.id} className="shrink-0 rounded-full px-2 py-[2px] text-[10.5px] font-semibold"
              style={h.isMe ? { background: '#E0A526', color: '#fff' } : { background: AR.tile, color: AR.sub, boxShadow: `inset 0 0 0 1px ${AR.line}` }}>{h.name}</span>
          ))}
          {props.here.length > 8 && <span className="text-[10.5px]" style={{ color: AR.muted }}>+{props.here.length - 8}</span>}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: AR.muted }}>
          {['←', '→', '↑', '↓'].map(k => <Key key={k}>{k}</Key>)}<span className="mx-1">고르기</span><Key>Enter</Key><span className="ml-1">들어가기</span>
        </span>
        <div className="flex min-w-0 flex-1 justify-end">
          {props.news && (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-1.5 pr-3 text-[11px] font-semibold" style={{ background: AR.card, boxShadow: `inset 0 0 0 1px ${AR.line}` }}>
              <span className="shrink-0 rounded-full bg-[#FACC15] px-1.5 text-[10px] font-black text-[#0F172A]">소식</span><span className="truncate">{props.news}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// 고른 칸: 게임 색으로 차오르고 커지며 빛남 / 모집 중: 노란 테두리
function selStyle(sel: boolean, color: string, isHot: boolean): React.CSSProperties {
  return {
    background: sel ? `linear-gradient(160deg, ${color} 0%, ${color}B3 55%, ${AR.card} 100%)` : AR.tile,
    boxShadow: sel
      ? `0 0 0 2px #fff, 0 0 0 5px ${color}88, 0 18px 40px -10px ${color}`
      : isHot ? '0 0 0 2px rgba(250,204,21,0.8)' : `0 0 0 1px ${AR.line}`,
    transform: sel ? 'translateY(-3px) scale(1.04)' : 'none',
    opacity: sel ? 1 : 0.85,
    transition: 'transform 110ms ease-out, box-shadow 110ms ease-out, background 110ms ease-out, opacity 110ms',
    zIndex: sel ? 2 : 1,
  }
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md px-1.5 text-[10px] font-bold leading-[16px]" style={{ background: AR.tile, color: AR.text, boxShadow: `inset 0 -2px 0 ${AR.line}, inset 0 0 0 1px ${AR.line}` }}>{children}</kbd>
}
