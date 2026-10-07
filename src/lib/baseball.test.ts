import { describe, it, expect } from 'vitest'
import {
  baseTransition, careerStats, dailyAllowance, judgeSwing, paOutcome, randomPitch, rankDay, resolvePitch, rollDoublePlay, simulateGame, travelMs,
  type Bases, type Outcome, type Pitch, type Play, type Swing,
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
  it('3아웃이면 종료, 남은 주자는 잔루, 이후 이벤트는 무시', () => {
    const st = simulateGame([SGL, B, B, K, K, K, K, K, K, HR])
    expect(st.finished).toBe(true)
    expect(st.outs).toBe(3)
    expect(st.results.map(r => r.kind)).toEqual(['1B', 'BB', 'K', 'K', 'K'])
    expect(st.lob).toBe(2)
    expect(st.runs).toBe(0)
  })
  it('사구·볼넷은 아웃이 아니라 이닝이 이어진다 (사구 연속 → 1·2루)', () => {
    const st = simulateGame([K, K, ev('hbp'), ev('hbp')])
    expect(st.finished).toBe(false)
    expect(st.outs).toBe(1)
    expect(st.bases).toEqual([true, true, false])
  })
  it('땅볼·뜬공 아웃은 타석을 끝내고 주자는 그대로', () => {
    const st = simulateGame([B, B, ev('groundout'), ev('popout'), ev('flyout', 110)])
    expect(st.results.map(r => r.kind)).toEqual(['BB', 'GO', 'FO', 'FO'])
    expect(st.finished).toBe(true)
    expect(st.lob).toBe(1)
  })
  it('병살(dp): 1루 주자 + 타자 아웃, 2·3루 주자는 그대로 — 2아웃이거나 1루가 비면 일반 땅볼', () => {
    const GDP: Swing = { ...ev('groundout'), dp: true }
    const st = simulateGame([B, B, DBL, B, B, GDP])
    // 볼넷(1루) → 2루타(1루 주자 3루, 타자 2루) → 볼넷(1·2·3루 만루) → 병살
    expect(st.results.map(r => r.kind)).toEqual(['BB', '2B', 'BB', 'DP'])
    expect(st.outs).toBe(2)
    expect(st.bases).toEqual([false, true, true])
    expect(st.finished).toBe(false)
    expect(simulateGame([K, K, GDP]).results.map(r => r.kind)).toEqual(['K', 'GO']) // 1루 주자 없음
    const twoOut = simulateGame([K, K, K, K, B, B, GDP])
    expect(twoOut.results.map(r => r.kind)).toEqual(['K', 'K', 'BB', 'GO']) // 2아웃 → 타자만 아웃, 이닝 종료
    expect(twoOut.finished).toBe(true)
  })
  it('예전 기록(dp 없음)은 병살로 바뀌지 않는다', () => {
    expect(simulateGame([B, B, ev('groundout')]).results.map(r => r.kind)).toEqual(['BB', 'GO'])
  })
  it('rollDoublePlay: 땅볼 + 1루 주자 + 2아웃 전일 때만, DP_RATE 확률', () => {
    const on1 = { bases: [true, false, false] as [boolean, boolean, boolean], outs: 0 }
    expect(rollDoublePlay(on1, 'groundout', () => 0.1)).toBe(true)
    expect(rollDoublePlay(on1, 'groundout', () => 0.9)).toBe(false)
    expect(rollDoublePlay(on1, 'popout', () => 0)).toBe(false)
    expect(rollDoublePlay({ ...on1, outs: 2 }, 'groundout', () => 0)).toBe(false)
    expect(rollDoublePlay({ bases: [false, true, true], outs: 0 }, 'groundout', () => 0)).toBe(false)
  })
  it('단타 시 3루 주자 득점', () => {
    const st = simulateGame([DBL, SGL, SGL, K, K, K, K, K, K])
    // 2루타(타자 2루) → 단타(주자 3루, 타자 1루) → 단타(3루 주자 홈인, 1루→2루, 타자 1루) → 삼진 3개
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

// 같은 시드면 같은 난수열 — 판정 pipeline을 예전 조합과 비교할 때 쓴다
function seeded(seed: number) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

describe('baseTransition — 진루 규칙 단일 출처(게임·중계 화면 공용)', () => {
  const T = (b: Bases, kind: Parameters<typeof baseTransition>[1]) => baseTransition(b, kind)
  it('1루 주자 + 단타 → 1·2루', () => {
    const tr = T([true, false, false], '1B')
    expect(tr.after).toEqual([true, true, false])
    expect(tr.scored).toBe(0)
    expect(tr.moves).toEqual([{ from: 0, to: 1 }, { from: 'batter', to: 0 }])
  })
  it('1·2루 + 단타 → 만루, 득점 없음', () => {
    expect(T([true, true, false], '1B')).toMatchObject({ after: [true, true, true], scored: 0 })
  })
  it('1루 + 2루타 → 2·3루(1루 주자는 3루)', () => {
    const tr = T([true, false, false], '2B')
    expect(tr.after).toEqual([false, true, true])
    expect(tr.moves).toEqual([{ from: 0, to: 2 }, { from: 'batter', to: 1 }])
  })
  it('만루: 단타 1점·2루타 2점·홈런 4점·볼넷 밀어내기 1점', () => {
    const full: Bases = [true, true, true]
    expect(T(full, '1B')).toMatchObject({ after: [true, true, true], scored: 1 })
    expect(T(full, '2B')).toMatchObject({ after: [false, true, true], scored: 2 })
    expect(T(full, 'HR')).toMatchObject({ after: [false, false, false], scored: 4 })
    expect(T(full, 'BB')).toMatchObject({ after: [true, true, true], scored: 1 })
  })
  it('볼넷·사구는 꽉 찬 주자만 민다 (2·3루면 1루만 채움)', () => {
    const tr = T([false, true, true], 'HBP')
    expect(tr.after).toEqual([true, true, true])
    expect(tr.moves).toEqual([{ from: 1, to: 1 }, { from: 2, to: 2 }, { from: 'batter', to: 0 }])
  })
  it('병살: 1루 주자·타자 아웃, 3루 주자 그대로', () => {
    const tr = T([true, false, true], 'DP')
    expect(tr.after).toEqual([false, false, true])
    expect(tr.moves).toEqual([{ from: 0, to: 'out' }, { from: 2, to: 2 }, { from: 'batter', to: 'out' }])
  })
  it('홈런: 주자 + 타자 전원 홈인', () => {
    expect(T([true, false, false], 'HR')).toMatchObject({ after: [false, false, false], scored: 2 })
  })
  it('삼진·땅볼·뜬공 아웃: 주자 그대로', () => {
    for (const k of ['K', 'GO', 'FO'] as const) expect(T([true, true, false], k)).toMatchObject({ after: [true, true, false], scored: 0 })
  })
  it('paOutcome의 진루는 simulateGame이 실제로 남긴 주자·득점과 같다 (무작위 1천 경기)', () => {
    const r = seeded(7)
    const outs: Outcome[] = ['perfect', 'good', 'fair', 'foul', 'miss', 'looking', 'ball', 'hbp', 'groundout', 'popout', 'flyout']
    for (let g = 0; g < 1000; g++) {
      const events: Swing[] = []
      for (let i = 0; i < 12; i++) {
        const st = simulateGame(events)
        if (st.finished) break
        const e = ev(outs[Math.floor(r() * outs.length)], Math.round(r() * 1500) / 10)
        if (e.outcome === 'groundout' && rollDoublePlay(st, e.outcome, r)) e.dp = true
        const pa = paOutcome(st, e)
        const after = simulateGame([...events, e])
        if (pa) {
          expect(pa.transition.after).toEqual(after.bases)
          expect(pa.transition.scored).toBe(after.runs - st.runs)
          expect(pa.kind).toBe(after.results[after.results.length - 1].kind)
        } else {
          expect(after.bases).toEqual(st.bases)
          expect(after.pa).toBe(st.pa)
        }
        events.push(e)
      }
    }
  })
})

describe('resolvePitch — 판정 pipeline 하나로', () => {
  it('예전 조합(judgeSwing → rollDoublePlay → simulateGame → paLabel)과 같은 결과·같은 난수 소비', () => {
    const r = seeded(11)
    for (let i = 0; i < 3000; i++) {
      const events = [B, B, SGL, K].slice(0, Math.floor(r() * 5))
      const pitch: Pitch = randomPitch(r)
      const offset = r() < 0.2 ? null : r() * 140 - 70
      const seed = Math.floor(r() * 1e9) + 1
      // 예전 BaseballWidget.resolveSwing 본문
      const r1 = seeded(seed)
      const { outcome, distance } = judgeSwing(offset, pitch, r1)
      const old: Swing = { type: pitch.type, speed: pitch.speed, outcome, distance, offset: offset === null ? null : Math.round(offset) }
      const before = simulateGame(events)
      if (rollDoublePlay(before, outcome, r1)) old.dp = true
      const after = simulateGame([...events, old])
      const r2 = seeded(seed)
      const res = resolvePitch(events, pitch, offset, { rand: r2 })
      expect(res.swing).toEqual(old)
      expect(res.after).toEqual(after)
      expect(r2()).toBe(r1()) // 난수를 같은 횟수만큼 썼다
    }
  })
  it('대결: pid가 붙고 저장 키 순서도 예전과 같다(…, offset, pid, dp)', () => {
    const p: Pitch = { id: 'p1', type: 'fastball', speed: 140, alt: 1, slot: 'mid', windup: 900, height: 0 }
    const { swing } = resolvePitch([B, B], p, 2, { pid: 'p1', rand: () => 0.01 })
    expect(Object.keys(swing)).toEqual(['type', 'speed', 'outcome', 'distance', 'offset', 'pid'])
  })
  it('타석이 끝나면 paEnded 문구, 아니면 null / 스윙 안 하면 병살 굴림 없음', () => {
    const p: Pitch = { id: 'p', type: 'fastball', speed: 140, alt: 1, slot: 'mid', windup: 900, height: 0 }
    expect(resolvePitch([K], p, null).paEnded).toBe('삼진')
    expect(resolvePitch([], p, null).paEnded).toBeNull()
    let calls = 0
    resolvePitch([B, B], p, null, { rand: () => { calls++; return 0 } })
    expect(calls).toBe(0)
  })
})
