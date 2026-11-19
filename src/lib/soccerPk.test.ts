import { describe, expect, it } from 'vitest'
import { diveOf, judgePk, keeperOf, parseDetail, pkRank, powerAt, shotOf } from './soccerPk'
import { mulberry32 } from './soccer'

describe('오늘의 PK', () => {
  it('같은 날짜면 같은 키퍼, 날짜가 바뀌면 (대개) 다른 키퍼', () => {
    expect(keeperOf('2026-11-19')).toEqual(keeperOf('2026-11-19'))
    const names = new Set(Array.from({ length: 10 }, (_, i) => keeperOf(`2026-11-${10 + i}`).name))
    expect(names.size).toBeGreaterThan(3)
  })
  it('힘 막대는 0→1→0으로 오르내린다', () => {
    expect(powerAt(0)).toBe(0)
    expect(powerAt(0.75)).toBeCloseTo(1)
    expect(powerAt(1.5)).toBeCloseTo(0)
  })
  it('골대 밖은 아웃, 기둥 근처는 골대, 키퍼 손 닿는 곳은 선방', () => {
    const k = { ...keeperOf('2026-11-19'), react: 0.15, reach: 1 }
    expect(judgePk(k, { x: 1.3, y: 0.5, flight: 0.4 }, { x: 0, y: 0.5 })).toBe('wide')
    expect(judgePk(k, { x: 0.2, y: 1.3, flight: 0.4 }, { x: 0, y: 0.5 })).toBe('over')
    expect(judgePk(k, { x: 1.0, y: 0.5, flight: 0.4 }, { x: 0, y: 0.5 })).toBe('post')
    expect(judgePk(k, { x: 0.7, y: 0.6, flight: 0.6 }, { x: 0.7, y: 0.6 })).toBe('save')
    expect(judgePk(k, { x: 0.8, y: 0.6, flight: 0.6 }, { x: -0.7, y: 0.6 })).toBe('goal')
  })
  it('구석을 적당한 힘으로 차면 가운데보다 잘 들어간다', () => {
    const rnd = mulberry32(3)
    const rate = (aim: { x: number; y: number }, pw: number) => {
      let g = 0
      for (let i = 0; i < 1500; i++) {
        const k = keeperOf(`2026-10-${(i % 28) + 1}`)
        if (judgePk(k, shotOf(aim, pw, rnd), diveOf(k, aim, rnd)) === 'goal') g++
      }
      return g / 1500
    }
    const corner = rate({ x: 0.8, y: 0.7 }, 0.72)
    const center = rate({ x: 0, y: 0.4 }, 0.6)
    expect(corner).toBeGreaterThan(center)
    expect(corner).toBeLessThan(0.9) // 너무 쉽진 않게
    expect(rate({ x: 0.85, y: 0.8 }, 1)).toBeLessThan(0.1) // 최대 힘은 뜬다
  })
  it('기록 해석·순위', () => {
    expect(parseDetail('OX-')).toEqual([true, false, null])
    const r = pkRank([
      { member_id: 'a', day: '2026-11-17', detail: 'OOXOO', goals: 4 },
      { member_id: 'b', day: '2026-11-17', detail: 'OOOO', goals: 4 },
      { member_id: 'a', day: '2026-11-10', detail: 'OOOOO', goals: 5 },
    ], '2026-11-16', '2026-11-22')
    expect(r.map(x => x.member_id)).toEqual(['b', 'a'])
  })
})
