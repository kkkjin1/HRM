import { describe, expect, it } from 'vitest'
import { cpuInput, duelStep, newCpuMem, newDuelState, type DSide, type DuelGame, type DuelInput, type DuelState } from '@/lib/duel'

function play(game: DuelGame, seed: number, maxMs = 10 * 60_000) {
  let r = seed
  const rand = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648 }
  let s: DuelState = newDuelState(game, seed)
  const mL = newCpuMem(), mR = newCpuMem()
  const dt = 1000 / 60
  for (let t = 0; t < maxMs && !s.winner; t += dt) {
    const L: DuelInput = cpuInput(s, 'L', mL, rand)
    const R: DuelInput = cpuInput(s, 'R', mR, rand)
    s = duelStep(s, { L, R }, dt)
  }
  return s
}

describe('⚔ 대결 — CPU끼리 붙여 보면 끝까지 간다', () => {
  for (const game of ['fencing', 'badminton'] as DuelGame[]) {
    it(`${game}: 승자가 나오고 점수가 쌓인다`, () => {
      let rallies = 0
      for (let seed = 1; seed <= 12; seed++) {
        const s = play(game, seed)
        expect(s.winner).not.toBeNull()
        rallies += s.score.L + s.score.R
      }
      console.log(`${game}: 12판 평균 득점 합 ${(rallies / 12).toFixed(1)}`)
    })
  }

  it('배드민턴: CPU끼리 랠리가 실제로 이어진다(서브 직후 바로 끝나지만은 않음)', () => {
    let r = 9
    const rand = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648 }
    let s: DuelState = newDuelState('badminton', 9)
    const mL = newCpuMem(), mR = newCpuMem()
    let hits = 0, prev: string | null = null
    for (let t = 0; t < 120_000 && !s.winner; t += 1000 / 60) {
      s = duelStep(s, { L: cpuInput(s, 'L', mL, rand), R: cpuInput(s, 'R', mR, rand) }, 1000 / 60)
      if (s.game === 'badminton' && s.lastHit && s.lastHit !== prev) hits++
      prev = s.game === 'badminton' ? s.lastHit : null
    }
    const points = s.score.L + s.score.R
    console.log(`배드민턴 타구 ${hits}회 / 득점 ${points}`)
    expect(hits / Math.max(1, points)).toBeGreaterThan(2)
  })

  it('펜싱: CPU끼리 해도 찌르기·돌진·막기가 골고루 나온다(단조롭지 않음)', () => {
    const seen: Record<string, number> = {}
    for (let seed = 1; seed <= 20; seed++) {
      let r = seed
      const rand = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648 }
      let s: DuelState = newDuelState('fencing', seed)
      const mL = newCpuMem(), mR = newCpuMem()
      let prev: string | null = null
      for (let t = 0; t < 10 * 60_000 && !s.winner; t += 1000 / 60) {
        s = duelStep(s, { L: cpuInput(s, 'L', mL, rand), R: cpuInput(s, 'R', mR, rand) }, 1000 / 60)
        if (s.last && s.last !== prev) { const kind = s.last.split(':')[1] ?? 'double'; seen[kind] = (seen[kind] ?? 0) + 1 }
        prev = s.last
      }
    }
    console.log('펜싱 결과 종류', JSON.stringify(seen))
    for (const k of ['touch', 'fleche', 'parry']) expect(seen[k] ?? 0, k).toBeGreaterThan(0)
  })

  it('펜싱: 붙어서 계속 밀면 상대가 끝선 밖으로 밀려나 장외 득점', () => {
    let s: DuelState = newDuelState('fencing')
    for (let t = 0; t < 20_000 && s.score.L === 0; t += 1000 / 60) {
      s = duelStep(s, { L: { dir: 1, act: false }, R: { dir: 0, act: false } }, 1000 / 60)
    }
    expect(s.score.L).toBe(1)
    expect(s.last).toBe('L:out')
  })

  it('배드민턴: CPU끼리 해도 ⚡ 번개 스매시(필살구)가 나오고, 받기가 훨씬 어렵다', () => {
    let specials = 0, specialPoints = 0
    for (let seed = 1; seed <= 12; seed++) {
      let r = seed
      const rand = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648 }
      let s: DuelState = newDuelState('badminton', seed)
      const mL = newCpuMem(), mR = newCpuMem()
      let prevLast: string | null = null, inSpecial: DSide | null = null
      for (let t = 0; t < 10 * 60_000 && !s.winner; t += 1000 / 60) {
        s = duelStep(s, { L: cpuInput(s, 'L', mL, rand), R: cpuInput(s, 'R', mR, rand) }, 1000 / 60)
        if (s.game !== 'badminton') break
        if (s.last !== prevLast && s.last?.endsWith(':special')) { specials++; inSpecial = s.last[0] as DSide }
        if (inSpecial && s.pause > 0) { if (s.last?.startsWith(inSpecial)) specialPoints++; inSpecial = null }
        if (inSpecial && !s.sh.special && s.lastHit !== inSpecial) inSpecial = null // 받아냄
        prevLast = s.last
      }
    }
    console.log(`필살구 ${specials}번 중 득점 ${specialPoints}번`)
    expect(specials).toBeGreaterThan(5)
    expect(specialPoints / specials).toBeGreaterThan(0.4)
  })
})

