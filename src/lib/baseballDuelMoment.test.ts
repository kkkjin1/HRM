import { describe, it, expect } from 'vitest'
import { duelEventMoment, duelSituation, gaugeGrade, PERFECT_ERR, GAUGE_PERFECT_SHOW_ERR, type Duel } from './baseballDuel'
import type { Outcome, Swing } from './baseball'

// 상황 연출(표시 전용) helper — 실제 대결 규칙으로만 판단하는지

const ev = (outcome: Outcome, distance = 0): Swing => ({ type: 'fastball', speed: 150, outcome, distance, offset: 0 })
const K = ev('looking')
const HR = ev('perfect', 130)
const SGL = ev('fair', 50)
const OUT1 = [K, K]
const OUT3 = [...OUT1, ...OUT1, ...OUT1]
const duel = (halves: Swing[][]): Pick<Duel, 'halves' | 'challenger_id' | 'opponent_id'> => ({ halves, challenger_id: 'c', opponent_id: 'o' })

describe('duelEventMoment — 결과 공개 때 (역전 > 동점 > 첫 득점 > 첫 안타)', () => {
  it('첫 안타 / 두 번째 안타는 없음', () => {
    expect(duelEventMoment([[]], [[SGL]])).toBe('FIRST_HIT')
    expect(duelEventMoment([[SGL]], [[SGL, SGL]])).toBeNull()
  })
  it('첫 득점(첫 안타가 홈런이어도 첫 득점이 우선)', () => {
    expect(duelEventMoment([[]], [[HR]])).toBe('FIRST_RUN')
  })
  it('동점: 초에 1점 내준 뒤 말에 홈런', () => {
    expect(duelEventMoment([[HR, ...OUT3], []], [[HR, ...OUT3], [HR]])).toBe('TIE')
  })
  it('역전: 지고 있다가 한 번에 앞서기', () => {
    expect(duelEventMoment([[HR, ...OUT3], [SGL]], [[HR, ...OUT3], [SGL, HR]])).toBe('LEAD_CHANGE')
  })
  it('점수 변화 없는 아웃은 없음', () => {
    expect(duelEventMoment([[SGL]], [[SGL, K]])).toBeNull()
  })
})

describe('duelSituation — 다음 타석 시작 때 (끝내기 찬스 > LAST OUT)', () => {
  it('말 공격 동점: 홈런이면 끝내기 → 끝내기 찬스', () => {
    expect(duelSituation(duel([OUT3, []]))).toBe('WALKOFF_CHANCE')
  })
  it('말 공격, 1점 지고 주자 없음, 2아웃: 홈런도 동점뿐 → LAST OUT', () => {
    expect(duelSituation(duel([[HR, ...OUT3], [...OUT1, ...OUT1]]))).toBe('LAST_OUT')
  })
  it('말 공격, 1점 지고 주자 1명: 홈런이면 역전 끝내기 → 끝내기 찬스(2아웃이어도 우선)', () => {
    expect(duelSituation(duel([[HR, ...OUT3], [...OUT1, ...OUT1, SGL]]))).toBe('WALKOFF_CHANCE')
  })
  it('초 공격 2아웃은 경기 끝이 아님(말 공격이 남음)', () => {
    expect(duelSituation(duel([[...OUT1, ...OUT1]]))).toBeNull()
  })
  it('말 공격 동점 2아웃: 아웃이면 연장으로 이어지므로 LAST OUT 아님 — 대신 끝내기 찬스', () => {
    expect(duelSituation(duel([OUT3, [...OUT1, ...OUT1]]))).toBe('WALKOFF_CHANCE')
  })
  it('말 공격 3점 차, 주자 없음, 무사: 아무것도 없음', () => {
    expect(duelSituation(duel([[SGL, SGL, HR, ...OUT3], []]))).toBeNull()
  })
  it('1S에서도 같은 판단(남은 스트라이크만큼 가상 삼진)', () => {
    expect(duelSituation(duel([[HR, ...OUT3], [...OUT1, ...OUT1, K]]))).toBe('LAST_OUT')
  })
})

describe('제구 막대 표시 등급 (효과는 좋음 구간 안/밖 두 가지 그대로)', () => {
  it('완벽 ⊂ 좋음 ⊂ 전체', () => {
    expect(gaugeGrade(0)).toBe('PERFECT')
    expect(gaugeGrade(GAUGE_PERFECT_SHOW_ERR)).toBe('PERFECT')
    expect(gaugeGrade(GAUGE_PERFECT_SHOW_ERR + 0.01)).toBe('GOOD')
    expect(gaugeGrade(PERFECT_ERR)).toBe('GOOD')
    expect(gaugeGrade(PERFECT_ERR + 0.01)).toBe('MISS')
  })
})
