// ⚽ 미니 축구 실시간 — 순수 함수(화면·채널과 분리, 테스트 가능). 폭탄 놀이터(bombNet.ts)와 같은 구조.
//
// - 방장: 공·판정·점수·시간·CPU를 모두 진행하고 WORLD_EVERY_MS마다 판 전체를 방송(soccer-방id).
// - 참가자: 내 몸(위치·동작)만 내 PC가 움직여 방장에게 보낸다(soccer-방id-in) → 조작 지연 0.
//           슛·패스는 내 화면에서 바로 공을 날리고(예측) 방장에게 알린다. 방장이 그 자리에서 다시 찬다.
//           방장이 나를 넘어뜨리면(kc 증가) 그 넉백을 내 몸에 적용한다.
// - 선수는 자리 번호(i)로 보낸다 — 모든 화면이 같은 자리 순서를 쓴다.
// - 시간: 서버 시계 기준 s.t = (서버시각 - startAt) / 1000.

import {
  ACTS, passBall, resetToKickoff, shootBall,
  type Phase, type SoccerPlayer, type SoccerState, type Team,
} from './soccer'

export const WORLD_EVERY_MS = 100 // 방장 → 모두 (초당 10번)
export const WORLD_EVERY_BIG_MS = 150 // 사람 5명 이상
export const POS_MIN_MS = 110 // 참가자 → 방장 (초당 최대 9번)
export const POS_MIN_BIG_MS = 170
export const POS_BEAT_MS = 450
export const GUEST_LOST_MS = 5000
export const HOST_LOST_MS = 6000
export const PREDICT_HOLD_SEC = 0.5 // 참가자가 찬 공을 방장 소식이 따라올 때까지 내 예측대로 두는 시간

const PHASES: Phase[] = ['play', 'goal', 'end']
const r1 = (v: number) => Math.round(v * 10) / 10
const r2 = (v: number) => Math.round(v * 100) / 100
const r3 = (v: number) => Math.round(v * 1000) / 1000

// [x, y, vx, vy, fx, fy, act, actUntil, stamina, kc, kx, ky, goals, steals, shots, charging(0/1), tired(0/1)]
type PW = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]

export interface SoccerWorldMsg {
  k: 'w'
  t: number
  ph: number
  pu: number
  sc: [number, number]
  gd: 0 | 1
  gs: number // goalSeq
  ko: number // kickoff 횟수
  w: 0 | 1 | 2 | 3 // 없음·A·B·무승부
  e: number | null
  lg: [number, number, 0 | 1] | null // 마지막 골 [팀 0/1, 넣은 사람 자리(-1), 자책]
  b: [number, number, number, number, number, number, number, number] // x y vx vy owner last lock lockUntil (자리, -1)
  p: PW[]
}

export type SoccerGuestMsg =
  | { k: 'p'; i: number; ko: number; kc: number; x: number; y: number; vx: number; vy: number; fx: number; fy: number; a: number; au: number; st: number; ch: 0 | 1 }
  | { k: 's'; i: number; x: number; y: number; fx: number; fy: number; pw: number }
  | { k: 'ps'; i: number; x: number; y: number; fx: number; fy: number }
  | { k: 'q'; i: number }

export type SoccerWire = SoccerWorldMsg | SoccerGuestMsg

export function encodeWorld(s: SoccerState): SoccerWorldMsg {
  const extra = s
  const idx = (id: string | null) => (id ? s.players.findIndex(p => p.id === id) : -1)
  const b = s.ball
  return {
    k: 'w',
    t: r3(s.t),
    ph: PHASES.indexOf(s.phase),
    pu: r3(s.phaseUntil),
    sc: [s.score.A, s.score.B],
    gd: s.golden ? 1 : 0,
    gs: s.goalSeq,
    ko: extra.ko,
    w: s.winner === 'A' ? 1 : s.winner === 'B' ? 2 : s.winner === 'draw' ? 3 : 0,
    e: s.endedAt,
    lg: extra.lastGoal ? [extra.lastGoal.team === 'A' ? 0 : 1, idx(extra.lastGoal.by), extra.lastGoal.own ? 1 : 0] : null,
    b: [r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), idx(b.owner), idx(b.last), idx(b.lockId), r3(b.lockUntil)],
    p: s.players.map(p => [
      r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), r2(p.fx), r2(p.fy), ACTS.indexOf(p.act), r3(p.actUntil), r2(p.stamina),
      p.kc, r1(p.kx), r1(p.ky), p.goals, p.steals, p.shots, p.chargeAt !== null ? 1 : 0, p.tired ? 1 : 0,
    ]),
  }
}

export interface SoccerGuestLocal {
  myIdx: number
  predictUntil: number // 이 시각까지는 공을 내 예측대로(내가 방금 찬 공)
}

/** 참가자: 방장 소식 반영. 내 몸은 내 것을 유지(넉백만 받는다). 반환 = 킥오프로 내가 제자리로 돌아갔는지 */
export function applyWorld(s: SoccerState, m: SoccerWorldMsg, me: SoccerGuestLocal): { kickoff: boolean; knocked: boolean } {
  const id = (i: number) => (i >= 0 ? s.players[i]?.id ?? null : null)
  let kickoff = false
  let knocked = false
  s.phase = PHASES[m.ph] ?? 'play'
  s.phaseUntil = m.pu
  s.score.A = m.sc[0]
  s.score.B = m.sc[1]
  s.golden = m.gd === 1
  s.goalSeq = m.gs
  s.winner = m.w === 1 ? 'A' : m.w === 2 ? 'B' : m.w === 3 ? 'draw' : null
  s.endedAt = m.e
  s.lastGoal = m.lg ? { team: (m.lg[0] === 0 ? 'A' : 'B') as Team, by: id(m.lg[1]), own: m.lg[2] === 1 } : null
  m.p.forEach((w, i) => {
    const p = s.players[i]
    if (!p) return
    if (i === me.myIdx) {
      // 넉백: 방장이 나를 넘어뜨렸다
      if (w[9] > p.kc) {
        p.kc = w[9]
        p.act = 'down'
        p.actUntil = w[7]
        p.vx = w[10]
        p.vy = w[11]
        p.chargeAt = null
        knocked = true
      }
      p.goals = w[12]
      p.steals = w[13]
      p.shots = w[14]
      return
    }
    p.x = w[0]; p.y = w[1]; p.vx = w[2]; p.vy = w[3]; p.fx = w[4]; p.fy = w[5]
    p.act = ACTS[w[6]] ?? 'none'
    p.actUntil = w[7]
    p.stamina = w[8]
    p.kc = w[9]; p.kx = w[10]; p.ky = w[11]
    p.goals = w[12]; p.steals = w[13]; p.shots = w[14]
    p.chargeAt = w[15] ? (p.chargeAt ?? m.t) : null
    p.tired = w[16] === 1
    p.moving = Math.hypot(p.vx, p.vy) > 20
  })
  // 킥오프: 방장이 모두를 제자리로 보냈다 → 내 몸도
  if (m.ko > s.ko) {
    s.ko = m.ko
    const p = s.players[me.myIdx]
    if (p) {
      resetToKickoff(s, p, s.lastGoal ? (s.lastGoal.team === 'A' ? 'B' : 'A') : null)
      kickoff = true
    }
    me.predictUntil = 0
  }
  // 공
  const b = s.ball
  const owner = id(m.b[4])
  const myId = s.players[me.myIdx]?.id
  const predicting = s.t < me.predictUntil && owner === myId
  if (!predicting) {
    b.x = m.b[0]; b.y = m.b[1]; b.vx = m.b[2]; b.vy = m.b[3]
    b.owner = owner
    b.last = id(m.b[5])
    b.lockId = id(m.b[6])
    b.lockUntil = m.b[7]
    if (owner !== myId) me.predictUntil = 0
  }
  return { kickoff, knocked }
}

/** 방장: 참가자 소식 반영. 반환 = 반영했는지 */
export function applyGuest(s: SoccerState, m: SoccerGuestMsg): boolean {
  const p = s.players[m.i]
  if (!p) return false
  switch (m.k) {
    case 'p': {
      if (m.ko !== s.ko) return false // 킥오프 전 위치 — 무시
      // 내가(방장) 넘어뜨렸는데 참가자가 아직 모르면 위치·동작은 받지 않는다
      if (m.kc < p.kc) return false
      if (s.phase !== 'play') return false
      p.x = m.x; p.y = m.y; p.vx = m.vx; p.vy = m.vy; p.fx = m.fx; p.fy = m.fy
      const act = ACTS[m.a] ?? 'none'
      if (act !== 'down' || p.act === 'down') {
        p.act = act
        p.actUntil = m.au
      }
      p.stamina = m.st
      p.chargeAt = m.ch ? (p.chargeAt ?? s.t) : null
      p.moving = Math.hypot(p.vx, p.vy) > 20
      return true
    }
    case 's':
    case 'ps': {
      if (s.ball.owner !== p.id || s.phase !== 'play') return false
      p.x = m.x; p.y = m.y; p.fx = m.fx; p.fy = m.fy
      if (m.k === 's') shootBall(s, p, m.pw)
      else passBall(s, p)
      return true
    }
    case 'q':
      return false
  }
}

export function guestPos(p: SoccerPlayer, i: number, ko: number): Extract<SoccerGuestMsg, { k: 'p' }> {
  return {
    k: 'p', i, ko, kc: p.kc, x: r1(p.x), y: r1(p.y), vx: r1(p.vx), vy: r1(p.vy), fx: r2(p.fx), fy: r2(p.fy),
    a: ACTS.indexOf(p.act), au: r3(p.actUntil), st: r2(p.stamina), ch: p.chargeAt !== null ? 1 : 0,
  }
}

/** 참가자: 위치를 보낼 때인가 (움직이면 자주, 가만있으면 가끔, 동작이 바뀌면 바로) */
export function shouldSendPos(last: { x: number; y: number; a: number; ch: number; at: number } | null, cur: { x: number; y: number; a: number; ch: number }, nowMs: number, minMs = POS_MIN_MS) {
  if (!last) return true
  if (last.a !== cur.a || last.ch !== cur.ch) return true
  const age = nowMs - last.at
  if (age >= POS_BEAT_MS) return true
  if (age < minMs) return false
  return Math.abs(last.x - cur.x) > 0.5 || Math.abs(last.y - cur.y) > 0.5
}
