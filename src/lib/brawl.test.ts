import { describe, it, expect } from 'vitest'
import { BH, CRUMBLE_AT, DT, NO_INPUT, MAX_FIGHTERS, MAP_ORDER, TAP, cpuInput, newBrawl, newCpuMind, platformsAt, step, windAt, type BrawlState, type Entrant, type Input } from './brawl'

const ents = (n: number, cpu = false): Entrant[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#000', cpu }))
const run = (s: BrawlState, sec: number, inp: (s: BrawlState) => Record<string, Input> = () => ({})) => { for (let i = 0; i < sec / DT; i++) step(s, inp(s)); return s }
const f = (s: BrawlState, id: string) => s.fighters.find(x => x.id === id)!

describe('brawl 엔진', () => {
  it('최대 5명, 모두 무대 위에서 시작하고 가만히 있으면 서 있다', () => {
    const s = newBrawl('peak', ents(7), 3)
    expect(s.fighters).toHaveLength(MAX_FIGHTERS)
    run(s, 2)
    for (const x of s.fighters) { expect(x.ground).toBe(true); expect(x.lives).toBe(3) }
  })

  it('같은 강펀치라도 %가 높을수록 멀리 날아간다', () => {
    const dist = (pct: number) => {
      const s = newBrawl('peak', ents(2), 3)
      const a = f(s, 'p0'), d = f(s, 'p1')
      a.x = 480; a.facing = 1; d.x = 520; d.facing = -1; d.pct = pct
      // ↵ 0.5초 모았다가 뗌
      let k = 0
      run(s, 1.2, () => ({ p0: { ...NO_INPUT, strong: k++ < 30 } }))
      return Math.abs(f(s, 'p1').x - 520) + (f(s, 'p1').lives < 3 ? 2000 : 0)
    }
    expect(dist(80)).toBeGreaterThan(dist(0) * 1.6)
  })

  it('잽은 가드에 막혀 %가 안 오른다, 강펀치는 가드를 깬다', () => {
    const mk = () => { const s = newBrawl('peak', ents(2), 3); const a = f(s, 'p0'), d = f(s, 'p1'); a.x = 480; a.facing = 1; d.x = 515; d.facing = -1; return s }
    const s1 = mk(); let k = 0
    run(s1, 0.6, () => ({ p0: { ...NO_INPUT, jab: k++ === 6 }, p1: { ...NO_INPUT, down: true } }))
    expect(f(s1, 'p1').pct).toBe(0)
    const s2 = mk(); k = 0
    run(s2, 1, () => ({ p0: { ...NO_INPUT, strong: k++ < 20 }, p1: { ...NO_INPUT, down: true } }))
    expect(f(s2, 'p1').pct).toBeGreaterThan(0)
  })

  it('강펀치 모으는 중에 맞으면 더 아프다', () => {
    const hit = (charging: boolean) => {
      const s = newBrawl('peak', ents(2), 3); const a = f(s, 'p0'), d = f(s, 'p1'); a.x = 480; a.facing = 1; d.x = 515; d.facing = -1
      let k = 0
      run(s, 0.5, () => ({ p0: { ...NO_INPUT, jab: k++ === 10 }, p1: { ...NO_INPUT, strong: charging } }))
      return f(s, 'p1').pct
    }
    expect(hit(true)).toBeGreaterThan(hit(false))
  })

  it('무대 밖으로 떨어지면 목숨이 줄고 다시 나타난다, 0이면 탈락·판 끝', () => {
    const s = newBrawl('peak', ents(2), 2)
    const d = f(s, 'p1'); d.x = 900; d.y = 300; d.ground = false
    run(s, 1.5)
    expect(f(s, 'p1').lives).toBe(1)
    expect(f(s, 'p1').y).toBeLessThan(BH)
    const d2 = f(s, 'p1'); d2.x = 920; d2.y = 300; d2.ground = false; d2.invuln = 0
    run(s, 1.5)
    expect(s.over).toBe(true)
    expect(s.winner).toBe('p0')
    expect(f(s, 'p0').place).toBe(1)
    expect(f(s, 'p1').place).toBe(2)
  })

  it('30초 뒤 무대가 좁아지고, 흔들다리는 끊어진다', () => {
    const w = (t: number) => { const m = platformsAt('peak', t).find(p => p.main)!; return m.x1 - m.x0 }
    expect(w(CRUMBLE_AT + 10)).toBeLessThan(w(CRUMBLE_AT - 1))
    expect(w(500)).toBeGreaterThanOrEqual(170)
    expect(platformsAt('bridge', CRUMBLE_AT - 1)).toHaveLength(3)
    expect(platformsAt('bridge', CRUMBLE_AT + 1)).toHaveLength(2)
  })

  it('CPU 5명 판은 시간 안에 끝나고 승자가 1명', () => {
    for (const map of MAP_ORDER) {
      for (const seed of [1, 2, 3]) {
        const s = newBrawl(map, ents(5, true), 3, seed)
        const minds = Object.fromEntries(s.fighters.map((x, i) => [x.id, newCpuMind(seed * 10 + i)]))
        let steps = 0
        while (!s.over && steps < 200 / DT) { step(s, Object.fromEntries(s.fighters.map(x => [x.id, cpuInput(s, x.id, minds[x.id])]))); steps++ }
        expect(s.over).toBe(true)
        expect(s.fighters.filter(x => x.place === 1)).toHaveLength(1)
      }
    }
  })

  it('CPU는 혼자 남아도 스스로 떨어지지 않는다', () => {
    for (const map of MAP_ORDER) {
      const s = newBrawl(map, ents(2, true), 3, 5)
      f(s, 'p1').lives = 99 // 가만히 있는 상대
      const m = newCpuMind(9)
      run(s, 25, st => ({ p0: cpuInput(st, 'p0', m) }))
      expect(f(s, 'p0').lives).toBe(3)
    }
  })

  it('Space 한 키: 짧게 떼면 잽, 오래 누르면 강펀치(더 멀리)', () => {
    const go = (holdSec: number) => {
      const s = newBrawl('peak', ents(2), 3); const a = f(s, 'p0'), d = f(s, 'p1'); a.x = 480; a.facing = 1; d.x = 515; d.facing = -1; d.pct = 30
      let k = 0; let sawStrong = false, sawJab = false
      run(s, 1.4, st => { const r = { p0: { ...NO_INPUT, attack: k++ < Math.round(holdSec / DT) } }; const me = f(st, 'p0'); if (me.act === 'strong') sawStrong = true; if (me.act === 'jab') sawJab = true; return r })
      return { sawStrong, sawJab, pct: f(s, 'p1').pct }
    }
    const tap = go(TAP * 0.5), hold = go(0.6)
    expect(tap.sawJab).toBe(true); expect(tap.sawStrong).toBe(false)
    expect(hold.sawStrong).toBe(true); expect(hold.sawJab).toBe(false)
    expect(hold.pct).toBeGreaterThan(tap.pct)
  })

  it('움직이는 바위 위에 서 있으면 같이 실려 간다', () => {
    const s = newBrawl('peak', ents(2), 3)
    const rock = s.platforms.find(p => p.move)!
    const a = f(s, 'p0'); a.x = (rock.x0 + rock.x1) / 2; a.y = rock.y; a.ground = true; a.on = rock.id
    const off = a.x - rock.x0
    run(s, 1)
    const r2 = s.platforms.find(p => p.id === rock.id)!
    expect(f(s, 'p0').ground).toBe(true)
    expect(Math.abs(f(s, 'p0').x - r2.x0 - off)).toBeLessThan(2)
  })

  it('흔들다리 돌풍은 예고 뒤 불고, 가만히 있으면 밀린다', () => {
    expect(windAt('peak', 9).acc).toBe(0)
    expect(windAt('bridge', 7).warn).not.toBe(0)
    expect(windAt('bridge', 9).acc).not.toBe(0)
    const s = newBrawl('bridge', ents(2), 3); const a = f(s, 'p0'); const x0 = a.x
    run(s, 10.5)
    expect(Math.abs(f(s, 'p0').x - x0)).toBeGreaterThan(20)
  })

  it('바위섬은 30초·50초에 바깥 섬이 가라앉는다', () => {
    expect(platformsAt('isles', 29)).toHaveLength(3)
    expect(platformsAt('isles', 31)).toHaveLength(2)
    expect(platformsAt('isles', 51)).toHaveLength(1)
  })
})
