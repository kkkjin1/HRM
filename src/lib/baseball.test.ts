import { describe, it, expect } from 'vitest'
import {
  careerStats, dailyAllowance, judgeSwing, randomPitch, rankDay, simulateGame, travelMs,
  type Outcome, type Play, type Swing,
} from './baseball'

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
  it('스윙 안 하면 루킹, 존 밖 공은 참으면 볼, 사구는 무조건', () => {
    expect(judgeSwing(null, { type: 'fastball', speed: 150 }).outcome).toBe('looking')
    expect(judgeSwing(null, { type: 'ball', speed: 140 }).outcome).toBe('ball')
    expect(judgeSwing(null, { type: 'curve', speed: 110, height: 1.5 }).outcome).toBe('ball')
    expect(judgeSwing(0, { type: 'hbp', speed: 140 }).outcome).toBe('hbp')
  })
  it('존 밖 공을 치면 타이밍이 맞아도 빗맞은 아웃(낮으면 땅볼·높으면 뜬공) 아니면 파울, 안 맞으면 헛스윙', () => {
    expect(judgeSwing(0, { type: 'fastball', speed: 140, height: 1.5 }, () => 0.1).outcome).toBe('groundout')
    expect(judgeSwing(0, { type: 'fastball', speed: 140, height: -1.5 }, () => 0.1).outcome).toBe('popout')
    expect(judgeSwing(0, { type: 'fastball', speed: 140, height: 1.5 }, () => 0.9).outcome).toBe('foul')
    expect(judgeSwing(-200, { type: 'fastball', speed: 140, height: 1.5 }).outcome).toBe('miss')
  })
  it('존 가장자리 공은 빗맞기 쉽고, 맞아도 비거리가 줄어든다', () => {
    expect(judgeSwing(0, { type: 'fastball', speed: 140, height: 1 }, () => 0.3).outcome).toBe('groundout')
    const mid = judgeSwing(0, { type: 'fastball', speed: 140, height: 0 }, () => 0.3)
    const edge = judgeSwing(0, { type: 'fastball', speed: 140, height: 0.6 }, () => 0.3)
    expect(edge.outcome).toBe('perfect')
    expect(edge.distance).toBeLessThan(mid.distance)
  })
  it('정타는 110m 이상, 구속 보너스가 붙는다', () => {
    const lucky = () => 0.4 // 수비에 안 잡히는 쪽
    const fast = judgeSwing(0, { type: 'fastball', speed: 150 }, lucky)
    const slow = judgeSwing(0, { type: 'fastball', speed: 100 }, lucky)
    expect(fast.outcome).toBe('perfect')
    expect(fast.distance).toBeGreaterThan(slow.distance)
    expect(slow.distance).toBe(129)
  })
  it('잘 맞아도 수비에 잡힐 수 있다 — 강한 타구는 외야 뜬공(펜스 앞), 약한 타구는 땅볼', () => {
    const caught = judgeSwing(0, { type: 'fastball', speed: 150 }, () => 0.9)
    expect(caught.outcome).toBe('flyout')
    expect(caught.distance).toBeLessThan(125)
    expect(judgeSwing(30, { type: 'fastball', speed: 140 }, () => 0.9).outcome).toBe('groundout')
  })
  it('너클볼은 판정 폭이 좁다', () => {
    expect(judgeSwing(7, { type: 'fastball', speed: 110 }, () => 0.1).outcome).toBe('perfect')
    expect(judgeSwing(7, { type: 'knuckle', speed: 110 }, () => 0.1).outcome).toBe('good')
  })
  it('판정 폭이 좁다: 정타 ±18ms, 빗맞음 ±35, 파울 ±60ms 밖은 헛스윙', () => {
    expect(judgeSwing(15, { type: 'fastball', speed: 140 }, () => 0.05).outcome).toBe('good')
    expect(judgeSwing(30, { type: 'fastball', speed: 140 }, () => 0.05).outcome).toBe('fair')
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
  it('땅볼·뜬공 아웃은 타석을 끝내고 주자는 그대로', () => {
    const st = simulateGame([B, B, ev('groundout'), ev('popout')])
    expect(st.results.map(r => r.kind)).toEqual(['BB', 'GO', 'FO'])
    expect(st.finished).toBe(true)
    expect(st.lob).toBe(1)
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
