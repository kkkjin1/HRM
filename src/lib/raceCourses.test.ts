import { describe, expect, it } from 'vitest'
import { HAZ, LANE_Y, RACE_LEN, RACE_TIMEOUT_MS, cpuSteer, kartStep, newCpu, newKart, ranking, rng, thingY, type Kart } from '@/lib/race'
import { COURSES, THEMES, courseOf, trackOf } from '@/lib/raceCourses'

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

  it('모든 코스: CPU 4대가 시간 안에 완주한다(코스별 평균 25~60초)', () => {
    const slow: string[] = []
    for (const c of COURSES) {
      let sum = 0, n = 0
      for (let seed = 1; seed <= 3; seed++) {
        const track = trackOf(seed * 7919 + c.key.length, c)
        const rand = rng(seed * 13 + 5)
        let karts: Kart[] = [0, 1, 2, 3].map(newKart)
        const mems = karts.map(() => newCpu(rand))
        const dt = 1000 / 60
        for (let t = 0; t < RACE_TIMEOUT_MS && karts.some(k => k.finishedAt === null); t += dt) {
          const order = ranking(karts.map((k, i) => ({ ...k, i })))
          karts = karts.map((k, i) => {
            const cs = cpuSteer(k, mems[i], t, track, [], rand)
            return kartStep(k, cs.steer, t, dt, track, [], order.findIndex(o => o.i === i), 4, rand).k
          })
        }
        for (const k of karts) { expect(k.finishedAt, c.key).not.toBeNull(); sum += k.finishedAt!; n++ }
      }
      const avg = sum / n / 1000
      if (avg < 25 || avg > 60) slow.push(`${c.key} ${avg.toFixed(1)}초`)
    }
    expect(slow).toEqual([])
  })
})
