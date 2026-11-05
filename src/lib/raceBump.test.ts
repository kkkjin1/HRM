import { describe, expect, it } from 'vitest'
import {
  BUMP_GRACE_MS, KART_HX, LANE_Y, MEDIAN_Y, SPIN_MS, bump, cpuSteer, forkAt, kartStep, lenOf, newCpu, newKart, ranking, rng, timeoutOf,
  type BumpOther, type Kart,
} from '@/lib/race'
import { HIDDEN_COURSES, HIDDEN_PCT, courseOf, roadOf, trackOf } from '@/lib/raceCourses'

const T = BUMP_GRACE_MS + 1000
const kart = (x: number, y: number, v = 400, extra: Partial<Kart> = {}): Kart => ({ ...newKart(0), x, y, v, ...extra })
const other = (x: number, y: number, v = 400, extra: Partial<BumpOther> = {}): BumpOther => ({ x, y, v, boost: false, heavy: false, ...extra })

describe('💥 범퍼카 충돌', () => {
  it('출발 직후엔 통과', () => {
    const k = kart(200, 150)
    expect(bump(k, [other(205, 150)], 1000).ev).toBeNull()
  })
  it('옆으로 닿으면 상대 반대쪽으로 튕기고, 쿨다운 동안은 겹침만 푼다', () => {
    const k = kart(1000, 150)
    const b = bump(k, [other(1000, 160)], T)
    expect(b.ev).toBe('side')
    expect(b.k.y).toBeLessThan(150) // 상대가 아래 → 나는 위로
    const again = bump(b.k, [other(1000, b.k.y + 15)], T + 100)
    expect(again.ev).toBeNull()
  })
  it('뒤에서 받으면 뒤차만 느려지고 앞차는 그대로', () => {
    const rear = bump(kart(1000, 150, 430), [other(1030, 150, 300)], T)
    expect(rear.ev).toBe('rear')
    expect(rear.k.v).toBeLessThanOrEqual(300 * 0.9)
    expect(rear.k.x).toBeLessThanOrEqual(1030 - 2 * KART_HX)
    const front = bump(kart(1030, 150, 300), [other(1000, 150, 430)], T)
    expect(front.ev).toBeNull()
    expect(front.k.v).toBe(300)
  })
  it('🚀 부스터 차가 박으면 빙글, 🛡️ 도장 차는 안 돈다·안 밀린다', () => {
    const hit = bump(kart(1030, 150, 300), [other(1010, 150, 660, { boost: true })], T)
    expect(hit.ev).toBe('ram')
    expect(hit.k.spinUntil).toBe(T + SPIN_MS)
    const held = bump(kart(1030, 150, 300, { shieldUntil: T + 2000 }), [other(1010, 150, 660, { boost: true })], T)
    expect(held.ev).toBe('held')
    expect(held.k.spinUntil).toBe(0)
    const side = bump(kart(1000, 150, 400, { shieldUntil: T + 2000 }), [other(1000, 160)], T)
    expect(side.k.y).toBe(150)
  })
  it('도장 차에 옆으로 닿으면 두 배로 튕긴다', () => {
    const a = bump(kart(1000, 150), [other(1000, 160)], T).k.y
    const b = bump(kart(1000, 150), [other(1000, 160, 400, { heavy: true })], T).k.y
    expect(150 - b).toBeGreaterThan((150 - a) * 1.5)
  })
  it('다른 사람 차는 판정을 작게(loose) — 살짝 겹친 건 안 닿은 걸로', () => {
    const d = 2 * KART_HX * 0.9
    expect(bump(kart(1000, 150), [other(1000 + d, 150)], T).ev).toBe('rear')
    expect(bump(kart(1000, 150), [other(1000 + d, 150, 400, { loose: 0.8 })], T).ev).toBeNull()
  })
  it('갈림길에서는 튕겨도 화단을 넘지 않는다', () => {
    const road = { curve: 0, phase: 0, forks: [{ x0: 500, x1: 3000, risky: 0 as const }] }
    const k = kart(1000, MEDIAN_Y - 25)
    const b = bump(k, [other(1000, MEDIAN_Y - 35)], T, road)
    expect(forkAt(road, 1000)).not.toBeNull()
    expect(b.k.y).toBeLessThan(MEDIAN_Y)
  })
})

describe('🎁 히든 코스 + 충돌 켠 CPU 레이스', () => {
  it(`히든 코스는 약 ${HIDDEN_PCT}%만 뜬다`, () => {
    const r = rng(3)
    let hid = 0
    for (let i = 0; i < 5000; i++) if (courseOf(Math.floor(r() * 1e9)).hidden) hid++
    expect(hid / 5000).toBeGreaterThan(HIDDEN_PCT / 100 - 0.03)
    expect(hid / 5000).toBeLessThan(HIDDEN_PCT / 100 + 0.03)
  })
  it('히든 코스: 장애물이 결승 안쪽, 지름길 미로는 갈림길이 전부 지름길', () => {
    for (const c of HIDDEN_COURSES) {
      const road = roadOf(77, c)
      expect(lenOf(road)).toBe(c.len)
      for (const th of trackOf(77, c)) expect(th.x).toBeLessThan(c.len!)
    }
    const maze = roadOf(77, HIDDEN_COURSES[1])
    expect(maze.forks.length).toBeGreaterThanOrEqual(4)
    expect(maze.forks.every(f => f.short)).toBe(true)
  })
  it('CPU 6대가 충돌하면서도 모두 완주한다 — 대장정은 약 2분', () => {
    const times: Record<string, number> = {}
    let bumps = 0
    for (const c of [...HIDDEN_COURSES, courseOf(5)]) {
      const sd = 4242
      const road = roadOf(sd, c), track = trackOf(sd, c, 6), gone = new Set<number>()
      const rand = rng(11)
      let karts: Kart[] = [0, 1, 2, 3, 4, 5].map(newKart)
      const mems = karts.map(() => newCpu(rand))
      const dt = 1000 / 60
      const limit = timeoutOf(lenOf(road))
      for (let t = 0; t < limit && karts.some(k => k.finishedAt === null); t += dt) {
        const order = ranking(karts.map((k, i) => ({ ...k, i })))
        karts = karts.map((k, i) => {
          const opts = { road, gone }
          const cs = cpuSteer(k, mems[i], t, track, [], rand, opts)
          const st = kartStep(k, cs.steer, t, dt, track, [], order.findIndex(o => o.i === i), 6, rand, opts)
          for (const e of st.events) if (e.type === 'box') gone.add(e.id)
          return cs.use ? { ...st.k, item: null } : st.k
        })
        karts = karts.map((k, i) => {
          const os = karts.filter((o, j) => j !== i && o.finishedAt === null && t >= o.spinUntil)
            .map(o => ({ x: o.x, y: o.y, v: o.v, boost: t < o.boostUntil, heavy: t < o.shieldUntil }))
          const b = bump(k, os, t, road)
          if (b.ev) bumps++
          expect(b.k.y).toBeGreaterThanOrEqual(LANE_Y[0] - 30)
          return b.k
        })
      }
      for (const k of karts) expect(k.finishedAt, c.key).not.toBeNull()
      times[c.key] = Math.max(...karts.map(k => k.finishedAt!)) / 1000
    }
    expect(bumps).toBeGreaterThan(0)
    expect(times['hidden-marathon']).toBeGreaterThan(105)
    expect(times['hidden-marathon']).toBeLessThan(150)
    console.log('완주(꼴찌) 초:', times, '충돌 수:', bumps)
  })
})
