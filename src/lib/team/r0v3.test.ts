import { describe, expect, it } from 'vitest'
import { BEHAVIOR_ITEMS, FRICTION_V3_ITEMS, NA, computeRoundResultV3, itemsSnapshotV3, validateAnswersV3 } from './r0v3'
import { computeRoundResult, validateAnswers } from './r0'
import { ANSWERS_V3, PEOPLE_V3, sampleAnswersV3 } from './fixturesV3'

const ctx = { selfId: 'm1', peerIds: ['m2', 'm3'] }

describe('validateAnswersV3 — 문항·척도', () => {
  it('정상 응답 통과 · 버전 분기(validateAnswers r0-v3)도 같은 결과', () => {
    expect(validateAnswersV3(sampleAnswersV3(), ctx).ok).toBe(true)
    expect(validateAnswers(sampleAnswersV3(), ctx, 'r0-v3').ok).toBe(true)
  })
  it('가상 5명 응답이 모두 검증을 통과한다', () => {
    for (const p of PEOPLE_V3) {
      const r = validateAnswersV3(ANSWERS_V3[p.id], { selfId: p.id, peerIds: PEOPLE_V3.map(x => x.id).filter(x => x !== p.id) })
      expect(r.ok, p.id).toBe(true)
    }
  })
  it('빈 응답은 거부하고 파트별 이유를 알려 준다', () => {
    const r = validateAnswersV3({}, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.some(e => e.includes('PART B'))).toBe(true)
      expect(r.errors.some(e => e.includes('PART C'))).toBe(true)
      expect(r.errors.some(e => e.includes('D01'))).toBe(true)
      expect(r.errors.some(e => e.includes('D02'))).toBe(true)
      expect(r.errors.some(e => e.includes('D03'))).toBe(true)
    }
  })
  it('B 1~5와 관찰 기회 없음(na)만 허용 — 0·6·소수·문자열은 거부', () => {
    const a = sampleAnswersV3()
    for (const bad of [0, 6, 3.5, '3', null]) expect(validateAnswersV3({ ...a, behavior: { ...a.behavior, B01: bad } }, ctx).ok).toBe(false)
    const ok = validateAnswersV3({ ...a, behavior: { ...a.behavior, B01: NA } }, ctx)
    expect(ok.ok && ok.answers.behavior.B01).toBe(NA)
  })
  it('C 0~3과 기회 없음(na)만 허용', () => {
    const a = sampleAnswersV3()
    expect(validateAnswersV3({ ...a, friction: { ...a.friction, C01: 4 } }, ctx).ok).toBe(false)
    expect(validateAnswersV3({ ...a, friction: { ...a.friction, C01: NA } }, ctx).ok).toBe(true)
  })
  it('모르는 키·허용되지 않은 값은 버린다', () => {
    const a = sampleAnswersV3()
    const r = validateAnswersV3({ ...a, extra: 1, behavior: { ...a.behavior, B99: 5 }, keep: ['K01', 'K77'], success: { none: true, situation: '무시됨', domains: ['goals'] } }, ctx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect('extra' in r.answers).toBe(false)
      expect('B99' in r.answers.behavior).toBe(false)
      expect(r.answers.keep).toEqual(['K01'])
      expect(r.answers.success).toEqual({ none: true, situation: null, behaviors: null, domains: [] })
    }
  })
  it('D01 — 사례 없음이 아니면 상황 서술 필수, 영역은 최대 2개', () => {
    expect(validateAnswersV3(sampleAnswersV3({ success: { none: false, situation: null } }), ctx).ok).toBe(false)
    const r = validateAnswersV3(sampleAnswersV3({ success: { none: false, situation: '잘됐다', domains: ['goals', 'info', 'safety'] } }), ctx)
    expect(r.ok && r.answers.success.domains).toEqual(['goals', 'info'])
  })
  it('D02 — 1~2개, 기타(K99)는 직접 입력 필수', () => {
    expect(validateAnswersV3(sampleAnswersV3({ keep: [] }), ctx).ok).toBe(false)
    expect(validateAnswersV3(sampleAnswersV3({ keep: ['K01', 'K02', 'K03'] }), ctx).ok).toBe(false)
    expect(validateAnswersV3(sampleAnswersV3({ keep: ['K99'] }), ctx).ok).toBe(false)
    expect(validateAnswersV3(sampleAnswersV3({ keep: ['K99'], keep_other: '퇴근 전 한 줄 공유' }), ctx).ok).toBe(true)
  })
  it('D03 — 영역 최대 2개, 특별히 없음은 단독, 영역을 고르면 아쉬웠던 상황 필수', () => {
    expect(validateAnswersV3(sampleAnswersV3({ improve: { areas: [] } }), ctx).ok).toBe(false)
    expect(validateAnswersV3(sampleAnswersV3({ improve: { areas: ['info', 'goals', 'safety'], situation: 'x' } }), ctx).ok).toBe(false)
    expect(validateAnswersV3(sampleAnswersV3({ improve: { areas: ['info'] } }), ctx).ok).toBe(false)
    const none = validateAnswersV3(sampleAnswersV3({ improve: { areas: ['none', 'info'], situation: '버려짐' } }), ctx)
    expect(none.ok && none.answers.improve).toEqual({ areas: ['none'], other: null, situation: null, impact: null, change: null })
    expect(validateAnswersV3(sampleAnswersV3({ improve: { areas: ['other'], situation: 'x' } }), ctx).ok).toBe(false)
  })
  it('C05 관련 항목은 서술이 있을 때만, 아는 C 항목만', () => {
    const r = validateAnswersV3(sampleAnswersV3({ friction_case: { text: null, items: ['C01'] } }), ctx)
    expect(r.ok && r.answers.friction_case.items).toEqual([])
    const r2 = validateAnswersV3(sampleAnswersV3({ friction_case: { text: '장면', items: ['C01', 'C09'] } }), ctx)
    expect(r2.ok && r2.answers.friction_case.items).toEqual(['C01'])
  })
  it('조하리는 선택 영역 — 비워도 통과, 고르면 3~6개', () => {
    expect(validateAnswersV3(sampleAnswersV3({ jh_self: [] }), ctx).ok).toBe(true)
    expect(validateAnswersV3(sampleAnswersV3({ jh_self: ['warm'] }), ctx).ok).toBe(false)
  })
  it('긴 서술은 500자, 짧은 메모는 300자로 자른다', () => {
    const r = validateAnswersV3(sampleAnswersV3({ perspective: 'a'.repeat(900), keep_note: 'b'.repeat(400) }), ctx)
    expect(r.ok && [r.answers.perspective?.length, r.answers.keep_note?.length]).toEqual([500, 300])
  })
})

describe('computeRoundResultV3 — na 분리 집계', () => {
  const rs = PEOPLE_V3.map(p => ({ member_id: p.id, answers: ANSWERS_V3[p.id] }))
  const res = computeRoundResultV3(rs, PEOPLE_V3.map(p => p.id))
  it('버전·인원·합류 4주 미만', () => {
    expect([res.version, res.n, res.roster_n, res.short_tenure]).toEqual(['r0-v3', 5, 5, 1])
    expect(computeRoundResult(rs, PEOPLE_V3.map(p => p.id), 'r0-v3')).toEqual(res)
  })
  it('B 분포는 점수별 인원 + na 칸(3점에 섞지 않음)', () => {
    expect(res.behavior.B11).toEqual({ '3': 2, '4': 1, na: 2 })
    const total = (k: string) => Object.values(res.behavior[k]).reduce((s, v) => s + v, 0)
    for (const it of BEHAVIOR_ITEMS) expect(total(it.key)).toBe(5)
  })
  it('C 분포·서술·성공 사례·유지·개선 집계', () => {
    expect(res.friction.C04).toEqual({ '0': 1, '1': 2, '2': 1, na: 1 })
    for (const it of FRICTION_V3_ITEMS) expect(Object.values(res.friction[it.key]).reduce((s, v) => s + v, 0)).toBe(5)
    expect(res.friction_cases).toBe(2)
    expect(res.success).toEqual({ cases: 4, none: 1, domains: { goals: 1, support: 2, safety: 1, info: 1 } })
    expect(res.keep.K06).toBe(1)
    expect(res.improve).toEqual({ learning: 1, none: 1, info: 1, execution: 1, safety: 1, goals: 1 })
  })
})

describe('itemsSnapshotV3', () => {
  it('문항 원문·척도·버전·자체 진단 안내를 담는다', () => {
    const s = itemsSnapshotV3()
    expect(s.version).toBe('r0-v3')
    expect(s.behavior.items).toHaveLength(12)
    expect(s.friction.items).toHaveLength(4)
    expect(s.keep.options).toHaveLength(7)
    expect(s.disclaimer).toContain('타당화된 원척도')
    expect('health' in s).toBe(false)
  })
})
