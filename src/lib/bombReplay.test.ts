import { describe, expect, it } from 'vitest'
import { mulberry32, newBombState, stepBomb, type BombInput } from './bomb'
import { cpuInput, newCpuMem } from './bombCpu'
import { Recorder, analyze, frameAt, playRate } from './bombReplay'

const DT = 1 / 60
// CPU끼리 붙이며 기록 — 실제 화면처럼 일정 간격으로 찍는다
function play(seed: number, n: 2 | 4) {
  const seats = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, team: (i < n / 2 ? 'A' : 'B') as 'A' | 'B' }))
  const s = newBombState(seed, seats, 0.72, 'versus', 'forest')
  const mems = Object.fromEntries(s.players.map((p, i) => [p.id, newCpuMem(mulberry32(seed * 7 + i))]))
  const rec = new Recorder()
  const hits: { id: string; by: string; t: number }[] = []
  for (let i = 0; i < 260 * 60 && s.endedAt === null; i++) {
    const inputs: Record<string, BombInput> = {}
    for (const p of s.players) inputs[p.id] = cpuInput(s, p, mems[p.id])
    stepBomb(s, inputs, DT)
    for (const e of s.events) if (e.kind === 'hit') hits.push({ id: e.id, by: e.by, t: s.t })
    s.events = []
    rec.rec(s) // 화면처럼 매 틱 부른다(간격은 Recorder가 거른다). 끝난 뒤 따로 더 찍지 않음
  }
  return { s, rec, hits }
}

describe('리플레이', () => {
  it('기록은 최근 RING_SEC 초만 남는다', () => {
    const { rec } = play(3, 2)
    const f = rec.frames
    expect(f.length).toBeGreaterThan(100)
    expect(f[f.length - 1].t - f[0].t).toBeLessThanOrEqual(16.1)
  })
  it('마지막으로 맞은 사람·맞힌 폭탄 주인·폭탄 위치를 찾는다', () => {
    let found = 0, owners = 0, bombs = 0
    for (let seed = 1; seed <= 12; seed++) {
      const { rec, hits } = play(seed, 4)
      const st = analyze(rec.frames)
      if (!st || st.hitT === null) continue
      found++
      const last = [...hits].reverse().find(h => h.id === st.targetId && Math.abs(h.t - st.hitT!) < 0.1)
      expect(last).toBeTruthy()
      if (st.ownerId === last!.by) owners++
      if (st.bomb) {
        bombs++
        expect(st.bomb.owner).toBe(last!.by)
        expect(st.bomb.placedAt).toBeLessThanOrEqual(st.hitT)
      }
      expect(st.startT).toBeLessThan(st.hitT)
      expect(st.endT).toBeGreaterThan(st.hitT)
      expect(playRate(st, st.hitT)).toBeLessThan(1)
      const fr = frameAt(rec.frames, st.hitT)
      expect(fr.players.length).toBe(4)
    }
    expect(found).toBeGreaterThan(8)
    expect(owners).toBe(found)
    expect(bombs).toBeGreaterThanOrEqual(found - 1)
  })
  it('맞자마자 판이 끝나도 그 맞은 장면이 기록된다(1:1 진 쪽)', () => {
    let checked = 0
    for (let seed = 1; seed <= 10; seed++) {
      const { s, rec } = play(seed, 2)
      if (!s.winner || s.winner === 'draw') continue
      const loser = s.players.find(p => p.team !== s.winner)!
      const st = analyze(rec.frames, loser.id)
      expect(st?.hitT).not.toBeNull()
      expect(st?.ownerId).toBeTruthy()
      checked++
    }
    expect(checked).toBeGreaterThan(5)
  })
  it('특정 사람을 지정하면 그 사람의 마지막 맞음을 찾는다', () => {
    const { rec, hits } = play(5, 2)
    const loserHit = [...hits].reverse()[0]
    const st = analyze(rec.frames, loserHit.id)
    expect(st?.targetId).toBe(loserHit.id)
    expect(st?.ownerId).toBe(loserHit.by)
  })
})
