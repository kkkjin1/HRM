// 🥊 격투기 실시간 — 순수 함수(화면·채널과 분리, 테스트 가능). 축구(soccerNet)와 같은 채널 구조, 판정 방식만 다르다.
//
// - 방장: 판 전체(이동·펀치 판정·KO·CPU)를 step으로 진행하고 WORLD_EVERY_MS마다 전원 상태 + 전원의 지금 키를 방송.
// - 참가자: 누른 키(비트)를 방장에게 보낸다(바뀔 때 + 박동). 내 화면에선 내 키는 바로, 남의 키는 방장이 알려 준 마지막 키로
//           같은 step을 돌려 부드럽게 보여 주되, 판정(맞음·KO·판 끝)은 하지 않는다(judge: false) → 방장 소식으로 맞춘다.
//           내 몸은 방장 소식과 크게 다르지 않으면(맞지 않았고 가까우면) 내 위치를 그대로 둬 조작 지연을 없앤다.
// - 사람은 자리 번호(i)로 보낸다 — 모든 화면이 같은 자리 순서를 쓴다.

import type { Act, BrawlState, Fighter, Input } from './brawl'

export const WORLD_EVERY_MS = 83 // 방장 → 모두(초당 12번)
export const INPUT_BEAT_MS = 250 // 참가자 키 박동
export const GUEST_LOST_MS = 5000 // 이만큼 소식 없으면 그 자리는 CPU가 대신
export const HOST_LOST_MS = 6000
export const SNAP_DIST = 70 // 내 몸이 방장 소식과 이만큼 넘게 다르면 방장 쪽으로

const ACTS: Act[] = ['idle', 'jab', 'charge', 'strong', 'guard', 'stun', 'out', 'down']
const KEYS: (keyof Input)[] = ['left', 'right', 'up', 'down', 'jab', 'strong', 'attack']

export function encodeInput(i: Input): number {
  let b = 0
  KEYS.forEach((k, n) => { if (i[k]) b |= 1 << n })
  return b
}
export function decodeInput(b: number): Input {
  const o = {} as Input
  KEYS.forEach((k, n) => { o[k] = (b & (1 << n)) !== 0 })
  return o
}

const r1 = (v: number) => Math.round(v * 10) / 10
const r3 = (v: number) => Math.round(v * 1000) / 1000

// [x, y, vx, vy, facing, act, t, charge, pct, lives, stun, invuln, ground, airJumps, on, chargeKey(0 strong/1 attack), place, outAt, downT, mash, downUsed]
type FW = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]

export type BrawlWorldMsg = { k: 'w'; t: number; f: FW[]; b: number[]; over: 0 | 1; win: number }
export type BrawlGuestMsg =
  | { k: 'i'; i: number; b: number }
  | { k: 'q'; i: number }
export type BrawlWire = BrawlWorldMsg | BrawlGuestMsg

export function encodeWorld(s: BrawlState, inputs: Input[]): BrawlWorldMsg {
  return {
    k: 'w',
    t: r3(s.time),
    f: s.fighters.map(f => [
      r1(f.x), r1(f.y), r1(f.vx), r1(f.vy), f.facing, ACTS.indexOf(f.act), r3(f.t), r3(f.charge), f.pct, f.lives,
      r3(f.stun), r3(f.invuln), f.ground ? 1 : 0, f.airJumps, f.on ?? -1, f.chargeKey === 'attack' ? 1 : 0, f.place ?? 0, f.outAt === null ? -1 : r3(f.outAt), r3(f.downT), f.mash, f.downUsed ? 1 : 0,
    ]),
    b: inputs.map(encodeInput),
    over: s.over ? 1 : 0,
    win: s.winner ? s.fighters.findIndex(f => f.id === s.winner) : -1,
  }
}

function applyFighter(f: Fighter, w: FW) {
  f.x = w[0]; f.y = w[1]; f.vx = w[2]; f.vy = w[3]; f.facing = w[4] >= 0 ? 1 : -1
  f.act = ACTS[w[5]] ?? 'idle'; f.t = w[6]; f.charge = w[7]
  f.stun = w[10]; f.ground = w[12] === 1; f.airJumps = w[13]; f.on = w[14] < 0 ? null : w[14]
  f.chargeKey = w[15] === 1 ? 'attack' : 'strong'
  f.downT = w[18] ?? 0; f.mash = w[19] ?? 0
}

// 참가자: 방장 소식을 내 판에 반영. 바뀐 것(맞음·KO)은 화면 연출용으로 돌려준다
export function applyWorld(s: BrawlState, m: BrawlWorldMsg, myIdx: number): { hits: { i: number; strong: boolean }[]; kos: number[] } {
  const hits: { i: number; strong: boolean }[] = []
  const kos: number[] = []
  m.f.forEach((w, i) => {
    const f = s.fighters[i]
    if (!f) return
    const dPct = w[8] - f.pct
    if (w[9] < f.lives) kos.push(i)
    else if (dPct > 0) hits.push({ i, strong: dPct >= 8 })
    const hostAct = ACTS[w[5]] ?? 'idle'
    const mine = i === myIdx
    // 내 몸: 맞았거나·KO·멀리 어긋났으면 방장 쪽으로, 아니면 내 화면 위치를 그대로(조작 지연 0)
    const take = !mine || dPct !== 0 || w[9] !== f.lives || hostAct === 'stun' || hostAct === 'out' || hostAct === 'down' || f.act === 'stun' || f.act === 'down' || Math.hypot(w[0] - f.x, w[1] - f.y) > SNAP_DIST
    if (take) applyFighter(f, w)
    f.pct = w[8]; f.lives = w[9]; f.invuln = w[11]; f.place = w[16] || null; f.outAt = w[17] < 0 ? null : w[17]; f.downUsed = w[20] === 1
    if (hostAct === 'down') { f.act = 'down'; f.downT = w[18]; f.mash = w[19] }
    if (hostAct === 'out') f.act = 'out'
  })
  if (m.over && !s.over) { s.over = true; s.winner = m.win >= 0 ? s.fighters[m.win]?.id ?? null : null }
  return { hits, kos }
}
