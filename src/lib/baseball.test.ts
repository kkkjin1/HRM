import { describe, it, expect } from 'vitest'
import {
  careerStats, dailyAllowance, judgeSwing, randomPitch, rankDay, simulateGame, travelMs,
  type Outcome, type Play, type Swing,
} from './baseball'

const mid = () => 0.5

function ev(outcome: Outcome, distance = 0): Swing {
  return { type: 'fastball', speed: 150, outcome, distance, offset: 0 }
}
const K = ev('looking')
const B = ev('ball')
const HR = ev('perfect', 130)
const DBL = ev('good', 90)
const SGL = ev('fair', 50)

function play(member_id: string, runs: number, homeruns: number, hits: number, best: number, over: Partial<Play> = {}): Play {
  return {
    id: `${member_id}-${Math.random()}`, member_id, play_date: '2026-09-30', game_no: 1, swings: [],
    runs, homeruns, hits, lob: 0, best_distance: best, finished: true, created_at: '', finished_at: '', ...over,
  }
}

describe('dailyAllowance', () => {
  it('기본 1 + 칭찬 4개당 1 (최대 5) + 관리자 추가분', () => {
    expect([0, 3, 4, 7, 8, 16, 40].map(p => dailyAllowance(p))).toEqual([1, 1, 2, 2, 3, 5, 5])
    expect(dailyAllowance(40, 2)).toBe(7)
  })
})

describe('randomPitch', () => {
  it('구종별 구속 범위 안에서 나온다', () => {
    for (let i = 0; i < 200; i++) {
      const p = randomPitch()
      expect(p.speed).toBeGreaterThanOrEqual(70)
      expect(p.speed).toBeLessThanOrEqual(165)
      expect(p.windup).toBeGreaterThanOrEqual(600)
      expect(p.windup).toBeLessThanOrEqual(1500)
    }
  })
})

describe('travelMs', () => {
  it('빠른 공일수록 짧다', () => {
    expect(travelMs(160)).toBeLessThan(travelMs(100))
  })
})

describe('judgeSwing', () => {
  it('스윙 안 하면 루킹, 빠지는 볼은 참으면 볼·휘두르면 헛스윙, 사구는 무조건', () => {
    expect(judgeSwing(null, { type: 'fastball', speed: 150 }).outcome).toBe('looking')
    expect(judgeSwing(null, { type: 'ball', speed: 140 }).outcome).toBe('ball')
    expect(judgeSwing(0, { type: 'ball', speed: 140 }).outcome).toBe('miss')
    expect(judgeSwing(0, { type: 'hbp', speed: 140 }).outcome).toBe('hbp')
  })
  it('정타는 110m 이상, 구속 보너스가 붙는다', () => {
    const fast = judgeSwing(0, { type: 'fastball', speed: 150 }, mid)
    const slow = judgeSwing(0, { type: 'fastball', speed: 100 }, mid)
    expect(fast.outcome).toBe('perfect')
    expect(fast.distance).toBeGreaterThan(slow.distance)
    expect(slow.distance).toBe(132.5)
  })
  it('너클볼은 판정 폭이 좁다', () => {
    expect(judgeSwing(7, { type: 'fastball', speed: 110 }).outcome).toBe('perfect')
    expect(judgeSwing(7, { type: 'knuckle', speed: 110 }).outcome).toBe('good')
  })
  it('판정 폭이 좁다: 정타 ±18ms, 빗맞음 ±35, 파울 ±60ms 밖은 헛스윙', () => {
    expect(judgeSwing(15, { type: 'fastball', speed: 140 }).outcome).toBe('good')
    expect(judgeSwing(30, { type: 'fastball', speed: 140 }).outcome).toBe('fair')
    expect(judgeSwing(50, { type: 'fastball', speed: 140 }).outcome).toBe('foul')
    expect(judgeSwing(65, { type: 'fastball', speed: 140 }).outcome).toBe('miss')
  })
})

describe('simulateGame', () => {
  it('2스트라이크 삼진, 1S에서 파울은 카운트 유지', () => {
    const st = simulateGame([ev('foul'), ev('foul'), ev('foul'), K])
    expect(st.results.map(r => r.kind)).toEqual(['K'])
    expect(st.pa).toBe(1)
  })
  it('2볼 볼넷 → 주자, 다음 타석 홈런은 2점', () => {
    const st = simulateGame([B, B, HR])
    expect(st.results.map(r => [r.kind, r.rbi])).toEqual([['BB', 0], ['HR', 2]])
    expect(st.runs).toBe(2)
    expect(st.bases).toEqual([false, false, false])
  })
  it('사구 → 1루, 2루타 → 주자 홈인 없이 2·3루(1루 주자는 3루)', () => {
    const st = simulateGame([ev('hbp'), DBL])
    expect(st.bases).toEqual([false, true, true])
    expect(st.runs).toBe(0)
  })
  it('3타석이면 종료, 남은 주자는 잔루, 이후 이벤트는 무시', () => {
    const st = simulateGame([SGL, B, B, K, K, HR])
    expect(st.finished).toBe(true)
    expect(st.results.map(r => r.kind)).toEqual(['1B', 'BB', 'K'])
    expect(st.lob).toBe(2)
    expect(st.runs).toBe(0)
  })
  it('단타 시 3루 주자 득점', () => {
    const st = simulateGame([DBL, SGL, SGL])
    // 2루타(타자 2루) → 단타(주자 3루, 타자 1루) → 단타(3루 주자 홈인, 1루→2루, 타자 1루)
    expect(st.runs).toBe(1)
    expect(st.bases).toEqual([true, true, false])
    expect(st.lob).toBe(2)
  })
})

describe('rankDay', () => {
  it('득점 → 홈런 → 안타 → 최장 비거리, 한 사람은 가장 잘한 판만', () => {
    const r = rankDay([
      play('a', 1, 1, 0, 125), play('a', 2, 1, 1, 121),
      play('b', 2, 1, 1, 130),
      play('c', 3, 0, 3, 90),
      play('d', 0, 0, 0, 0, { finished: false }),
    ])
    expect(r.map(x => [x.member_id, x.rank, x.games])).toEqual([['c', 1, 1], ['b', 2, 1], ['a', 3, 2]])
  })
  it('완전히 같으면 공동 순위', () => {
    expect(rankDay([play('a', 1, 1, 0, 120), play('b', 1, 1, 0, 120)]).map(x => x.rank)).toEqual([1, 1])
  })
})

describe('careerStats', () => {
  it('지난 라운드 1위 횟수 + 통산 합산, 오늘 라운드는 1위 횟수에서 제외', () => {
    const rows = careerStats([
      play('a', 2, 1, 1, 130, { play_date: '2026-09-28' }), play('b', 0, 0, 2, 90, { play_date: '2026-09-28' }),
      play('b', 3, 2, 0, 140, { play_date: '2026-09-29' }), play('a', 0, 0, 1, 60, { play_date: '2026-09-29' }),
      play('a', 4, 3, 0, 150, { play_date: '2026-09-30' }),
    ], '2026-09-30')
    expect(rows.find(r => r.member_id === 'a')).toMatchObject({ dayWins: 1, runs: 6, homeruns: 4, hits: 2, best: 150, games: 3 })
    expect(rows.find(r => r.member_id === 'b')).toMatchObject({ dayWins: 1, runs: 3, homeruns: 2, hits: 2, best: 140, games: 2 })
  })
})
