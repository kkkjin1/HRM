import { describe, expect, it } from 'vitest'
import { bump, cpuSteer, fireItem, kartStep, lenOf, newCpu, newKart, ranking, rng, timeoutOf, type Banana, type Kart } from '@/lib/race'
import { courseOf, roadOf, trackOf } from '@/lib/raceCourses'
import { CARS, CAR_BODIES, rideOffset, specOf, type CarBody } from '@/lib/raceCars'

const DT = 1000 / 60

// 6대(차종 하나씩)가 같은 코스를 CPU로 달린다 — 아이템·바나나·충돌 포함. 출발 자리는 판마다 돌린다(자리 운 빼기)
function race(seed: number, bodies: CarBody[]) {
  const rand = rng(seed * 13 + 5)
  const course = courseOf(seed)
  const road = roadOf(seed, course)
  const track = trackOf(seed, course, bodies.length)
  const gone = new Set<number>()
  const order0 = bodies.map((_, i) => (i + seed) % bodies.length)
  let karts: Kart[] = bodies.map((_, i) => newKart(order0[i]))
  const mems = bodies.map(() => { const m = newCpu(rand); m.skill = 0.85; return m })
  let bananas: Banana[] = []
  const timeout = timeoutOf(lenOf(road))
  for (let t = 0; t < timeout && karts.some(k => k.finishedAt === null); t += DT) {
    const order = ranking(karts.map((k, i) => ({ ...k, i })))
    karts = karts.map((k, i) => {
      const spec = specOf(bodies[i])
      const c = cpuSteer(k, mems[i], t, track, bananas, rand, { road, gone })
      const st = kartStep(k, c.steer, t, DT, track, bananas, order.findIndex(o => o.i === i), karts.length, rand, { road, gone, spec })
      let n = st.k
      for (const e of st.events) {
        if (e.type === 'box') gone.add(e.id)
        if ((e.type === 'spin' || e.type === 'slow') && 'bananaId' in e && e.bananaId) bananas = bananas.filter(b => b.id !== e.bananaId)
      }
      if (c.use && n.item !== 'mail' && n.item !== 'notice') {
        const r = fireItem(n, t, spec)
        n = r.k
        if (r.used === 'banana' || r.used === 'hurdle') bananas.push({ id: `${i}-${t}`, x: n.x - 33, y: n.y, owner: String(i), ...(r.used === 'hurdle' ? { kind: 'hurdle' as const } : {}) })
      }
      return n
    })
    karts = karts.map((k, i) => {
      if (k.finishedAt !== null) return k
      const others = karts.flatMap((o, j) => (j === i || o.finishedAt !== null || t < o.spinUntil ? [] : [{ x: o.x, y: o.y, v: o.v, boost: t < o.boostUntil, heavy: t < o.shieldUntil, mass: specOf(bodies[j]).mass }]))
      return bump(k, others, t, road, specOf(bodies[i]).mass).k
    })
  }
  return karts
}

describe('🚗 차종 10종 사다리(2026-11-24)', () => {
  it('뒤로 갈수록 비싸고, 최고속·부스터가 오른다 · 성격은 남는다(싼타썰매 무게·장애물 1등, 아르기닌 최고속·가속 1등)', () => {
    const spec = (b: CarBody) => CARS[b].spec
    for (let i = 1; i < CAR_BODIES.length; i++) {
      const a = CAR_BODIES[i - 1], b = CAR_BODIES[i]
      expect(CARS[b].price, b).toBeGreaterThan(CARS[a].price)
      expect(spec(b).vMax, b).toBeGreaterThan(spec(a).vMax)
      expect(spec(b).boost, b).toBeGreaterThan(spec(a).boost)
      expect(CARS[b].ride.trim).toBe(i) // 내장 등급 = 차 등급
    }
    expect(Math.max(...CAR_BODIES.map(b => spec(b).mass))).toBe(spec('suv').mass)
    expect(Math.max(...CAR_BODIES.map(b => spec(b).slowKeep))).toBe(spec('suv').slowKeep)
    expect(Math.max(...CAR_BODIES.map(b => spec(b).accel))).toBe(spec('super').accel)
    expect(CARS.kart.spec).toEqual(specOf(undefined)) // 차종 없으면 기본 카트
  })

  it('좋은 차가 대체로 빠르다 — 10대 CPU 60판: 위 다섯 대 평균이 아래 다섯 대보다 빠르고, 카트↔아르기닌 차이는 12% 안', () => {
    const sum: Record<string, number> = {}, n: Record<string, number> = {}, wins: Record<string, number> = {}
    const R = 60
    for (let seed = 1; seed <= R; seed++) {
      const ks = race(seed, CAR_BODIES)
      const fin = ks.map((k, i) => ({ b: CAR_BODIES[i], t: k.finishedAt ?? Infinity }))
      for (const f of fin) if (f.t < Infinity) { sum[f.b] = (sum[f.b] ?? 0) + f.t / lenOf(roadOf(seed)); n[f.b] = (n[f.b] ?? 0) + 1 }
      const w = fin.reduce((a, b) => (b.t < a.t ? b : a))
      wins[w.b] = (wins[w.b] ?? 0) + 1
    }
    const avg = Object.fromEntries(CAR_BODIES.map(b => [b, (sum[b] / n[b]) * 22000 / 1000]))
    console.log('22000px 환산 평균 완주(초)', Object.fromEntries(Object.entries(avg).map(([k, v]) => [k, v.toFixed(2)])), '우승', wins)
    const lo = CAR_BODIES.slice(0, 5).reduce((a, b) => a + avg[b], 0) / 5
    const hi = CAR_BODIES.slice(5).reduce((a, b) => a + avg[b], 0) / 5
    expect(hi).toBeLessThan(lo)
    expect(avg.super).toBeLessThan(avg.kart)
    expect(avg.kart / avg.super).toBeLessThan(1.12)
  }, 120_000)

  it('승차감: 개나타는 거의 안 흔들리고, 아르기닌은 최고속에서만 크게 떨린다', () => {
    const jit = (b: CarBody, s: number) => { let m = 0; for (let w = 0; w < 3000; w += 16) m = Math.max(m, Math.abs(rideOffset(CARS[b].ride, w + 16, s).y - rideOffset(CARS[b].ride, w, s).y)); return m }
    const amp = (b: CarBody, s: number) => { let m = 0; for (let w = 0; w < 3000; w += 7) m = Math.max(m, Math.abs(rideOffset(CARS[b].ride, w, s).y)); return m }
    expect(jit('sedan', 1)).toBeLessThan(jit('kart', 1) * 0.3)
    expect(jit('super', 1)).toBeGreaterThan(jit('kart', 1))
    expect(amp('super', 0.5)).toBeLessThan(0.01)
    expect(amp('suv', 1)).toBeGreaterThan(amp('sedan', 1) * 1.8) // 싼타썰매는 크게 출렁
  })
})

describe('🚗 차종 운전석 — 묶음끼리 시야 같고, 위 묶음일수록 앞이 넓다', () => {
  it('A 카트·모닝빵·아방이 / B 개나타·싼타썰매·그랜절 / C 스무디·벤또 / D 고르쉐·아르기닌', () => {
    const view = (b: CarBody) => { const r = CARS[b].ride; return { pillar: r.pillar, camH: r.camH, dashTop: r.dashTop, roof: r.roof, focal: r.focal, fovKick: r.fovKick } }
    const groups: CarBody[][] = [['kart', 'mini', 'compact'], ['sedan', 'suv', 'grand'], ['coupe', 'lux'], ['sport', 'super']]
    for (const g of groups) for (const b of g) expect(view(b)).toEqual(view(g[0]))
    for (let i = 1; i < groups.length; i++) {
      const lo = CARS[groups[i - 1][0]].ride, hi = CARS[groups[i][0]].ride
      expect(hi.dashTop).toBeGreaterThan(lo.dashTop)
      expect(hi.roof).toBeLessThan(lo.roof)
      expect(hi.pillar).toBeLessThan(lo.pillar)
    }
    expect(groups.flat()).toEqual(CAR_BODIES)
  })
})
