import { describe, expect, it } from 'vitest'
import { applyTrials, equipFromSlots, equippedTeams, fullSetTeam, inSeason, uniformTeam, type GearTrial } from './baseballGear'

describe('fullSetTeam', () => {
  it('같은 구단 3자리 이상이면 그 구단, 아니면 null', () => {
    expect(fullSetTeam(equipFromSlots({ head: { part: 'cap', team: 'lg' }, top: { part: 'uniform', team: 'lg' }, hand: { part: 'bat', team: 'kia' } }))).toBeNull()
    expect(fullSetTeam(equipFromSlots({ head: { part: 'cap', team: 'lg' }, top: { part: 'away', team: 'lg' }, effect: { part: 'ring', team: 'lg' } }))?.key).toBe('lg')
  })
})

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

const tr = (team: string, part: string, exp: number, prev: GearTrial['prev_item']): GearTrial => ({
  id: team + part, member_id: 'm', team: team as GearTrial['team'], part: part as GearTrial['part'], prev_item: prev,
  granted_by: null, created_at: '', expires_at: new Date(exp).toISOString(),
})
const raw = { top: { part: 'autumn', team: 'kia' }, head: { part: 'cap', team: 'lg' } }
const no = () => false

describe('일일권 만료(applyTrials)', () => {
  it('만료 전엔 그대로', () => {
    expect(applyTrials(raw, [tr('kia', 'autumn', 1000, { part: 'uniform', team: 'lg' })], no, 500)).toEqual(raw)
  })
  it('만료되면 이전 장비로, 이전 장비가 없으면 비운다', () => {
    expect(applyTrials(raw, [tr('kia', 'autumn', 1000, { part: 'uniform', team: 'lg' })], no, 2000)).toEqual({ top: { part: 'uniform', team: 'lg' }, head: raw.head })
    expect(applyTrials(raw, [tr('kia', 'autumn', 1000, null)], no, 2000)).toEqual({ head: raw.head })
  })
  it('진짜로 가진 아이템이면 만료돼도 그대로', () => {
    expect(applyTrials(raw, [tr('kia', 'autumn', 1000, null)], () => true, 2000)).toEqual(raw)
  })
})
