import { describe, expect, it } from 'vitest'
import {
  RACE_LEN, RACE_TIMEOUT_MS, cpuSteer, fireItem, kartStep, makeTrack, mailTarget, newCpu, newKart, ranking, rng, stunKart,
  type Banana, type Kart,
} from '@/lib/race'

// CPU 4대가 한 레이스를 끝까지 달려 본다(아이템 포함)
function race(seed: number) {
  const rand = rng(seed * 7 + 1)
  const track = makeTrack(seed)
  let karts: Kart[] = [0, 1, 2, 3].map(newKart)
  const mems = karts.map(() => newCpu(rand))
  let bananas: Banana[] = []
  const mails: { to: number; at: number }[] = []
  const stats = { spins: 0, slips: 0, pads: 0, boxes: 0, rockets: 0, bananaDrops: 0, mails: 0 }
  const dt = 1000 / 60
  for (let t = 0; t < RACE_TIMEOUT_MS && karts.some(k => k.finishedAt === null); t += dt) {
    const order = ranking(karts.map((k, i) => ({ ...k, i })))
    karts = karts.map((k, i) => {
      const rank = order.findIndex(o => o.i === i)
      const c = cpuSteer(k, mems[i], t, track, bananas, rand)
      const step = kartStep(k, c.steer, t, dt, track, bananas, rank, karts.length, rand)
      let n = step.k
      const events = step.events
      for (const e of events) {
        if (e.type === 'spin') { stats.spins++; if (e.bananaId) bananas = bananas.filter(b => b.id !== e.bananaId) }
        if (e.type === 'slip') stats.slips++
        if (e.type === 'pad') stats.pads++
        if (e.type === 'box') stats.boxes++
      }
      if (c.use) {
        const r = fireItem(n, t)
        n = r.k
        if (r.used === 'rocket') stats.rockets++
        if (r.used === 'banana') { stats.bananaDrops++; bananas.push({ id: `${i}-${t}`, x: n.x - 33, y: n.y, owner: String(i) }) }
        if (r.used === 'mail') {
          stats.mails++
          const to = mailTarget(String(i), karts.map((kk, j) => ({ id: String(j), x: kk.x, done: kk.finishedAt !== null })))
          if (to !== null) mails.push({ to: Number(to), at: t + 1200 })
        }
      }
      return n
    })
    for (let m = mails.length - 1; m >= 0; m--) if (t >= mails[m].at) { karts[mails[m].to] = stunKart(karts[mails[m].to], t); mails.splice(m, 1) }
  }
  return { karts, stats }
}

describe('🏎 퇴근 레이싱', () => {
  it('코스는 시드가 같으면 같고, 한 줄에 최소 한 차선은 비어 있다', () => {
    expect(makeTrack(5)).toEqual(makeTrack(5))
    const t = makeTrack(5)
    expect(t.length).toBeGreaterThan(10)
    expect(t.every(o => o.x > 500 && o.x < RACE_LEN)).toBe(true)
  })

  it('CPU 4대가 시간 안에 완주하고, 장애물·아이템이 실제로 쓰인다', () => {
    const times: number[] = []
    const tot = { spins: 0, slips: 0, pads: 0, boxes: 0, rockets: 0, bananaDrops: 0, mails: 0 }
    for (let seed = 1; seed <= 20; seed++) {
      const { karts, stats } = race(seed)
      for (const k of karts) { expect(k.finishedAt).not.toBeNull(); times.push(k.finishedAt!) }
      for (const key of Object.keys(tot) as (keyof typeof tot)[]) tot[key] += stats[key]
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    console.log(`완주 평균 ${(avg / 1000).toFixed(1)}초 (최소 ${(Math.min(...times) / 1000).toFixed(1)} / 최대 ${(Math.max(...times) / 1000).toFixed(1)}), 20판 합계`, tot)
    expect(avg).toBeGreaterThan(32_000)
    expect(avg).toBeLessThan(55_000)
    expect(tot.boxes).toBeGreaterThan(0)
    expect(tot.rockets + tot.bananaDrops + tot.mails).toBeGreaterThan(0)
  })

  it('📧 메일은 바로 앞사람, 내가 1등이면 대상 없음(못 씀)', () => {
    const rs = [{ id: 'a', x: 100, done: false }, { id: 'b', x: 300, done: false }, { id: 'c', x: 500, done: false }]
    expect(mailTarget('a', rs)).toBe('b')
    expect(mailTarget('c', rs)).toBeNull()
  })
})
