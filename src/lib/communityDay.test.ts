import { describe, expect, it } from 'vitest'
import { communityDayOf, communityDaysAround, lastThursday } from './communityDay'

describe('커뮤니티데이', () => {
  it('매월 마지막 주 목요일', () => {
    expect(lastThursday(2026, 10)).toBe('2026-10-29')
    expect(lastThursday(2026, 11)).toBe('2026-11-26')
    expect(lastThursday(2026, 12)).toBe('2026-12-31') // 말일이 목요일
    expect(lastThursday(2027, 2)).toBe('2027-02-25')
  })
  it('옮긴 달은 옮긴 날짜를 쓴다', () => {
    expect(communityDayOf(2026, 10, { '2026-10': '2026-10-28' })).toBe('2026-10-28')
    expect(communityDayOf(2026, 11, { '2026-10': '2026-10-28' })).toBe('2026-11-26')
  })
  it('보고 있는 달 앞뒤 달까지 날짜 → 달', () => {
    const m = communityDaysAround(2026, 1, {})
    expect(m.get('2025-12-25')).toBe('2025-12')
    expect(m.get('2026-01-29')).toBe('2026-01')
    expect(m.get('2026-02-26')).toBe('2026-02')
  })
})
