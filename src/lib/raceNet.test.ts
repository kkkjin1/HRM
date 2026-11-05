import { describe, expect, it } from 'vitest'
import { LANE_Y, cpuSteer, kartStep, newCpu, newKart, rng, type Kart } from '@/lib/race'
import { COURSES, roadOf, trackOf } from '@/lib/raceCourses'
import { ST_BEAT_MS, ST_MIN_MS, predict, type Fx, type Remote, type StItem } from '@/lib/raceNet'

// 실제로 달리는 차(사람처럼 조향 = 무작위로 바꿈 / CPU) → 보내는 규칙대로 보내고 → 60ms 늦게 받아 예측 → 실제와 차이
function simulate(courseKey: string, mode: 'human' | 'cpu', seed: number) {
  const c = COURSES.find(x => x.key === courseKey)!
  const track = trackOf(seed, c, 4), road = roadOf(seed, c)
  const rand = rng(seed), mem = newCpu(rand)
  let k: Kart = { ...newKart(0) }
  let steer: -1 | 0 | 1 = 0, nextSteerAt = 0
  const LAT = 60, dt = 1000 / 60
  let lastSent = -1e9, lastSig = '', sends = 0
  const inbox: { at: number; m: StItem }[] = []
  let remote: Remote | null = null
  const errs: number[] = []
  const fxOf = (kk: Kart, t: number): Fx => (t < kk.stunUntil ? 'stun' : t < kk.spinUntil ? 'spin' : t < kk.slipUntil ? 'slip' : t < kk.boostUntil ? 'boost' : '')
  for (let t = 0; t < 40000 && k.finishedAt === null; t += dt) {
    let tl: number | undefined
    if (mode === 'human') { if (t >= nextSteerAt) { steer = ([-1, 0, 0, 1] as const)[Math.floor(rand() * 4)]; nextSteerAt = t + 150 + rand() * 600 } }
    else { const cs = cpuSteer(k, mem, t, track, [], rand, { road }); steer = cs.steer; tl = LANE_Y[mem.target] }
    k = kartStep(k, steer, t, dt, track, [], 0, 1, rand, { road }).k
    const m: StItem = { id: 'a', x: k.x, y: k.y, v: k.v, fx: fxOf(k, t), fin: k.finishedAt, item: k.item, ...(mode === 'human' ? { s: steer } : { tl }) }
    const sig = `${m.s ?? ''}${m.tl ?? ''}${m.fx}${m.item ?? ''}${m.fin ?? ''}`
    if ((sig !== lastSig && t - lastSent >= ST_MIN_MS) || t - lastSent >= ST_BEAT_MS) { lastSent = t; lastSig = sig; sends++; inbox.push({ at: t + LAT, m }) }
    // 받기(RaceArena takeSt와 같은 계산)
    while (inbox.length && inbox[0].at <= t) {
      const { at, m: r } = inbox.shift()!
      let cx = 0, cy = 0
      if (remote) { const p = predict(remote, at); cx = p.x - r.x; cy = p.y - r.y; if (Math.abs(cx) > 160 || Math.abs(cy) > 60) { cx = 0; cy = 0 } }
      remote = { ...r, at: at - LAT, cx, cy } // 보낸 시각 기준으로 예측(받은 쪽은 at = 받은 시각이라 LAT만큼 덜 앞섬 — 아래 오차에 포함)
      remote.at = at
    }
    if (remote && t > 1000) { const p = predict(remote, t); errs.push(Math.hypot(p.x - k.x, p.y - k.y)) }
  }
  errs.sort((a, b) => a - b)
  const secs = k.finishedAt ? k.finishedAt / 1000 : 40
  return { rate: sends / secs, avg: errs.reduce((a, b) => a + b, 0) / errs.length, p95: errs[Math.floor(errs.length * 0.95)] }
}

describe('🏎 레이스 위치 소식(통신량 줄이기)', () => {
  it('초당 보내는 수는 6번 이하, 예측 오차는 작다(평균 < 40px, 95% < 90px)', () => {
    const rows: string[] = []
    for (const key of ['classic', 'neon', 'mixed', 'autumn']) for (const mode of ['human', 'cpu'] as const) {
      const r = simulate(key, mode, 11)
      rows.push(`${key}/${mode} 초당 ${r.rate.toFixed(1)}번 · 오차 평균 ${r.avg.toFixed(0)}px · 95% ${r.p95.toFixed(0)}px`)
      expect(r.rate, key + mode).toBeLessThanOrEqual(6)
      expect(r.avg, key + mode).toBeLessThan(40)
      expect(r.p95, key + mode).toBeLessThan(90)
    }
    console.log(rows.join('\n'))
  })
})
