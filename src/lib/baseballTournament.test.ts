import { describe, it, expect } from 'vitest'
import { betOpen, currentMatch, nextStep, roundName, seedBracket, totalRounds, type Match } from './baseballTournament'

let seq = 0
const newId = () => `d${++seq}`

function run(bracket: Match[][], duels: Record<string, { status: 'done' | 'playing'; winner_id: string | null }> = {}) {
  return nextStep({ status: 'running', bracket }, new Map(Object.entries(duels)), newId)
}

describe('seedBracket', () => {
  it('홀수면 1명 제외(베팅 전용), 나머지로 1라운드', () => {
    const s = seedBracket(['a', 'b', 'c', 'd', 'e'], () => 0.3)
    expect(s.players).toHaveLength(4)
    expect(s.excluded_id).not.toBeNull()
    expect(s.players).not.toContain(s.excluded_id)
    expect(s.bracket[0]).toHaveLength(2)
  })
  it('짝수면 제외 없음', () => {
    const s = seedBracket(['a', 'b'])
    expect(s.excluded_id).toBeNull()
    expect(s.bracket[0]).toEqual([{ a: expect.any(String), b: expect.any(String), duel_id: null, winner: null }])
  })
})

describe('roundName', () => {
  it('4명이면 준결승 → 결승', () => {
    expect(totalRounds(4)).toBe(2)
    expect(roundName(0, 2)).toBe('준결승')
    expect(roundName(1, 2)).toBe('결승')
  })
})

describe('nextStep', () => {
  it('시작 직후 첫 경기만 배정 (한 번에 하나씩)', () => {
    const s = run([[{ a: 'a', b: 'b', duel_id: null, winner: null }, { a: 'c', b: 'd', duel_id: null, winner: null }]])!
    expect(s.createDuel).toMatchObject({ round: 0, match_no: 0, a: 'a', b: 'b' })
    expect(s.bracket[0][1].duel_id).toBeNull()
  })
  it('진행 중이면 아무것도 안 바뀜', () => {
    expect(run([[{ a: 'a', b: 'b', duel_id: 'x', winner: null }, { a: 'c', b: 'd', duel_id: null, winner: null }]], { x: { status: 'playing', winner_id: null } })).toBeNull()
  })
  it('첫 경기 끝나면 승자 기록 + 두 번째 경기 배정', () => {
    const s = run([[{ a: 'a', b: 'b', duel_id: 'x', winner: null }, { a: 'c', b: 'd', duel_id: null, winner: null }]], { x: { status: 'done', winner_id: 'b' } })!
    expect(s.bracket[0][0].winner).toBe('b')
    expect(s.createDuel).toMatchObject({ match_no: 1, a: 'c', b: 'd' })
  })
  it('라운드가 끝나면 결승 생성 + 배정, 결승 끝나면 우승', () => {
    const s = run([[{ a: 'a', b: 'b', duel_id: 'x', winner: 'b' }, { a: 'c', b: 'd', duel_id: 'y', winner: null }]], { y: { status: 'done', winner_id: 'c' } })!
    expect(s.bracket[1][0]).toMatchObject({ a: 'b', b: 'c' })
    expect(s.createDuel).toMatchObject({ round: 1, a: 'b', b: 'c' })
    const f = run(s.bracket, { [s.createDuel!.id]: { status: 'done', winner_id: 'c' } })!
    expect(f.status).toBe('done')
    expect(f.champion_id).toBe('c')
  })
  it('다음 라운드가 홀수면 마지막 사람 부전승', () => {
    const s = run([[
      { a: 'a', b: 'b', duel_id: 'x', winner: 'a' }, { a: 'c', b: 'd', duel_id: 'y', winner: 'c' }, { a: 'e', b: 'f', duel_id: 'z', winner: null },
    ]], { z: { status: 'done', winner_id: 'e' } })!
    expect(s.bracket[1]).toEqual([
      { a: 'a', b: 'c', duel_id: expect.any(String), winner: null },
      { a: 'e', b: null, duel_id: null, winner: 'e' },
    ])
  })
})

describe('currentMatch / betOpen', () => {
  it('진행 중 경기를 찾고, 첫 경기 끝나면 베팅 마감', () => {
    const b: Match[][] = [[{ a: 'a', b: 'b', duel_id: 'x', winner: null }]]
    expect(currentMatch({ bracket: b })?.match.a).toBe('a')
    expect(betOpen({ status: 'running', bracket: b })).toBe(true)
    expect(betOpen({ status: 'running', bracket: [[{ ...b[0][0], winner: 'a' }]] })).toBe(false)
  })
})
