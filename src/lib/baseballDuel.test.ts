import { describe, it, expect } from 'vitest'
import { applyDuelEvent, duelScore, gaugeError, gaugePos, halfRoles, makeDuelPitch, type Duel } from './baseballDuel'
import type { Outcome, Swing } from './baseball'

const ev = (outcome: Outcome, distance = 0): Swing => ({ type: 'fastball', speed: 150, outcome, distance, offset: 0 })
const K = ev('looking')
const HR = ev('perfect', 130)
const SGL = ev('fair', 50)

function duel(halves: Swing[][]): Pick<Duel, 'halves' | 'challenger_id' | 'opponent_id'> {
  return { halves, challenger_id: 'c', opponent_id: 'o' }
}

// 한 반 이닝(3타석)을 이벤트 목록으로 끝까지 적용
function playHalf(d: Pick<Duel, 'halves' | 'challenger_id' | 'opponent_id'>, events: Swing[], mustWin = false) {
  let cur = { ...d }
  let last = null as ReturnType<typeof applyDuelEvent> | null
  for (const e of events) {
    last = applyDuelEvent(cur, e, { mustWin, rand: () => 0.1 })
    cur = { ...cur, halves: last.halves }
    if (last.status === 'done') break
  }
  return { d: cur, last: last! }
}

describe('halfRoles', () => {
  it('초는 도전자가 던지고 상대가 친다, 말은 반대', () => {
    expect(halfRoles({ challenger_id: 'c', opponent_id: 'o' }, 0)).toEqual({ pitcher: 'c', batter: 'o' })
    expect(halfRoles({ challenger_id: 'c', opponent_id: 'o' }, 1)).toEqual({ pitcher: 'o', batter: 'c' })
  })
})

describe('applyDuelEvent', () => {
  it('초 3타석이 끝나면 말로 넘어간다', () => {
    const { d, last } = playHalf(duel([[]]), [K, K, K, K, K, K])
    expect(last.status).toBe('playing')
    expect(d.halves.length).toBe(2)
  })
  it('말에서 도전자가 앞서면 끝내기', () => {
    const top = playHalf(duel([[]]), [K, K, K, K, K, K]).d // 0점
    const { last } = playHalf(top, [HR])
    expect(last.status).toBe('done')
    expect(last.winner_id).toBe('c')
    expect(duelScore(last.halves)).toEqual({ challenger: 1, opponent: 0 })
  })
  it('1회 끝나 상대가 앞서면 상대 승', () => {
    const top = playHalf(duel([[]]), [HR, K, K, K, K]).d // 상대 1점
    const { last } = playHalf(top, [K, K, K, K, K, K])
    expect(last.status).toBe('done')
    expect(last.winner_id).toBe('o')
  })
  it('동점이면 연장, 최대 3번 연장 뒤에도 같으면 친선전은 무승부', () => {
    let d = duel([[]])
    let last = null as ReturnType<typeof applyDuelEvent> | null
    for (let i = 0; i < 8; i++) { const r = playHalf(d, [K, K, K, K, K, K]); d = r.d; last = r.last }
    expect(last!.status).toBe('done')
    expect(last!.winner_id).toBeNull()
    expect(last!.halves.length).toBe(8) // 4이닝 × 초말
  })
  it('토너먼트(mustWin)는 끝까지 같으면 동전 던지기로라도 승자', () => {
    let d = duel([[]])
    let last = null as ReturnType<typeof applyDuelEvent> | null
    for (let i = 0; i < 8; i++) { const r = playHalf(d, [K, K, K, K, K, K], true); d = r.d; last = r.last }
    expect(last!.winner_id).not.toBeNull()
  })
  it('득점은 반 이닝별 3타석 규칙 그대로 (볼넷 후 안타)', () => {
    const top = playHalf(duel([[]]), [SGL, SGL, SGL]).d // 단타 3개: 3루 주자 없이 만루... 1점도 없음
    expect(duelScore(top.halves).opponent).toBe(0)
  })
})

describe('makeDuelPitch', () => {
  it('정중앙이면 노린 대로', () => {
    expect(makeDuelPitch('curve', 'zone', 0, () => 0.3).type).toBe('curve')
    expect(makeDuelPitch('curve', 'high', 0, () => 0.3).type).toBe('ball')
  })
  it('존을 노렸는데 흔들리면 볼, 볼을 노렸는데 흔들리면 실투(스트라이크)', () => {
    expect(makeDuelPitch('slider', 'zone', 0.6, () => 0.3).type).toBe('ball')
    expect(makeDuelPitch('slider', 'low', 0.7, () => 0.3).type).toBe('slider')
  })
  it('아주 크게 흔들리면 사구가 나올 수 있다', () => {
    expect(makeDuelPitch('fastball', 'zone', 0.95, () => 0.1).type).toBe('hbp')
  })
})

describe('gauge', () => {
  it('왕복 게이지, 정중앙 오차 0 · 끝 오차 1', () => {
    expect(gaugePos(0)).toBe(0)
    expect(gaugePos(550)).toBeCloseTo(1)
    expect(gaugeError(0.5)).toBe(0)
    expect(gaugeError(1)).toBe(1)
  })
})
