'use client'

// 방송 중계 시점 — 타격 뒤 장면(타구·수비·주루·홈런·벤치 클리어링)을 홈플레이트 뒤 높은 카메라에서 본 원근으로 그린다.
// 판정(judgeSwing·simulateGame)은 이미 끝났다. 확정된 결과(Swing)를 실제 경기장 좌표(m)의 장면으로 바꿔 보여줄 뿐이다.
// 결과 → 장면 매핑은 getPlaySequence 한 곳, 장면은 "결과 시작 후 경과 시간(t)"의 순수 함수(타이머 없음 — 기존 rAF 루프가 시계).
// 같은 결과는 모든 화면(대결 관전자 포함)에서 같은 장면이 나오도록 결과값 해시로 수비수·코스·스타일을 고른다.

import type { ReactNode } from 'react'
import { CapShape } from '@/components/baseball/gear'
import { teamOf, type Equip } from '@/lib/baseballGear'
import { DOUBLE_M, FENCE_M, isHit, type GameState, type Swing } from '@/lib/baseball'

export type GameMode = 'solo' | 'duel'
type Pt = { x: number; y: number }
export type V3 = { x: number; y: number; z: number } // x: 1루 쪽 +, y: 높이, z: 홈 → 중견수 (m)
const V = (x: number, y: number, z: number): V3 => ({ x, y, z })
const mix = (a: V3, b: V3, k: number): V3 => V(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k)
const add = (a: V3, b: V3): V3 => V(a.x + b.x, a.y + b.y, a.z + b.z)
const ground = (p: V3): V3 => V(p.x, 0, p.z)
const gdist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z)
const clamp01 = (k: number) => Math.max(0, Math.min(1, k))
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))
const lerp2 = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
const polar = (d: number, deg: number, y = 0) => V(d * Math.sin((deg * Math.PI) / 180), y, d * Math.cos((deg * Math.PI) / 180))
const angleOf = (p: V3) => (Math.atan2(p.x, p.z) * 180) / Math.PI
const toward = (from: V3, to: V3, m: number): V3 => { const d = gdist(from, to) || 1; return V(from.x + ((to.x - from.x) / d) * m, from.y, from.z + ((to.z - from.z) / d) * m) }

// FieldScene과 같은 viewBox
const VIEW_W = 560
const VIEW_TOP = -58
const VIEW_H = 150

// ── 카메라 (홈플레이트 뒤 높은 곳 → 외야 정면) ──
const CAM = { pos: V(0, 22, -30), look: V(0, 0, 55), f: 300, cx: VIEW_W / 2, cy: 20 }
const CAM_F = (() => { const d = V(CAM.look.x - CAM.pos.x, CAM.look.y - CAM.pos.y, CAM.look.z - CAM.pos.z); const n = Math.hypot(d.x, d.y, d.z); return V(d.x / n, d.y / n, d.z / n) })()
const CAM_R = V(1, 0, 0)
const CAM_U = V(CAM_F.y * CAM_R.z - CAM_F.z * CAM_R.y, CAM_F.z * CAM_R.x - CAM_F.x * CAM_R.z, CAM_F.x * CAM_R.y - CAM_F.y * CAM_R.x)
export function project(p: V3): Pt & { depth: number } {
  const d = V(p.x - CAM.pos.x, p.y - CAM.pos.y, p.z - CAM.pos.z)
  const zc = Math.max(0.5, d.x * CAM_F.x + d.y * CAM_F.y + d.z * CAM_F.z)
  const xc = d.x * CAM_R.x + d.y * CAM_R.y + d.z * CAM_R.z
  const yc = d.x * CAM_U.x + d.y * CAM_U.y + d.z * CAM_U.z
  return { x: CAM.cx + (CAM.f * xc) / zc, y: CAM.cy - (CAM.f * yc) / zc, depth: zc }
}
const P2 = (p: V3): Pt => { const q = project(p); return { x: q.x, y: q.y } }
const pts = (list: V3[]) => list.map(p => { const q = project(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}` }).join(' ')
// 사람 크기: 원근 그대로면 외야수가 너무 작아 읽히지 않아 살짝 과장 + 최소 크기
const figScale = (depth: number) => Math.max(12, Math.min(40, ((CAM.f * 1.8) / depth) * 1.35)) / 26

// ── 경기장 ──
export const BASES3 = { home: V(0, 0, 0), first: V(19.4, 0, 19.4), second: V(0, 0, 38.8), third: V(-19.4, 0, 19.4) }
const BASE_PATH = [BASES3.first, BASES3.second, BASES3.third, BASES3.home]
const MOUND = V(0, 0, 18.4)
export type FielderKey = '1B' | '2B' | 'SS' | '3B' | 'LF' | 'CF' | 'RF'
type Infielder = '1B' | '2B' | 'SS' | '3B'
export const FIELD_POS: Record<FielderKey, V3> = {
  '1B': V(23, 0, 27), '2B': V(12, 0, 44), SS: V(-12, 0, 44), '3B': V(-23, 0, 27),
  LF: V(-33, 0, 84), CF: V(0, 0, 100), RF: V(33, 0, 84),
}
const FIELDER_KEYS = Object.keys(FIELD_POS) as FielderKey[]
const POS_LABEL: Record<FielderKey, string> = { '1B': '1루수', '2B': '2루수', SS: '유격수', '3B': '3루수', LF: '좌익수', CF: '중견수', RF: '우익수' }
const BAG1 = V(19.4 - 0.6, 0, 19.4 + 0.8) // 1루수가 베이스를 밟고 받는 자리
const BAG2 = V(0.8, 0, 38.8 - 0.6)

export type HitStyle = 'GROUNDER_THROUGH' | 'LINER' | 'BLOOP' | 'GAP' | 'DOWN_LINE' | 'OFF_WALL'
export type PlaySequence =
  | { type: 'GROUND_OUT'; fielder: Infielder; dive: boolean }
  | { type: 'DOUBLE_PLAY'; fielder: 'SS' | '2B' | '3B' } // 판정이 병살(Swing.dp)일 때만
  | { type: 'HIT'; style: HitStyle; angle: number; diver: FielderKey | null; chasers: FielderKey[]; double: boolean }
  | { type: 'FLY_OUT'; fielder: FielderKey; angle: number; style: 'CAMPED' | 'RUNNING' | 'WALL_LEAP'; popup: boolean }
  | { type: 'HOME_RUN'; angle: number; chaser: FielderKey }
  | { type: 'BRAWL' } // 대결 모드 사구 → 벤치 클리어링
  | { type: 'NONE' }  // 인플레이가 아닌 결과(파울·삼진·볼넷 등) — 포수 시점에서 끝난다

export const CALL_MS = 600
const BOARD = { x: 222, y: VIEW_TOP + 1, w: 116, h: 20 } // 화면 맨 위 가운데 전광판(고정)
export const BROADCAST_FADE_MS = 250

function hashSwing(s: Swing) {
  const str = `${s.type}|${s.speed}|${s.distance}|${s.offset ?? 'n'}|${s.outcome}|${s.pid ?? ''}`
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const pick = <T,>(arr: readonly T[], h: number, salt = 0) => arr[Math.floor(h / 7 ** salt) % arr.length]
const nearest = (keys: FielderKey[], angle: number) => keys.reduce((a, b) => (Math.abs(angleOf(FIELD_POS[b]) - angle) < Math.abs(angleOf(FIELD_POS[a]) - angle) ? b : a))
const OUTFIELD: FielderKey[] = ['LF', 'CF', 'RF']
const INFIELD: FielderKey[] = ['3B', 'SS', '2B', '1B']

export function getPlaySequence(s: Swing, mode: GameMode = 'solo'): PlaySequence {
  if (s.outcome === 'hbp' && mode === 'duel') return { type: 'BRAWL' }
  const h = hashSwing(s)
  switch (s.outcome) {
    case 'groundout': {
      if (s.dp) return { type: 'DOUBLE_PLAY', fielder: pick(['SS', 'SS', '2B', '3B'] as const, h) }
      const fielder = pick(['SS', 'SS', '2B', '2B', '3B', '1B'] as const, h)
      return { type: 'GROUND_OUT', fielder, dive: (fielder === 'SS' || fielder === '3B') && h % 10 < 3 }
    }
    case 'popout': {
      const fielder = pick(['SS', '2B', '3B', '1B'] as const, h)
      return { type: 'FLY_OUT', fielder, angle: angleOf(FIELD_POS[fielder]), style: 'CAMPED', popup: true }
    }
    case 'flyout': {
      const angle = pick([-30, -14, 0, 14, 30] as const, h)
      const style = s.distance >= 108 ? 'WALL_LEAP' : s.distance < 70 || h % 3 === 0 ? 'RUNNING' : 'CAMPED'
      return { type: 'FLY_OUT', fielder: nearest(OUTFIELD, angle), angle, style, popup: false }
    }
    default: {
      if (!isHit(s.outcome)) return { type: 'NONE' }
      if (s.distance >= FENCE_M) {
        const angle = pick([-24, -6, 8, 24] as const, h)
        return { type: 'HOME_RUN', angle, chaser: nearest(OUTFIELD, angle) }
      }
      if (s.distance >= DOUBLE_M) { // 2루타: 좌·우중간을 가르거나 선상 / 펜스 직격
        const angle = pick([-18, 18, -18, 18, -40, 40] as const, h)
        const line = Math.abs(angle) > 30
        const style: HitStyle = !line && s.distance >= 105 && h % 3 === 0 ? 'OFF_WALL' : line ? 'DOWN_LINE' : 'GAP'
        const chasers: FielderKey[] = line ? [angle < 0 ? 'LF' : 'RF'] : angle < 0 ? ['LF', 'CF'] : ['CF', 'RF']
        return { type: 'HIT', style, angle, diver: null, chasers, double: true }
      }
      if (s.distance < 45) { // 내야를 빠지는 땅볼 안타 — 내야수가 몸을 날려 보지만 못 잡는다
        const hole = pick([{ angle: -30, diver: '3B' }, { angle: -3, diver: 'SS' }, { angle: 3, diver: '2B' }, { angle: 29, diver: '2B' }] as const, h)
        return { type: 'HIT', style: 'GROUNDER_THROUGH', angle: hole.angle, diver: hole.diver, chasers: [nearest(OUTFIELD, hole.angle)], double: false }
      }
      const angle = pick([-26, -9, 9, 26] as const, h)
      return { type: 'HIT', style: h % 3 === 0 ? 'BLOOP' : 'LINER', angle, diver: nearest(INFIELD, angle), chasers: [nearest(OUTFIELD, angle)], double: false }
    }
  }
}

export const isBroadcast = (seq: PlaySequence | null) => !!seq && seq.type !== 'NONE'

// ── 장면 프레임 ──
export type Pose = {
  active: number          // 0 = 평소(흐리게), 1 = 지금 플레이 중(또렷 + 포지션 이름표)
  run: number | null      // 달리기 위상(라디안), null = 서 있음
  lean: number            // 몸 기울기(도, 화면 기준 +면 오른쪽) — 다이빙은 크게
  glove: Pt               // 글러브 손(발 기준 로컬, 키 26 기준)
  hand: Pt                // 던지는 손
  jump: number            // 공중으로 뜬 높이(m)
  pop: number             // 포구 순간 살짝 커지는 정도
}
const READY_GLOVE = { x: -5, y: -13 }
const READY_HAND = { x: 5, y: -13 }
const LOW_GLOVE = { x: -3, y: -3 }
const UP_GLOVE = { x: -3, y: -31 }
const COCKED = { x: 7, y: -27 }
const THROWN = { x: -5, y: -14 }
const idle = (): Pose => ({ active: 0, run: null, lean: 0, glove: READY_GLOVE, hand: READY_HAND, jump: 0, pop: 0 })

export type Mover = { pos: V3; pose: Pose }
export type RunnerFig = { pos: V3; run: number | null; opacity: number; lean: number }
export type Burst = { at: V3 | Pt; k: number; size: number; color: string }
export type Call = { label: 'OUT!' | 'SAFE'; at: V3; opacity: number; scale: number }
export type WorldFrame = {
  fielders: Partial<Record<FielderKey, Mover>>
  ball: V3 | null
  ballScale: number
  trail: V3[]
  batter: { pos: V3; run: number | null; swing: number; bat: boolean; opacity: number; trot: boolean }
  batBall: boolean          // 홈에 내려놓은 방망이
  pitcher: { pos: V3; opacity: number; run: number | null }
  runners: RunnerFig[]
  calls: Call[]
  scores: number[]          // 홈인 +1 (진행도 k 0~1)
  bursts: Burst[]
  impact: Burst | null
  shake: Pt | null
  holdCaption: boolean
  board: { label: string; color: string; k: number; pulse: number } | null
  brawl: { k: number; t: number } | null
  brawlers: (RunnerFig & { side: 'batter' | 'pitcher' })[]
  marks: { at: V3; text: string; k: number; color: string }[]
  flyingCap: { at: V3; rot: number } | null
  landed: V3 | null         // 낙구 지점 깃발
}

const CONTACT_OF = (batsLeft: boolean) => V(batsLeft ? 0.35 : -0.35, 0.9, 0.6)
const BATTER_AT = (batsLeft: boolean) => V(batsLeft ? 0.95 : -0.95, 0, 0.1)

function blank(batsLeft: boolean): WorldFrame {
  return {
    fielders: {}, ball: null, ballScale: 1, trail: [],
    batter: { pos: BATTER_AT(batsLeft), run: null, swing: 1, bat: false, opacity: 1, trot: false }, batBall: true,
    pitcher: { pos: MOUND, opacity: 0.85, run: null },
    runners: [], calls: [], scores: [], bursts: [], impact: null, shake: null, holdCaption: false,
    board: null, brawl: null, brawlers: [], marks: [], flyingCap: null, landed: null,
  }
}

function call(label: Call['label'], at: V3, t: number, start: number): Call | null {
  if (t < start || t >= start + CALL_MS) return null
  const p = (t - start) / CALL_MS
  return { label, at, opacity: p < 0.2 ? p / 0.2 : p > 0.7 ? (1 - p) / 0.3 : 1, scale: p < 0.3 ? 0.85 + 0.2 * (p / 0.3) : p < 0.5 ? 1.05 - 0.05 * ((p - 0.3) / 0.2) : 1 }
}
function pushCall(f: WorldFrame, c: Call | null) { if (c) f.calls.push(c) }

function moveTo(m: Mover, from: V3, to: V3, t: number, t0: number, t1: number) {
  const k = ease(seg(t, t0, t1))
  m.pos = mix(from, to, k)
  if (t > t0 && t < t1) m.pose.run = t / 42
  return k
}
function rolling(a: V3, b: V3, k: number, hop: number, hops: number): V3 {
  const g = mix(ground(a), ground(b), k)
  return V(g.x, 0.12 + hop * Math.abs(Math.sin(hops * Math.PI * k)) * (1 - k), g.z)
}
function flying(a: V3, b: V3, apex: number, k: number): V3 {
  const p = mix(a, b, k)
  return V(p.x, p.y + 4 * apex * k * (1 - k), p.z)
}
function runPath(path: V3[], k: number): V3 {
  if (path.length === 1) return path[0]
  const n = path.length - 1
  const i = Math.min(n - 1, Math.floor(k * n))
  return mix(path[i], path[i + 1], k * n - i)
}
// 글러브를 화면에서 target 쪽으로 뻗는다(로컬 좌표)
function reachToward(from: V3, to: V3, len: number, lift = -18): Pt {
  const a = project(from), b = project(to)
  const dx = b.x - a.x, dy = b.y - a.y
  const n = Math.hypot(dx, dy) || 1
  return { x: (dx / n) * len, y: lift + (dy / n) * len * 0.5 }
}

const impactPower = (s: Swing) => (s.distance >= FENCE_M ? 1.7 : s.outcome === 'perfect' ? 1.3 : s.outcome === 'good' ? 1.05 : s.outcome === 'flyout' ? 0.95 : 0.7)

// ── 땅볼 아웃 ──
function groundOutTimes(seq: Extract<PlaySequence, { type: 'GROUND_OUT' }>) {
  const base = FIELD_POS[seq.fielder]
  const side = seq.fielder === '2B' || seq.fielder === '1B' ? 1 : -1
  const catchPt = seq.dive ? add(toward(base, BASES3.home, 1.5), V(side * 4, 0, 0)) : toward(base, BASES3.home, seq.fielder === '1B' ? 3 : 4)
  const ballMs = seq.dive ? 560 : 650
  if (seq.fielder === '1B') { // 1루수가 직접 잡아 베이스를 밟는다
    const step = ballMs + 450
    return { catchPt, ballMs, throwStart: step, firstCatch: step, out: step + 30, runnerEnd: step + 160, end: step + 30 + CALL_MS + 150 }
  }
  const throwStart = ballMs + (seq.dive ? 520 : 200)
  const throwMs = Math.max(260, Math.min(520, gdist(catchPt, BAG1) * 13))
  const firstCatch = throwStart + throwMs
  return { catchPt, ballMs, throwStart, firstCatch, out: firstCatch + 50, runnerEnd: Math.max(1500, firstCatch + 160), end: firstCatch + 50 + CALL_MS + 150 }
}

function groundOutFrame(seq: Extract<PlaySequence, { type: 'GROUND_OUT' }>, t: number, f: WorldFrame, contact: V3) {
  const T = groundOutTimes(seq)
  const key = seq.fielder
  f.holdCaption = t < T.out
  const m: Mover = { pos: FIELD_POS[key], pose: idle() }
  m.pose.active = 1
  moveTo(m, FIELD_POS[key], T.catchPt, t, seq.dive ? 180 : 260, T.ballMs)
  if (seq.dive) { // 몸을 날려 잡고 → 일어나 송구
    const side = key === '2B' ? 1 : -1
    const dv = ease(seg(t, T.ballMs - 220, T.ballMs - 40)) * (1 - ease(seg(t, T.ballMs + 220, T.ballMs + 460)))
    m.pose.lean = side * 72 * dv
    if (dv > 0) m.pose.run = null
    m.pose.glove = lerp2(READY_GLOVE, { x: side * -12, y: -10 }, dv)
  } else if (t < T.throwStart) {
    const low = ease(seg(t, T.ballMs - 150, T.ballMs))
    m.pose.glove = lerp2(READY_GLOVE, LOW_GLOVE, low)
    m.pose.hand = lerp2(READY_HAND, { x: 2, y: -3 }, low)
  }
  if (key === '1B') {
    if (t > T.ballMs) { moveTo(m, T.catchPt, V(BASES3.first.x + 0.4, 0, BASES3.first.z + 0.4), t, T.ballMs + 60, T.throwStart); m.pose.glove = { x: -4, y: -16 } }
  } else if (t >= T.throwStart - 60) {
    const w = ease(seg(t, T.throwStart - 60, T.throwStart + 110))
    m.pose.glove = lerp2(LOW_GLOVE, READY_GLOVE, w)
    m.pose.hand = w < 0.5 ? lerp2(READY_HAND, COCKED, w * 2) : lerp2(COCKED, THROWN, (w - 0.5) * 2)
    m.pose.lean = -8 * Math.sin(Math.PI * w)
  }
  f.fielders[key] = m
  if (key !== '1B') { // 1루수: 베이스로 들어가 송구를 받는다
    const fb: Mover = { pos: FIELD_POS['1B'], pose: idle() }
    moveTo(fb, FIELD_POS['1B'], BAG1, t, 150, T.throwStart - 100)
    const reach = ease(seg(t, T.throwStart, T.firstCatch - 80))
    fb.pose.active = Math.max(0.35, reach)
    fb.pose.glove = lerp2(READY_GLOVE, reachToward(BAG1, T.catchPt, 11), reach)
    fb.pose.lean = (project(T.catchPt).x > project(BAG1).x ? 10 : -10) * reach
    fb.pose.pop = Math.sin(Math.PI * seg(t, T.firstCatch, T.firstCatch + 120))
    f.fielders['1B'] = fb
  }
  // 공: 방망이 → 튀며 굴러 → 글러브 → 송구(포물선) → 1루수 글러브
  if (t < T.ballMs) {
    const k = 1 - (1 - t / T.ballMs) ** 2
    const r = rolling(contact, T.catchPt, k, 0.7, 2.5)
    f.ball = V(r.x, r.y + (contact.y - 0.12) * (1 - Math.min(1, k * 4)), r.z)
  } else if (t < T.throwStart || key === '1B') {
    f.ball = add(m.pos, V(0, 0.35, -0.2))
  } else if (t < T.firstCatch) {
    f.ball = flying(add(T.catchPt, V(0, 1.7, 0)), add(BAG1, V(0, 1.4, 0)), 1 + gdist(T.catchPt, BAG1) * 0.05, seg(t, T.throwStart, T.firstCatch))
  } else {
    f.ball = add(BAG1, V(0, 1.3, -0.3))
  }
  // 타자 주자: 1루로 전력질주, 포구보다 살짝 늦게 도착 직전에서 멈춤
  const rk = seg(t, 180, T.runnerEnd)
  f.batter = { ...f.batter, pos: mix(f.batter.pos, mix(BASES3.home, BASES3.first, 0.93), rk), run: rk > 0 && rk < 1 ? t / 50 : null }
  pushCall(f, call('OUT!', add(BASES3.first, V(0, 4, 0)), t, T.out))
}

// ── 병살 (6-4-3 / 4-6-3 / 5-4-3) ──
const PIVOT: Record<'SS' | '2B' | '3B', FielderKey> = { SS: '2B', '2B': 'SS', '3B': '2B' }
function doublePlayTimes(seq: Extract<PlaySequence, { type: 'DOUBLE_PLAY' }>) {
  const catchPt = toward(FIELD_POS[seq.fielder], BASES3.home, 4)
  const ballMs = 600
  const throw1 = ballMs + 140
  const out1 = throw1 + Math.max(220, Math.min(420, gdist(catchPt, BAG2) * 13)) + 30
  const throw2 = out1 + 130
  const firstCatch = throw2 + Math.max(300, Math.min(500, gdist(BAG2, BAG1) * 12))
  const out2 = firstCatch + 50
  return { catchPt, ballMs, throw1, out1, throw2, firstCatch, out2, runnerEnd: out2 + 160, end: out2 + CALL_MS + 200 }
}

function doublePlayFrame(seq: Extract<PlaySequence, { type: 'DOUBLE_PLAY' }>, t: number, f: WorldFrame, contact: V3) {
  const T = doublePlayTimes(seq)
  const key = seq.fielder
  const pivot = PIVOT[key]
  f.holdCaption = t < T.out2
  const m: Mover = { pos: FIELD_POS[key], pose: idle() }
  m.pose.active = 1
  moveTo(m, FIELD_POS[key], T.catchPt, t, 250, T.ballMs)
  if (t < T.throw1) m.pose.glove = lerp2(READY_GLOVE, LOW_GLOVE, ease(seg(t, T.ballMs - 150, T.ballMs)))
  else { const w = ease(seg(t, T.throw1 - 50, T.throw1 + 100)); m.pose.hand = lerp2(COCKED, THROWN, w) }
  f.fielders[key] = m
  const pv: Mover = { pos: FIELD_POS[pivot], pose: idle() }
  pv.pose.active = 1
  moveTo(pv, FIELD_POS[pivot], BAG2, t, 150, T.throw1 + 60)
  pv.pose.glove = lerp2(READY_GLOVE, reachToward(BAG2, T.catchPt, 10), ease(seg(t, T.throw1, T.out1 - 30)))
  if (t >= T.out1) { // 점프하며 1루로
    const w = ease(seg(t, T.throw2 - 70, T.throw2 + 100))
    pv.pose.jump = 0.6 * Math.sin(Math.PI * seg(t, T.out1, T.throw2 + 120))
    pv.pose.hand = w < 0.5 ? lerp2(READY_HAND, COCKED, w * 2) : lerp2(COCKED, THROWN, (w - 0.5) * 2)
    pv.pose.glove = lerp2(pv.pose.glove, READY_GLOVE, w)
  }
  pv.pose.pop = Math.sin(Math.PI * seg(t, T.out1 - 30, T.out1 + 90))
  f.fielders[pivot] = pv
  const fb: Mover = { pos: FIELD_POS['1B'], pose: idle() }
  moveTo(fb, FIELD_POS['1B'], BAG1, t, 150, T.throw2)
  const reach = ease(seg(t, T.throw2, T.firstCatch - 80))
  fb.pose.active = Math.max(0.35, reach)
  fb.pose.glove = lerp2(READY_GLOVE, reachToward(BAG1, BAG2, 11), reach)
  fb.pose.pop = Math.sin(Math.PI * seg(t, T.firstCatch, T.firstCatch + 120))
  f.fielders['1B'] = fb
  if (t < T.ballMs) {
    const k = 1 - (1 - t / T.ballMs) ** 2
    const r = rolling(contact, T.catchPt, k, 0.7, 2.5)
    f.ball = V(r.x, r.y + (contact.y - 0.12) * (1 - Math.min(1, k * 4)), r.z)
  } else if (t < T.throw1) f.ball = add(m.pos, V(0, 0.35, -0.2))
  else if (t < T.out1 - 30) f.ball = flying(add(T.catchPt, V(0, 1.6, 0)), add(BAG2, V(0, 1.5, 0)), 1, seg(t, T.throw1, T.out1 - 30))
  else if (t < T.throw2) f.ball = add(BAG2, V(0, 1.5, -0.3))
  else if (t < T.firstCatch) f.ball = flying(add(BAG2, V(0, 1.8, 0)), add(BAG1, V(0, 1.4, 0)), 1.6, seg(t, T.throw2, T.firstCatch))
  else f.ball = add(BAG1, V(0, 1.3, -0.3))
  const rk = seg(t, 180, T.runnerEnd)
  f.batter = { ...f.batter, pos: mix(f.batter.pos, mix(BASES3.home, BASES3.first, 0.93), rk), run: rk > 0 && rk < 1 ? t / 50 : null }
  pushCall(f, call('OUT!', add(BASES3.second, V(0, 4, 0)), t, T.out1))
  pushCall(f, call('OUT!', add(BASES3.first, V(0, 4, 0)), t, T.out2))
}

// ── 안타 ──
function hitTimes(seq: Extract<PlaySequence, { type: 'HIT' }>, s: Swing) {
  const stop = s.outcome === 'perfect' ? 70 : 0 // 잘 맞은 공은 아주 잠깐 멈췄다 날아간다(히트스톱)
  const d = Math.min(s.distance, FENCE_M - 1)
  switch (seq.style) {
    case 'GROUNDER_THROUGH': { const land = stop + 650, roll = stop + 1300; const arrive = Math.max(1450, roll + 150); return { stop, land, roll, wall: 0, carom: 0, arrive, end: arrive + CALL_MS + 150 } }
    case 'LINER': case 'BLOOP': { const land = stop + (seq.style === 'BLOOP' ? 1050 : 520 + d * 3); const roll = land + 420; const arrive = Math.max(1450, roll + 120); return { stop, land, roll, wall: 0, carom: 0, arrive, end: arrive + CALL_MS + 150 } }
    default: {
      const land = stop + (seq.style === 'OFF_WALL' ? 760 + d * 2.4 : 620 + d * 3)
      const wall = seq.style === 'OFF_WALL' ? land : land + 520
      const carom = wall + 420
      const arrive = Math.max(carom + 250, 2100)
      return { stop, land, roll: wall, wall, carom, arrive, end: arrive + CALL_MS + 150 }
    }
  }
}

function hitFrame(seq: Extract<PlaySequence, { type: 'HIT' }>, s: Swing, t: number, f: WorldFrame, contact: V3) {
  const T = hitTimes(seq, s)
  const d = Math.min(s.distance, FENCE_M - 1)
  const a = seq.angle
  f.holdCaption = t < T.arrive
  const tt = Math.max(0, t - T.stop)
  const land = seq.style === 'GROUNDER_THROUGH' ? polar(50, a) : seq.style === 'BLOOP' ? polar(Math.max(42, d * 0.78), a) : polar(d, a)
  const rest = seq.style === 'GROUNDER_THROUGH' ? polar(68, a) : polar((seq.style === 'BLOOP' ? Math.max(42, d * 0.78) : d) + 6, a)
  const wallPt = polar(FENCE_M - 0.8, a)
  const caromPt = polar(FENCE_M - 11, a + (a < 0 ? 3 : -3))
  if (!seq.double) f.landed = ground(land)
  // 공
  if (t < T.stop) f.ball = contact
  else if (seq.style === 'GROUNDER_THROUGH') {
    if (t < T.land) { const k = seg(t, T.stop, T.land); const r = rolling(contact, land, k, 0.8, 3); f.ball = V(r.x, r.y + (contact.y - 0.12) * (1 - Math.min(1, k * 5)), r.z) }
    else f.ball = rolling(land, rest, 1 - (1 - seg(t, T.land, T.roll)) ** 2, 0.25, 2)
  } else if (t < T.land) {
    const apex = seq.style === 'BLOOP' ? 15 : seq.double ? 4 + d * 0.06 : 2.5 + d * 0.03
    f.ball = flying(contact, seq.style === 'OFF_WALL' ? V(wallPt.x, 2.4, wallPt.z) : land, apex, seg(tt, 0, T.land - T.stop))
  } else if (!seq.double) f.ball = rolling(land, rest, 1 - (1 - seg(t, T.land, T.roll)) ** 2, 0.6, 1.5)
  else if (seq.style === 'OFF_WALL') f.ball = flying(V(wallPt.x, 2.4, wallPt.z), caromPt, 0.8, seg(t, T.wall, T.carom))
  else if (t < T.wall) f.ball = rolling(land, wallPt, seg(t, T.land, T.wall), 0.7, 3)
  else f.ball = flying(V(wallPt.x, 0.3, wallPt.z), caromPt, 0.7, seg(t, T.wall, T.carom))
  if (seq.double && t >= T.wall && t < T.wall + 380) f.bursts.push({ at: V(wallPt.x, seq.style === 'OFF_WALL' ? 2.4 : 0.6, wallPt.z), k: seg(t, T.wall, T.wall + 380), size: 14, color: '#C9A77A' })
  // 내야수: 늦게 몸을 날리거나 점프하지만 못 잡는다
  if (seq.diver) {
    const key = seq.diver
    const base = FIELD_POS[key]
    const m: Mover = { pos: base, pose: idle() }
    m.pose.active = 1
    const linePt = polar(Math.hypot(base.x, base.z), a)
    if (seq.style === 'GROUNDER_THROUGH') {
      const passT = T.land - 180
      const dv = ease(seg(t, passT - 260, passT - 40))
      const up = ease(seg(t, passT + 520, passT + 820))
      m.pos = mix(base, linePt, 0.7 * dv)
      const side = project(linePt).x > project(base).x ? 1 : -1
      m.pose.lean = side * 74 * dv * (1 - up)
      m.pose.glove = lerp2(READY_GLOVE, { x: side * 12, y: -12 }, dv)
    } else if (seq.style === 'BLOOP') {
      const k = moveTo(m, base, mix(base, land, 0.6), t, T.stop + 150, T.land - 60)
      m.pose.glove = lerp2(READY_GLOVE, UP_GLOVE, k)
    } else {
      const passT = T.stop + 170
      m.pose.jump = 0.8 * Math.sin(Math.PI * seg(t, passT - 150, passT + 170))
      m.pose.glove = lerp2(READY_GLOVE, UP_GLOVE, Math.min(1, m.pose.jump * 2))
    }
    f.fielders[key] = m
  }
  // 외야수: 낙하 지점·갭으로 달려가지만 늦는다 → 하나가 공을 줍는다
  seq.chasers.forEach((key, i) => {
    const base = FIELD_POS[key]
    const m: Mover = { pos: base, pose: idle() }
    m.pose.active = 1
    if (!seq.double) {
      const k = moveTo(m, base, toward(rest, BASES3.home, -1), t, T.stop + 260, T.roll)
      m.pose.glove = lerp2(READY_GLOVE, LOW_GLOVE, k)
    } else {
      const gap = add(land, V(i === 0 ? -3.5 : 3.5, 0, 2))
      if (t < T.wall || i > 0) {
        const k = moveTo(m, base, gap, t, T.stop + 200, T.land + 200)
        if (k >= 1 && t > T.land + 120) { const dv = ease(seg(t, T.land + 120, T.land + 300)); m.pose.lean = (i === 0 ? 1 : -1) * 70 * dv; m.pose.run = null } // 몸 날렸지만 못 잡음
        m.pose.glove = lerp2(READY_GLOVE, { x: i === 0 ? 12 : -12, y: -11 }, k)
      } else {
        moveTo(m, gap, toward(caromPt, BASES3.home, -0.8), t, T.wall - 150, T.carom)
        m.pose.glove = LOW_GLOVE
      }
    }
    f.fielders[key] = m
  })
  if (seq.double && t >= T.carom) f.ball = add(f.fielders[seq.chasers[0]]!.pos, V(0, 0.4, -0.3))
  // 주자: 1루(단타) / 1루 돌아 2루(2루타)
  const rk = seg(t, 160, T.arrive)
  const path = seq.double ? [f.batter.pos, V(19.4, 0, 19.0), V(0.4, 0, 38.4)] : [f.batter.pos, V(19.0, 0, 19.0)]
  f.batter = { ...f.batter, pos: runPath(path, ease(rk)), run: rk > 0 && rk < 1 ? t / 50 : null }
  pushCall(f, call('SAFE', add(seq.double ? BASES3.second : BASES3.first, V(0, 4, 0)), t, T.arrive))
}

// ── 뜬공 아웃 ──
function flyTimes(seq: Extract<PlaySequence, { type: 'FLY_OUT' }>, s: Swing, contact: V3) {
  const base = FIELD_POS[seq.fielder]
  const land = seq.popup ? add(toward(base, BASES3.home, 2.5), V(1.5, 0, 0)) : polar(Math.min(s.distance, FENCE_M - 3.5), seq.angle)
  const flight = seq.popup ? 1050 : 800 + s.distance * 5
  const apex = seq.popup ? 26 : 8 + Math.min(s.distance, 125) * 0.22
  const leap = seq.style === 'WALL_LEAP' ? 0.9 : 0
  const catchH = 2.1 + leap
  let rc = 0.97
  for (let r = 0.5; r <= 1; r += 0.004) { if (flying(contact, land, apex, r).y <= catchH) { rc = r; break } }
  const catchT = rc * flight
  return { base, land, flight, apex, leap, catchT, catchPt: flying(contact, land, apex, rc), out: catchT + 50, end: catchT + 50 + CALL_MS + 200 }
}

function flyFrame(seq: Extract<PlaySequence, { type: 'FLY_OUT' }>, s: Swing, t: number, f: WorldFrame, contact: V3) {
  const T = flyTimes(seq, s, contact)
  f.holdCaption = t < T.out
  const m: Mover = { pos: T.base, pose: idle() }
  m.pose.active = 1
  const spot = ground(T.catchPt)
  const [m0, m1] = seq.style === 'CAMPED' ? [200, T.catchT * 0.6] : seq.style === 'RUNNING' ? [T.catchT * 0.3, T.catchT - 40] : [250, T.catchT - 180]
  moveTo(m, T.base, spot, t, m0, m1)
  m.pose.glove = lerp2(READY_GLOVE, UP_GLOVE, ease(seg(t, T.catchT - (seq.style === 'CAMPED' ? 450 : 200), T.catchT - 30)))
  if (seq.style === 'WALL_LEAP') m.pose.jump = T.leap * Math.sin(Math.PI * seg(t, T.catchT - 170, T.catchT + 200))
  m.pose.pop = Math.sin(Math.PI * seg(t, T.catchT, T.catchT + 120))
  f.fielders[seq.fielder] = m
  f.ball = t < T.catchT ? flying(contact, T.land, T.apex, t / T.flight) : add(m.pos, V(0, 2.1 + m.pose.jump, -0.2))
  if (t < T.catchT) f.ballScale = 1 + 0.25 * Math.sin(Math.PI * Math.min(1, (t / T.flight) * 1.4))
  const rk = seg(t, 180, T.catchT + 250)
  f.batter = { ...f.batter, pos: mix(f.batter.pos, BASES3.first, 0.65 * rk), run: rk > 0 && rk < 1 ? t / 60 : null }
  pushCall(f, call('OUT!', add(spot, V(0, 5, 0)), t, T.out))
}

// ── 홈런 ──
function homeRunTimes(s: Swing) {
  const stop = 110                     // 히트스톱
  const flight = 800 + s.distance * 6  // 기존 비행 시간
  const land = stop + flight
  return { stop, flight, land, end: land + 1500 }
}

function homeRunFrame(seq: Extract<PlaySequence, { type: 'HOME_RUN' }>, s: Swing, t: number, f: WorldFrame, contact: V3) {
  const T = homeRunTimes(s)
  f.holdCaption = t < T.land
  const d = Math.min(s.distance, 160)
  const target = polar(d + 8, seq.angle, 6 + (d - FENCE_M) * 0.35) // 담장 너머 관중석
  const apex = 22 + (d - 110) * 0.45
  const path = (r: number) => flying(contact, target, apex, r)
  if (t < T.stop) { f.ball = contact; f.ballScale = 1.3 }
  else if (t < T.land + 90) {
    const r = Math.min(1, (t - T.stop) / T.flight)
    f.ball = path(r)
    f.ballScale = 1 + 0.5 * Math.sin(Math.PI * Math.min(1, r * 2.2)) // 2.5D: 확 솟구친다
    for (let i = 1; i <= 8; i++) { const rr = r - i * 0.02; if (rr > 0) f.trail.push(path(rr)) }
  }
  if (t < 260) { const k = 1 - t / 260; f.shake = { x: 2.8 * Math.sin(t * 0.31) * k, y: 1.8 * Math.cos(t * 0.37) * k } }
  // 외야수: 펜스까지 쫓아가 점프 → 넘어가는 공을 바라본다
  const m: Mover = { pos: FIELD_POS[seq.chaser], pose: idle() }
  m.pose.active = 1
  moveTo(m, FIELD_POS[seq.chaser], polar(FENCE_M - 3, seq.angle), t, T.stop + 220, T.stop + T.flight * 0.78)
  m.pose.jump = 1.1 * Math.sin(Math.PI * seg(t, T.stop + T.flight * 0.8, T.stop + T.flight * 0.95))
  m.pose.glove = lerp2(READY_GLOVE, UP_GLOVE, ease(seg(t, T.stop + T.flight * 0.6, T.stop + T.flight * 0.8)))
  if (t > T.stop + T.flight * 0.96) { const sag = ease(seg(t, T.stop + T.flight * 0.96, T.land + 300)); m.pose.glove = lerp2(m.pose.glove, { x: -4, y: -9 }, sag); m.pose.lean = 10 * sag }
  f.fielders[seq.chaser] = m
  // 타자: 천천히 베이스 한 바퀴
  const trot = seg(t, T.stop + 500, T.end - 350)
  f.batter = { ...f.batter, pos: runPath([f.batter.pos, BASES3.first, BASES3.second, BASES3.third, BASES3.home], trot), run: trot > 0 && trot < 1 ? t / 70 : null, trot: true }
  if (t >= T.end - 350 && t < T.end + 450) f.scores.push(seg(t, T.end - 350, T.end + 450))
  if (t >= T.land) {
    const colors = ['#F59E0B', '#DC2626', '#3B82F6', '#10B981']
    const shots: [V3 | Pt, number, number][] = [[target, 0, 18], [{ x: 178, y: -30 }, 150, 28], [{ x: 384, y: -34 }, 330, 28], [{ x: 214, y: -14 }, 520, 24], [{ x: 348, y: -12 }, 700, 24]]
    shots.forEach(([at, delay, size], i) => {
      const k = seg(t, T.land + delay, T.land + delay + 700)
      if (k > 0 && k < 1) f.bursts.push({ at, k, size, color: colors[i % colors.length] })
    })
    f.board = { label: 'HOME RUN!', color: '#F59E0B', k: seg(t, T.land, T.end), pulse: 0.5 + 0.5 * Math.sin((t - T.land) / 85) }
  }
}

// ── 대결 모드 사구 → 벤치 클리어링 (웃자고 만든 장면, 판정은 그냥 사구) ──
export const BRAWL_MS = 3400
const BRAWL_AT = V(0, 0, 8)
const BRAWL_WORDS = ['퍽!', '!@#$%', '빡!', '💢', '쾅!', '야!!', '★', '으악', '놔봐!!', '💫']

function brawlFrame(t: number, f: WorldFrame, batsLeft: boolean) {
  f.holdCaption = t < BRAWL_MS - 650
  f.ball = null
  const cloudK = ease(seg(t, 1250, 1500)) * (1 - ease(seg(t, 2650, 2950)))
  const hide = seg(cloudK, 0.25, 0.7)
  const start = BATTER_AT(batsLeft)
  const charge = ease(seg(t, 700, 1350))
  const walk = ease(seg(t, 2800, BRAWL_MS - 250))
  const flinch = Math.sin(Math.PI * seg(t, 0, 380)) * 0.5
  const atCloud = add(BRAWL_AT, V(-2.2, 0, -0.5))
  f.batter = {
    pos: t < 2800 ? mix(add(start, V(batsLeft ? flinch : -flinch, 0, -flinch)), atCloud, charge) : mix(atCloud, V(19.0, 0, 19.0), walk),
    run: (charge > 0 && charge < 1) || (walk > 0 && walk < 1) ? t / 45 : null, swing: 0, bat: false, opacity: 1 - hide, trot: false,
  }
  const pk = ease(seg(t, 900, 1400)) * (1 - ease(seg(t, 2800, BRAWL_MS - 200)))
  f.pitcher = { pos: mix(MOUND, add(BRAWL_AT, V(2.2, 0, 0.5)), pk), opacity: 1 - hide, run: pk > 0 && pk < 1 ? t / 45 : null }
  const team = (side: -1 | 1, n: number) => {
    for (let i = 0; i < n; i++) {
      const st = 750 + i * 70 + (side > 0 ? 35 : 0)
      const k = ease(seg(t, st, st + 650))
      const back = ease(seg(t, 2750 + i * 40, 3250))
      const ang = (side < 0 ? Math.PI : 0) + (i - n / 2) * 0.4
      const ring = add(BRAWL_AT, V(Math.cos(ang) * (3.6 + (i % 3) * 0.8), 0, Math.sin(ang) * 2.2))
      const dugout = V(side * (30 + (i % 3) * 2), 0, 2 + i * 0.8)
      const jitter = cloudK > 0.5 ? V(Math.sin(t / 55 + i * 1.7) * 0.5, 0, 0) : V(0, 0, 0)
      const pos = add(back > 0 ? mix(ring, dugout, back) : mix(dugout, ring, k), jitter)
      f.brawlers.push({ pos, run: (k > 0 && k < 1) || (back > 0 && back < 1) ? t / 40 + i : null, opacity: 1, lean: cloudK > 0.5 ? Math.sin(t / 90 + i) * 18 : 0, side: side < 0 ? 'batter' : 'pitcher' })
    }
  }
  team(-1, 7)
  team(1, 7)
  if (cloudK > 0) {
    f.brawl = { k: cloudK, t }
    const wi = Math.floor((t - 1300) / 220)
    for (let j = 0; j < 3; j++) {
      const idx = wi - j
      if (idx < 0) continue
      const k = seg(t, 1300 + idx * 220, 1300 + idx * 220 + 520)
      if (k <= 0 || k >= 1) continue
      const a = idx * 2.4
      f.marks.push({ at: add(BRAWL_AT, V(Math.cos(a) * 6.5, 3.4 + Math.sin(a) * 1.4, 0)), text: BRAWL_WORDS[idx % BRAWL_WORDS.length], k, color: idx % 2 ? '#DC2626' : '#1F2933' })
    }
    const ck = seg(t, 1850, 2550)
    if (ck > 0 && ck < 1) f.flyingCap = { at: flying(add(BRAWL_AT, V(0.5, 2, 0)), add(BRAWL_AT, V(7, 0.2, -1)), 5, ck), rot: ck * 720 }
    f.shake = { x: Math.sin(t / 23) * 1.4 * cloudK, y: Math.cos(t / 29) * 0.9 * cloudK }
  }
  const m1 = seg(t, 250, 950)
  if (m1 > 0 && m1 < 1) f.marks.push({ at: add(start, V(0, 2.6, 0)), text: '!!', k: m1, color: '#DC2626' })
  const m2 = seg(t, 520, 1150)
  if (m2 > 0 && m2 < 1) f.marks.push({ at: add(MOUND, V(0, 2.8, 0)), text: '?!', k: m2, color: '#1F2933' })
  if (t >= 900) f.board = { label: '벤치 클리어링!', color: '#DC2626', k: seg(t, 900, BRAWL_MS), pulse: 0.5 + 0.5 * Math.sin((t - 900) / 70) }
}

// ── 이미 나가 있는 주자 — 진루는 판정 규칙(simulateGame) 그대로 ──
function runnerWindow(seq: PlaySequence, s: Swing): [number, number] | null {
  if (seq.type === 'HIT') return [160, hitTimes(seq, s).arrive]
  if (seq.type === 'HOME_RUN') { const T = homeRunTimes(s); return [T.stop + 300, T.end - 500] }
  if (seq.type === 'DOUBLE_PLAY') { const T = doublePlayTimes(seq); return [100, T.out1 + 40] }
  return null
}

function placeRunners(f: WorldFrame, seq: PlaySequence, s: Swing, t: number, bases: GameState['bases']) {
  const win = runnerWindow(seq, s)
  const n = seq.type === 'HIT' ? (s.distance >= DOUBLE_M ? 2 : 1) : seq.type === 'HOME_RUN' ? 3 : 0
  bases.forEach((on, i) => {
    if (!on) return
    const at = BASE_PATH[i]
    if (!win) { f.runners.push({ pos: at, run: null, opacity: 1, lean: 0 }); return }
    const [t0, t1] = win
    const k = ease(seg(t, t0, t1))
    const moving = t > t0 && t < t1
    if (seq.type === 'DOUBLE_PLAY') {
      if (i !== 0) { f.runners.push({ pos: at, run: null, opacity: 1, lean: 0 }); return }
      f.runners.push({ pos: mix(BASES3.first, BASES3.second, 0.9 * k), run: moving ? t / 50 : null, opacity: 1 - seg(t, t1 + 250, t1 + 650), lean: 55 * seg(t, t1 - 120, t1) })
      return
    }
    const to = Math.min(3, i + n)
    f.runners.push({ pos: runPath(BASE_PATH.slice(i, to + 1), k), run: moving ? t / 50 : null, opacity: to === 3 ? 1 - seg(t, t1 + 150, t1 + 450) : 1, lean: 0 })
    if (to === 3 && t >= t1 && t < t1 + 800) f.scores.push(seg(t, t1, t1 + 800))
  })
}

// 장면 길이(ms) — scene.tsx의 resultDuration이 쓴다. 결과가 같으면 길이도 같다(결정적).
export function sequenceDuration(seq: PlaySequence, s: Swing): number {
  switch (seq.type) {
    case 'GROUND_OUT': return groundOutTimes(seq).end
    case 'DOUBLE_PLAY': return doublePlayTimes(seq).end
    case 'HIT': return hitTimes(seq, s).end
    case 'FLY_OUT': return flyTimes(seq, s, CONTACT_OF(false)).end
    case 'HOME_RUN': return homeRunTimes(s).end
    case 'BRAWL': return BRAWL_MS
    default: return 0
  }
}

export function worldFrame(seq: PlaySequence, s: Swing, t: number, bases: GameState['bases'], batsLeft: boolean): WorldFrame {
  const f = blank(batsLeft)
  const contact = CONTACT_OF(batsLeft)
  f.batter.swing = Math.min(1, t / 140) // 스윙 마무리
  f.batter.bat = t < 160 || seq.type === 'BRAWL'
  f.batBall = !f.batter.bat
  if (seq.type === 'GROUND_OUT') groundOutFrame(seq, t, f, contact)
  else if (seq.type === 'DOUBLE_PLAY') doublePlayFrame(seq, t, f, contact)
  else if (seq.type === 'HIT') hitFrame(seq, s, t, f, contact)
  else if (seq.type === 'FLY_OUT') flyFrame(seq, s, t, f, contact)
  else if (seq.type === 'HOME_RUN') homeRunFrame(seq, s, t, f, contact)
  else if (seq.type === 'BRAWL') { f.batter.bat = false; f.batBall = true; brawlFrame(t, f, batsLeft) }
  if (seq.type !== 'BRAWL' && t < 240) f.impact = { at: contact, k: t / 240, size: 14 * impactPower(s), color: s.distance >= FENCE_M ? '#F59E0B' : '#FFFFFF' }
  if (!f.shake && s.outcome === 'perfect' && t < 160) { const a = 1 - t / 160; f.shake = { x: 1.4 * Math.sin(t * 0.33) * a, y: 0 } }
  placeRunners(f, seq, s, t, bases)
  return f
}

// 지난 안타의 낙구 지점(같은 결과면 같은 방향)
export function landingPoint(s: Swing): V3 | null {
  const q = getPlaySequence(s)
  if (q.type !== 'HIT') return null
  return polar(q.style === 'GROUNDER_THROUGH' ? 50 : q.style === 'BLOOP' ? Math.max(42, s.distance * 0.78) : Math.min(s.distance, FENCE_M - 1), q.angle)
}

// ── 그림 ──
function StickFigure({ at, depth, pose, cap, label, team, dim = 1 }: { at: Pt; depth: number; pose: Pose; cap: ReturnType<typeof teamOf>; label?: string; team?: string; dim?: number }) {
  const s = figScale(depth) * (1 + 0.06 * pose.pop)
  const jumpPx = (pose.jump * CAM.f) / depth
  const st = pose.run === null ? 0 : Math.sin(pose.run)
  const op = dim * (0.62 + 0.38 * pose.active)
  return (
    <g transform={`translate(${at.x} ${at.y - jumpPx}) scale(${s}) rotate(${pose.lean})`} opacity={op}>
      <ellipse cx="0" cy={0.5 + jumpPx / s} rx="6" ry="1.6" fill="#2F3A33" opacity="0.2" />
      <g stroke="#3F4954" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeWidth="2">
        <polyline points={`0,-11 ${-2.5 + 2 * st},-5.5 ${-3.5 + 3 * st},${-Math.max(0, st) * 2}`} />
        <polyline points={`0,-11 ${2.5 - 2 * st},-5.5 ${3.5 - 3 * st},${-Math.max(0, -st) * 2}`} />
        <line x1="-3.5" y1="-20" x2={pose.glove.x} y2={pose.glove.y} strokeWidth="1.7" />
        <line x1="3.5" y1="-20" x2={pose.hand.x} y2={pose.hand.y} strokeWidth="1.7" />
      </g>
      <path d="M-4 -21 L4 -21 L3 -11 L-3 -11 Z" fill={team ?? '#E5E7EB'} stroke="#3F4954" strokeWidth="1" strokeLinejoin="round" />
      <circle cx={pose.glove.x} cy={pose.glove.y} r="2.2" fill="#8B5A2B" />
      <circle cx="0" cy="-25" r="3.9" fill="#E5E7EB" stroke="#3F4954" strokeWidth="0.9" />
      <CapShape cx={0} cy={-25} r={3.9} facing={1} team={cap} fallback="#B91C1C" />
      {/* 중견수·유격수 이름표는 한 칸 위 — 갭 타구처럼 양옆 수비수와 모일 때 겹치지 않게 */}
      {label && pose.active > 0.5 && (
        <text x="0" y={label === '중견수' || label === '유격수' ? -44 : -34} textAnchor="middle" fontSize={Math.max(8, 9.5 / s)} fontWeight="800" fill="#1F2933" transform={`rotate(${-pose.lean})`}
          opacity={seg(pose.active, 0.5, 0.9)} paintOrder="stroke" stroke="#FFFFFF" strokeWidth={2.6 / Math.min(1.4, s)} strokeLinejoin="round">{label}</text>
      )}
    </g>
  )
}

function RunnerShape({ at, depth, r, helmet, jersey }: { at: Pt; depth: number; r: { run: number | null; opacity: number; lean: number }; helmet: string; jersey: string }) {
  const s = figScale(depth)
  const st = r.run === null ? 0 : Math.sin(r.run)
  return (
    <g transform={`translate(${at.x} ${at.y}) scale(${s}) rotate(${r.lean})`} opacity={r.opacity}>
      <ellipse cx="0" cy="0.5" rx="6" ry="1.6" fill="#2F3A33" opacity="0.2" />
      <g stroke="#2B3440" strokeLinecap="round" fill="none" strokeWidth="2.1">
        <polyline points={`0,-11 ${-2 + 3 * st},-5.5 ${-3.5 + 5 * st},0`} />
        <polyline points={`0,-11 ${1 - 3 * st},-5.5 ${3.5 - 5 * st},0`} />
        <line x1="-3.5" y1="-20" x2={-5 - 4 * st} y2="-13" strokeWidth="1.7" />
        <line x1="3.5" y1="-20" x2={5 + 4 * st} y2="-13" strokeWidth="1.7" />
      </g>
      <path d="M-4 -21 L4 -21 L3 -11 L-3 -11 Z" fill={jersey} stroke="#2B3440" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="0" cy="-25" r="3.9" fill="#F3F4F6" stroke="#2B3440" strokeWidth="0.9" />
      <path d="M-4.2 -25.3 Q0 -31 4.2 -25.3 L5.8 -24.4 L-4.2 -24.4 Z" fill={helmet} />
    </g>
  )
}

function BurstShape({ at, k, size, color, rays = 10 }: { at: Pt; k: number; size: number; color: string; rays?: number }) {
  const r = 3 + size * ease(k)
  return (
    <g opacity={1 - k} pointerEvents="none">
      <circle cx={at.x} cy={at.y} r={r} fill="none" stroke={color} strokeWidth={1.6 * (1 - k * 0.6)} />
      {Array.from({ length: rays }, (_, i) => {
        const a = (i / rays) * Math.PI * 2 + 0.3
        return <line key={i} x1={at.x + Math.cos(a) * r * 0.55} y1={at.y + Math.sin(a) * r * 0.55} x2={at.x + Math.cos(a) * r * 1.15} y2={at.y + Math.sin(a) * r * 1.15} stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      })}
    </g>
  )
}

const arcPts = (r: number, from = -45, to = 45, y = 0, n = 24) => Array.from({ length: n + 1 }, (_, i) => polar(r, from + ((to - from) * i) / n, y))

// 경기장 바탕(고정) — 하늘·관중석·전광판·펜스·잔디·내야·거리선
function Ballpark({ uid, logo }: { uid: string; logo?: string | null }) {
  const fenceB = arcPts(FENCE_M, -45, 45, 0)
  const fenceT = arcPts(FENCE_M, -45, 45, 3)
  const standB = arcPts(FENCE_M + 4, -58, 58, 3.5, 30)
  const standT = arcPts(FENCE_M + 55, -62, 62, 34, 30)
  const fair = [BASES3.home, ...fenceB]
  const track = [...arcPts(FENCE_M - 5, -45, 45), ...[...fenceB].reverse()]
  const dirt = Array.from({ length: 33 }, (_, i) => add(V(0, 0, 18.4), polar(28.5, -180 + i * 11.25)))
  const infGrass = [V(0, 0, 3.4), V(16.6, 0, 20), V(0, 0, 36.2), V(-16.6, 0, 20)]
  return (
    <g aria-hidden pointerEvents="none">
      <defs>
        <linearGradient id={`${uid}-bsky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#DDE7F1" /><stop offset="1" stopColor="#EFF3F6" /></linearGradient>
        <linearGradient id={`${uid}-bgrass`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#B9D3AA" /><stop offset="1" stopColor="#CFE2C3" /></linearGradient>
        <filter id={`${uid}-bsoft`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0.9" /></filter>
        <pattern id={`${uid}-bcrowd`} width="5" height="4" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="0.9" fill="#F4F1EA" /><circle cx="3.7" cy="3" r="0.9" fill="#6F8094" /></pattern>
      </defs>
      <rect x="0" y={VIEW_TOP} width={VIEW_W} height={VIEW_H - VIEW_TOP} fill={`url(#${uid}-bsky)`} />
      <g filter={`url(#${uid}-bsoft)`} opacity="0.5">
        <polygon points={`${pts(standB)} ${pts([...standT].reverse())}`} fill="#9AAABB" />
        <polygon points={`${pts(standB)} ${pts([...standT].reverse())}`} fill={`url(#${uid}-bcrowd)`} opacity="0.6" />
        {[-75, 75].map(x => { const a = P2(V(x, 0, 168)), b = P2(V(x, 52, 168)); return <g key={x}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7D8B99" strokeWidth="1.6" /><rect x={b.x - 9} y={b.y - 4} width="18" height="6" rx="1" fill="#E8EDF2" stroke="#7D8B99" strokeWidth="0.8" /></g> })}
        <rect x={BOARD.x} y={BOARD.y} width={BOARD.w} height={BOARD.h} rx="2" fill="#465566" />
      </g>
      {logo && <image href={logo} x={BOARD.x + BOARD.w / 2 - 14} y={BOARD.y + 1} width="28" height={BOARD.h - 2} preserveAspectRatio="xMidYMid meet" opacity="0.28" />}
      <polygon points={`${pts(fenceB)} ${pts([...fenceT].reverse())}`} fill="#4E7260" />
      <polyline points={pts(fenceT)} fill="none" stroke="#E2C76A" strokeWidth="1.1" />
      {/* 그라운드 */}
      <polygon points={`0,${P2(V(0, 0, 400)).y} ${VIEW_W},${P2(V(0, 0, 400)).y} ${VIEW_W},${VIEW_H} 0,${VIEW_H}`} fill={`url(#${uid}-bgrass)`} opacity="0.75" />
      <polygon points={pts(fair)} fill="#B4D2A2" />
      {Array.from({ length: 9 }, (_, i) => i % 2 === 0 ? null : <polygon key={i} points={pts([BASES3.home, polar(FENCE_M, -45 + i * 10), polar(FENCE_M, -35 + i * 10)])} fill="#FFFFFF" opacity="0.1" />)}
      <polygon points={pts(track)} fill="#D8C29F" opacity="0.9" />
      <polygon points={pts(dirt)} fill="#E2CDAE" />
      <polygon points={pts(infGrass)} fill="#B4D2A2" />
      <polygon points={pts(Array.from({ length: 13 }, (_, i) => add(MOUND, polar(2.8, i * 30))))} fill="#DCC4A2" />
      <polygon points={pts(Array.from({ length: 13 }, (_, i) => polar(4.2, i * 30)))} fill="#DCC4A2" />
      {/* 파울 라인 */}
      {[-45, 45].map(a => { const p = P2(polar(FENCE_M, a)), h = P2(BASES3.home); return <line key={a} x1={h.x} y1={h.y} x2={p.x} y2={p.y} stroke="#FFFFFF" strokeWidth="1.1" opacity="0.9" /> })}
      {/* 비거리 기준선 30·60·90 + 펜스 125 */}
      {[30, 60, 90].map(r => (
        <g key={r}>
          <polyline points={pts(arcPts(r, -45, 45, 0, 20))} fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="0.9" strokeDasharray="3 3" />
          {(() => { const p = P2(polar(r, 41)); return <text x={p.x + 4} y={p.y + 3} fontSize="7.5" fontWeight="700" fill="#4F6B4A" paintOrder="stroke" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round">{r}m</text> })()}
        </g>
      ))}
      {(() => { const p = P2(polar(FENCE_M, 0, 3)); return <text x={p.x} y={p.y - 2} textAnchor="middle" fontSize="8" fontWeight="800" fill="#1F6B3A" paintOrder="stroke" stroke="#FFFFFF" strokeWidth="2.2" strokeLinejoin="round">HR 125m</text> })()}
      {/* 베이스·홈플레이트 */}
      {[BASES3.first, BASES3.second, BASES3.third].map((b, i) => <polygon key={i} points={pts([add(b, V(0, 0, -0.5)), add(b, V(0.5, 0, 0)), add(b, V(0, 0, 0.5)), add(b, V(-0.5, 0, 0))])} fill="#FFFFFF" stroke="#C9BBA6" strokeWidth="0.5" />)}
      <polygon points={pts([V(-0.22, 0, 0.2), V(0.22, 0, 0.2), V(0.22, 0, -0.05), V(0, 0, -0.25), V(-0.22, 0, -0.05)])} fill="#FFFFFF" />
      {[-1, 1].map(s => <polygon key={s} points={pts([V(s * 0.5, 0, -0.9), V(s * 1.7, 0, -0.9), V(s * 1.7, 0, 1.0), V(s * 0.5, 0, 1.0)])} fill="none" stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="0.7" />)}
    </g>
  )
}

export function BroadcastView({ frame, weight, uid, logo, pitcherGear, batterGear, batterColor, prevLandings }: {
  frame: WorldFrame; weight: number; uid: string; logo?: string | null; pitcherGear?: Equip; batterGear?: Equip; batterColor: string; prevLandings: Swing[]
}) {
  const pCap = teamOf(pitcherGear?.cap)
  const pUni = teamOf(pitcherGear?.uniform)
  const bCap = teamOf(batterGear?.cap)
  const bUni = teamOf(batterGear?.uniform)
  const bBat = teamOf(batterGear?.bat)
  const helmet = bCap?.cap ?? '#1F4E8C'
  const jersey = bUni?.primary ?? batterColor
  const pJersey = pUni?.primary ?? '#E5E7EB'
  // 원근 순서(먼 것부터)로 그릴 사람들
  type Item = { depth: number; node: ReactNode }
  const items: Item[] = []
  for (const k of FIELDER_KEYS) {
    const m = frame.fielders[k] ?? { pos: FIELD_POS[k], pose: idle() }
    const q = project(m.pos)
    items.push({ depth: q.depth, node: <StickFigure key={k} at={q} depth={q.depth} pose={m.pose} cap={pCap} team={pJersey} label={POS_LABEL[k]} /> })
  }
  const pq = project(frame.pitcher.pos)
  items.push({ depth: pq.depth, node: <StickFigure key="P" at={pq} depth={pq.depth} pose={{ ...idle(), run: frame.pitcher.run, hand: { x: -4, y: -9 } }} cap={pCap} team={pJersey} dim={frame.pitcher.opacity} /> })
  const cq = project(V(0, 0, -1.3))
  items.push({ depth: cq.depth, node: <g key="C" transform={`translate(${cq.x} ${cq.y}) scale(${figScale(cq.depth) * 0.95})`} opacity="0.9"><ellipse cx="0" cy="0.5" rx="7" ry="1.8" fill="#2F3A33" opacity="0.2" /><path d="M-6 0 L-4 -7 L4 -7 L6 0 M-4 -7 L-3 -14 L3 -14 L4 -7" stroke="#3F4954" strokeWidth="2" fill={pJersey} strokeLinejoin="round" /><circle cx="0" cy="-17.5" r="3.6" fill="#374151" /><circle cx="-5" cy="-10" r="2.3" fill="#8B5A2B" /></g> })
  frame.runners.forEach((r, i) => { const q = project(r.pos); items.push({ depth: q.depth, node: <RunnerShape key={`r${i}`} at={q} depth={q.depth} r={r} helmet={helmet} jersey={jersey} /> }) })
  frame.brawlers.forEach((b, i) => { const q = project(b.pos); items.push({ depth: q.depth, node: <RunnerShape key={`b${i}`} at={q} depth={q.depth} r={b} helmet={b.side === 'batter' ? helmet : pCap?.cap ?? '#B91C1C'} jersey={b.side === 'batter' ? jersey : pJersey} /> }) })
  // 타자(방망이 들고 → 내려놓고 달린다)
  const bq = project(frame.batter.pos)
  const bs = figScale(bq.depth)
  items.push({
    depth: bq.depth, node: (
      <g key="B" opacity={frame.batter.opacity}>
        <RunnerShape at={bq} depth={bq.depth} r={{ run: frame.batter.run, opacity: 1, lean: 0 }} helmet={helmet} jersey={jersey} />
        {frame.batter.bat && (() => { const a = (-150 + 220 * frame.batter.swing) * (Math.PI / 180); const hx = bq.x + 2 * bs, hy = bq.y - 15 * bs; return <line x1={hx} y1={hy} x2={hx + Math.cos(a) * 15 * bs} y2={hy + Math.sin(a) * 15 * bs} stroke={bBat?.cap ?? '#8B5A2B'} strokeWidth={2.6 * bs} strokeLinecap="round" /> })()}
      </g>
    ),
  })
  items.sort((a, b) => b.depth - a.depth)
  const ball = frame.ball ? project(frame.ball) : null
  const shadow = frame.ball ? project(ground(frame.ball)) : null
  const ballR = ball ? Math.max(2.4, ((CAM.f * 0.074 * 2.6) / ball.depth) * frame.ballScale) : 0
  const home = P2(BASES3.home)
  const brawlQ = frame.brawl ? project(BRAWL_AT) : null
  const bk = brawlQ ? figScale(brawlQ.depth) : 1
  return (
    <g opacity={weight} data-layer="broadcast" pointerEvents="none">
      <g transform={frame.shake ? `translate(${frame.shake.x} ${frame.shake.y})` : undefined}>
        <Ballpark uid={uid} logo={logo} />
        {frame.board && (
          <g data-layer="board">
            <rect x={BOARD.x - 20} y={BOARD.y} width={BOARD.w + 40} height={BOARD.h + 4} rx="3" fill={frame.board.color} opacity={(0.25 + 0.3 * frame.board.pulse) * (1 - seg(frame.board.k, 0.85, 1))} />
            <text x={BOARD.x + BOARD.w / 2} y={BOARD.y + 17} textAnchor="middle" fontSize="17" fontWeight="900" fill={frame.board.color} paintOrder="stroke" stroke="#FFFFFF" strokeWidth="3.5" strokeLinejoin="round"
              opacity={1 - seg(frame.board.k, 0.85, 1)}>{frame.board.label}</text>
          </g>
        )}
        {prevLandings.map((s, i) => { const p = landingPoint(s); if (!p) return null; const q = P2(p); return <circle key={i} cx={q.x} cy={q.y} r="1.6" fill="#FFFFFF" stroke="#7A8491" strokeWidth="0.7" /> })}
        {frame.landed && (() => { const a = P2(frame.landed), b = P2(add(frame.landed, V(0, 4, 0))); return <g><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#DC2626" strokeWidth="1" /><polygon points={`${b.x},${b.y} ${b.x + 6},${b.y + 2} ${b.x},${b.y + 4}`} fill="#DC2626" /></g> })()}
        {frame.batBall && (() => { const a = P2(add(frame.batter.pos.x < 0 ? V(-0.5, 0, 0.6) : V(0.5, 0, 0.6), V(0, 0, 0))), b = P2(V(frame.batter.pos.x < 0 ? -1.6 : 1.6, 0, 1.2)); return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8B5A2B" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" /> })()}
        {items.map(i => i.node)}
        {frame.brawl && brawlQ && (
          <g data-layer="brawl">
            {Array.from({ length: 10 }, (_, i) => {
              const t = frame.brawl!.t, c = frame.brawl!.k
              return <circle key={i} cx={brawlQ.x + Math.cos(i * 0.63 + t / 400) * (24 + 5 * Math.sin(t / 70 + i * 2)) * bk} cy={brawlQ.y - 14 * bk + Math.sin(i * 0.63 + t / 400) * 9 * bk} r={(16 + 5 * Math.sin(t / 90 + i)) * c * bk} fill="#EDE3D1" stroke="#C9B89A" strokeWidth="1" />
            })}
            {Array.from({ length: 7 }, (_, i) => {
              const t = frame.brawl!.t, c = frame.brawl!.k
              const a = i * 0.9 + t / 160
              const r0 = 28 * c * bk, len = (46 + 9 * Math.sin(t / 50 + i * 3)) * c * bk
              const o = { x: brawlQ.x, y: brawlQ.y - 14 * bk }
              return <g key={`l${i}`}><line x1={o.x + Math.cos(a) * r0} y1={o.y + Math.sin(a) * r0 * 0.55} x2={o.x + Math.cos(a) * len} y2={o.y + Math.sin(a) * len * 0.55} stroke="#2B3440" strokeWidth={2.2 * bk} strokeLinecap="round" /><circle cx={o.x + Math.cos(a) * len} cy={o.y + Math.sin(a) * len * 0.55} r={2.8 * bk} fill={i % 2 ? helmet : pCap?.cap ?? '#B91C1C'} stroke="#2B3440" strokeWidth="0.8" /></g>
            })}
          </g>
        )}
        {frame.flyingCap && (() => { const q = P2(frame.flyingCap.at); return <path d="M-6 0 Q0 -8 6 0 L9 1 L-6 1 Z" fill={pCap?.cap ?? '#B91C1C'} transform={`translate(${q.x} ${q.y}) rotate(${frame.flyingCap.rot})`} /> })()}
        {frame.impact && <BurstShape at={P2(frame.impact.at as V3)} k={frame.impact.k} size={frame.impact.size} color={frame.impact.color} />}
        {frame.bursts.map((b, i) => <BurstShape key={i} at={'z' in b.at ? P2(b.at) : b.at} k={b.k} size={b.size} color={b.color} rays={12} />)}
        {ball && shadow && <ellipse cx={shadow.x} cy={shadow.y} rx={ballR * 1.2} ry={ballR * 0.4} fill="#2F3A33" opacity={0.28 * Math.max(0.2, 1 - (frame.ball!.y / 30))} />}
        {frame.trail.map((p, i) => { const q = project(p); return <circle key={i} cx={q.x} cy={q.y} r={ballR * (1 - i * 0.1)} fill="#FDE68A" opacity={0.5 * (1 - i / 9)} /> })}
        {ball && <circle cx={ball.x} cy={ball.y} r={ballR} fill="#FFFFFF" stroke="#B42318" strokeWidth="1.2" data-ball />}
        {frame.calls.map((c, i) => { const g = project(ground(c.at)); const q = g.depth > 85 ? { x: g.x, y: g.y + 13 } : P2(c.at) /* 외야는 선수 발밑(위쪽 자막과 안 겹치게) */; return <text key={i} x={q.x} y={q.y} textAnchor="middle" fontSize="14" fontWeight="900" fill={c.label === 'SAFE' ? '#15803D' : '#DC2626'} opacity={c.opacity} paintOrder="stroke" stroke="#FFFFFF" strokeWidth="3.5" strokeLinejoin="round" transform={`translate(${q.x} ${q.y}) scale(${c.scale}) translate(${-q.x} ${-q.y})`}>{c.label}</text> })}
        {frame.scores.map((k, i) => <text key={`s${i}`} x={home.x + 26 + i * 22} y={home.y - 26 - (i % 2) * 8 - 12 * ease(k)} textAnchor="middle" fontSize="13" fontWeight="900" fill="#F59E0B" opacity={1 - seg(k, 0.6, 1)} paintOrder="stroke" stroke="#FFFFFF" strokeWidth="3" strokeLinejoin="round">+1</text>)}
        {frame.marks.map((m, i) => { const q = P2(m.at); return <text key={`m${i}`} x={q.x} y={q.y - 6 * ease(m.k)} textAnchor="middle" fontSize={m.text.length <= 2 ? 15 : 12} fontWeight="900" fill={m.color} opacity={1 - seg(m.k, 0.65, 1)} paintOrder="stroke" stroke="#FFFFFF" strokeWidth="3" strokeLinejoin="round">{m.text}</text> })}
      </g>
    </g>
  )
}
