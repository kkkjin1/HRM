import { describe, expect, it } from 'vitest'
import { equipFromSlots, equippedTeams, inSeason, uniformTeam } from './baseballGear'

describe('inSeason', () => {
  it('시즌 없는 아이템은 늘, 가을야구는 10~11월, 홀리데이는 연말을 넘어 1/15까지', () => {
    expect(inSeason('cap', '2026-03-01')).toBe(true)
    expect([inSeason('autumn', '2026-09-30'), inSeason('autumn', '2026-10-01'), inSeason('autumn', '2026-11-30'), inSeason('autumn', '2026-12-01')]).toEqual([false, true, true, false])
    expect([inSeason('holiday', '2026-11-30'), inSeason('holiday', '2026-12-25'), inSeason('holiday', '2027-01-15'), inSeason('holiday', '2027-01-16')]).toEqual([false, true, true, false])
  })
})

describe('equipFromSlots', () => {
  it('슬롯 값을 예전 요약(cap/uniform/bat)과 함께 만든다', () => {
    const e = equipFromSlots({ head: { part: 'helmet', team: 'lg' }, top: { part: 'away', team: 'kia' }, hand: { part: 'cheer', team: 'ssg' } })
    expect([e.cap, e.uniform, e.bat]).toEqual(['lg', 'kia', null]) // 응원봉은 방망이가 아니다
    expect(equippedTeams(e)).toEqual(['lg', 'kia', 'ssg'])
  })

  it('슬롯에 안 맞는 종류·모르는 구단·이상한 값은 버린다', () => {
    const e = equipFromSlots({ head: { part: 'bat', team: 'lg' }, face: { part: 'shades', team: 'nope' }, top: null, hand: { part: 'bat', team: 'kt' } })
    expect(e.slots).toEqual({ hand: { part: 'bat', team: 'kt' } })
    expect(equipFromSlots(null).slots).toEqual({})
    expect(equipFromSlots('x').slots).toEqual({})
  })

  it('원정 유니폼은 구단 색 바탕 + 흰 글씨, 홈은 그대로', () => {
    const away = uniformTeam(equipFromSlots({ top: { part: 'away', team: 'hanwha' } }))
    expect(away?.jersey).toBe('#FF6600')
    expect(away?.primary).toBe('#FFFFFF')
    expect(uniformTeam(equipFromSlots({ top: { part: 'uniform', team: 'hanwha' } }))?.jersey).toBe('#FFFFFF')
  })
})
