import { describe, expect, it } from 'vitest'
import {
  FUEL, KIT_SIZE, MAX_HP, POOL, TURN_MS, advanceTurn, armsOf, baseTerrain, cpuPlan, footAt, isSolid, kitFor, maxTurnsOf, moveAlong, mulberry32, newFortState, resolveShot,
  FORT_MAPS, mapOfSeed, skipTurn, spawnXs, spawnYsOf, terrainOf, windFor, winnerOf, worldW, type ArmKey, type FortState, type RosterEntry,
} from './fort'
import { WH, topAt } from './fortMaps'

const roster2: RosterEntry[] = [
  { id: 'a1', team: 'A', cpu: false, skin: 'desk', special: 'rain' },
  { id: 'b1', team: 'B', cpu: true, skin: 'desk', special: 'bolt' },
]
const roster4: RosterEntry[] = [
  { id: 'a1', team: 'A', cpu: false, skin: 'desk', special: 'rain' },
  { id: 'b1', team: 'B', cpu: false, skin: 'desk', special: 'freeze' },
  { id: 'a2', team: 'A', cpu: true, skin: 'desk', special: 'homing' },
  { id: 'b2', team: 'B', cpu: true, skin: 'desk', special: 'quake' },
]
// 무기 효과 시험은 탁 트인 땅 위 맵에서(터널·섬 맵은 맵 자체 시험에서 따로)
const OPEN = ['hill', 'valley', 'dunes', 'twin', 'faults']
const openSeeds: number[] = []
for (let seed = 0; openSeeds.length < 80; seed++) if (OPEN.includes(mapOfSeed(seed).key)) openSeeds.push(seed)
const openSeed = (n: number) => openSeeds[n % openSeeds.length]
const seedOf = (key: string, n = 0) => { let c = 0; for (let seed = 0; ; seed++) if (mapOfSeed(seed).key === key && c++ === n) return seed }
// 테스트용: 차례를 a1에게, 바람 0, 원하는 무기를 1개 쥐여 줌
function setup(n: number, arm: ArmKey, patch?: (s: FortState) => FortState): FortState {
  const s0 = newFortState(openSeed(n), '1v1', roster2, 0)
  const s: FortState = { ...s0, active: 'a1', wind: 0, players: s0.players.map(p => (p.id === 'a1' ? { ...p, ammo: { ...p.ammo, [arm]: 1 } } : p)) }
  return patch ? patch(s) : s
}
const P = (s: FortState, id: string) => s.players.find(p => p.id === id)!
const shotOf = (s: FortState, id: string, o: { elev: number; power: number; weapon: ArmKey; facing?: 1 | -1 }) => ({ id, x: P(s, id).x, y: P(s, id).y, facing: o.facing ?? (1 as const), elev: o.elev, power: o.power, weapon: o.weapon })
// a1이 b1을 가장 많이 깎는 각도·힘 찾기
function aimAt(s: FortState, arm: ArmKey = 'clip') {
  let best: { elev: number; power: number; hp: number } | null = null
  for (let elev = 25; elev <= 75; elev += 5) {
    for (let power = 0.3; power <= 1; power += 0.02) {
      const { next } = resolveShot(s, shotOf(s, 'a1', { elev, power, weapon: arm }), 0)
      const hp = P(next, 'b1').hp
      if (!best || hp < best.hp) best = { elev, power, hp }
    }
  }
  return best!
}

describe('지형(2D 칸 지도)', () => {
  it('같은 seed면 같은 지형, 크기는 모드별 맵 너비', () => {
    const a = baseTerrain(42, '1v1'), b = baseTerrain(42, '1v1')
    expect(a.solid).toEqual(b.solid)
    expect(a.w).toBe(worldW('1v1'))
    expect(a.h).toBe(WH)
    expect(worldW('3v3')).toBeGreaterThan(worldW('2v2'))
  })
  it('구덩이는 땅을 파고, 흙더미는 쌓는다', () => {
    const seed = openSeed(3)
    const t0 = baseTerrain(seed, '1v1')
    const x = t0.w / 2
    const g = topAt(t0, x)!
    expect(topAt(terrainOf(seed, '1v1', [{ x, y: g, r: 30 }]), x)!).toBeGreaterThan(g + 25)
    expect(topAt(terrainOf(seed, '1v1', [{ x, y: g, r: 30, fill: 1 }]), x)!).toBeLessThan(g - 15)
  })
  it('맵 30종 이상, 기둥 맵은 2개만, 시드마다 고루 나옴', () => {
    expect(FORT_MAPS.length).toBeGreaterThanOrEqual(30)
    expect(new Set(FORT_MAPS.map(m => m.key)).size).toBe(FORT_MAPS.length)
    expect(FORT_MAPS.filter(m => m.ops.some(o => o[0] === 'pillars')).length).toBeLessThanOrEqual(2)
    expect(FORT_MAPS.filter(m => m.under).length).toBeGreaterThanOrEqual(5) // 터널·동굴·벙커
    const seen = new Set<string>()
    for (let seed = 0; seed < 3000; seed++) seen.add(mapOfSeed(seed).key)
    expect(seen.size).toBe(FORT_MAPS.length)
  })
  it('모든 맵 × 모드 3개: 요새는 땅 위에 서 있고 머리 위가 비어 있다', () => {
    for (const mode of ['1v1', '2v2', '3v3'] as const) {
      const sp = spawnXs(mode)
      const xs = [...sp.A, ...sp.B]
      for (const map of FORT_MAPS) {
        for (let n = 0; n < 2; n++) {
          const seed = seedOf(map.key, n)
          const t = baseTerrain(seed, mode)
          const ys = spawnYsOf(seed, mode)
          xs.forEach((x, i) => {
            const y = ys[i]
            const tag = map.key + ' ' + mode + ' #' + i
            expect(isSolid(t, x, y), tag).toBe(true)
            expect(isSolid(t, x, y - 1) || isSolid(t, x, y - 24), tag).toBe(false)
            expect(footAt(t, x, y), tag).toBe(y)
            // 양옆 12px도 바로 발 디딜 데가 있음
            expect(footAt(t, x - 12, y - 4) !== null && footAt(t, x + 12, y - 4) !== null, tag).toBe(true)
          })
        }
      }
    }
  })
  it('터널 맵은 요새가 땅속(위에 땅이 있는 곳)에서 시작', () => {
    const seed = seedOf('subway')
    const t = baseTerrain(seed, '1v1')
    const x = spawnXs('1v1').A[0], y = spawnYsOf(seed, '1v1')[0]
    expect(topAt(t, x)!).toBeLessThan(y - 40) // 머리 위 어딘가에 천장
  })
  it('기둥 맵은 대부분 낭떠러지, 우주는 바람 없고 중력 약함', () => {
    const t = baseTerrain(seedOf('pillars'), '3v3')
    let empty = 0
    for (let x = 0; x < t.w; x += 4) if (topAt(t, x) === null) empty++
    expect(empty / (t.w / 4)).toBeGreaterThan(0.6)
    const sp = seedOf('asteroids')
    expect(windFor(sp, 0)).toBe(0)
    expect(windFor(sp, 5)).toBe(0)
    expect(baseTerrain(sp, '1v1').grav).toBeLessThan(1)
    expect(baseTerrain(seedOf('hill'), '1v1').grav).toBe(1)
  })
  it('움직임은 연료 안에서, 맵 끝 못 넘음, 땅을 따라간다', () => {
    const seed = openSeed(5)
    const t = baseTerrain(seed, '1v1')
    const y0 = topAt(t, 20)!
    expect(moveAlong(t, 20, y0, -1, 100).x).toBeGreaterThanOrEqual(10)
    const s = newFortState(seed, '1v1', roster2, 0)
    const a = P(s, 'a1')
    const m = moveAlong(t, a.x, a.y, 1, FUEL)
    expect(Math.abs(m.x - a.x)).toBeLessThanOrEqual(FUEL)
    expect(footAt(t, m.x, m.y)).toBe(m.y)
  })
})

describe('무기 꾸러미', () => {
  it('각자 10종 중 서로 다른 4개, seed·id가 같으면 같다', () => {
    const k = kitFor(5, 'a1')
    expect(k).toHaveLength(KIT_SIZE)
    expect(new Set(k).size).toBe(KIT_SIZE)
    for (const w of k) expect(POOL).toContain(w)
    expect(kitFor(5, 'a1')).toEqual(k)
    const s = newFortState(5, '1v1', roster2, 0)
    expect(P(s, 'a1').kit).toEqual(k)
    expect(P(s, 'a1').ammo.rain).toBe(1) // 필살기 1번
    expect(P(s, 'a1').ammo.clip).toBe(-1)
  })
  it('사람마다·판마다 꾸러미가 골고루 바뀐다', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) for (const id of ['a1', 'b1']) seen.add(kitFor(seed, id).join(','))
    expect(seen.size).toBeGreaterThan(30)
  })
  it('없는 무기를 쏘면 기본탄으로', () => {
    const s0 = newFortState(6, '1v1', roster2, 0)
    const s: FortState = { ...s0, active: 'a1', players: s0.players.map(p => (p.id === 'a1' ? { ...p, ammo: { clip: -1 } } : p)) }
    const { result } = resolveShot(s, shotOf(s, 'a1', { elev: 45, power: 0.6, weapon: 'bomb' }), 0)
    expect(result.blasts.every(b => b.weapon === 'clip')).toBe(true)
  })
})

describe('차례', () => {
  it('2:2는 팀 번갈아', () => {
    const s = newFortState(4, '2v2', roster4, 0)
    const teams = s.order.map(id => P(s, id).team)
    expect(teams[0]).not.toBe(teams[1]); expect(teams[1]).not.toBe(teams[2]); expect(teams[2]).not.toBe(teams[3])
  })
  it('🤖 CPU는 차례 맨 뒤 — 사람 먼저, CPU 묶음은 마지막 사람의 반대 팀부터', () => {
    // 나(A) 혼자 사람 + CPU 3
    const r: RosterEntry[] = [
      { id: 'me', team: 'A', cpu: false, skin: 'desk', special: null },
      { id: 'c1', team: 'B', cpu: true, skin: 'desk', special: null },
      { id: 'c2', team: 'A', cpu: true, skin: 'desk', special: null },
      { id: 'c3', team: 'B', cpu: true, skin: 'desk', special: null },
    ]
    for (const seed of [1, 2]) {
      const s = newFortState(seed, '2v2', r, 0)
      expect(s.order[0]).toBe('me')
      expect(s.order.slice(1).every(id => P(s, id).cpu)).toBe(true)
      expect(s.order.map(id => P(s, id).team)).toEqual(['A', 'B', 'A', 'B'])
    }
    // 사람 2(양 팀) + CPU 2: 사람 둘이 먼저
    const s2 = newFortState(3, '2v2', roster4, 0)
    expect(s2.order.slice(0, 2).sort()).toEqual(['a1', 'b1'])
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
    const s = newFortState(openSeed(2), '1v1', roster2, 0)
    const me = P(s, s.active)
    const m = moveAlong(terrainOf(s.seed, s.mode, []), me.x, me.y, me.facing, 20)
    const n = skipTurn(s, { x: m.x, y: m.y, facing: me.facing, elev: 50 }, 5000)
    expect(P(n, me.id).x).toBeCloseTo(m.x)
    expect(n.active).not.toBe(me.id)
    expect(n.turnEndsAt).toBe(5000 + TURN_MS)
  })
})

describe('무기 효과', () => {
  it('같은 입력 → 같은 결과(모든 화면이 똑같이 그림)', () => {
    const s = setup(11, 'mail')
    const shot = shotOf(s, 'a1', { elev: 50, power: 0.62, weapon: 'mail' })
    expect(resolveShot(s, shot, 0)).toEqual(resolveShot(s, shot, 0))
  })
  it('메일 폭탄은 3갈래(궤적 4개), 탄수 감소', () => {
    const s = setup(12, 'mail')
    const { result, next } = resolveShot(s, shotOf(s, 'a1', { elev: 60, power: 0.7, weapon: 'mail' }), 0)
    expect(result.trails.length).toBe(4)
    expect(P(next, 'a1').ammo.mail).toBe(0)
  })
  it('커피는 회복(최대 100), 다 쓰면 기본탄', () => {
    const s = setup(13, 'coffee', s => ({ ...s, players: s.players.map(p => (p.id === 'a1' ? { ...p, hp: 50 } : p)) }))
    const shot = shotOf(s, 'a1', { elev: 45, power: 0, weapon: 'coffee' })
    const { next } = resolveShot(s, shot, 0)
    expect(P(next, 'a1').hp).toBe(80)
    expect(P(resolveShot({ ...next, active: 'a1' }, shot, 0).next, 'a1').hp).toBe(80)
  })
  it('2연발은 궤적 2개·폭발 최대 2번', () => {
    const s = setup(16, 'double')
    const { result } = resolveShot(s, shotOf(s, 'a1', { elev: 45, power: 0.7, weapon: 'double' }), 0)
    expect(result.trails.length).toBe(2)
    expect(result.blasts.length).toBeLessThanOrEqual(2)
  })
  it('흙벽 쌓기는 피해 없이 땅을 높인다', () => {
    const s = setup(17, 'wall')
    const { result, next } = resolveShot(s, shotOf(s, 'a1', { elev: 50, power: 0.55, weapon: 'wall' }), 0)
    expect(result.hits.length).toBe(0)
    const b = result.blasts[0]
    expect(topAt(terrainOf(next.seed, next.mode, next.craters), b.x)!).toBeLessThan(topAt(terrainOf(s.seed, s.mode, s.craters), b.x)! - 15)
  })
  it('순간이동은 떨어진 자리로 옮겨가고 같은 차례에 한 발 더', () => {
    const s = setup(18, 'warp')
    const { result, next } = resolveShot(s, shotOf(s, 'a1', { elev: 50, power: 0.55, weapon: 'warp' }), 0)
    expect(Math.abs(P(next, 'a1').x - result.blasts[0].x)).toBeLessThan(1)
    expect(next.active).toBe('a1')
    expect(next.turnNo).toBe(s.turnNo + 1)
    expect(next.wind).toBe(s.wind)
    // 한 발 더 쏘면 상대 차례로
    const after = resolveShot(next, shotOf(next, 'a1', { elev: 50, power: 0.5, weapon: 'clip' }), 0).next
    expect(after.active).toBe('b1')
  })
  it('필살기는 빗나가도 근처 상대에게 스침 피해', () => {
    const s = setup(27, 'homing')
    const b = P(s, 'b1')
    // 유도 없이(상대가 멀어 휘어도 못 닿는 곳) 근처 60px 옆에 떨어지는 경우를 직접 찾는다
    let grazed = false
    for (let power = 0.2; power <= 1 && !grazed; power += 0.01) {
      const { result, next } = resolveShot(s, shotOf(s, 'a1', { elev: 50, power, weapon: 'homing' }), 0)
      const bl = result.blasts[0]
      if (!bl) continue
      const d = Math.abs(bl.x - b.x)
      if (d > 32 + 14 + 5 && d < 32 + 14 + 60) { expect(MAX_HP - P(next, 'b1').hp).toBe(18); grazed = true }
    }
    expect(grazed).toBe(true)
  })
  it('땅 뚫기는 박힌 곳보다 깊은 데서 터진다', () => {
    const s = setup(19, 'drill')
    const { result } = resolveShot(s, shotOf(s, 'a1', { elev: 50, power: 0.55, weapon: 'drill' }), 0)
    const hit = result.trails[0].pts.at(-1)!
    expect(result.blasts[0].y).toBeGreaterThan(hit.y + 20)
    expect(result.craterTimes.length).toBeGreaterThan(3) // 굴 + 폭발
  })
  it('굴러가기는 떨어진 뒤 옆으로 굴러간다', () => {
    let rolled = 0
    for (let n = 20; n < 30; n++) {
      const s = setup(n, 'roll')
      const { result } = resolveShot(s, shotOf(s, 'a1', { elev: 35, power: 0.5, weapon: 'roll' }), 0)
      if (result.trails.length === 2 && result.trails[1].pts.length > 3) rolled++
    }
    expect(rolled).toBeGreaterThanOrEqual(5)
  })
  it('레이저는 바람을 무시한다', () => {
    const base = setup(21, 'laser')
    const shot = shotOf(base, 'a1', { elev: 50, power: 0.6, weapon: 'laser' })
    const calm = resolveShot(base, shot, 0).result.blasts[0]
    const windy = resolveShot({ ...base, wind: 1 }, shot, 0).result.blasts[0]
    expect(windy.x).toBeCloseTo(calm.x, 5)
  })
  it('지진은 가장 가까운 상대 발밑을 꺼뜨리고 피해', () => {
    const s = setup(24, 'quake')
    const { result, next } = resolveShot(s, shotOf(s, 'a1', { elev: 45, power: 0, weapon: 'quake' }), 0)
    expect(result.blasts[0].x).toBeCloseTo(P(s, 'b1').x)
    expect(P(next, 'b1').hp).toBeLessThan(MAX_HP)
    expect(P(next, 'b1').y).toBeGreaterThan(P(s, 'b1').y)
  })
  it('번개는 일직선으로 상대를 맞힌다(땅 뚫고)', () => {
    const s = setup(25, 'bolt')
    const a = P(s, 'a1'), b = P(s, 'b1')
    const mx = a.x + 14, my = a.y - 18 + 2
    const elev = (Math.atan2(my - (b.y - 9), b.x - mx) * 180) / Math.PI
    const { next } = resolveShot(s, shotOf(s, 'a1', { elev, power: 1, weapon: 'bolt' }), 0)
    expect(P(next, 'b1').hp).toBeLessThanOrEqual(MAX_HP - 25)
  })
  it('폭우는 첫 발 + 7발 낙하', () => {
    const s = setup(26, 'rain')
    const { result } = resolveShot(s, shotOf(s, 'a1', { elev: 50, power: 0.6, weapon: 'rain' }), 0)
    expect(result.trails.length).toBe(8)
  })
  it('유도탄은 기본탄보다 상대 가까이 떨어진다(대체로)', () => {
    let better = 0
    for (let n = 30; n < 42; n++) {
      const s = setup(n, 'homing')
      const shot = (w: ArmKey) => shotOf(s, 'a1', { elev: 55, power: 0.62, weapon: w })
      const bx = P(s, 'b1').x
      const h = resolveShot(s, shot('homing'), 0).result.blasts[0]
      const c = resolveShot(s, shot('clip'), 0).result.blasts[0]
      if (h && c && Math.abs(h.x - bx) <= Math.abs(c.x - bx)) better++
    }
    expect(better).toBeGreaterThanOrEqual(9)
  })
  it('반려 서류로 화면 끝 상대를 밀어내면 탈락', () => {
    const s0 = setup(14, 'reject')
    const t = terrainOf(s0.seed, s0.mode, [])
    const edgeX = t.w - 12
    const s: FortState = { ...s0, players: s0.players.map(p => (p.id === 'b1' ? { ...p, x: edgeX, y: topAt(t, edgeX)! } : p)) }
    const rng = mulberry32(5)
    let pushed = false
    for (let k = 0; k < 400 && !pushed; k++) {
      const { next } = resolveShot(s, shotOf(s, 'a1', { elev: 20 + rng() * 60, power: 0.3 + rng() * 0.7, weapon: 'reject' }), 0)
      if (P(next, 'b1').out === 'pushed') pushed = true
    }
    expect(pushed).toBe(true)
  })
  it('바닥까지 파이면 떨어져 탈락', () => {
    const s0 = setup(15, 'coffee')
    const b = P(s0, 'b1')
    const s: FortState = { ...s0, craters: Array.from({ length: 14 }, (_, i) => ({ x: b.x, y: b.y + i * 20, r: 30 })) }
    const { next } = resolveShot(s, shotOf(s, 'a1', { elev: 45, power: 0, weapon: 'coffee' }), 0)
    expect(footAt(terrainOf(s.seed, s.mode, s.craters), b.x, b.y)).toBe(null)
    expect(P(next, 'b1').out).toBe('fell')
    expect(next.winner).toBe('A')
  })
})

describe('🤖 CPU', () => {
  it('조준(흔들기 없음)은 대부분 상대에게 피해를 준다', () => {
    let hits = 0
    for (let n = 1; n <= 20; n++) {
      const s0 = newFortState(openSeed(n), '1v1', roster2, 0)
      const s: FortState = { ...s0, active: 'b1', players: s0.players.map(p => (p.id === 'b1' ? { ...p, ammo: { clip: -1 } } : p)) }
      const { next } = resolveShot(s, cpuPlan(s, 'b1', () => 0.5), 0)
      if (P(next, 'a1').hp < MAX_HP) hits++
    }
    expect(hits).toBeGreaterThanOrEqual(14)
  })
  it('CPU끼리 2:2 한 판은 차례 제한 안에 끝나고, 대부분 피해가 오간다', { timeout: 60000 }, () => {
    const turns: number[] = []
    let dealt = 0
    for (let seed = 1; seed <= 12; seed++) {
      const rng = mulberry32(seed * 7)
      let s = newFortState(seed, '2v2', roster4.map(r => ({ ...r, cpu: true })), 0)
      while (!s.winner) s = resolveShot(s, cpuPlan(s, s.active, rng), 0).next
      turns.push(s.turnNo + 1)
      if (s.players.reduce((acc, p) => acc + (MAX_HP - p.hp), 0) >= 100) dealt++
    }
    console.log('2:2 CPU 판당 차례 수', turns.join(','))
    expect(Math.max(...turns)).toBeLessThanOrEqual(maxTurnsOf('2v2'))
    expect(dealt).toBeGreaterThanOrEqual(10)
  })
})

describe('3:3', () => {
  const roster6: RosterEntry[] = [0, 1, 2, 3, 4, 5].map(i => ({ id: 'p' + i, team: i % 2 === 0 ? 'A' : 'B', cpu: true, skin: 'desk', special: null }))
  it('자리 6개 · 팀 번갈아 · 요새끼리 겹치지 않음', () => {
    const s = newFortState(3, '3v3', roster6, 0)
    expect(s.players).toHaveLength(6)
    const teams = s.order.map(id => s.players.find(p => p.id === id)!.team)
    for (let i = 1; i < teams.length; i++) expect(teams[i]).not.toBe(teams[i - 1])
    const xs = s.players.map(p => p.x).sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(60)
  })
  it('CPU끼리 3:3 한 판은 차례 제한 안에 끝난다', { timeout: 90000 }, () => {
    const turns: number[] = []
    for (let seed = 1; seed <= 8; seed++) {
      const rng = mulberry32(seed * 7)
      let s = newFortState(seed, '3v3', roster6, 0)
      while (!s.winner) s = resolveShot(s, cpuPlan(s, s.active, rng), 0).next
      turns.push(s.turnNo + 1)
    }
    console.log('3:3 CPU 판당 차례 수', turns.join(','))
    expect(Math.max(...turns)).toBeLessThanOrEqual(maxTurnsOf('3v3'))
  })
})

describe('고유 필살기 v3', () => {
  it('필살기 없는 사람(CPU 등)은 무기 칸 5개, 있으면 6개', () => {
    const s = newFortState(40, '1v1', [{ ...roster2[0] }, { ...roster2[1], special: null }], 0)
    expect(armsOf(P(s, 'a1'))).toHaveLength(6)
    expect(armsOf(P(s, 'b1'))).toHaveLength(5)
    expect(P(s, 'b1').ammo).not.toHaveProperty('bolt')
  })
  it('얼리기: 맞은 상대는 다음 차례를 한 번 쉰다', () => {
    const base = setup(41, 'freeze')
    const best = aimAt(base, 'freeze')
    const { next } = resolveShot(base, shotOf(base, 'a1', { elev: best.elev, power: best.power, weapon: 'freeze' }), 0)
    expect(P(next, 'b1').hp).toBeLessThan(MAX_HP)
    // 1:1이라 b1이 쉬면 다시 a1 차례, b1의 얼음은 풀림
    expect(next.active).toBe('a1')
    expect(next.frozenSkip).toEqual(['b1'])
    expect(P(next, 'b1').frozen).toBe(false)
  })
  it('연쇄 폭발: 첫 폭발 뒤 작은 폭탄 6개가 튀어 차례로 터진다', () => {
    const base = setup(42, 'swap')
    const best = aimAt(base, 'swap')
    const { result, next } = resolveShot(base, shotOf(base, 'a1', { elev: best.elev, power: best.power, weapon: 'swap' }), 0)
    expect(result.blasts.length).toBeGreaterThanOrEqual(4)
    const ts = result.blasts.map(b => b.t)
    expect(Math.max(...ts)).toBeGreaterThan(Math.min(...ts) + 150) // 한꺼번에가 아니라 연달아
    expect(P(next, 'b1').hp).toBeLessThan(MAX_HP)
  })
  it('소용돌이: 근처 상대를 떨어진 곳 쪽으로 끌어당긴다', () => {
    const base = setup(43, 'vortex')
    const bx = P(base, 'b1').x
    // 상대 앞 60px 쯤에 떨어지는 조합 찾기
    let pulled = false
    for (let elev = 30; elev <= 70 && !pulled; elev += 5) {
      for (let power = 0.3; power <= 1 && !pulled; power += 0.02) {
        const { result, next } = resolveShot(base, shotOf(base, 'a1', { elev, power, weapon: 'vortex' }), 0)
        const b = result.blasts[0]
        if (b && Math.abs(b.x - bx) > 40 && Math.abs(b.x - bx) < 120) {
          expect(Math.abs(P(next, 'b1').x - b.x)).toBeLessThan(Math.abs(bx - b.x))
          pulled = true
        }
      }
    }
    expect(pulled).toBe(true)
  })
})

describe('방: 각자 팀 옮기기', () => {
  it('빈칸이면 이동, 사람이 있으면 맞바꿈, 칸 순서대로 A B A B', async () => {
    const { moveSeat, rosterOf, slotTeam } = await import('./useFortRooms')
    const seats = [
      { id: 'me', slot: 0, skin: 'desk' as const, special: null },
      { id: 'kim', slot: 1, skin: 'desk' as const, special: null },
    ]
    // 빈칸(3, 빨강)으로 이동
    const moved = moveSeat(seats, 'me', 3, '2v2')
    expect(moved.find(s => s.id === 'me')!.slot).toBe(3)
    expect(slotTeam(3)).toBe('B')
    // 사람이 있는 칸(1)으로 → 맞바꿈
    const swapped = moveSeat(seats, 'me', 1, '2v2')
    expect(swapped.find(s => s.id === 'me')!.slot).toBe(1)
    expect(swapped.find(s => s.id === 'kim')!.slot).toBe(0)
    // 범위 밖·없는 사람은 그대로
    expect(moveSeat(seats, 'me', 5, '2v2')).toBe(seats)
    expect(moveSeat(seats, 'nobody', 1, '2v2')).toBe(seats)
    // 명단: 빈칸은 CPU, 팀은 칸 번호로
    const r = rosterOf('2v2', moved)
    expect(r.map(x => `${x.team}:${x.cpu ? 'cpu' : x.id}`)).toEqual(['A:cpu', 'B:kim', 'A:cpu', 'B:me'])
  })
})
