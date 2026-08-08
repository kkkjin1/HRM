import { describe, it, expect } from 'vitest'
import { buildWheel, totalWeight, type RouletteMember } from './roulette'

function member(id: string, name: string, role: RouletteMember['role']): RouletteMember {
  return { id, name, role }
}

describe('buildWheel', () => {
  it('4명(팀장1·파트장1·팀원2) 합계가 100에 근사한다', () => {
    const members = [
      member('1', '팀장', 'lead'),
      member('2', '파트장', 'part_lead'),
      member('3', '팀원A', 'member'),
      member('4', '팀원B', 'member'),
    ]
    const wheel = buildWheel('meal', members)
    expect(totalWeight(wheel)).toBeCloseTo(100, 5)
  })

  it('팀원 3명만 있으면 각자 20÷3을 받는다 (팀장·파트장은 공석 없음)', () => {
    const members = [
      member('1', '팀장', 'lead'),
      member('2', '파트장', 'part_lead'),
      member('3', '팀원A', 'member'),
      member('4', '팀원B', 'member'),
      member('5', '팀원C', 'member'),
    ]
    const wheel = buildWheel('meal', members)
    const memberSegments = wheel.filter(s => s.memberId && members.find(m => m.id === s.memberId)?.role === 'member')
    expect(memberSegments).toHaveLength(3)
    for (const seg of memberSegments) expect(seg.weight).toBeCloseTo(20 / 3, 5)
  })

  it('파트장이 공석이면 그 지분(20)이 실재 멤버 전원에게 재분배되고 합계는 유지된다', () => {
    const members = [
      member('1', '팀장', 'lead'),
      member('2', '팀원A', 'member'),
      member('3', '팀원B', 'member'),
    ]
    const wheel = buildWheel('meal', members)
    expect(totalWeight(wheel)).toBeCloseTo(100, 5)

    const extra = 20 / 3 // 3명에게 균등 재분배
    const lead = wheel.find(s => s.memberId === '1')!
    const memberA = wheel.find(s => s.memberId === '2')!
    expect(lead.weight).toBeCloseTo(40 + extra, 5)
    expect(memberA.weight).toBeCloseTo(20 / 2 + extra, 5) // 팀원 2명이 20을 나눠 가진 뒤 재분배분을 더함
  })

  it('멤버가 1명만 남아도 크래시 없이 전체 지분을 받는다', () => {
    const members = [member('1', '혼자', 'lead')]
    expect(() => buildWheel('meal', members)).not.toThrow()
    const wheel = buildWheel('meal', members)
    const solo = wheel.find(s => s.memberId === '1')!
    expect(solo.weight).toBeCloseTo(80, 5) // lead 40 + 공석(part_lead 20 + member 20)
    expect(totalWeight(wheel)).toBeCloseTo(100, 5) // + 법인카드 20
  })

  it('간식(snack)에는 법인카드 세그먼트가 없다', () => {
    const members = [
      member('1', '팀장', 'lead'),
      member('2', '팀원A', 'member'),
    ]
    const wheel = buildWheel('snack', members)
    expect(wheel.some(s => s.memberId === null)).toBe(false)
    expect(totalWeight(wheel)).toBeCloseTo(100, 5)
  })

  it('멤버가 0명이면 빈 배열을 반환한다', () => {
    expect(buildWheel('meal', [])).toEqual([])
  })
})
