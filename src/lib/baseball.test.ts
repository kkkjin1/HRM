import { describe, it, expect } from 'vitest'
import {
  careerStats, dailyAllowance, judgeSwing, rankDay, tallySwings, travelMs,
  type Play, type Swing,
} from './baseball'

const mid = () => 0.5

function sw(distance: number, outcome: Swing['outcome'] = distance > 0 ? 'good' : 'miss'): Swing {
  return { type: 'fastball', speed: 150, outcome, distance, offset: 0 }
}

function play(member_id: string, homeruns: number, hits: number, best: number, over: Partial<Play> = {}): Play {
  return {
    id: `${member_id}-${Math.random()}`, member_id, play_date: '2026-09-30', game_no: 1, swings: [],
    homeruns, hits, best_distance: best, finished: true, created_at: '', finished_at: '', ...over,
  }
}

describe('dailyAllowance', () => {
  it('기본 1 + 칭찬 4개당 1, 최대 5', () => {
    expect([0, 3, 4, 7, 8, 16, 40].map(dailyAllowance)).toEqual([1, 1, 2, 2, 3, 5, 5])
  })
})

describe('travelMs', () => {
  it('빠른 공일수록 짧다', () => {
    expect(travelMs(150)).toBeLessThan(travelMs(100))
    expect(travelMs(150)).toBeGreaterThan(700)
  })
})

describe('judgeSwing', () => {
  it('스윙 안 하면 루킹', () => {
    expect(judgeSwing(null, { type: 'fastball', speed: 150 })).toEqual({ outcome: 'looking', distance: 0 })
  })
  it('정타는 110m 이상, 구속 보너스가 붙는다', () => {
    const fast = judgeSwing(0, { type: 'fastball', speed: 150 }, mid)
    const slow = judgeSwing(0, { type: 'fastball', speed: 100 }, mid)
    expect(fast.outcome).toBe('perfect')
    expect(fast.distance).toBeGreaterThan(slow.distance)
    expect(slow.distance).toBe(125)
  })
  it('오차가 크면 파울 → 헛스윙', () => {
    expect(judgeSwing(120, { type: 'fastball', speed: 150 }).outcome).toBe('foul')
    expect(judgeSwing(-300, { type: 'fastball', speed: 150 }).outcome).toBe('miss')
  })
  it('너클볼은 판정 폭이 좁다', () => {
    expect(judgeSwing(22, { type: 'fastball', speed: 110 }).outcome).toBe('perfect')
    expect(judgeSwing(22, { type: 'knuckle', speed: 110 }).outcome).toBe('good')
  })
})

describe('tallySwings', () => {
  it('홈런과 (홈런 제외) 안타를 따로 세고 3구면 끝', () => {
    expect(tallySwings([sw(130), sw(60), sw(0)])).toEqual({ homeruns: 1, hits: 1, best_distance: 130, finished: true })
    expect(tallySwings([sw(0, 'foul')]).finished).toBe(false)
  })
})

describe('rankDay', () => {
  it('홈런 → 안타 → 최장 비거리, 한 사람은 가장 잘한 판만', () => {
    const r = rankDay([
      play('a', 0, 3, 100), play('a', 1, 0, 125),
      play('b', 1, 1, 121),
      play('c', 1, 1, 130),
      play('d', 0, 0, 0, { finished: false }),
    ])
    expect(r.map(x => [x.member_id, x.rank, x.games])).toEqual([['c', 1, 1], ['b', 2, 1], ['a', 3, 2]])
  })
  it('완전히 같으면 공동 순위', () => {
    expect(rankDay([play('a', 1, 0, 120), play('b', 1, 0, 120)]).map(x => x.rank)).toEqual([1, 1])
  })
})

describe('careerStats', () => {
  it('지난 라운드 1위 횟수 + 통산 합산, 오늘 라운드는 1위 횟수에서 제외', () => {
    const rows = careerStats([
      play('a', 1, 1, 130, { play_date: '2026-09-28' }), play('b', 0, 2, 90, { play_date: '2026-09-28' }),
      play('b', 2, 0, 140, { play_date: '2026-09-29' }), play('a', 0, 1, 60, { play_date: '2026-09-29' }),
      play('a', 3, 0, 150, { play_date: '2026-09-30' }),
    ], '2026-09-30')
    const a = rows.find(r => r.member_id === 'a')!
    const b = rows.find(r => r.member_id === 'b')!
    expect(a).toMatchObject({ dayWins: 1, homeruns: 4, hits: 2, best: 150, games: 3 })
    expect(b).toMatchObject({ dayWins: 1, homeruns: 2, hits: 2, best: 140, games: 2 })
  })
})
