import { describe, it, expect } from 'vitest'
import { applyDuelEvent, duelScore, gaugeError, gaugePos, halfRoles, makeDuelPitch, playRps, type Duel } from './baseballDuel'
import type { Outcome, Swing } from './baseball'

const ev = (outcome: Outcome, distance = 0): Swing => ({ type: 'fastball', speed: 150, outcome, distance, offset: 0 })
const K = ev('looking')
const HR = ev('perfect', 130)
const SGL = ev('fair', 50)
const HBP = ev('hbp')
const OUT3 = [K, K, K, K, K, K] // 삼진 3개 = 3아웃

type D = Pick<Duel, 'halves' | 'challenger_id' | 'opponent_id'>
function duel(halves: Swing[][]): D {
  return { halves, challenger_id: 'c', opponent_id: 'o' }
}

// 이벤트 목록을 차례로 적용 (끝나면 멈춤)
function play(d: D, events: Swing[], mustWin = false) {
  let cur = { ...d }
  let last = null as ReturnType<typeof applyDuelEvent> | null
  for (const e of events) {
    last = applyDuelEvent(cur, e, { mustWin })
    cur = { ...cur, halves: last.halves }
    if (last.status !== 'playing') break
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
  it('3아웃이면 말로 넘어간다 — 사구는 아웃이 아니라 이닝이 이어진다', () => {
    const a = play(duel([[]]), [K, K, HBP, HBP])
    expect(a.d.halves.length).toBe(1) // 1아웃 · 1·2루, 아직 초
    const b = play(a.d, [K, K, K, K])
    expect(b.d.halves.length).toBe(2)
  })
  it('말에서 도전자가 앞서면 끝내기', () => {
    const top = play(duel([[]]), OUT3).d
    const { last } = play(top, [HR])
    expect(last.status).toBe('done')
    expect(last.winner_id).toBe('c')
    expect(duelScore(last.halves)).toEqual({ challenger: 1, opponent: 0 })
  })
  it('1회 끝나 상대가 앞서면 상대 승', () => {
    const top = play(duel([[]]), [HR, ...OUT3]).d
    const { last } = play(top, OUT3)
    expect(last.status).toBe('done')
    expect(last.winner_id).toBe('o')
  })
  it('동점이면 2회 연장 1번, 그래도 같으면 안타 많은 쪽 승리', () => {
    let d = duel([[]])
    d = play(d, [SGL, ...OUT3]).d // 1회초 상대 안타 1
    d = play(d, OUT3).d
    d = play(d, OUT3).d
    const { last } = play(d, OUT3)
    expect(last.halves.length).toBe(4)
    expect(last.status).toBe('done')
    expect(last.winner_id).toBe('o')
  })
  it('안타도 같으면 친선전은 무승부, 토너먼트는 가위바위보로', () => {
    let d = duel([[]])
    for (let i = 0; i < 3; i++) d = play(d, OUT3).d
    expect(play(d, OUT3).last).toMatchObject({ status: 'done', winner_id: null })
    let t = duel([[]])
    for (let i = 0; i < 3; i++) t = play(t, OUT3, true).d
    const r = play(t, OUT3, true).last
    expect(r.status).toBe('rps')
    expect(r.rps).toEqual({ c: null, o: null, round: 1 })
  })
})

describe('playRps', () => {
  const d = { challenger_id: 'c', opponent_id: 'o' }
  it('한 명만 냈으면 대기, 비기면 다음 판, 이기면 끝', () => {
    const a = playRps({ ...d, rps: { c: null, o: null, round: 1 } }, 'c', 'rock')
    expect(a.status).toBe('rps')
    const tie = playRps({ ...d, rps: a.rps }, 'o', 'rock')
    expect(tie.rps).toMatchObject({ c: null, o: null, round: 2, last: { c: 'rock', o: 'rock' } })
    const win = playRps({ ...d, rps: { c: 'paper', o: null, round: 2 } }, 'o', 'rock')
    expect(win).toMatchObject({ status: 'done', winner_id: 'c' })
  })
})

describe('makeDuelPitch', () => {
  it('게이지 가운데면 고른 높이·구속 그대로', () => {
    const p = makeDuelPitch('curve', 'low', 'fast', 0.1, () => 0.5)
    expect(p.type).toBe('curve')
    expect(p.height).toBeCloseTo(0.8, 1)
    expect(p.speed).toBe(120)
    expect(makeDuelPitch('curve', 'highBall', 'slow', 0, () => 0.5).height).toBeCloseTo(-1.5, 1)
  })
  it('가운데를 벗어나면 높이·구속이 랜덤', () => {
    const p = makeDuelPitch('curve', 'low', 'fast', 0.6, () => 0.95)
    expect(p.height).toBeCloseTo(1.53, 1) // 낮은 쪽 존 밖으로 빠짐
    expect(p.speed).toBeLessThan(121)
  })
  it('아주 크게 흔들리면 사구가 나올 수 있다', () => {
    expect(makeDuelPitch('fastball', 'mid', 'normal', 0.95, () => 0.1).type).toBe('hbp')
  })
})

describe('gauge', () => {
  it('왕복 게이지, 정중앙 오차 0 · 끝 오차 1', () => {
    expect(gaugePos(0)).toBe(0)
    expect(gaugePos(350)).toBeCloseTo(1)
    expect(gaugeError(0.5)).toBe(0)
    expect(gaugeError(1)).toBe(1)
  })
})
