// 💣 폭탄 놀이터 CPU — 빈자리 채우기용. 순수 함수(상태를 바꾸지 않음), 매 step 호출해도 되게 가볍게.
// 우선순위: ① 위험하면 피하기 ② 유령 된 같은 팀 구하러 가기 ③ 상대 유령 터뜨리기 ④ 가까운 아이템
//          ⑤ 상자/상대 옆이면(도망칠 길이 있을 때만) 폭탄 ⑥ 상자 옆이나 상대 쪽으로 가기
// 유령이면 가까운 같은 팀 쪽으로 천천히 간다.

import {
  FLAME_SEC, FUSE_SEC, blastCells, free, idx, playerSpeed,
  type BombInput, type BombPlayer, type BombState, type Dir,
} from './bomb'

export interface CpuMem {
  rnd: () => number
  nextThink: number // 이 시각 전엔 지난 판단 유지
  path: number[] // 갈 칸들(idx)
  wantBomb: boolean
  bombCool: number
}

export function newCpuMem(rnd: () => number): CpuMem {
  return { rnd, nextThink: 0, path: [], wantBomb: false, bombCool: 0 }
}

const NEI: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

// 칸별로 "언제 불꽃이 닿는지"(초, s.t 기준 절대시각). 연쇄는 간단히 두 번 훑어 반영. 지금 타는 칸은 s.t.
export function dangerMap(s: BombState, extra?: { cx: number; cy: number; range: number }): Float64Array {
  const d = new Float64Array(s.cols * s.rows).fill(Infinity)
  const bombs = s.bombs.map(b => ({ cx: b.cx, cy: b.cy, range: b.range, at: b.explodeAt }))
  if (extra) bombs.push({ ...extra, at: s.t + FUSE_SEC })
  for (let pass = 0; pass < 2; pass++)
    for (const b of bombs)
      for (const c of blastCells(s, b.cx, b.cy, b.range)) {
        const k = idx(s, c.cx, c.cy)
        if (b.at < d[k]) d[k] = b.at
        // 다른 폭탄에 닿으면 그 폭탄도 같이 터짐
        for (const o of bombs) if (o !== b && o.cx === c.cx && o.cy === c.cy && b.at < o.at) o.at = b.at
      }
  for (const f of s.flames) d[idx(s, f.cx, f.cy)] = Math.min(d[idx(s, f.cx, f.cy)], s.t)
  return d
}

// 칸 k에 t 시각에 서 있어도 되나
function safeAt(s: BombState, d: Float64Array, k: number, t: number) {
  const at = d[k]
  if (at === Infinity) return true
  return t < at - 0.2 || t > at + FLAME_SEC + 0.1
}

// 지금 따라가던 경로가 아직 안전한가 (도망치다가 방향을 자꾸 바꾸지 않게)
function pathOk(s: BombState, p: BombPlayer, d: Float64Array, path: number[]) {
  if (!path.length) return false
  const speed = playerSpeed(p, s)
  for (let i = 0; i < path.length; i++) {
    const k = path[i]
    const x = k % s.cols
    const y = Math.floor(k / s.cols)
    const arrive = s.t + (i + 1) / speed
    if (!free(s, x, y) || !safeAt(s, d, k, arrive)) return false
  }
  return d[path[path.length - 1]] === Infinity
}

// 완벽히 안전한 칸이 없을 때 — 갈 수 있는 칸 중 가장 늦게 불이 닿는 칸으로
function bfsLatest(s: BombState, p: BombPlayer, d: Float64Array, maxSteps = 20): number[] {
  const start = idx(s, Math.round(p.x), Math.round(p.y))
  const speed = playerSpeed(p, s)
  const prev = new Int32Array(s.cols * s.rows).fill(-2)
  const steps = new Int32Array(s.cols * s.rows)
  prev[start] = -1
  const q = [start]
  let best = start
  for (let h = 0; h < q.length; h++) {
    const k = q[h]
    if (d[k] > d[best]) best = k
    if (steps[k] >= maxSteps) continue
    const x = k % s.cols
    const y = Math.floor(k / s.cols)
    for (const [dx, dy] of NEI) {
      const nk = idx(s, x + dx, y + dy)
      if (prev[nk] !== -2 || !free(s, x + dx, y + dy)) continue
      if (s.t + (steps[k] + 1) / speed >= d[nk] - 0.05) continue
      prev[nk] = k
      steps[nk] = steps[k] + 1
      q.push(nk)
    }
  }
  const path: number[] = []
  for (let c = best; c !== start; c = prev[c]) path.push(c)
  return path.reverse()
}

// BFS — 시작 칸에서 목표(goal) 칸까지 안전하게 갈 수 있는 경로. 못 가면 null.
function bfs(s: BombState, p: BombPlayer, d: Float64Array, goal: (k: number, steps: number) => boolean, maxSteps = 40, ghost = false): number[] | null {
  const sx = Math.round(p.x)
  const sy = Math.round(p.y)
  const start = idx(s, sx, sy)
  const speed = playerSpeed(p, s)
  const prev = new Int32Array(s.cols * s.rows).fill(-2)
  const steps = new Int32Array(s.cols * s.rows)
  prev[start] = -1
  const q = [start]
  for (let h = 0; h < q.length; h++) {
    const k = q[h]
    if (goal(k, steps[k])) {
      const path: number[] = []
      for (let c = k; c !== start; c = prev[c]) path.push(c)
      return path.reverse()
    }
    if (steps[k] >= maxSteps) continue
    const x = k % s.cols
    const y = Math.floor(k / s.cols)
    for (const [dx, dy] of NEI) {
      const nx = x + dx
      const ny = y + dy
      const nk = idx(s, nx, ny)
      if (prev[nk] !== -2 || !free(s, nx, ny)) continue
      const arrive = s.t + (steps[k] + 1) / speed
      // 들어가는 순간과 다 지나가는 순간 모두 안전해야
      if (!ghost && (!safeAt(s, d, nk, arrive) || !safeAt(s, d, nk, arrive + 1 / speed))) continue
      prev[nk] = k
      steps[nk] = steps[k] + 1
      q.push(nk)
    }
  }
  return null
}

const enemyOf = (s: BombState, p: BombPlayer) => s.players.filter(o => o.team !== p.team && o.status === 'alive')
const near = (a: BombPlayer, k: number, cols: number) => Math.round(a.x) === k % cols && Math.round(a.y) === Math.floor(k / cols)

// 폭탄을 지금 놓으면 상자/상대를 맞힐 수 있나
function worthBombing(s: BombState, p: BombPlayer) {
  const cx = Math.round(p.x)
  const cy = Math.round(p.y)
  let blocks = 0
  let enemies = 0
  for (const c of blastCells(s, cx, cy, p.range)) {
    if (s.grid[idx(s, c.cx, c.cy)] === 2) blocks++
    for (const e of enemyOf(s, p)) if (Math.round(e.x) === c.cx && Math.round(e.y) === c.cy) enemies++
  }
  return { blocks, enemies }
}

function dirToward(p: BombPlayer, k: number, cols: number): Dir | null {
  const tx = k % cols
  const ty = Math.floor(k / cols)
  const dx = tx - p.x
  const dy = ty - p.y
  if (Math.abs(dx) < 0.04 && Math.abs(dy) < 0.04) return null
  // 옆 축이 많이 어긋나 있으면 그쪽부터 (모서리에서 걸리지 않게)
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

export function cpuInput(s: BombState, p: BombPlayer, mem: CpuMem): BombInput {
  if (p.status === 'out') return { dir: null, bomb: false }
  const cur = idx(s, Math.round(p.x), Math.round(p.y))

  if (p.status === 'ghost') {
    // 유령 — 가장 가까운 살아 있는 같은 팀에게
    const mates = s.players.filter(o => o !== p && o.team === p.team && o.status === 'alive')
    if (!mates.length) return { dir: null, bomb: false }
    const d = new Float64Array(s.cols * s.rows).fill(Infinity)
    const path = bfs(s, p, d, k => mates.some(m => near(m, k, s.cols)), 30, true)
    return { dir: path?.length ? dirToward(p, path[0], s.cols) : null, bomb: false }
  }

  const d = dangerMap(s)
  // 지난 판단 유지 중이면 경로 따라가기 (단, 위험해지면 바로 다시 생각)
  const danger = !safeAt(s, d, cur, s.t) || !safeAt(s, d, cur, s.t + 0.6)
  if (s.t < mem.nextThink && !danger) return follow(s, p, mem, cur)
  mem.nextThink = s.t + 0.12 + mem.rnd() * 0.12
  mem.wantBomb = false

  // ① 위험 — 안전한 칸으로
  if (d[cur] !== Infinity) {
    const rest = mem.path[0] === cur ? mem.path.slice(1) : mem.path
    if (!pathOk(s, p, d, rest)) mem.path = bfs(s, p, d, k => d[k] === Infinity, 30) ?? bfsLatest(s, p, d)
    return follow(s, p, mem, cur)
  }
  const mates = s.players.filter(o => o !== p && o.team === p.team)
  // ② 같은 팀 유령 구하기
  const ghostMates = mates.filter(m => m.status === 'ghost')
  if (ghostMates.length) {
    const path = bfs(s, p, d, k => ghostMates.some(g => near(g, k, s.cols)), 30)
    if (path) {
      mem.path = path
      return follow(s, p, mem, cur)
    }
  }
  // ③ 상대 유령 터뜨리기
  const ghostEnemies = s.players.filter(o => o.team !== p.team && o.status === 'ghost')
  if (ghostEnemies.length) {
    const path = bfs(s, p, d, k => ghostEnemies.some(g => near(g, k, s.cols)), 25)
    if (path) {
      mem.path = path
      return follow(s, p, mem, cur)
    }
  }
  // ⑤ 폭탄 놓을 만하고, 놓은 뒤 도망칠 길이 있으면
  const w = worthBombing(s, p)
  const mine = s.bombs.filter(b => b.owner === p.id).length
  if ((w.blocks > 0 || w.enemies > 0) && mine < p.maxBombs && s.t >= mem.bombCool && mem.rnd() < 0.85) {
    const d2 = dangerMap(s, { cx: cur % s.cols, cy: Math.floor(cur / s.cols), range: p.range })
    const escape = bfs({ ...s, bombs: [...s.bombs, { id: -1, cx: cur % s.cols, cy: Math.floor(cur / s.cols), owner: p.id, range: p.range, placedAt: s.t, explodeAt: s.t + FUSE_SEC }] }, p, d2, k => d2[k] === Infinity, 12)
    if (escape) {
      mem.path = escape
      mem.bombCool = s.t + 0.5
      return { dir: escape.length ? dirToward(p, escape[0], s.cols) : null, bomb: true }
    }
  }
  // ④ 가까운 아이템
  const itemPath = bfs(s, p, d, k => !!s.items[k], 7)
  if (itemPath) {
    mem.path = itemPath
    return follow(s, p, mem, cur)
  }
  // ⑥ 상자 옆 칸 또는 상대 쪽으로
  const enemies = enemyOf(s, p)
  const goal = (k: number) => {
    const x = k % s.cols
    const y = Math.floor(k / s.cols)
    if (enemies.some(e => Math.abs(Math.round(e.x) - x) + Math.abs(Math.round(e.y) - y) <= 1)) return true
    return NEI.some(([dx, dy]) => s.grid[idx(s, x + dx, y + dy)] === 2) && k !== cur
  }
  const path = bfs(s, p, d, goal, 40)
  if (path) mem.path = path
  else {
    // 갈 데가 없으면 상대 쪽으로 한 칸이라도
    const e = enemies[0]
    mem.path = e ? (bfs(s, p, d, k => near(e, k, s.cols), 40) ?? []) : []
  }
  return follow(s, p, mem, cur)
}

function follow(s: BombState, p: BombPlayer, mem: CpuMem, cur: number): BombInput {
  while (mem.path.length && mem.path[0] === cur && near(p, cur, s.cols) && Math.abs(p.x - Math.round(p.x)) < 0.05 && Math.abs(p.y - Math.round(p.y)) < 0.05) mem.path.shift()
  // 지금 칸 한가운데에 거의 왔으면 다음 칸으로
  if (mem.path.length && mem.path[0] === cur) mem.path.shift()
  const next = mem.path[0]
  if (next === undefined) {
    // 칸 한가운데로 정렬
    return { dir: dirToward(p, cur, s.cols), bomb: false }
  }
  return { dir: dirToward(p, next, s.cols), bomb: false }
}
