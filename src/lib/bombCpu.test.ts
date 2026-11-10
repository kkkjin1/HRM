import { describe, expect, it } from 'vitest'
import { MAP_ORDER, mulberry32, newBombState, stepBomb, type BombInput, type MapId } from './bomb'
import { cpuInput, newCpuMem } from './bombCpu'

const DT = 1 / 60

function simulate(seed: number, n: 2 | 4 | 6, map: MapId = 'forest') {
  const seats = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, team: (i < n / 2 ? 'A' : 'B') as 'A' | 'B' }))
  const s = newBombState(seed, seats, 0.72, 'versus', map)
  const mems = Object.fromEntries(s.players.map((p, i) => [p.id, newCpuMem(mulberry32(seed * 7 + i))]))
  const blocksStart = s.blocksLeft
  let selfHits = 0, rescues = 0
  for (let i = 0; i < 260 * 60 && s.endedAt === null; i++) {
    const inputs: Record<string, BombInput> = {}
    for (const p of s.players) inputs[p.id] = cpuInput(s, p, mems[p.id])
    stepBomb(s, inputs, DT)
    for (const e of s.events) {
      if (e.kind === 'hit' && e.id === e.by) selfHits++
      if (e.kind === 'rescue') rescues++
    }
    s.events = []
  }
  return { s, selfHits, rescues, broken: blocksStart - s.blocksLeft }
}

describe('CPU', () => {
  it('2:2 CPU끼리 붙으면 제한 시간 안에 판이 끝나고 상자를 많이 부순다', () => {
    let ended = 0, selfHits = 0, broken = 0, rescues = 0, hits = 0
    const N = 12
    for (let seed = 1; seed <= N; seed++) {
      const r = simulate(seed, 4)
      if (r.s.winner) ended++
      selfHits += r.selfHits
      broken += r.broken
      rescues += r.rescues
      hits += r.s.players.reduce((a, p) => a + p.hits, 0)
    }
    console.log(`2:2 x${N}: 끝남 ${ended}, 평균 부순 상자 ${(broken / N).toFixed(1)}, 자폭 ${selfHits}/${hits}, 구출 ${rescues}`)
    expect(ended).toBe(N)
    expect(broken / N).toBeGreaterThan(20)
  })
  it('1:1도 끝난다', () => {
    for (let seed = 1; seed <= 6; seed++) expect(simulate(seed, 2).s.winner).not.toBeNull()
  })
})

describe('CPU · 맵별', () => {
  it('3:3을 맵마다 돌려도 판이 끝나고 상자를 부순다', () => {
    const lines: string[] = []
    for (const map of MAP_ORDER) {
      let broken = 0
      for (let seed = 1; seed <= 3; seed++) {
        const r = simulate(seed, 6, map)
        expect(r.s.winner, map).not.toBeNull()
        broken += r.broken
      }
      lines.push(`${map} 평균 부순 상자 ${(broken / 3).toFixed(0)}`)
      expect(broken / 3).toBeGreaterThan(20)
    }
    console.log(lines.join(' · '))
  }, 60000)
})
