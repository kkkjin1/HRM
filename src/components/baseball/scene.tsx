'use client'

// 비거리 야구 필드 그림·애니메이션 공용 모듈 — 솔로 게임(BaseballWidget)과 1:1 대결(DuelView)이 같이 쓴다.
// 좌표·궤적·투수 자세 계산 + 필드 SVG(FieldScene) + 투구 애니메이션 루프(usePitchAnimation).

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { BatShape, CapShape, JerseyShape } from '@/components/baseball/gear'
import { teamOf, type Equip } from '@/lib/baseballGear'
import { DOODLE_PALETTE } from '@/lib/data'
import { displayName } from '@/lib/members'
import {
  OUTS_PER_INNING, PITCH_TYPES, FENCE_M, FIELD_M, STRIKES_FOR_OUT, BALLS_FOR_WALK,
  isHit, isOut, outcomeLabel, paLabel, pitchHeight, travelMs,
  type GameState, type Pitch, type Slot, type Swing,
} from '@/lib/baseball'

export const LOOKING_GRACE_MS = 250 // 도착 후 이 시간 안에 안 치면 루킹/볼
export const FOLLOW_MS = 280        // 릴리스 후 팔로스루 모션

// SVG 좌표 (viewBox 560x150, 위쪽 58 여백은 HUD·자막·전광판 자리). 투수를 오른쪽 끝에 멀리 둬서
// 구속·구종 차이가 궤적으로, 투구폼(팔 각도)이 구종 힌트로 보이게 한다.
export const VIEW_W = 560
export const VIEW_H = 150
export const VIEW_TOP = -58
export const PLATE_X = 58
export const PLATE_Y = 104
export const PX = 522 // 투수 축발 위치
export const GROUND_Y = 132
export const SCALE = (550 - PLATE_X) / FIELD_M // 1m당 px
export const HANDS = { x: 48, y: 98 }
export const BODY = { x: 42, y: 94 } // 몸에 맞는 공 도착점
export const ZONE = { x: 51, y: 88, w: 14, h: 30 } // 스트라이크존 표시
// 투구폼별 릴리스 지점 / 팔을 뒤로 뺐을 때 손 위치
export const RELEASE: Record<Slot, { x: number; y: number }> = {
  high: { x: PX - 25, y: 68 }, mid: { x: PX - 31, y: 84 }, side: { x: PX - 32, y: 100 }, low: { x: PX - 26, y: 122 },
}
export const COCK: Record<Slot, { x: number; y: number }> = {
  high: { x: PX + 12, y: 70 }, mid: { x: PX + 16, y: 86 }, side: { x: PX + 18, y: 102 }, low: { x: PX + 12, y: 126 },
}

// 캐릭터 표시 배율 — 판정·궤적 계산 좌표는 그대로 두고 그림만 키운다(발끝 기준 확대).
// 타자 쪽(스트라이크존·홈플레이트 포함)은 BATTER_SCALE, 투수 쪽은 PITCHER_SCALE.
export const BATTER_SCALE = 1.5
export const PITCHER_SCALE = 1.3
const BATTER_ANCHOR = { x: 40, y: GROUND_Y }
const PITCHER_ANCHOR = { x: PX, y: GROUND_Y }
const scaleAt = (o: Pt, s: number) => (p: Pt): Pt => ({ x: o.x + (p.x - o.x) * s, y: o.y + (p.y - o.y) * s })
const toBatter = scaleAt(BATTER_ANCHOR, BATTER_SCALE)
const toPitcher = scaleAt(PITCHER_ANCHOR, PITCHER_SCALE)
const scaleTransform = (o: Pt, s: number) => `translate(${o.x} ${o.y}) scale(${s}) translate(${-o.x} ${-o.y})`

export type Anim = { pitch: Pitch; start: number; result: Swing | null; resultStart: number | null; paEnded: string | null; selfResolve: boolean }
export type Pt = { x: number; y: number }

export function windupOf(a: Anim) {
  return a.pitch.windup ?? 900
}

export function arrivalOf(a: Anim) {
  return a.start + windupOf(a) + travelMs(a.pitch.speed)
}

export function resultDuration(s: Swing) {
  if (isHit(s.outcome) || s.outcome === 'flyout') return 800 + s.distance * 6
  if (s.outcome === 'foul') return 700
  if (s.outcome === 'groundout' || s.outcome === 'popout') return 1000
  return 600
}

export function slotOf(p: Pitch): Slot {
  return p.slot ?? PITCH_TYPES[p.type].slot
}

export function endPoint(p: Pitch): Pt {
  if (p.type === 'hbp') return BODY
  return { x: PLATE_X, y: PLATE_Y + pitchHeight(p) * 15 }
}

// 구종별 비행 중 위치 (p: 0~1, 1 = 홈플레이트 도착, 1 넘으면 같은 높이로 포수까지 직진)
export function flightPos(pitch: Pitch, p: number): Pt {
  const start = RELEASE[slotOf(pitch)]
  const end = endPoint(pitch)
  const q = Math.min(p, 1)
  const px = pitch.type === 'changeup' && p <= 1 ? p + 0.22 * Math.sin(Math.PI * p) : p
  const x = start.x + (end.x - start.x) * px
  const line = (e: number) => start.y + (end.y - start.y) * e
  let y: number
  switch (pitch.type) {
    case 'heater': y = line(q) - 5 * Math.sin(Math.PI * q); break
    case 'fastball': y = line(q) - 7 * Math.sin(Math.PI * q); break
    case 'twoseam': y = line(q) + 20 * q ** 4 * (1 - q) * 4; break
    case 'cutter': y = line(q) + 7 * q ** 4; break
    case 'splitter': y = line(q) + 13 * q ** 7; break
    case 'slider': y = line(q) + 26 * q ** 4 * (1 - q) * 4; break
    case 'changeup': y = line(q) + 18 * q ** 2 * (1 - q) * 3; break
    case 'curve': y = line(q) - 32 * Math.sin(Math.PI * q) + 30 * q ** 2 * (1 - q); break
    case 'slowcurve': y = line(q) - 48 * Math.sin(Math.PI * q) + 40 * q ** 2 * (1 - q); break
    case 'eephus': y = line(q) - 78 * Math.sin(Math.PI * q); break
    case 'knuckle': y = line(q) + 9 * Math.sin(q * 17) * (0.4 + q) * (1 - q); break
    case 'rising': y = line(q ** 1.8); break
    case 'sidearm': y = line(q ** 3); break
    // 빠지는 볼: 스트라이크처럼 오다가 마지막 구간에서 존 밖으로 빠진다 — 끝까지 봐야 참을 수 있다
    // 빠지는 볼: 끝(end)은 존 밖이지만 가운데를 향하듯 오다가 마지막 구간에서 빠진다
    case 'ball': y = start.y + (PLATE_Y - start.y) * q - 6 * Math.sin(Math.PI * q) + (end.y - PLATE_Y) * q ** 5; break
    case 'hbp': y = line(q); break
  }
  return { x, y }
}

export function landX(distance: number) {
  return PLATE_X + Math.min(distance, FIELD_M) * SCALE
}

// 현재 시각(now) 기준 공 위치. null이면 공을 그리지 않는다(투구 모션 중엔 투수 손에 들려 있음).
export function ballPos(a: Anim, now: number): Pt | null {
  const t = now - a.start
  if (t < windupOf(a)) return null
  const res = a.result
  if (res && a.resultStart !== null && now >= a.resultStart) {
    const r = Math.min(1, (now - a.resultStart) / resultDuration(res))
    if (res.outcome === 'hbp') {
      if (r >= 1) return null
      return { x: BODY.x + 40 * r, y: BODY.y + (GROUND_Y - BODY.y) * r - 60 * r * (1 - r) }
    }
    if (res.outcome === 'foul') {
      if (r >= 1) return null
      return { x: PLATE_X - 60 * r, y: PLATE_Y - 130 * r }
    }
    if (res.outcome === 'groundout') { // 앞으로 튀며 굴러가는 땅볼
      const x = PLATE_X + (landX(24) - PLATE_X) * r
      return { x, y: GROUND_Y - 3 - 14 * Math.abs(Math.sin(Math.PI * 3 * r)) * (1 - r) }
    }
    if (res.outcome === 'popout') { // 높이 떴다가 금방 떨어지는 뜬공
      const lx = landX(38)
      return { x: PLATE_X + (lx - PLATE_X) * r, y: PLATE_Y + (GROUND_Y - PLATE_Y) * r - 4 * 95 * r * (1 - r) }
    }
    if (isHit(res.outcome) || res.outcome === 'flyout') { // 잡힌 뜬공도 날아가는 궤적은 같다(끝에 깃발 대신 '잡혔다')
      const lx = landX(res.distance)
      const h = 20 + Math.min(res.distance, FIELD_M) * 0.6
      return { x: PLATE_X + (lx - PLATE_X) * r, y: PLATE_Y + (GROUND_Y - PLATE_Y) * r - 4 * h * r * (1 - r) }
    }
  }
  const p = (t - windupOf(a)) / travelMs(a.pitch.speed)
  if (a.pitch.type === 'hbp') return p <= 1 ? flightPos(a.pitch, p) : BODY
  if (p >= 1.15) return null // 포수 미트로 사라짐
  return flightPos(a.pitch, p)
}

// 공을 화면에 그릴 위치 — 투구 중엔 (확대된) 투수 손 → (확대된) 타자 존으로 자연스럽게 옮겨 가고,
// 타구는 방망이에서 출발해 금방 실제 거리 좌표(landX)로 합류한다. 그림 전용, 판정과 무관.
function battedShown(s: Swing) {
  return s.outcome === 'hbp' || s.outcome === 'foul' || s.outcome === 'groundout' || s.outcome === 'popout' || s.outcome === 'flyout' || isHit(s.outcome)
}

export function ballView(a: Anim, now: number, ball: Pt): Pt {
  const res = a.result
  if (res && a.resultStart !== null && now >= a.resultStart && battedShown(res)) {
    const r = Math.min(1, (now - a.resultStart) / resultDuration(res))
    return lerp(toBatter(ball), ball, ease(Math.min(1, r * 2.5)))
  }
  const p = Math.max(0, Math.min(1, (now - a.start - windupOf(a)) / travelMs(a.pitch.speed)))
  return lerp(toPitcher(ball), toBatter(ball), p)
}

export const lerp = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
export const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))

// 졸라맨 투수 자세 — 다리 들기(0~40%) → 내딛으며 팔 뒤로(40~85%) → 릴리스(85~100%) → 팔로스루
export function pitcherPose(a: Anim | null, now: number) {
  const hipBase = { x: PX, y: 104 }
  const glove = { x: PX - 6, y: 90 }
  const pose = {
    head: { x: PX, y: 71 }, shoulder: { x: PX, y: 80 }, hip: hipBase,
    front: { x: PX - 7, y: GROUND_Y }, back: { x: PX + 8, y: GROUND_Y },
    hand: glove, gloveHand: { x: PX - 9, y: 92 }, holding: false,
  }
  if (!a) return pose
  const t = now - a.start
  const w = windupOf(a)
  const slot = slotOf(a.pitch)
  const lift = { x: PX - 9, y: 114 }
  const stride = { x: PX - 26, y: GROUND_Y }
  if (t < w) {
    const u = t / w
    pose.holding = true
    if (u < 0.4) {
      pose.front = lerp(pose.front, lift, ease(u / 0.4))
    } else if (u < 0.85) {
      const k = ease((u - 0.4) / 0.45)
      pose.front = lerp(lift, stride, k)
      pose.hand = lerp(glove, COCK[slot], k)
      pose.shoulder = lerp(pose.shoulder, { x: PX - 5, y: 81 }, k)
      pose.head = lerp(pose.head, { x: PX - 5, y: 72 }, k)
      pose.hip = lerp(hipBase, { x: PX - 5, y: 105 }, k)
    } else {
      const k = ease((u - 0.85) / 0.15)
      pose.front = stride
      pose.hand = lerp(COCK[slot], RELEASE[slot], k)
      pose.shoulder = lerp({ x: PX - 5, y: 81 }, { x: PX - 11, y: 83 }, k)
      pose.head = lerp({ x: PX - 5, y: 72 }, { x: PX - 12, y: 74 }, k)
      pose.hip = lerp({ x: PX - 5, y: 105 }, { x: PX - 9, y: 106 }, k)
    }
    return pose
  }
  // 팔로스루
  const f = ease(Math.min(1, (t - w) / FOLLOW_MS))
  const finish = slot === 'low' ? { x: PX - 26, y: 96 } : { x: PX - 22, y: 120 }
  pose.front = stride
  pose.back = lerp(pose.back, { x: PX + 2, y: GROUND_Y - 4 }, f)
  pose.hand = lerp(RELEASE[slot], finish, f)
  pose.shoulder = { x: PX - 13, y: 85 }
  pose.head = { x: PX - 14, y: 76 }
  pose.hip = { x: PX - 9, y: 106 }
  pose.gloveHand = { x: PX - 4, y: 96 }
  return pose
}

export function knee(hip: Pt, foot: Pt, bend: number): Pt {
  const straight = { x: (hip.x + foot.x) / 2 + bend, y: (hip.y + foot.y) / 2 - 2 }
  const lifted = Math.max(0, Math.min(1, (GROUND_Y - foot.y) / 18)) // 발이 뜬 정도
  return lerp(straight, { x: hip.x - 13, y: hip.y - 2 }, lifted)
}

export function swung(s: Swing | null) {
  return !!s && s.offset !== null && s.outcome !== 'hbp'
}

export function batAngle(a: Anim | null, now: number) {
  const READY = -125
  const FOLLOW = 30
  if (!a?.result || a.resultStart === null || !swung(a.result)) return READY
  const t = now - a.resultStart
  if (t < 0) return READY
  return READY + (FOLLOW - READY) * Math.min(1, t / 120)
}

export function offsetHint(s: Swing) {
  if (s.offset === null || s.outcome === 'hbp') return ''
  if (Math.abs(s.offset) < 12) return '완벽한 타이밍'
  return `${(Math.abs(s.offset) / 1000).toFixed(2)}초 ${s.offset > 0 ? '늦음' : '빠름'}`
}

export function CountDots({ label, n, max, color }: { label: string; n: number; max: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="text-[10px] font-bold text-[#5B6472] w-2.5">{label}</span>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="w-2 h-2 rounded-full border" style={{ background: i < n ? color : 'transparent', borderColor: i < n ? color : '#C4CBD2' }} />
      ))}
    </span>
  )
}

export function Diamond({ bases }: { bases: GameState['bases'] }) {
  const cell = (on: boolean, x: number, y: number) => (
    <rect x={x} y={y} width="7" height="7" transform={`rotate(45 ${x + 3.5} ${y + 3.5})`} fill={on ? '#F59E0B' : '#FFFFFF'} stroke={on ? '#B45309' : '#C4CBD2'} strokeWidth="1" />
  )
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" aria-label="주자">
      {cell(bases[1], 11.5, 1)}
      {cell(bases[2], 3, 9.5)}
      {cell(bases[0], 20, 9.5)}
    </svg>
  )
}

export type MemberLite = { name: string; nickname: string | null; color_key: number; avatar_url: string | null }

// 투구 애니메이션 루프. selfResolve인 공(내가 타자)은 도착 후 일정 시간 안에 안 치면 onDeadline을 부른다(루킹/볼/사구 판정).
// 관전·투수 화면의 공은 결과가 DB로 도착할 때까지 기다린다(너무 오래면 루프만 멈춤).
export function usePitchAnimation(onDeadline: (a: Anim, t: number) => void) {
  const [anim, setAnimState] = useState<Anim | null>(null)
  const animRef = useRef<Anim | null>(null)
  const [now, setNow] = useState(0)
  const cbRef = useRef(onDeadline)
  useEffect(() => { cbRef.current = onDeadline })

  const setAnim = useCallback((next: Anim | null) => {
    animRef.current = next
    setAnimState(next)
  }, [])

  useEffect(() => {
    if (!anim) return
    let raf = 0
    const tick = () => {
      const t = performance.now()
      setNow(t)
      const a = animRef.current
      if (!a) return
      const grace = a.pitch.type === 'hbp' ? 0 : LOOKING_GRACE_MS
      if (!a.result && a.selfResolve && t > arrivalOf(a) + grace) cbRef.current(a, t)
      const cur = animRef.current
      if (cur?.result && cur.resultStart !== null && t > cur.resultStart + resultDuration(cur.result)) return
      if (cur && !cur.result && t > arrivalOf(cur) + 20000) return // 결과가 끝내 안 오면 루프만 멈춘다
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [anim])

  const animEnd = anim?.result && anim.resultStart !== null ? anim.resultStart + resultDuration(anim.result) : null
  const animActive = !!anim && (!anim.result || animEnd === null || now < animEnd)
  return { anim, animRef, now, setAnim, animActive }
}

export function PaLog({ results }: { results: GameState['results'] }) {
  return (
    <ul className="mt-1 ml-auto max-w-[118px] flex flex-wrap justify-end gap-x-1.5 text-[9.5px] leading-[12px] tabular-nums">
      {/* 최근 4타석만, 좁은 폭에서 줄바꿈 — 세로로 길면 (확대된) 투수와, 가로로 길면 자막과 겹친다 */}
      {results.slice(-4).map((r, j, arr) => {
        const i = results.length - arr.length + j
        const color = !r ? 'text-[#C4CBD2]' : r.kind === 'HR' ? 'text-[#DC2626] font-semibold' : isOut(r.kind) ? 'text-[#9AA5B1]' : 'text-[#15803D]'
        return <li key={i} className={`whitespace-nowrap ${color}`}>{i + 1} {r ? paLabel(r) : '·'}</li>
      })}
    </ul>
  )
}

// 야구장 배경(그림 전용) — 하늘은 위젯 배경, 여기선 조명탑·관중석·전광판·외야 펜스·잔디·내야 흙.
// 낮은 채도 + 흐림으로 플레이(캐릭터·공·거리선)보다 확실히 뒤로 민다.
function StadiumBackground({ uid, logo }: { uid: string; logo?: string | null }) {
  const top = VIEW_TOP
  const stands = 'M0 4 L150 18 L410 18 L560 4 L560 56 L0 56 Z'
  return (
    <g aria-hidden pointerEvents="none">
      <defs>
        <filter id={`${uid}-soft`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.1" /></filter>
        <linearGradient id={`${uid}-grass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C6DBBA" />
          <stop offset="1" stopColor="#DAE8D0" />
        </linearGradient>
        <linearGradient id={`${uid}-stand`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A9B7C6" />
          <stop offset="1" stopColor="#8FA0B2" />
        </linearGradient>
        <pattern id={`${uid}-crowd`} width="6" height="5" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1" fill="#F4F1EA" />
          <circle cx="4.5" cy="3.8" r="1" fill="#6F8094" />
        </pattern>
      </defs>
      <g filter={`url(#${uid}-soft)`} opacity="0.34">
        {/* 조명탑 */}
        {[70, 490].map(x => (
          <g key={x}>
            <line x1={x} y1={top + 8} x2={x} y2={48} stroke="#7D8B99" strokeWidth="2" />
            <rect x={x - 14} y={top + 3} width="28" height="9" rx="1.5" fill="#E8EDF2" stroke="#7D8B99" strokeWidth="1" />
          </g>
        ))}
        {/* 관중석 (양옆이 높은 계단식) */}
        <path d={stands} fill={`url(#${uid}-stand)`} />
        <path d={stands} fill={`url(#${uid}-crowd)`} opacity="0.55" />
        {/* 전광판 */}
        <rect x="198" y={top + 12} width="164" height="62" rx="3" fill="#465566" />
        <rect x="204" y={top + 18} width="152" height="50" rx="2" fill="#5A6B7D" />
        <rect x="270" y={top + 74} width="20" height="14" fill="#465566" />
        {/* 외야 펜스 */}
        <rect x="0" y="54" width={VIEW_W} height="9" fill="#5E7D6A" />
        <line x1="0" y1="54" x2={VIEW_W} y2="54" stroke="#D9C77A" strokeWidth="1.2" />
      </g>
      {/* 전광판 구단 로고 — 흐림 필터 밖에서 아주 옅게 */}
      {logo && <image href={logo} x="245" y={top + 19} width="70" height="48" preserveAspectRatio="xMidYMid meet" opacity="0.22" />}
      {/* 외야 잔디 (잔디 깎은 줄무늬) */}
      <rect x="0" y="63" width={VIEW_W} height={VIEW_H - 63} fill={`url(#${uid}-grass)`} opacity="0.85" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={i * 80 + 40} y="63" width="40" height={VIEW_H - 63} fill="#FFFFFF" opacity="0.12" />
      ))}
      {/* 내야 흙 (홈 쪽 부채꼴) + 투수 마운드 흙 */}
      <path d={`M0 ${VIEW_H} L0 110 Q120 102 210 122 Q250 132 262 ${VIEW_H} Z`} fill="#E6D3B8" opacity="0.6" />
      <ellipse cx={PX - 6} cy={GROUND_Y + 1} rx="46" ry="9" fill="#E3CCAE" opacity="0.75" />
    </g>
  )
}

export function FieldScene(props: {
  anim: Anim | null
  now: number
  st: GameState
  prevLandings: Swing[]
  batter: MemberLite | null
  batterGear?: Equip
  pitcherGear?: Equip
  pitcherName?: string
  idleCaption?: string
  rightTop?: ReactNode
  scoreboardLogo?: string | null // 전광판에 흐리게 띄울 구단 로고(배경 로고 설정)
  dragProps?: Record<string, (e: React.PointerEvent<HTMLDivElement>) => void>
}) {
  const { anim, now, st, prevLandings, batter } = props
  const rawBall = anim ? ballPos(anim, now) : null
  const ball = anim && rawBall ? ballView(anim, now, rawBall) : null
  const uid = useId().replace(/:/g, '')
  const angle = (batAngle(anim, now) * Math.PI) / 180
  const windup = !!anim && now - anim.start < windupOf(anim)
  const animEnd = anim?.result && anim.resultStart !== null ? anim.resultStart + resultDuration(anim.result) : null
  const landed = anim?.result && isHit(anim.result.outcome) && animEnd !== null && now >= animEnd ? anim.result : null
  const resultShown = anim?.result && anim.resultStart !== null && now >= anim.resultStart ? anim.result : null
  const palette = DOODLE_PALETTE[(batter?.color_key ?? 0) % 8]
  const pp = pitcherPose(anim, now)
  const bCap = teamOf(props.batterGear?.cap)
  const bUni = teamOf(props.batterGear?.uniform)
  const bBat = teamOf(props.batterGear?.bat)
  const pCap = teamOf(props.pitcherGear?.cap)
  const pUni = teamOf(props.pitcherGear?.uniform)

  // 구종·구속은 친 뒤에만 공개 — 투구폼과 궤적만 보고 읽어야 한다.
  let caption = ''
  let subCaption = ''
  if (resultShown?.outcome === 'flyout') {
    caption = `잡혔다! ${resultShown.distance}m 뜬공 아웃`
    const hint = offsetHint(resultShown)
    subCaption = `${PITCH_TYPES[resultShown.type].label} ${resultShown.speed}km/h${hint ? ` · ${hint}` : ''}`
  } else if (resultShown) {
    caption = anim?.paEnded
      ? (isHit(resultShown.outcome) ? `${anim.paEnded} ${resultShown.distance}m` : anim.paEnded)
      : outcomeLabel(resultShown)
    const hint = offsetHint(resultShown)
    subCaption = `${PITCH_TYPES[resultShown.type].label} ${resultShown.speed}km/h${hint ? ` · ${hint}` : ''}`
  } else if (anim) {
    caption = windup ? '투구 준비…' : ''
  } else {
    caption = props.idleCaption ?? ''
  }
  const bigCaption = !!resultShown && (!!anim?.paEnded || isHit(resultShown.outcome))

  const tickText = { textAnchor: 'middle' as const, fontSize: 9, paintOrder: 'stroke' as const, stroke: '#FFFFFF', strokeWidth: 2.5, strokeOpacity: 0.85, strokeLinejoin: 'round' as const }
  const hudPanel = 'absolute top-1 z-20 pointer-events-none rounded-lg bg-white/65 backdrop-blur-[2px] border border-white/80'

  return (
    <div className="cursor-move touch-none relative" {...props.dragProps}>
      {/* HUD — 필드 그림과 독립된 위 레이어 */}
      <div className={`${hudPanel} left-2.5 flex items-center gap-2 px-1.5 py-1`}>
        <Diamond bases={st.bases} />
        <span className="flex flex-col gap-0.5">
          <CountDots label="S" n={st.strikes} max={STRIKES_FOR_OUT - 1} color="#F59E0B" />
          <CountDots label="B" n={st.balls} max={BALLS_FOR_WALK - 1} color="#16A34A" />
          <CountDots label="O" n={st.outs} max={OUTS_PER_INNING} color="#DC2626" />
        </span>
      </div>
      <div className={`${hudPanel} right-2.5 text-right px-2 py-1`}>
        {props.rightTop ?? (
          <>
            <p className="leading-none tabular-nums whitespace-nowrap">
              <span className="text-[18px] font-bold text-[#1F2933]">{st.runs}</span><span className="text-[10.5px] font-medium text-[#5B6472] ml-0.5">점</span>
              <span className="text-[10.5px] text-[#5B6472] ml-2">{st.finished ? st.pa : st.pa + 1}번째 타석</span>
            </p>
            {st.results.length > 0 && <PaLog results={st.results} />}
          </>
        )}
      </div>

      <svg viewBox={`0 ${VIEW_TOP} ${VIEW_W} ${VIEW_H - VIEW_TOP}`} className="relative z-0 w-full h-auto block" role="img" aria-label="야구 필드">
        <StadiumBackground uid={uid} logo={props.scoreboardLogo} />

        {/* 거리 기준선 — 잔디 위에서도 보이게 흰 분필선 + 옅은 초록 그림자 */}
        <line x1="6" y1={GROUND_Y + 1} x2={VIEW_W - 6} y2={GROUND_Y + 1} stroke="#6E9B62" strokeOpacity="0.35" strokeWidth="4" strokeLinecap="round" />
        <line x1="6" y1={GROUND_Y} x2={VIEW_W - 6} y2={GROUND_Y} stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
        {[30, 60, 90, FIELD_M].map(m => (
          <g key={m}>
            <line x1={landX(m)} y1={GROUND_Y - 2} x2={landX(m)} y2={GROUND_Y + 4} stroke="#FFFFFF" strokeWidth="1.4" />
            <text x={landX(m)} y={GROUND_Y + 14} {...tickText} fill="#4F6B4A">{m}</text>
          </g>
        ))}
        <rect x={landX(FENCE_M) - 2} y={GROUND_Y - 18} width="4" height="18" rx="1" fill="#1F6B3A" />
        <text x={landX(FENCE_M)} y={GROUND_Y - 22} {...tickText} fontWeight="800" fill="#1F6B3A">HR</text>
        <text x={landX(FENCE_M)} y={GROUND_Y + 14} {...tickText} fontWeight="700" fill="#1F6B3A">{FENCE_M}</text>

        {prevLandings.map((s, i) => (
          <g key={i}>
            <circle cx={landX(s.distance)} cy={GROUND_Y - 2} r="2.5" fill="#FFFFFF" stroke="#7A8491" />
            <text x={landX(s.distance)} y={GROUND_Y - 7} {...tickText} fontSize="8" fill="#5B6472">{s.distance}</text>
          </g>
        ))}

        {/* 졸라맨 투수 (멀리, 마운드 위) — 투구폼(팔 각도)이 구종마다 달라진다 */}
        <g transform={scaleTransform(PITCHER_ANCHOR, PITCHER_SCALE)}>
          <rect x={PX - 5} y={GROUND_Y - 1} width="10" height="2" rx="0.5" fill="#FFFFFF" opacity="0.9" />
          <g stroke="#374151" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <polyline points={`${pp.hip.x},${pp.hip.y} ${knee(pp.hip, pp.back, 3).x},${knee(pp.hip, pp.back, 3).y} ${pp.back.x},${pp.back.y}`} strokeWidth="3" />
            <polyline points={`${pp.hip.x},${pp.hip.y} ${knee(pp.hip, pp.front, -4).x},${knee(pp.hip, pp.front, -4).y} ${pp.front.x},${pp.front.y}`} strokeWidth="3" />
            {!pUni && <line x1={pp.shoulder.x} y1={pp.shoulder.y} x2={pp.hip.x} y2={pp.hip.y} strokeWidth="3" />}
          </g>
          {pUni && <JerseyShape a={pp.shoulder} b={pp.hip} wTop={10} wBottom={8} team={pUni} />}
          <g stroke="#374151" strokeLinecap="round" fill="none">
            <line x1={pp.shoulder.x} y1={pp.shoulder.y} x2={pp.gloveHand.x} y2={pp.gloveHand.y} strokeWidth="2.5" />
            <line x1={pp.shoulder.x} y1={pp.shoulder.y} x2={pp.hand.x} y2={pp.hand.y} strokeWidth="2.5" />
          </g>
          <circle cx={pp.gloveHand.x} cy={pp.gloveHand.y} r="3" fill="#8B5A2B" />
          <circle cx={pp.head.x} cy={pp.head.y} r="7.5" fill="#E5E7EB" stroke="#374151" strokeWidth="1.2" />
          <CapShape cx={pp.head.x} cy={pp.head.y} r={7.5} facing={-1} team={pCap} fallback="#B91C1C" />
          {pp.holding && <circle cx={pp.hand.x} cy={pp.hand.y} r="3" fill="#FFFFFF" stroke="#C0392B" strokeWidth="1" />}
        </g>
        {props.pitcherName && <text x={PX} y={GROUND_Y + 15} {...tickText} fontSize="9" fontWeight="600" fill="#3A4249">{props.pitcherName}</text>}

        {/* 타석: 타자석 분필선·홈플레이트·스트라이크존 + 졸라맨 타자 (같은 배율) */}
        <g transform={scaleTransform(BATTER_ANCHOR, BATTER_SCALE)}>
          <ellipse cx={PLATE_X - 8} cy={GROUND_Y + 1} rx="34" ry="5" fill="#DCC6A6" opacity="0.7" />
          <path d={`M${PLATE_X - 31} ${GROUND_Y + 4} L${PLATE_X - 27} ${GROUND_Y - 3} L${PLATE_X - 9} ${GROUND_Y - 3} L${PLATE_X - 11} ${GROUND_Y + 4} Z`} fill="none" stroke="#FFFFFF" strokeOpacity="0.85" strokeWidth="0.9" />
          <path d={`M${PLATE_X + 9} ${GROUND_Y + 4} L${PLATE_X + 9} ${GROUND_Y - 3} L${PLATE_X + 25} ${GROUND_Y - 3} L${PLATE_X + 29} ${GROUND_Y + 4}`} fill="none" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="0.9" />
          <rect x={ZONE.x} y={ZONE.y} width={ZONE.w} height={ZONE.h} fill="#4C7FE0" fillOpacity="0.06" stroke="#4C7FE0" strokeOpacity="0.4" strokeDasharray="2 2" strokeWidth="0.8" />
          <polygon points={`${PLATE_X - 6},${GROUND_Y} ${PLATE_X + 6},${GROUND_Y} ${PLATE_X + 6},${GROUND_Y - 2} ${PLATE_X},${GROUND_Y - 4} ${PLATE_X - 6},${GROUND_Y - 2}`} fill="#FFFFFF" stroke="#B8B2A7" strokeWidth="0.8" />
          {!bUni && <line x1="40" y1="84" x2="40" y2="110" stroke="#374151" strokeWidth="3" strokeLinecap="round" />}
          <line x1="40" y1="110" x2="33" y2={GROUND_Y} stroke="#374151" strokeWidth="3" strokeLinecap="round" />
          <line x1="40" y1="110" x2="48" y2={GROUND_Y} stroke="#374151" strokeWidth="3" strokeLinecap="round" />
          {bUni && <JerseyShape a={{ x: 40, y: 84 }} b={{ x: 40, y: 110 }} wTop={12} wBottom={10} team={bUni} />}
          {/* 방망이는 유니폼 위에 — 넓은 몸통에 가려지지 않게 */}
          <BatShape hands={HANDS} angleRad={angle} length={28} team={bBat} />
          <line x1="40" y1="90" x2={HANDS.x} y2={HANDS.y} stroke="#374151" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="40" cy="75" r="8.5" fill={palette.bg} stroke={palette.fg} strokeWidth="1.2" />
          <CapShape cx={40} cy={75} r={8.5} facing={1} team={bCap} fallback="#1F4E8C" />
        </g>
        {batter && <text x="40" y={GROUND_Y + 15} {...tickText} fontSize="9" fontWeight="600" fill="#3A4249">{displayName(batter)}</text>}

        {ball && <circle cx={ball.x} cy={ball.y} r="4.2" fill="#FFFFFF" stroke="#C0392B" strokeWidth="1.1" />}

        {landed && (
          <g>
            <line x1={landX(landed.distance)} y1={GROUND_Y} x2={landX(landed.distance)} y2={GROUND_Y - 16} stroke="#DC2626" strokeWidth="1.2" />
            <polygon points={`${landX(landed.distance)},${GROUND_Y - 16} ${landX(landed.distance) + 9},${GROUND_Y - 13} ${landX(landed.distance)},${GROUND_Y - 10}`} fill="#DC2626" />
          </g>
        )}

        {/* 안내·결과 자막 (중앙 상단, HUD 줄 바로 아래) — 흰 테두리로 배경 위에서도 읽히게 */}
        {caption && (
          <text x={VIEW_W / 2} y="25" textAnchor="middle" fontSize={bigCaption ? 18 : 12.5} fontWeight="700" paintOrder="stroke" stroke="#FFFFFF" strokeWidth="3.5" strokeOpacity="0.9" strokeLinejoin="round" fill={resultShown && resultShown.distance >= FENCE_M ? '#DC2626' : '#1F2933'}>{caption}</text>
        )}
        {subCaption && <text x={VIEW_W / 2} y="40" textAnchor="middle" fontSize="10" paintOrder="stroke" stroke="#FFFFFF" strokeWidth="3" strokeOpacity="0.9" strokeLinejoin="round" fill="#3A4249">{subCaption}</text>}
      </svg>
    </div>
  )
}

// 주 액션 버튼 — 투구(파랑)·스윙(빨강, 조금 더 크게)
export const PITCH_BTN = 'inline-flex items-center justify-center gap-1 h-10 rounded-[18px] px-4 text-[12.5px] font-bold text-white whitespace-nowrap bg-[#4C7FE0] hover:bg-[#3A6CC8] active:bg-[#335FB3] active:translate-y-px disabled:opacity-40 disabled:active:translate-y-0 shadow-[0_2px_6px_rgba(76,127,224,0.28)] transition-colors'
export const SWING_BTN = 'inline-flex items-center justify-center gap-1.5 h-11 rounded-[20px] px-6 text-[14px] font-bold text-white whitespace-nowrap bg-[#DC2626] hover:bg-[#C42020] active:bg-[#A91B1B] active:translate-y-px shadow-[0_2px_8px_rgba(220,38,38,0.3)] transition-colors'

// 하단 컨트롤바 — 왼쪽 "장비 바꾸기"(equip 없으면 자리만 비움), 가운데 주 액션. wide면 가운데를 전체 폭으로.
export function GameControls({ equip, wide, children }: { equip?: ReactNode; wide?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative z-10 mx-2 mb-2 rounded-xl bg-white/80 backdrop-blur-sm border border-white shadow-[0_1px_4px_rgba(16,24,40,0.08)] px-2.5 py-2">
      {wide ? children : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 min-h-[44px]">
          <div className="min-w-0">
            {equip && (
              <button onClick={() => setOpen(v => !v)} className="text-[10.5px] text-[#5B6472] hover:text-[#1F2933] whitespace-nowrap">
                👕 장비 바꾸기 {open ? '▲' : '▼'}
              </button>
            )}
          </div>
          <div className="flex justify-center">{children}</div>
          <div />
        </div>
      )}
      {equip && open && <div className="mt-2 bg-white/80 border border-[#E5E8EB] rounded-lg px-2 py-1.5">{equip}</div>}
    </div>
  )
}
