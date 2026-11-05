import { describe, expect, it } from 'vitest'
import {
  FUEL, MAX_HP, TURN_MS, advanceTurn, baseTerrain, cpuPlan, groundAt, isPit, moveAlong, mulberry32, newFortState, resolveShot,
  skipTurn, spawnXs, terrainOf, winnerOf, type FortState,
} from './fort'
import { H, W } from './playground'

const roster2 = [
  { id: 'a1', team: 'A' as const, cpu: false, skin: 'desk' as const },
  { id: 'b1', team: 'B' as const, cpu: true, skin: 'desk' as const },
]
const roster4 = [
  { id: 'a1', team: 'A' as const, cpu: false, skin: 'desk' as const },
  { id: 'b1', team: 'B' as const, cpu: false, skin: 'desk' as const },
  { id: 'a2', team: 'A' as const, cpu: true, skin: 'desk' as const },
  { id: 'b2', team: 'B' as const, cpu: true, skin: 'desk' as const },
]

describe('지형', () => {
  it('같은 seed면 같은 지형, 화면 안 높이', () => {
    const a = baseTerrain(42, '1v1'), b = baseTerrain(42, '1v1')
    expect(a).toEqual(b)
    for (const y of a) { expect(y).toBeGreaterThanOrEqual(H * 0.3 - 0.01); expect(y).toBeLessThanOrEqual(H * 0.88 + 0.01) }
  })
  it('구덩이는 땅을 낮춘다(y 커짐)', () => {
    const t0 = baseTerrain(7, '1v1')
    const x = 540
    const g = groundAt(t0, x)
    const t1 = terrainOf(7, '1v1', [{ x, y: g, r: 30 }])
    expect(groundAt(t1, x)).toBeGreaterThan(g + 25)
  })
  it('요새 자리는 평평', () => {
    for (const mode of ['1v1', '2v2'] as const) {
      const t = baseTerrain(99, mode)
      const sp = spawnXs(mode)
      for (const x of [...sp.A, ...sp.B]) expect(Math.abs(groundAt(t, x - 12) - groundAt(t, x + 12))).toBeLessThan(1.5)
    }
  })
  it('움직임은 연료 안에서, 화면 끝 못 넘음', () => {
    const t = baseTerrain(3, '1v1')
    expect(moveAlong(t, 20, -1, 100)).toBeGreaterThanOrEqual(10)
    expect(Math.abs(moveAlong(t, 300, 1, FUEL) - 300)).toBeLessThanOrEqual(FUEL)
  })
})

describe('차례', () => {
  it('2:2는 팀 번갈아', () => {
    const s = newFortState(4, '2v2', roster4, 0)
    const teams = s.order.map(id => s.players.find(p => p.id === id)!.team)
    expect(teams[0]).not.toBe(teams[1]); expect(teams[1]).not.toBe(teams[2]); expect(teams[2]).not.toBe(teams[3])
  })
  it('죽은 사람은 건너뛴다', () => {
    let s = newFortState(4, '2v2', roster4, 0)
    const second = s.order[1]
    s = { ...s, players: s.players.map(p => (p.id === second ? { ...p, alive: false, hp: 0 } : p)) }
    s = advanceTurn(s, 1000)
    expect(s.active).toBe(s.order[2])
    expect(s.turnEndsAt).toBe(1000)
  })
  it('한 팀이 다 죽으면 승자', () => {
    const s = newFortState(1, '1v1', roster2, 0)
    const dead: FortState = { ...s, players: s.players.map(p => (p.team === 'B' ? { ...p, alive: false, hp: 0 } : p)) }
    expect(winnerOf(dead)).toBe('A')
    expect(advanceTurn(dead, 0).winner).toBe('A')
  })
  it('시간 초과는 움직인 자리를 반영하고 넘긴다', () => {
    const s = newFortState(2, '1v1', roster2, 0)
    const me = s.players.find(p => p.id === s.active)!
    const n = skipTurn(s, { x: me.x + 20, facing: me.facing, elev: 50 }, 5000)
    expect(n.players.find(p => p.id === me.id)!.x).toBeCloseTo(me.x + 20)
    expect(n.active).not.toBe(me.id)
    expect(n.turnEndsAt).toBe(5000 + TURN_MS)
  })
})

describe('포격', () => {
  it('CPU 조준(흔들기 없음 근사)은 대부분 상대에게 피해를 준다', () => {
    let hits = 0
    for (let seed = 1; seed <= 20; seed++) {
      let s = newFortState(seed, '1v1', roster2, 0)
      if (s.active !== 'b1') s = { ...s, active: 'b1' }
      const plan = cpuPlan({ ...s, players: s.players.map(p => ({ ...p, ammo: { ...p.ammo, mail: 0, bomb: 0, reject: 0, coffee: 0 } })) }, 'b1', () => 0.5)
      const { next } = resolveShot(s, plan, 0)
      if (next.players.find(p => p.id === 'a1')!.hp < MAX_HP) hits++
    }
    expect(hits).toBeGreaterThanOrEqual(14)
  })
  it('같은 입력 → 같은 결과(모든 화면이 똑같이 그림)', () => {
    const s = newFortState(11, '1v1', roster2, 0)
    const shot = { id: s.active, x: s.players.find(p => p.id === s.active)!.x, facing: (s.active === 'a1' ? 1 : -1) as 1 | -1, elev: 50, power: 0.62, weapon: 'mail' as const }
    expect(resolveShot(s, shot, 0)).toEqual(resolveShot(s, shot, 0))
  })
  it('메일 폭탄은 3갈래(궤적 4개), 탄수 감소', () => {
    const s = newFortState(12, '1v1', roster2, 0)
    const me = s.players.find(p => p.id === s.active)!
    const { result, next } = resolveShot(s, { id: me.id, x: me.x, facing: me.facing, elev: 60, power: 0.7, weapon: 'mail' }, 0)
    expect(result.trails.length).toBe(4)
    expect(next.players.find(p => p.id === me.id)!.ammo.mail).toBe(1)
  })
  it('커피는 회복(최대 100)', () => {
    const s0 = newFortState(13, '1v1', roster2, 0)
    const s = { ...s0, players: s0.players.map(p => (p.id === s0.active ? { ...p, hp: 50 } : p)) }
    const me = s.players.find(p => p.id === s.active)!
    const { next } = resolveShot(s, { id: me.id, x: me.x, facing: me.facing, elev: 45, power: 0, weapon: 'coffee' }, 0)
    expect(next.players.find(p => p.id === me.id)!.hp).toBe(80)
    const again = resolveShot({ ...next, active: me.id }, { id: me.id, x: me.x, facing: me.facing, elev: 45, power: 0, weapon: 'coffee' }, 0)
    expect(again.next.players.find(p => p.id === me.id)!.hp).toBe(80) // 다 써서 클립으로 바뀜(회복 없음)
  })
  it('반려 서류로 화면 끝 상대를 밀어내면 탈락', () => {
    const s0 = newFortState(14, '1v1', roster2, 0)
    const t = terrainOf(s0.seed, s0.mode, [])
    const b = s0.players.find(p => p.id === 'b1')!
    const edgeX = W - 12
    const s: FortState = { ...s0, active: 'a1', wind: 0, players: s0.players.map(p => (p.id === 'b1' ? { ...p, x: edgeX, y: groundAt(t, edgeX) } : p)) }
    void b
    // 정답 조준을 훑어서 찾는다
    const rng = mulberry32(5)
    let pushed = false
    for (let k = 0; k < 400 && !pushed; k++) {
      const elev = 20 + rng() * 60, power = 0.3 + rng() * 0.7
      const { next } = resolveShot(s, { id: 'a1', x: s.players[0].x, facing: 1, elev, power, weapon: 'reject' }, 0)
      if (next.players.find(p => p.id === 'b1')!.out === 'pushed') pushed = true
    }
    expect(pushed).toBe(true)
  })
  it('바닥까지 파이면 떨어져 탈락', () => {
    const s0 = newFortState(15, '1v1', roster2, 0)
    const b = s0.players.find(p => p.id === 'b1')!
    const pit = Array.from({ length: 12 }, (_, i) => ({ x: b.x, y: b.y + i * 20, r: 30 }))
    const s: FortState = { ...s0, active: 'a1', craters: pit }
    const { next } = resolveShot(s, { id: 'a1', x: s.players[0].x, facing: 1, elev: 45, power: 0, weapon: 'coffee' }, 0)
    expect(isPit(groundAt(terrainOf(s.seed, s.mode, s.craters), b.x))).toBe(true)
    expect(next.players.find(p => p.id === 'b1')!.out).toBe('fell')
    expect(next.winner).toBe('A')
  })
})

describe('CPU끼리 한 판', () => {
  it('대부분 차례 제한 안에 끝난다', () => {
    const turns: number[] = []
    let done = 0
    for (let seed = 1; seed <= 12; seed++) {
      const rng = mulberry32(seed * 7)
      let s = newFortState(seed, '2v2', roster4.map(r => ({ ...r, cpu: true })), 0)
      while (!s.winner) s = resolveShot(s, cpuPlan(s, s.active, rng), 0).next
      if (s.turnNo + 1 < 30) done++
      turns.push(s.turnNo + 1)
    }
    console.log('2:2 CPU 판당 차례 수', turns.join(','))
    expect(done).toBeGreaterThanOrEqual(9)
  })
})
