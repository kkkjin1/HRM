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

describe('🚗 차종', () => {
  it('차종 6개 — 성능 숫자가 말과 맞다(슈퍼카 최고속 1등, SUV 무게 1등·감속 장애물에 강함, 쿠페 가속 1등)', () => {
    const spec = (b: CarBody) => CARS[b].spec
    expect(Math.max(...CAR_BODIES.map(b => spec(b).vMax))).toBe(spec('super').vMax)
    expect(Math.max(...CAR_BODIES.map(b => spec(b).mass))).toBe(spec('suv').mass)
    expect(Math.max(...CAR_BODIES.map(b => spec(b).slowKeep))).toBe(spec('suv').slowKeep)
    expect(Math.max(...CAR_BODIES.map(b => spec(b).accel))).toBe(spec('coupe').accel)
    expect(Math.min(...CAR_BODIES.map(b => spec(b).slip))).toBe(spec('sedan').slip)
    expect(CARS.kart.spec).toEqual(specOf(undefined)) // 차종 없으면 기본 카트
  })

  it('한 차종이 늘 이기지 않는다 — 6대 CPU 60판, 평균 완주 시간 차 6% 안 · 우승 40% 미만', () => {
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
    const vals = Object.values(avg)
    expect(Math.max(...vals) / Math.min(...vals)).toBeLessThan(1.06)
    for (const b of CAR_BODIES) expect(wins[b] ?? 0).toBeLessThan(R * 0.4)
  }, 60_000)

  it('승차감: 세단은 거의 안 흔들리고, 슈퍼카는 최고속에서만 크게 떨린다', () => {
    // jit = 한 프레임(16ms) 사이 흔들림 변화(잔진동) · amp = 최대 흔들림(출렁임 포함)
    const jit = (b: CarBody, s: number) => { let m = 0; for (let w = 0; w < 3000; w += 16) m = Math.max(m, Math.abs(rideOffset(CARS[b].ride, w + 16, s).y - rideOffset(CARS[b].ride, w, s).y)); return m }
    const amp = (b: CarBody, s: number) => { let m = 0; for (let w = 0; w < 3000; w += 7) m = Math.max(m, Math.abs(rideOffset(CARS[b].ride, w, s).y)); return m }
    expect(jit('sedan', 1)).toBeLessThan(jit('kart', 1) * 0.3)
    expect(jit('super', 1)).toBeGreaterThan(jit('kart', 1))
    expect(amp('super', 0.5)).toBeLessThan(0.01)
    expect(amp('suv', 1)).toBeGreaterThan(amp('sedan', 1) * 1.8) // SUV는 크게 출렁
  })
})

describe('🚗 차종 운전석 — 짝끼리 시야 같고 내장만 다르게', () => {
  it('카트·세단 / SUV·쿠페 / 스포츠·슈퍼: 각도·앞유리 크기 같음, 짝 안에선 내장 등급↑, 짝이 올라갈수록 앞이 넓다', () => {
    const view = (b: CarBody) => { const r = CARS[b].ride; return { pillar: r.pillar, camH: r.camH, dashTop: r.dashTop, roof: r.roof, focal: r.focal, fovKick: r.fovKick } }
    const pairs: [CarBody, CarBody][] = [['kart', 'sedan'], ['suv', 'coupe'], ['sport', 'super']]
    for (const [a, b] of pairs) {
      expect(view(b)).toEqual(view(a))
      expect(CARS[b].ride.trim).toBeGreaterThan(CARS[a].ride.trim)
      expect(CARS[b].price).toBeGreaterThanOrEqual(CARS[a].price)
    }
    for (let i = 1; i < pairs.length; i++) {
      const lo = CARS[pairs[i - 1][0]].ride, hi = CARS[pairs[i][0]].ride
      expect(hi.dashTop).toBeGreaterThan(lo.dashTop)
      expect(hi.roof).toBeLessThan(lo.roof)
      expect(hi.pillar).toBeLessThan(lo.pillar)
    }
    expect(new Set(CAR_BODIES.map(b => CARS[b].ride.trim)).size).toBe(6) // 내장은 6종 모두 다름
  })
})
