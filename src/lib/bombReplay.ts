// 🎬 폭탄 놀이터 리플레이 — 경기 중 최근 장면을 기록해 두었다가, 끝나면 "왜 죽었는지"를 다시 보여 준다(2026-11-10).
// 통신과 무관하게 각자 자기 화면(s)을 그대로 찍는다. 화면(BombArena)은 프레임을 BombState 모양으로 되돌려 같은 그림으로 그린다.

import type { Bomb, BombPlayer, BombState, Cell, Flame, Item } from './bomb'

export const REC_FPS = 30
export const RING_SEC = 16 // 맞기 몇 초 전 ~ 유령 6초 ~ 탈락 뒤까지 들어가게
export const AFTER_OUT_SEC = 1.2 // 탈락 뒤 조금 더 찍고 잘라 둔다

export type RPlayer = Pick<BombPlayer, 'id' | 'team' | 'x' | 'y' | 'dir' | 'moving' | 'status' | 'range' | 'shieldUntil' | 'ghostUntil'>
export interface Frame {
  t: number
  players: RPlayer[]
  bombs: Bomb[]
  flames: Flame[]
  items: Record<number, Item>
  grid: Cell[] // 상자가 부서질 때만 새 배열(같은 판은 같은 참조)
  gridVersion: number
}

export class Recorder {
  frames: Frame[] = []
  private lastT = -Infinity
  private grid: Cell[] | null = null
  private gridV = -1
  rec(s: BombState) {
    // 판이 끝난 순간은 간격과 상관없이 꼭 찍는다(맞자마자 끝나면 그 장면이 빠졌었다)
    const final = s.endedAt !== null && s.t !== this.lastT
    if (s.t < 0 || (!final && s.t - this.lastT < 1 / REC_FPS - 1e-6)) return
    this.lastT = s.t
    if (s.gridVersion !== this.gridV || !this.grid) { this.grid = s.grid.slice(); this.gridV = s.gridVersion }
    this.frames.push({
      t: s.t,
      players: s.players.map(p => ({ id: p.id, team: p.team, x: p.x, y: p.y, dir: p.dir, moving: p.moving, status: p.status, range: p.range, shieldUntil: p.shieldUntil, ghostUntil: p.ghostUntil })),
      bombs: s.bombs.map(b => ({ ...b })),
      flames: s.flames.map(f => ({ ...f })),
      items: { ...s.items },
      grid: this.grid,
      gridVersion: this.gridV,
    })
    const cut = s.t - RING_SEC
    let n = 0
    while (n < this.frames.length && this.frames[n].t < cut) n++
    if (n) this.frames.splice(0, n)
  }
}

export interface DeathStory {
  targetId: string
  hitT: number | null
  bomb: { cx: number; cy: number; owner: string; range: number; placedAt: number; explodeAt: number } | null
  ownerId: string | null // 맞힌 불꽃(폭탄) 주인
  outT: number | null
  outBy: string | null // 유령일 때 닿아서 터뜨린 상대
  outKind: 'pop' | 'timeout' | 'ended' | null // ended = 유령인 채로 판이 끝남(팀 전멸)
  startT: number
  endT: number
}

const near = (a: RPlayer, b: RPlayer, d: number) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= d * d

// targetId 를 정하지 않으면 마지막으로 맞은 사람(결정적 장면)
export function analyze(frames: Frame[], targetId?: string): DeathStory | null {
  if (frames.length < 2) return null
  const st = (i: number, id: string) => frames[i].players.find(p => p.id === id)
  let tid = targetId
  let hitI = -1
  const isHit = (i: number, id: string) => st(i - 1, id)?.status === 'alive' && st(i, id)?.status === 'ghost'
  if (tid) {
    for (let i = frames.length - 1; i >= 1; i--) if (isHit(i, tid)) { hitI = i; break }
  } else {
    for (let i = frames.length - 1; i >= 1 && hitI < 0; i--)
      for (const p of frames[i].players) if (isHit(i, p.id)) { hitI = i; tid = p.id; break }
  }
  if (!tid) return null
  const first = frames[0].t, last = frames[frames.length - 1].t
  if (hitI < 0) return { targetId: tid, hitT: null, bomb: null, ownerId: null, outT: null, outBy: null, outKind: null, startT: Math.max(first, last - 6), endT: last }
  const hitT = frames[hitI].t
  const me = st(hitI, tid)!
  const cx = Math.round(me.x), cy = Math.round(me.y)
  // 맞은 칸의 불꽃 → 주인
  let flame: Flame | undefined
  for (const j of [hitI, hitI - 1, hitI + 1]) {
    const f = frames[j]?.flames.find(q => q.cx === cx && q.cy === cy)
    if (f) { flame = f; break }
  }
  const ownerId = flame?.owner ?? null
  // 그 불꽃을 만든 폭탄: 주인이 놓았고 맞은 칸과 한 줄(범위 안)에 있으며, 맞기 직전에 터진 것
  let bomb: DeathStory['bomb'] = null
  if (ownerId) {
    const seen = new Map<string, Bomb>()
    for (let i = hitI; i >= 0; i--)
      for (const b of frames[i].bombs) {
        if (b.owner !== ownerId) continue
        const k = `${b.cx},${b.cy},${b.placedAt.toFixed(2)}`
        if (!seen.has(k)) seen.set(k, b)
      }
    let best: Bomb | null = null
    for (const b of seen.values()) {
      const inLine = (b.cx === cx && Math.abs(b.cy - cy) <= b.range) || (b.cy === cy && Math.abs(b.cx - cx) <= b.range)
      if (!inLine || b.placedAt > hitT) continue
      // 연쇄로 일찍 터졌을 수도 있으니 explodeAt 대신 "맞은 순간 뒤로는 안 보이는" 폭탄 중 가장 늦게 놓은 것
      const stillAfter = frames[Math.min(frames.length - 1, hitI + 1)].bombs.some(q => q.owner === b.owner && q.cx === b.cx && q.cy === b.cy && Math.abs(q.placedAt - b.placedAt) < 0.01)
      if (stillAfter) continue
      if (!best || b.placedAt > best.placedAt) best = b
    }
    if (best) bomb = { cx: best.cx, cy: best.cy, owner: best.owner, range: best.range, placedAt: best.placedAt, explodeAt: Math.min(best.explodeAt, hitT) }
  }
  // 탈락
  let outT: number | null = null, outBy: string | null = null, outKind: DeathStory['outKind'] = null
  for (let i = hitI + 1; i < frames.length; i++) {
    const p = st(i, tid)
    if (!p) break
    if (p.status === 'alive') break // 구출됨 → 탈락 아님(이 경우 hitI가 마지막 맞음이 아니므로 거의 없음)
    if (p.status === 'out') {
      outT = frames[i].t
      const prev = st(i - 1, tid) ?? p
      const foe = [i, i - 1].flatMap(j => frames[j].players).find(o => o.team !== p.team && o.status === 'alive' && near(o, prev, 1.05))
      if (foe) { outKind = 'pop'; outBy = foe.id } else outKind = 'timeout'
      break
    }
  }
  if (outT === null && st(frames.length - 1, tid)?.status === 'ghost') outKind = 'ended'
  const startT = Math.max(first, Math.min(hitT - 2.5, bomb ? bomb.placedAt - 0.8 : hitT - 2.5))
  // 끝: 탈락(또는 맞음) 1.2초 뒤까지. 판이 그 순간 끝나 기록이 없으면 마지막 장면에서 멈춰 보여 준다(frameAt이 끝 프레임 유지)
  const endT = Math.max(Math.min(last, (outT ?? hitT) + 1.2), (outT ?? hitT) + 1.2)
  return { targetId: tid, hitT, bomb, ownerId, outT, outBy, outKind, startT, endT }
}

// 재생 속도: 맞는 순간·탈락 순간 앞뒤는 느리게
export function playRate(story: DeathStory, t: number) {
  const slow = (c: number | null, a: number, b: number) => c !== null && t >= c - a && t <= c + b
  if (slow(story.hitT, 0.45, 0.35)) return 0.3
  if (slow(story.outT, 0.35, 0.3)) return 0.4
  return 1
}

// t 시각의 장면(사람 위치는 앞뒤 프레임 사이를 이어 부드럽게)
export function frameAt(frames: Frame[], t: number): Frame {
  let lo = 0, hi = frames.length - 1
  if (t <= frames[0].t) return frames[0]
  if (t >= frames[hi].t) return frames[hi]
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (frames[m].t <= t) lo = m; else hi = m }
  const a = frames[lo], b = frames[hi]
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t)
  return {
    ...a, t,
    players: a.players.map(p => {
      const q = b.players.find(o => o.id === p.id)
      if (!q || Math.abs(q.x - p.x) + Math.abs(q.y - p.y) > 1.5) return p // 순간이동·부활 자리 이동은 끊어서
      return { ...p, x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k }
    }),
  }
}
