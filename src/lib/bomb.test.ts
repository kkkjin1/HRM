import { describe, expect, it } from 'vitest'
import { BASE_SPEED, CELL_BLOCK, CELL_EMPTY, CELL_WALL, CELL_WATER, COLS, FUSE_SEC, playerSpeed, GHOST_SEC, ROWS, TRAP_SEC, hitPlayer, idx, isGhost, newBombState, stepBomb, type BombInput, type BombState } from './bomb'

const DT = 1 / 60
const none: Record<string, BombInput> = {}

function run(s: BombState, sec: number, inputs: Record<string, BombInput> = none) {
  const n = Math.round(sec / DT)
  for (let i = 0; i < n; i++) stepBomb(s, inputs, DT)
}

// 빈 판(기둥·테두리만) 만들기
function emptyState(ids = ['me']) {
  const s = newBombState(1, ids, 0)
  return s
}

describe('판 만들기', () => {
  it('테두리와 짝수 칸 기둥은 벽, 시작 자리는 비어 있다', () => {
    const s = newBombState(42, ['me'])
    expect(s.grid[idx(s, 0, 0)]).toBe(CELL_WALL)
    expect(s.grid[idx(s, 2, 2)]).toBe(CELL_WALL)
    expect(s.grid[idx(s, 1, 1)]).toBe(CELL_EMPTY)
    expect(s.grid[idx(s, 2, 1)]).toBe(CELL_EMPTY)
    expect(s.grid[idx(s, 1, 2)]).toBe(CELL_EMPTY)
    expect(s.grid.length).toBe(COLS * ROWS)
    expect(s.blocksLeft).toBeGreaterThan(40)
  })
  it('같은 시드면 같은 판', () => {
    expect(newBombState(7, ['a']).grid).toEqual(newBombState(7, ['a']).grid)
  })
})

describe('폭탄', () => {
  it('2.5초 뒤 터지고 범위 1이면 십자 1칸까지 불꽃', () => {
    const s = emptyState()
    stepBomb(s, { me: { dir: null, bomb: true } }, DT)
    expect(s.bombs.length).toBe(1)
    // 폭탄에서 비켜서기: 오른쪽으로 2칸 → 맞지 않게 (1,1)->(3,1)
    run(s, 0.7, { me: { dir: 'right', bomb: false } })
    run(s, FUSE_SEC - 0.7 + 0.02)
    expect(s.bombs.length).toBe(0)
    const cells = s.flames.map(f => `${f.cx},${f.cy}`).sort()
    expect(cells).toEqual(['1,1', '1,2', '2,1'].sort())
  })
  it('범위가 기둥에서 멈추고 상자는 부수고 멈춘다', () => {
    const s = emptyState()
    s.grid[idx(s, 3, 1)] = CELL_BLOCK
    s.grid[idx(s, 4, 1)] = CELL_BLOCK
    s.blocksLeft = 2
    s.players[0].range = 5
    s.players[0].x = 1
    s.players[0].y = 3
    s.bombs.push({ id: 99, cx: 1, cy: 1, owner: 'x', range: 5, placedAt: 0, explodeAt: 0 })
    stepBomb(s, none, DT)
    expect(s.grid[idx(s, 3, 1)]).toBe(CELL_EMPTY)
    expect(s.grid[idx(s, 4, 1)]).toBe(CELL_BLOCK)
    expect(s.blocksLeft).toBe(1)
    // 위쪽은 테두리 벽이라 불꽃 없음
    expect(s.flames.some(f => f.cy === 0)).toBe(false)
  })
  it('불꽃이 다른 폭탄에 닿으면 연쇄로 터진다', () => {
    const s = emptyState()
    s.players[0].x = 9
    s.players[0].y = 9
    s.bombs.push({ id: 1, cx: 1, cy: 1, owner: 'x', range: 3, placedAt: 0, explodeAt: 0 })
    s.bombs.push({ id: 2, cx: 3, cy: 1, owner: 'x', range: 2, placedAt: 0, explodeAt: 99 })
    stepBomb(s, none, DT)
    expect(s.bombs.length).toBe(0)
    expect(s.flames.some(f => f.cx === 5 && f.cy === 1)).toBe(true)
  })
  it('개수 한도만큼만 놓인다', () => {
    const s = emptyState()
    stepBomb(s, { me: { dir: null, bomb: true } }, DT)
    run(s, 0.4, { me: { dir: 'right', bomb: false } })
    stepBomb(s, { me: { dir: null, bomb: true } }, DT)
    expect(s.bombs.length).toBe(1)
  })
})

describe('이동', () => {
  it('벽을 뚫지 못한다', () => {
    const s = emptyState()
    run(s, 1, { me: { dir: 'up', bomb: false } })
    expect(s.players[0].y).toBeCloseTo(1, 5)
  })
  it('살짝 비껴 있으면 통로로 미끄러져 들어간다', () => {
    const s = emptyState()
    const p = s.players[0]
    p.x = 1.3 // (1,1)과 (2,1) 사이, 아래는 (1,2) 통로 / (2,2)는 기둥
    p.y = 1
    run(s, 0.5, { me: { dir: 'down', bomb: false } })
    expect(p.x).toBeCloseTo(1, 5)
    expect(p.y).toBeGreaterThan(1.5)
  })
  it('자기가 놓은 폭탄 위에서는 빠져나갈 수 있고, 나간 뒤엔 다시 못 들어간다', () => {
    const s = emptyState()
    stepBomb(s, { me: { dir: null, bomb: true } }, DT)
    run(s, 0.6, { me: { dir: 'right', bomb: false } })
    const p = s.players[0]
    expect(p.x).toBeGreaterThan(2.5)
    run(s, 0.6, { me: { dir: 'left', bomb: false } })
    expect(p.x).toBeGreaterThan(1.5)
  })
})

describe('아이템·피격', () => {
  it('아이템을 밟으면 능력이 오른다', () => {
    const s = emptyState()
    s.items[idx(s, 2, 1)] = { kind: 'fire', safeUntil: 0 }
    s.items[idx(s, 3, 1)] = { kind: 'bomb', safeUntil: 0 }
    s.items[idx(s, 4, 1)] = { kind: 'speed', safeUntil: 0 }
    run(s, 1.2, { me: { dir: 'right', bomb: false } })
    const p = s.players[0]
    expect(p.range).toBe(2)
    expect(p.maxBombs).toBe(2)
    expect(p.speedLv).toBe(1)
  })
  it('불꽃에 맞으면 유령이 되고 시간이 지나면 시작 자리로 돌아온다', () => {
    const s = emptyState()
    stepBomb(s, { me: { dir: null, bomb: true } }, DT)
    run(s, FUSE_SEC + 0.1)
    const p = s.players[0]
    expect(p.hits).toBe(1)
    expect(isGhost(s, p)).toBe(true)
    run(s, GHOST_SEC + 0.1)
    expect(isGhost(s, p)).toBe(false)
    expect([p.x, p.y]).toEqual([1, 1])
  })
})

describe('팀전(versus)', () => {
  const seats = [{ id: 'a0', team: 'A' as const }, { id: 'a1', team: 'A' as const }, { id: 'b0', team: 'B' as const }, { id: 'b1', team: 'B' as const }]
  const vs = () => newBombState(1, seats, 0, 'versus')
  const P = (s: BombState, id: string) => s.players.find(p => p.id === id)!

  it('A는 왼쪽, B는 오른쪽 모서리에서 시작', () => {
    const s = vs()
    expect([P(s, 'a0').x, P(s, 'a1').x]).toEqual([1, 1])
    expect(s.cols).toBe(17)
    expect([P(s, 'b0').x, P(s, 'b1').x]).toEqual([s.cols - 2, s.cols - 2])
  })
  it('맞으면 유령, 같은 팀이 닿으면 부활', () => {
    const s = vs()
    const a0 = P(s, 'a0'), a1 = P(s, 'a1')
    hitPlayer(s, a0, 'b0')
    expect(a0.status).toBe('ghost')
    a1.x = a0.x; a1.y = a0.y + 0.3
    stepBomb(s, none, DT)
    expect(a0.status).toBe('alive')
    expect(a1.rescues).toBe(1)
  })
  it('상대가 닿으면 탈락, 유령 시간이 다 돼도 탈락', () => {
    const s = vs()
    const a0 = P(s, 'a0'), b0 = P(s, 'b0'), b1 = P(s, 'b1')
    hitPlayer(s, a0, 'b0')
    b0.x = a0.x + 0.2; b0.y = a0.y
    stepBomb(s, none, DT)
    expect(a0.status).toBe('out')
    expect(b0.pops).toBe(1)
    hitPlayer(s, b1, 'a1')
    run(s, TRAP_SEC + 0.1)
    expect(b1.status).toBe('out')
  })
  it('한 팀이 전부 유령이어도 바로 안 끝나고, 실제로 탈락해야 끝', () => {
    const s = vs()
    hitPlayer(s, P(s, 'b0'), 'a0')
    hitPlayer(s, P(s, 'b1'), 'a0')
    stepBomb(s, none, DT)
    expect(s.winner).toBeNull() // 갇힌 채로 계속 — 터지는 장면까지 본다
    run(s, TRAP_SEC + 0.1)
    expect(P(s, 'b0').status).toBe('out')
    expect(s.winner).toBe('A')
    expect(s.endedAt).not.toBeNull()
  })
  it('마지막 유령을 상대가 터뜨리면 그 순간 끝', () => {
    const s = vs()
    const a0 = P(s, 'a0'), b0 = P(s, 'b0'), b1 = P(s, 'b1')
    hitPlayer(s, b0, 'a0'); b0.status = 'out'
    hitPlayer(s, b1, 'a0')
    stepBomb(s, none, DT)
    expect(s.winner).toBeNull()
    a0.x = b1.x + 0.2; a0.y = b1.y
    stepBomb(s, none, DT)
    expect(b1.status).toBe('out')
    expect(s.winner).toBe('A')
  })
  it('유령은 천천히 움직이고 폭탄은 못 놓는다', () => {
    const s = vs()
    const a0 = P(s, 'a0')
    hitPlayer(s, a0, 'b0')
    run(s, 1, { a0: { dir: 'right', bomb: true } })
    expect(a0.x).toBeGreaterThan(1.8)
    expect(a0.x).toBeLessThan(2.6)
    expect(s.bombs.length).toBe(0)
  })
  it('방장이 아닌 PC는 세계를 진행하지 않는다(폭탄이 안 터짐)', () => {
    const s = vs()
    s.bombs.push({ id: 1, cx: 7, cy: 7, owner: 'x', range: 1, placedAt: 0, explodeAt: 0 })
    stepBomb(s, none, DT, { world: false })
    expect(s.bombs.length).toBe(1)
  })
})

describe('맵·3:3', () => {
  const six = ['a0', 'a1', 'a2', 'b0', 'b1', 'b2'].map((id, i) => ({ id, team: (i < 3 ? 'A' : 'B') as 'A' | 'B' }))
  it('3:3은 21×15, 팀마다 위·가운데·아래에서 시작, 4분', () => {
    const s = newBombState(3, six, 0.72, 'versus')
    expect([s.cols, s.rows]).toEqual([21, 15])
    expect(s.players.map(p => `${p.x},${p.y}`)).toEqual(['1,1', '1,7', '1,13', '19,1', '19,7', '19,13'])
    for (const p of s.players) expect(s.grid[idx(s, p.x, p.y)]).toBe(CELL_EMPTY)
    expect(s.timeLimit).toBe(240)
  })
  it('해변: 물웅덩이가 있어도 시작 자리끼리 다 이어져 있다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = newBombState(seed, six, 0, 'versus', 'beach')
      expect(s.grid.filter(c => c === CELL_WATER).length).toBeGreaterThan(0)
      // 빈 판(상자 0)에서 첫 자리로부터 모든 자리에 갈 수 있어야
      const seen = new Set([idx(s, 1, 1)]); const q = [idx(s, 1, 1)]
      for (let h = 0; h < q.length; h++) for (const d of [1, -1, s.cols, -s.cols]) { const n = q[h] + d; if (!seen.has(n) && s.grid[n] === CELL_EMPTY) { seen.add(n); q.push(n) } }
      for (const p of s.players) expect(seen.has(idx(s, p.x, p.y))).toBe(true)
    }
  })
  it('해변: 물은 불꽃을 막는다', () => {
    const s = newBombState(1, ['me'], 0, 'practice')
    s.grid[idx(s, 3, 1)] = CELL_WATER
    s.players[0].y = 3
    s.bombs.push({ id: 1, cx: 1, cy: 1, owner: 'x', range: 4, placedAt: 0, explodeAt: 0 })
    stepBomb(s, none, DT)
    expect(s.flames.some(f => f.cx >= 3 && f.cy === 1)).toBe(false)
  })
  it('밤 놀이공원: 문에 들어가면 짝꿍 문으로, 나온 문은 벗어나야 다시 탄다', () => {
    const s = newBombState(1, ['a', 'b'], 0, 'versus', 'park')
    expect(s.portals.length).toBe(2)
    const [a, b] = s.portals[1] // 가운데 줄 좌우
    const p = s.players[0]
    p.x = (a % s.cols) - 1; p.y = Math.floor(a / s.cols)
    let warped = false
    for (let i = 0; i < 60 && !warped; i++) {
      stepBomb(s, { a: { dir: 'right', bomb: false } }, DT)
      warped = s.events.some(e => e.kind === 'warp')
      s.events = []
    }
    expect(warped).toBe(true)
    expect([p.x, p.y]).toEqual([b % s.cols, Math.floor(b / s.cols)])
    run(s, 0.3)
    expect([p.x, p.y]).toEqual([b % s.cols, Math.floor(b / s.cols)]) // 나온 문 위에 가만히 있으면 다시 안 탐
  })
  it('눈밭: 얼음 위에서 빠르다 · 과자 나라: 처음부터 범위 2', () => {
    const s = newBombState(1, ['me'], 0, 'practice', 'snow')
    const p = s.players[0]
    s.ice = { [idx(s, 1, 1)]: true }
    expect(playerSpeed(p, s)).toBeCloseTo(BASE_SPEED * 1.5, 5)
    expect(newBombState(1, ['me'], 0.7, 'practice', 'candy').players[0].range).toBe(2)
  })
})
