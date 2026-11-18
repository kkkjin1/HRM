import { describe, expect, it } from 'vitest'
import { cpuInput, duelStep, isDuelGame, newCpuMem, newDuelState, type DSide, type DuelGame, type DuelInput, type DuelState } from '@/lib/duel'

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
  for (const game of ['badminton'] as DuelGame[]) {
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

  it('옛 화면의 🤺 펜싱 신청은 대결 종목으로 인정하지 않는다(펜싱 삭제)', () => {
    expect(isDuelGame('fencing')).toBe(false)
    expect(isDuelGame('badminton')).toBe(true)
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

