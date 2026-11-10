// 💣 폭탄 놀이터 실시간 대전 통신 — 순수 함수(화면·채널과 분리, 테스트 가능).
//
// 구조 (방장 1명 + 참가자 여럿)
// - 방장: 판 전체(폭탄·불꽃·상자·아이템·모두의 위치·능력·상태)를 WORLD_EVERY_MS마다 방송(bomb-방id 채널).
//         CPU도 방장 PC가 움직인다. 아이템 줍기·부활·탈락·승패도 방장만 판정.
// - 참가자: 내 위치만 방장 전용 채널(bomb-방id-in)로 보낸다 — 다른 참가자에게 안 가서 메시지 수가 준다.
//           내 이동·내 피격은 내 PC가 판정(조작 지연 0, "분명 피했는데"가 없게). 폭탄은 놓는 즉시 내 화면에 그리고 알린다.
//           방장 소식을 받으면 그 시각부터 지금까지 폭탄 터짐만 다시 돌려(fastForward) 화면이 뒤로 튀지 않게 한다.
// - 시간: 모두 서버 시계 기준 s.t = (서버시각 - startAt) / 1000. 그래서 폭탄이 모든 화면에서 같은 순간에 터진다.

import {
  FUSE_SEC, hitPlayer, idx, stepBomb,
  type Bomb, type BombPlayer, type BombState, type Dir, type Flame, type ItemKind, type Status, type Team,
} from './bomb'

export const WORLD_EVERY_MS = 125 // 방장 → 모두 (초당 8번)
export const POS_MIN_MS = 140 // 참가자 → 방장, 움직일 때 이보다 자주는 안 보냄 (초당 최대 7번)
export const POS_BEAT_MS = 450 // 가만히 있어도 이만큼마다 (살아 있다는 신호)
// 사람 5명 이상(3:3)일 때 — Supabase 무료 한도(초당 100, 받는 사람 수만큼 셈) 안에 들게
export const WORLD_EVERY_BIG_MS = 170
export const POS_MIN_BIG_MS = 200
export const GUEST_LOST_MS = 5000 // 이만큼 소식이 없으면 방장이 그 자리를 CPU로 넘김
export const HOST_LOST_MS = 6000 // 참가자: 방장 소식이 이만큼 없으면 판 종료

const DIRS: Dir[] = ['up', 'down', 'left', 'right']
const STATUSES: Status[] = ['alive', 'ghost', 'out']
const ARMS: Flame['arm'][] = ['center', 'up', 'down', 'left', 'right']
const ITEMS: ItemKind[] = ['fire', 'bomb', 'speed']
const r2 = (v: number) => Math.round(v * 100) / 100
const r3 = (v: number) => Math.round(v * 1000) / 1000

// [id, x, y, dir, moving, range, maxBombs, speedLv, status, ghostUntil, shieldUntil, hits, rescues, pops]
type PW = [string, number, number, number, 0 | 1, number, number, number, number, number, number, number, number, number]

export interface WorldMsg {
  k: 'w'
  t: number
  g: string // 칸 상태 문자열 ('0' 빈칸 '1' 벽 '2' 상자)
  it: [number, number, number][] // [칸, 종류, safeUntil]
  b: [number, number, number, string, number, number, number][] // [id, cx, cy, owner, range, placedAt, explodeAt]
  f: [number, number, number, 0 | 1, number, number, string][] // [cx, cy, arm, end, at, until, owner]
  p: PW[]
  n: number // nextBombId
  bl: number // blocksLeft
  gv: number // gridVersion
  w: Team | 'draw' | null
  e: number | null // endedAt
}

export type GuestMsg =
  | { k: 'p'; id: string; x: number; y: number; d: number; m: 0 | 1 }
  | { k: 'b'; id: string; cx: number; cy: number; at: number }
  | { k: 'h'; id: string; by: string; at: number }
  | { k: 'q'; id: string }

export type BombWire = WorldMsg | GuestMsg

export function encodeWorld(s: BombState): WorldMsg {
  return {
    k: 'w',
    t: r3(s.t),
    g: s.grid.join(''),
    it: Object.entries(s.items).map(([k, it]) => [Number(k), ITEMS.indexOf(it.kind), r3(it.safeUntil)]),
    b: s.bombs.map(b => [b.id, b.cx, b.cy, b.owner, b.range, r3(b.placedAt), r3(b.explodeAt)]),
    f: s.flames.map(f => [f.cx, f.cy, ARMS.indexOf(f.arm), f.end ? 1 : 0, r3(f.at), r3(f.until), f.owner]),
    p: s.players.map(p => [
      p.id, r2(p.x), r2(p.y), DIRS.indexOf(p.dir), p.moving ? 1 : 0, p.range, p.maxBombs, p.speedLv,
      STATUSES.indexOf(p.status), r3(p.ghostUntil), r3(p.shieldUntil), p.hits, p.rescues, p.pops,
    ]),
    n: s.nextBombId,
    bl: s.blocksLeft,
    gv: s.gridVersion,
    w: s.winner,
    e: s.endedAt,
  }
}

export interface GuestLocal {
  myId: string
  hitAt: number | null // 내가 맞았다고 알린 시각 (방장 소식에 아직 반영 안 됐을 수 있음)
  pending: Bomb[] // 내가 놓았는데 방장 소식에 아직 없는 폭탄
}

// 참가자: 방장 소식을 내 상태에 반영. 내 위치·방향은 내 것을 유지하고, 그 뒤 지금 시각까지 폭탄 터짐을 다시 돌린다.
export function applyWorld(s: BombState, m: WorldMsg, me: GuestLocal, nowT: number) {
  const mine = s.players.find(p => p.id === me.myId)
  const keep = mine ? { x: mine.x, y: mine.y, dir: mine.dir, moving: mine.moving, status: mine.status, ghostUntil: mine.ghostUntil } : null
  const gridChanged = m.gv !== s.gridVersion || m.g !== s.grid.join('')
  if (gridChanged) {
    for (let i = 0; i < m.g.length; i++) s.grid[i] = Number(m.g[i]) as 0 | 1 | 2
    s.gridVersion = Math.max(s.gridVersion, m.gv) + 1 // 화면 다시 그리기
  }
  s.t = m.t
  s.items = {}
  for (const [k, kind, safe] of m.it) s.items[k] = { kind: ITEMS[kind], safeUntil: safe }
  s.bombs = m.b.map(([id, cx, cy, owner, range, placedAt, explodeAt]) => ({ id, cx, cy, owner, range, placedAt, explodeAt }))
  // 내가 놓은 폭탄 중 아직 소식에 없는 것(0.6초까지)은 남겨 둔다
  me.pending = me.pending.filter(b => nowT - b.placedAt < 0.6 && !s.bombs.some(o => o.cx === b.cx && o.cy === b.cy))
  for (const b of me.pending) if (b.explodeAt > m.t) s.bombs.push({ ...b })
  s.flames = m.f.map(([cx, cy, arm, end, at, until, owner]) => ({ cx, cy, arm: ARMS[arm], end: !!end, at, until, owner }))
  for (const w of m.p) {
    const p = s.players.find(o => o.id === w[0])
    if (!p) continue
    applyPlayer(p, w)
  }
  s.nextBombId = Math.max(s.nextBombId, m.n)
  s.blocksLeft = m.bl
  s.winner = m.w
  s.endedAt = m.e
  if (mine && keep) {
    // 내 위치는 내가 정한다
    mine.x = keep.x
    mine.y = keep.y
    mine.dir = keep.dir
    mine.moving = keep.moving
    // 방금 맞았다고 알렸는데 방장이 아직 모르는 상태면 유령 유지
    if (keep.status === 'ghost' && mine.status === 'alive' && me.hitAt !== null && m.t < me.hitAt + 0.6) {
      mine.status = 'ghost'
      mine.ghostUntil = keep.ghostUntil
    }
  }
  fastForward(s, nowT)
}

function applyPlayer(p: BombPlayer, w: PW) {
  p.x = w[1]
  p.y = w[2]
  p.dir = DIRS[w[3]]
  p.moving = w[4] === 1
  p.range = w[5]
  p.maxBombs = w[6]
  p.speedLv = w[7]
  p.status = STATUSES[w[8]]
  p.ghostUntil = w[9]
  p.shieldUntil = w[10]
  p.hits = w[11]
  p.rescues = w[12]
  p.pops = w[13]
}

// 소식 시각(s.t)부터 nowT까지 폭탄 터짐·불꽃만 다시 돌린다 (이동·피격·판정 없음)
export function fastForward(s: BombState, nowT: number, step = 1 / 60) {
  const end = s.endedAt
  let n = 0
  while (s.t + step <= nowT + 1e-9 && n < 120) {
    stepBomb(s, {}, step, { move: new Set(), hit: new Set(), world: true, judge: false })
    n++
  }
  if (s.t < nowT) s.t = nowT
  s.endedAt = end
  s.events = []
}

// 방장: 참가자 소식 반영. 반환값 = 반영했는지
export function applyGuest(s: BombState, m: GuestMsg): boolean {
  const p = s.players.find(o => o.id === m.id)
  if (!p) return false
  switch (m.k) {
    case 'p':
      if (p.status === 'out') return false
      p.x = m.x
      p.y = m.y
      p.dir = DIRS[m.d] ?? p.dir
      p.moving = m.m === 1
      return true
    case 'b': {
      if (p.status !== 'alive') return false
      const at = Math.min(s.t, Math.max(s.t - 0.4, m.at)) // 늦게 온 만큼은 인정하되 0.4초까지만
      const mine = s.bombs.filter(b => b.owner === p.id).length
      if (mine >= p.maxBombs || s.bombs.some(b => b.cx === m.cx && b.cy === m.cy) || s.grid[idx(s, m.cx, m.cy)] !== 0) return false
      s.bombs.push({ id: s.nextBombId++, cx: m.cx, cy: m.cy, owner: p.id, range: p.range, placedAt: at, explodeAt: at + FUSE_SEC })
      s.events.push({ kind: 'place', id: p.id })
      return true
    }
    case 'h':
      return hitPlayer(s, p, m.by)
    case 'q':
      return false
  }
}

// 참가자: 내 위치 소식을 보낼 때인가
export function shouldSendPos(last: { x: number; y: number; d: number; m: 0 | 1; at: number } | null, cur: { x: number; y: number; d: number; m: 0 | 1 }, nowMs: number, minMs = POS_MIN_MS) {
  if (!last) return true
  const age = nowMs - last.at
  if (age >= POS_BEAT_MS) return true
  if (age < minMs) return false
  return Math.abs(last.x - cur.x) > 0.02 || Math.abs(last.y - cur.y) > 0.02 || last.d !== cur.d || last.m !== cur.m
}

// 다른 사람 캐릭터를 부드럽게: 받은 위치 + 움직이는 중이면 받은 뒤 지난 시간만큼 앞으로(최대 0.15초)
export function predictPos(p: { x: number; y: number; dir: Dir; moving: boolean }, ageSec: number, speed: number) {
  if (!p.moving) return { x: p.x, y: p.y }
  const k = Math.min(0.15, Math.max(0, ageSec)) * speed
  const [dx, dy] = p.dir === 'left' ? [-1, 0] : p.dir === 'right' ? [1, 0] : p.dir === 'up' ? [0, -1] : [0, 1]
  return { x: p.x + dx * k, y: p.y + dy * k }
}

export const dirCode = (d: Dir) => DIRS.indexOf(d)
