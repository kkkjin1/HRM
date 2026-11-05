import { describe, expect, it } from 'vitest'
import { HAZ, LANE_Y, MEDIAN_Y, RACE_LEN, RACE_TIMEOUT_MS, cpuSteer, forkAt, kartStep, newCpu, newKart, ranking, rng, thingY, type Kart } from '@/lib/race'
import { COURSES, THEMES, courseOf, roadOf, trackOf } from '@/lib/raceCourses'

describe('🏎 랜덤 코스', () => {
  it('코스 30~50개, 키 중복 없음, 테마·장애물 종류가 모두 정의돼 있다', () => {
    expect(COURSES.length).toBeGreaterThanOrEqual(30)
    expect(COURSES.length).toBeLessThanOrEqual(50)
    expect(new Set(COURSES.map(c => c.key)).size).toBe(COURSES.length)
    for (const c of COURSES) {
      expect(THEMES[c.theme]).toBeDefined()
      for (const k of Object.keys(c.mix)) expect(HAZ[k as keyof typeof HAZ]).toBeDefined()
    }
  })

  it('시드가 같으면 같은 코스·같은 장애물, 시드를 바꾸면 여러 코스가 골고루 나온다', () => {
    expect(courseOf(123)).toBe(courseOf(123))
    expect(trackOf(123)).toEqual(trackOf(123))
    const seen = new Set<string>()
    const r = rng(9)
    for (let i = 0; i < 2000; i++) seen.add(courseOf(Math.floor(r() * 1e9)).key)
    expect(seen.size).toBe(COURSES.length)
  })

  it('모든 코스: 장애물이 도로 안에 있고, 움직이는 것도 도로 밖으로 안 나간다', () => {
    for (const c of COURSES) {
      const t = trackOf(1000 + COURSES.indexOf(c), c)
      expect(t.length).toBeGreaterThan(10)
      for (const th of t) {
        expect(th.x).toBeGreaterThan(500); expect(th.x).toBeLessThan(RACE_LEN)
        for (const ms of [0, 333, 777, 1500, 2900]) {
          const y = thingY(th, ms)
          expect(y).toBeGreaterThanOrEqual(LANE_Y[0] - 20); expect(y).toBeLessThanOrEqual(LANE_Y[3] + 20)
        }
      }
    }
  })

  it('모든 코스: CPU 4대가 시간 안에 완주한다(커브·갈림길·상자 공유 포함, 코스별 평균 25~60초), 갈림길 화단은 못 넘는다', () => {
    const slow: string[] = []
    let crossed = 0, forkSteps = 0, boxTakes = 0, boxTotal = 0
    for (const c of COURSES) {
      let sum = 0, n = 0
      for (let seed = 1; seed <= 3; seed++) {
        const sd = seed * 7919 + c.key.length
        const track = trackOf(sd, c, 4)
        const road = roadOf(sd, c)
        const gone = new Set<number>()
        boxTotal += track.filter(t => t.kind === 'box').length
        const rand = rng(seed * 13 + 5)
        let karts: Kart[] = [0, 1, 2, 3].map(newKart)
        const mems = karts.map(() => newCpu(rand))
        const dt = 1000 / 60
        for (let t = 0; t < RACE_TIMEOUT_MS && karts.some(k => k.finishedAt === null); t += dt) {
          const order = ranking(karts.map((k, i) => ({ ...k, i })))
          karts = karts.map((k, i) => {
            const opts = { road, gone }
            const cs = cpuSteer(k, mems[i], t, track, [], rand, opts)
            const st = kartStep(k, cs.steer, t, dt, track, [], order.findIndex(o => o.i === i), 4, rand, opts)
            for (const e of st.events) if (e.type === 'box') { expect(gone.has(e.id)).toBe(false); gone.add(e.id); boxTakes++ }
            const n = cs.use ? { ...st.k, item: null } : st.k
            if (forkAt(road, k.x) && forkAt(road, n.x)) { forkSteps++; if ((k.y < MEDIAN_Y) !== (n.y < MEDIAN_Y)) crossed++ }
            return n
          })
        }
        for (const k of karts) { expect(k.finishedAt, c.key).not.toBeNull(); sum += k.finishedAt!; n++ }
      }
      const avg = sum / n / 1000
      if (avg < 25 || avg > 60) slow.push(`${c.key} ${avg.toFixed(1)}초`)
    }
    expect(slow).toEqual([])
    expect(forkSteps).toBeGreaterThan(0)
    expect(crossed).toBe(0)
    expect(boxTakes).toBeGreaterThan(0)
    expect(boxTakes).toBeLessThanOrEqual(boxTotal)
  })

  it('상자 줄은 참가 인원만큼, 이미 먹은 상자는 다시 못 먹는다', () => {
    const c = COURSES[0]
    for (const n of [2, 3, 4, 6]) {
      const boxes = trackOf(77, c, n).filter(t => t.kind === 'box')
      const rows: { x: number; n: number }[] = []
      for (const b of [...boxes].sort((a, z) => a.x - z.x)) { const last = rows[rows.length - 1]; if (last && b.x - last.x < 150) last.n++; else rows.push({ x: b.x, n: 1 }) }
      for (const r of rows) expect(r.n).toBe(n)
    }
    const box = trackOf(77, c, 2).find(t => t.kind === 'box')!
    const k = { ...newKart(0), x: box.x - 5, y: box.y, v: 300 }
    const rand = rng(1)
    expect(kartStep(k, 0, 5000, 16, [box], [], 0, 2, rand).events.some(e => e.type === 'box')).toBe(true)
    expect(kartStep(k, 0, 5000, 16, [box], [], 0, 2, rand, { gone: new Set([box.id]) }).events.some(e => e.type === 'box')).toBe(false)
  })
})

describe('⚡ 지름길', () => {
  it('지름길 쪽에선 같은 시간에 더 멀리 가고, 반대쪽은 그대로다', async () => {
    const { MEDIAN_Y, SHORTCUT_GAIN, newKart, kartStep, rng } = await import('@/lib/race')
    const road = { curve: 0, phase: 0, forks: [{ x0: 1000, x1: 3000, risky: 0 as const, short: true }] }
    const run = (y: number) => {
      let k = { ...newKart(0), x: 900, y, v: 430 }
      const rand = rng(1)
      let saw = false
      for (let t = 1000; t < 9000; t += 16) {
        const st = kartStep(k, 0, t, 16, [], [], 0, 1, rand, { road })
        if (st.events.some(e => e.type === 'shortcut')) saw = true
        k = st.k
      }
      return { x: k.x, saw }
    }
    const short = run(MEDIAN_Y - 40), normal = run(MEDIAN_Y + 40)
    expect(short.saw).toBe(true)
    expect(normal.saw).toBe(false)
    expect(short.x - normal.x).toBeGreaterThan(2000 * (1 - 1 / SHORTCUT_GAIN) * 0.9) // 갈림길 2000px를 1.3배로 = 약 460px 앞섬
  })
  it('지름길 코스는 지름길이 실제로 생긴다', () => {
    for (const c of COURSES.filter(c => c.shortcuts)) {
      const road = roadOf(321, c)
      expect(road.forks.filter(f => f.short).length, c.key).toBeGreaterThan(0)
    }
  })
})
