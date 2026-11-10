// 💣 폭탄 놀이터 게임 규칙 (화면과 분리된 순수 로직 — 실시간 대전에서도 같은 함수로 판정)
// 좌표: 칸 단위. 플레이어 위치 x,y는 칸 중심 기준 실수(정수 = 칸 한가운데).
// 시간: 초 단위(s.t). stepBomb(s, inputs, dt)가 상태를 직접 바꾼다.
//
// 두 가지 모드
// - practice(연습판): 혼자. 맞으면 GHOST_SEC 뒤 시작 자리에서 다시. 상자를 다 부수면 끝.
// - versus(팀전 1:1 / 2:2): 맞으면 유령(TRAP_SEC). 같은 팀이 닿으면 부활, 상대가 닿거나 시간이 다 되면 탈락.
//   한 팀이 모두 탈락하면 그 팀 패배(전원 유령이어도 실제로 터질 때까지 진행). 제한 시간이 끝나면 남은 사람이 많은 팀 승.

// 판 크기는 맵·인원마다 다르다(s.cols × s.rows). COLS·ROWS는 기본(1:1·연습판) 크기.
export const COLS = 15
export const ROWS = 13

export const CELL_EMPTY = 0
export const CELL_WALL = 1 // 부서지지 않는 기둥
export const CELL_BLOCK = 2 // 부서지는 상자
export const CELL_WATER = 3 // 물웅덩이(해변) — 못 지나가고 불꽃도 막힌다
export type Cell = 0 | 1 | 2 | 3
export const isSolid = (c: number) => c === CELL_WALL || c === CELL_WATER

// 맵 — 생김새는 화면(BombArena THEMES), 규칙 차이는 여기
export type MapId = 'forest' | 'snow' | 'candy' | 'beach' | 'park'
export const MAPS: Record<MapId, { name: string; emoji: string; help: string }> = {
  forest: { name: '숲속 놀이터', emoji: '🌳', help: '기본 맵' },
  snow: { name: '눈밭', emoji: '❄️', help: '얼음 칸 위에서는 쭉 빨라져요' },
  candy: { name: '과자 나라', emoji: '🍭', help: '상자마다 아이템이 잔뜩 · 처음부터 범위 2' },
  beach: { name: '해변', emoji: '🏖', help: '물웅덩이는 못 지나가고 불꽃도 막혀요' },
  park: { name: '밤 놀이공원', emoji: '🎡', help: '반짝이는 문에 들어가면 짝꿍 문으로 순간이동' },
}
export const MAP_ORDER: MapId[] = ['forest', 'snow', 'candy', 'beach', 'park']
export const ICE_BOOST = 1.5
// 인원별 판 크기 — 3:3은 넓게
export function boardSize(mode: BombMode, n: number): [number, number] {
  if (mode === 'practice' || n <= 2) return [15, 13]
  if (n <= 4) return [17, 13]
  return [21, 15]
}

export type ItemKind = 'fire' | 'bomb' | 'speed'
export type Dir = 'up' | 'down' | 'left' | 'right'
export type Team = 'A' | 'B'
export type BombMode = 'practice' | 'versus'
export type Status = 'alive' | 'ghost' | 'out'

export const FUSE_SEC = 2.5
export const FLAME_SEC = 0.55
export const GHOST_SEC = 2 // 연습판: 맞으면 2초 유령 후 시작 자리에서 다시
export const TRAP_SEC = 6 // 팀전: 유령으로 버티는 시간(이 안에 같은 팀이 닿으면 부활)
export const GHOST_SPEED = 1.3 // 유령 이동 속도(칸/초) — 천천히 같은 팀 쪽으로 갈 수 있다
export const TOUCH_DIST = 0.7 // 이만큼 가까우면 닿은 것
export const SHIELD_SEC = 1.5 // 다시 나온 직후 무적
export const BASE_SPEED = 3.4 // 칸/초
export const SPEED_STEP = 0.55
export const MAX_RANGE = 8
export const MAX_BOMBS = 8
export const MAX_SPEED_LV = 6
export const VERSUS_SEC = 180 // 팀전 제한 시간
export const VERSUS_SEC_BIG = 240 // 3:3

export interface BombPlayer {
  id: string
  team: Team
  x: number
  y: number
  dir: Dir
  moving: boolean
  range: number
  maxBombs: number
  speedLv: number
  status: Status
  ghostUntil: number // 유령이 끝나는 시각
  shieldUntil: number
  spawnX: number
  spawnY: number
  hits: number // 맞은 횟수
  rescues: number // 같은 팀 살려 준 횟수
  pops: number // 상대 유령 터뜨린 횟수
  pc: number // 마지막으로 나온 순간이동 문 칸(-1 = 없음) — 그 칸을 벗어나야 다시 탈 수 있다
}

export interface Bomb {
  id: number
  cx: number
  cy: number
  owner: string
  range: number
  placedAt: number
  explodeAt: number
}

// 불꽃 한 칸. arm: 어느 방향 줄기인지(center = 폭탄 자리·십자), end = 줄기 끝
export interface Flame {
  cx: number
  cy: number
  arm: 'center' | Dir
  end: boolean
  at: number
  until: number
  owner: string
}

export interface Item {
  kind: ItemKind
  safeUntil: number // 막 드러난 아이템은 같은 폭발에 바로 타지 않게
}

export interface BombInput {
  dir: Dir | null
  bomb: boolean
}

export interface BombState {
  mode: BombMode
  map: MapId
  cols: number
  rows: number
  ice: Record<number, true> // 얼음 칸(눈밭)
  portals: [number, number][] // 순간이동 문 짝(칸 번호)
  t: number
  grid: Cell[]
  hidden: Record<number, ItemKind> // 상자 안에 숨은 아이템
  items: Record<number, Item> // 바닥에 드러난 아이템
  bombs: Bomb[]
  flames: Flame[]
  players: BombPlayer[]
  nextBombId: number
  blocksLeft: number
  gridVersion: number // 상자가 부서질 때마다 +1 (화면 캐시용)
  timeLimit: number // 0 = 없음
  winner: Team | 'draw' | null
  endedAt: number | null
  events: BombEvent[] // 이번 step에서 생긴 일 (효과음·연출용, 화면이 읽고 비움)
}

export type BombEvent =
  | { kind: 'boom'; cx: number; cy: number }
  | { kind: 'hit'; id: string; by: string }
  | { kind: 'pickup'; id: string; item: ItemKind }
  | { kind: 'place'; id: string }
  | { kind: 'rescue'; id: string; by: string }
  | { kind: 'pop'; id: string; by: string }
  | { kind: 'timeout'; id: string }
  | { kind: 'end'; winner: Team | 'draw' }
  | { kind: 'warp'; id: string }

export const idx = (s: { cols: number }, cx: number, cy: number) => cy * s.cols + cx

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 기둥이 아닌(홀수) 가운데 줄
export const oddMid = (n: number) => Math.floor(n / 2) | 1

// 시작 자리. 팀전 자리 순서 [A0, A1, A2, B0, B1, B2] → A는 왼쪽, B는 오른쪽(위·가운데·아래)
function spawnPoints(cols: number, rows: number) {
  const my = oddMid(rows)
  return {
    tl: [1, 1], ml: [1, my], bl: [1, rows - 2],
    tr: [cols - 2, 1], mr: [cols - 2, my], br: [cols - 2, rows - 2],
  } as Record<string, [number, number]>
}
function spawnsFor(cols: number, rows: number, n: number): [number, number][] {
  const c = spawnPoints(cols, rows)
  if (n <= 1) return [c.tl]
  if (n === 2) return [c.tl, c.br]
  if (n <= 4) return [c.tl, c.bl, c.tr, c.br]
  return [c.tl, c.ml, c.bl, c.tr, c.mr, c.br]
}

export interface Seat {
  id: string
  team: Team
}

export function newBombState(seed: number, players: (string | Seat)[], blockRate = 0.72, mode: BombMode = 'practice', map: MapId = 'forest'): BombState {
  const seats: Seat[] = players.map((p, i) => (typeof p === 'string' ? { id: p, team: (i % 2 === 0 ? 'A' : 'B') as Team } : p))
  const rnd = mulberry32(seed)
  const [cols, rows] = boardSize(mode, seats.length)
  const at = (x: number, y: number) => y * cols + x
  const grid: Cell[] = []
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const border = x === 0 || y === 0 || x === cols - 1 || y === rows - 1
      grid.push(border || (x % 2 === 0 && y % 2 === 0) ? CELL_WALL : CELL_EMPTY)
    }
  // 시작 자리 주변(ㄱ자·ㅏ자 2칸씩)은 비워 둔다 — 네 모서리는 늘, 가운데 자리는 3:3일 때만
  const safe = new Set<number>()
  const sp = spawnPoints(cols, rows)
  const zones = seats.length > 4 ? Object.values(sp) : [sp.tl, sp.bl, sp.tr, sp.br]
  for (const [sx, sy] of zones) {
    const dx = sx === 1 ? 1 : -1
    const mid = sy !== 1 && sy !== rows - 2
    const around = mid ? [[0, 0], [dx, 0], [2 * dx, 0], [0, -1], [0, 1]] : [[0, 0], [dx, 0], [0, sy === 1 ? 1 : -1], [2 * dx, 0], [0, sy === 1 ? 2 : -2]]
    for (const [ax, ay] of around) safe.add(at(sx + ax, sy + ay))
  }
  // 맵 장치
  const portals: [number, number][] = []
  if (map === 'park') {
    const mx = oddMid(cols)
    const my = oddMid(rows)
    const pairs: [number, number, number, number][] = [[mx, 1, mx, rows - 2], [3, my, cols - 4, my]]
    if (seats.length > 4) pairs.push([3, 1, cols - 4, rows - 2])
    for (const [ax, ay, bx, by] of pairs) {
      portals.push([at(ax, ay), at(bx, by)])
      for (const [x, y] of [[ax, ay], [bx, by]]) safe.add(at(x, y))
    }
  }
  if (map === 'beach') {
    // 물웅덩이 — 십자 모양. 모든 시작 자리끼리 이어져 있을 때만 남긴다
    const tries = Math.round((cols * rows) / 45)
    for (let k = 0; k < tries; k++) {
      const cx = 2 + Math.floor(rnd() * (cols - 4))
      const cy = 2 + Math.floor(rnd() * (rows - 4))
      const cells = [[cx, cy], [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]
        .filter(([x, y]) => x > 0 && y > 0 && x < cols - 1 && y < rows - 1 && grid[at(x, y)] === CELL_EMPTY && !safe.has(at(x, y)))
      if (cells.length < 3) continue
      for (const [x, y] of cells) grid[at(x, y)] = CELL_WATER
      if (!connected(grid, cols, rows, zones)) for (const [x, y] of cells) grid[at(x, y)] = CELL_EMPTY
    }
  }
  const ice: Record<number, true> = {}
  if (map === 'snow') for (let i = 0; i < grid.length; i++) if (grid[i] === CELL_EMPTY && rnd() < 0.3) ice[i] = true
  const itemRate = map === 'candy' ? 0.7 : 0.42
  const hidden: Record<number, ItemKind> = {}
  let blocks = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== CELL_EMPTY || safe.has(i)) continue
    if (rnd() < blockRate) {
      grid[i] = CELL_BLOCK
      blocks++
      if (rnd() < itemRate) {
        const k = rnd()
        hidden[i] = k < 0.4 ? 'fire' : k < 0.75 ? 'bomb' : 'speed'
      }
    }
  }
  const spawns = spawnsFor(cols, rows, seats.length)
  const startRange = map === 'candy' ? 2 : 1
  const ps: BombPlayer[] = seats.map((st, i) => {
    const [sx, sy] = spawns[i % spawns.length]
    return {
      id: st.id, team: st.team, x: sx, y: sy, dir: 'down', moving: false, range: startRange, maxBombs: 1, speedLv: 0,
      status: 'alive', ghostUntil: 0, shieldUntil: 0, spawnX: sx, spawnY: sy, hits: 0, rescues: 0, pops: 0, pc: -1,
    }
  })
  return {
    mode, map, cols, rows, ice, portals, t: 0, grid, hidden, items: {}, bombs: [], flames: [], players: ps, nextBombId: 1, blocksLeft: blocks, gridVersion: 0,
    timeLimit: mode === 'versus' ? (seats.length > 4 ? VERSUS_SEC_BIG : VERSUS_SEC) : 0, winner: null, endedAt: null, events: [],
  }
}

// 시작 자리들이 (벽·물을 빼고) 모두 이어져 있나
function connected(grid: Cell[], cols: number, rows: number, pts: [number, number][]) {
  const seen = new Uint8Array(cols * rows)
  const start = pts[0][1] * cols + pts[0][0]
  const q = [start]
  seen[start] = 1
  for (let h = 0; h < q.length; h++) {
    const k = q[h]
    for (const d of [1, -1, cols, -cols]) {
      const n = k + d
      if (n < 0 || n >= grid.length || seen[n] || isSolid(grid[n])) continue
      seen[n] = 1
      q.push(n)
    }
  }
  return pts.every(([x, y]) => seen[y * cols + x])
}

// 이동 속도 — 유령은 느리게, 얼음 칸 위에서는 빠르게
export function playerSpeed(p: BombPlayer, s?: BombState) {
  if (p.status === 'ghost') return GHOST_SPEED
  const base = BASE_SPEED + SPEED_STEP * p.speedLv
  return s && s.ice[idx(s, Math.round(p.x), Math.round(p.y))] ? base * ICE_BOOST : base
}
export const isGhost = (_s: BombState, p: BombPlayer) => p.status === 'ghost'
export const isAlive = (p: BombPlayer) => p.status === 'alive'

export const DIRV: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

export function bombAt(s: BombState, cx: number, cy: number) {
  return s.bombs.find(b => b.cx === cx && b.cy === cy)
}

// 그 칸에 들어갈 수 있나 (벽·상자·폭탄은 못 들어감)
export function free(s: BombState, cx: number, cy: number) {
  if (cx < 0 || cy < 0 || cx >= s.cols || cy >= s.rows) return false
  if (s.grid[idx(s, cx, cy)] !== CELL_EMPTY) return false
  return !bombAt(s, cx, cy)
}

function approach(v: number, target: number, step: number) {
  if (v < target) return Math.min(target, v + step)
  return Math.max(target, v - step)
}

// 이동 — 칸 사이 통로에 딱 맞지 않아도 살짝 비껴 있으면 자동으로 줄을 맞춰 준다(모서리 미끄러짐)
export function movePlayer(s: BombState, p: BombPlayer, dir: Dir, dist: number) {
  const [dx, dy] = DIRV[dir]
  const horizontal = dx !== 0
  let along = horizontal ? p.x : p.y
  let side = horizontal ? p.y : p.x
  const sideCell = Math.round(side)
  const off = side - sideCell
  const alongCell = Math.round(along)
  const cellFree = (a: number, sd: number) => (horizontal ? free(s, a, sd) : free(s, sd, a))
  const step = horizontal ? dx : dy

  const aheadFree = cellFree(alongCell + step, sideCell)
  if (Math.abs(off) > 0.001) {
    const pastCenter = (along - alongCell) * step > 0.001
    if (aheadFree || pastCenter) {
      const fix = Math.min(dist, Math.abs(off))
      side -= Math.sign(off) * fix
      dist -= fix
    } else {
      const alt = sideCell + Math.sign(off)
      if (Math.abs(off) > 0.18 && cellFree(alongCell + step, alt) && cellFree(alongCell, alt)) side = approach(side, alt, dist)
      else side = approach(side, sideCell, dist)
      dist = 0
    }
  }
  if (dist > 0) {
    const cur = Math.round(along)
    if (cellFree(cur + step, Math.round(side))) along += step * dist
    else along = (along - cur) * step < 0 ? approach(along, cur, dist) : along
  }
  if (horizontal) {
    p.x = along
    p.y = side
  } else {
    p.y = along
    p.x = side
  }
}

// 폭탄이 터지면 불꽃이 닿는 칸들(상자에서 멈춤, 상자 칸 포함). CPU 위험 계산에도 쓴다.
export function blastCells(s: BombState, cx: number, cy: number, range: number): { cx: number; cy: number; arm: Flame['arm']; end: boolean }[] {
  const out: { cx: number; cy: number; arm: Flame['arm']; end: boolean }[] = [{ cx, cy, arm: 'center', end: false }]
  for (const dir of ['up', 'down', 'left', 'right'] as Dir[]) {
    const [dx, dy] = DIRV[dir]
    for (let i = 1; i <= range; i++) {
      const x = cx + dx * i
      const y = cy + dy * i
      const cell = s.grid[idx(s, x, y)]
      if (isSolid(cell)) {
        if (i > 1) out[out.length - 1].end = true
        break
      }
      const stop = cell === CELL_BLOCK || (i < range && !!bombAt(s, x, y))
      out.push({ cx: x, cy: y, arm: dir, end: stop || i === range })
      if (stop) break
    }
  }
  return out
}

function explode(s: BombState, b: Bomb) {
  s.bombs = s.bombs.filter(o => o !== b)
  const until = s.t + FLAME_SEC
  s.events.push({ kind: 'boom', cx: b.cx, cy: b.cy })
  const cells = blastCells(s, b.cx, b.cy, b.range)
  const chain: Bomb[] = []
  for (const c of cells) {
    const k = idx(s, c.cx, c.cy)
    if (s.grid[k] === CELL_BLOCK) {
      s.grid[k] = CELL_EMPTY
      s.blocksLeft--
      s.gridVersion++
      const hid = s.hidden[k]
      if (hid) {
        s.items[k] = { kind: hid, safeUntil: s.t + FLAME_SEC + 0.05 }
        delete s.hidden[k]
      }
    } else {
      const it = s.items[k]
      if (it && s.t > it.safeUntil) delete s.items[k]
    }
    const other = c.arm !== 'center' ? bombAt(s, c.cx, c.cy) : undefined
    if (other) chain.push(other)
    // 같은 칸에 불꽃이 이미 있으면 시간만 늘리고, 방향이 엇갈리면 십자(center)로
    const ex = s.flames.find(f => f.cx === c.cx && f.cy === c.cy)
    if (ex) {
      ex.until = until
      ex.owner = b.owner
      if (ex.arm !== c.arm) {
        ex.arm = 'center'
        ex.end = false
      } else ex.end = ex.end && c.end
    } else s.flames.push({ cx: c.cx, cy: c.cy, arm: c.arm, end: c.end, at: s.t, until, owner: b.owner })
  }
  for (const o of chain) if (s.bombs.includes(o)) explode(s, o)
}

export function flameAt(s: BombState, cx: number, cy: number) {
  return s.flames.find(f => f.cx === cx && f.cy === cy && s.t < f.until)
}

// 순간이동 문 — 문 칸 한가운데쯤 오면 짝꿍 문으로. 나온 문을 벗어나야 다시 탈 수 있다.
export function takePortal(s: BombState, p: BombPlayer) {
  if (!s.portals.length) return
  const k = idx(s, Math.round(p.x), Math.round(p.y))
  if (p.pc >= 0 && k !== p.pc) p.pc = -1
  if (k === p.pc) return
  const pair = s.portals.find(([a, b]) => a === k || b === k)
  if (!pair || Math.abs(p.x - Math.round(p.x)) > 0.2 || Math.abs(p.y - Math.round(p.y)) > 0.2) return
  const to = pair[0] === k ? pair[1] : pair[0]
  p.x = to % s.cols
  p.y = Math.floor(to / s.cols)
  p.pc = to
  s.events.push({ kind: 'warp', id: p.id })
}

export function placeBomb(s: BombState, p: BombPlayer) {
  if (p.status !== 'alive') return false
  const cx = Math.round(p.x)
  const cy = Math.round(p.y)
  const mine = s.bombs.filter(b => b.owner === p.id).length
  if (mine >= p.maxBombs || bombAt(s, cx, cy) || s.grid[idx(s, cx, cy)] !== CELL_EMPTY) return false
  s.bombs.push({ id: s.nextBombId++, cx, cy, owner: p.id, range: p.range, placedAt: s.t, explodeAt: s.t + FUSE_SEC })
  s.events.push({ kind: 'place', id: p.id })
  return true
}

// 한 사람 맞음 처리 (실시간 대전에서 "내가 맞았다" 소식을 받았을 때도 이걸 부른다)
export function hitPlayer(s: BombState, p: BombPlayer, by: string) {
  if (p.status !== 'alive' || s.t < p.shieldUntil) return false
  p.status = 'ghost'
  p.ghostUntil = s.t + (s.mode === 'practice' ? GHOST_SEC : TRAP_SEC)
  p.hits++
  s.events.push({ kind: 'hit', id: p.id, by })
  return true
}

const dist2 = (a: BombPlayer, b: BombPlayer) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

export interface StepCtl {
  // 이 PC가 입력으로 움직이는 사람(나 + CPU). 없으면 전부. 나머지는 위치를 밖에서(네트워크) 넣어 준다.
  move?: Set<string>
  // 불꽃 피격을 이 PC가 판정하는 사람. 없으면 전부. (실시간: 각자 자기 피격을 판정해서 알린다)
  hit?: Set<string>
  // 폭탄 터짐·불꽃을 이 PC가 진행하나. 실시간 참가자도 true(방장 소식이 올 때까지 앞서 그려 둠)
  world?: boolean
  // 아이템 줍기·부활·탈락·승패를 이 PC가 판정하나 (실시간은 방장만). 없으면 world와 같음
  judge?: boolean
}

export function stepBomb(s: BombState, inputs: Record<string, BombInput>, dt: number, ctl: StepCtl = {}) {
  if (s.endedAt !== null) return
  const world = ctl.world ?? true
  const judge = ctl.judge ?? world
  s.t += dt
  for (const p of s.players) {
    if (p.status === 'out') {
      p.moving = false
      continue
    }
    // 연습판: 유령 끝 → 시작 자리에서 다시
    if (judge && p.status === 'ghost' && s.t >= p.ghostUntil) {
      if (s.mode === 'practice') {
        p.status = 'alive'
        p.x = p.spawnX
        p.y = p.spawnY
        p.shieldUntil = s.t + SHIELD_SEC
      } else {
        p.status = 'out'
        s.events.push({ kind: 'timeout', id: p.id })
        continue
      }
    }
    if (ctl.move && !ctl.move.has(p.id)) continue
    const inp = inputs[p.id]
    if (!inp) {
      p.moving = false
      continue
    }
    if (inp.bomb && judge) placeBomb(s, p)
    if (s.mode === 'practice' && p.status === 'ghost') {
      p.moving = false
      continue
    }
    p.moving = !!inp.dir
    if (inp.dir) {
      p.dir = inp.dir
      movePlayer(s, p, inp.dir, playerSpeed(p, s) * dt)
    }
    takePortal(s, p)
  }
  if (judge)
    // 아이템 줍기
    for (const p of s.players) {
      if (p.status !== 'alive') continue
      const k = idx(s, Math.round(p.x), Math.round(p.y))
      const it = s.items[k]
      if (!it) continue
      delete s.items[k]
      if (it.kind === 'fire') p.range = Math.min(MAX_RANGE, p.range + 1)
      if (it.kind === 'bomb') p.maxBombs = Math.min(MAX_BOMBS, p.maxBombs + 1)
      if (it.kind === 'speed') p.speedLv = Math.min(MAX_SPEED_LV, p.speedLv + 1)
      s.events.push({ kind: 'pickup', id: p.id, item: it.kind })
    }
  // 폭탄 터짐 (연쇄 포함)
  if (world) for (const b of [...s.bombs]) if (s.bombs.includes(b) && s.t >= b.explodeAt) explode(s, b)
  s.flames = s.flames.filter(f => s.t < f.until)
  if (world)
    for (const f of s.flames) {
      const k = idx(s, f.cx, f.cy)
      const it = s.items[k]
      if (it && s.t > it.safeUntil) delete s.items[k]
    }
  // 피격
  for (const p of s.players) {
    if (p.status !== 'alive' || (ctl.hit && !ctl.hit.has(p.id))) continue
    const f = flameAt(s, Math.round(p.x), Math.round(p.y))
    if (f) hitPlayer(s, p, f.owner)
  }
  if (!judge || s.mode !== 'versus') return
  // 유령 ↔ 살아 있는 사람 닿기: 같은 팀이면 부활, 상대면 탈락
  for (const g of s.players) {
    if (g.status !== 'ghost') continue
    const toucher = s.players.find(o => o !== g && o.status === 'alive' && dist2(o, g) < TOUCH_DIST * TOUCH_DIST)
    if (!toucher) continue
    if (toucher.team === g.team) {
      g.status = 'alive'
      g.shieldUntil = s.t + SHIELD_SEC
      toucher.rescues++
      s.events.push({ kind: 'rescue', id: g.id, by: toucher.id })
    } else {
      g.status = 'out'
      toucher.pops++
      s.events.push({ kind: 'pop', id: g.id, by: toucher.id })
    }
  }
  // 승패 — 한 팀이 전부 탈락해야 끝(2026-11-10). 예전엔 전부 유령이 되는 순간(구해 줄 사람 없음) 바로 끝나서
  // 마지막에 갇혀 터지는 장면을 못 봤다. 이제 유령이 상대에게 닿아 터지거나 TRAP_SEC가 다 될 때까지 계속한다.
  const standing = (t: Team) => s.players.filter(p => p.team === t && p.status !== 'out').length
  const a = standing('A')
  const b = standing('B')
  let w: Team | 'draw' | null = null
  if (a === 0 && b === 0) w = 'draw'
  else if (a === 0) w = 'B'
  else if (b === 0) w = 'A'
  else if (s.timeLimit && s.t >= s.timeLimit) {
    const sa = standing('A')
    const sb = standing('B')
    w = sa === sb ? 'draw' : sa > sb ? 'A' : 'B'
  }
  if (w) {
    s.winner = w
    s.endedAt = s.t
    s.events.push({ kind: 'end', winner: w })
  }
}
