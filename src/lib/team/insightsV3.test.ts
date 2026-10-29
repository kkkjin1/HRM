import { describe, expect, it } from 'vitest'
import { buildInsightsV3, itemStats } from './insightsV3'
import { buildAnalysisExport, parseRefs, pseudonymMap } from './exportData'
import { computeRoundResultV3, type R0V3Answers } from './r0v3'
import { ANSWERS_V3, PEOPLE_V3, sampleAnswersV3 } from './fixturesV3'

// r0-v3 교차 분석 — 가상 5명(fixturesV3)에 설계해 둔 팀 역학이 발견으로 나오는지, 원칙(소수 보존·N/A 제외·판정 금지)이 지켜지는지.
const nameOf = (id: string) => PEOPLE_V3.find(p => p.id === id)?.name ?? id
const rs = PEOPLE_V3.map(p => ({ member_id: p.id, answers: ANSWERS_V3[p.id] }))
const ins = buildInsightsV3({ responses: rs, nameOf })
const find = (id: string) => ins.findings.find(f => f.id === id)

describe('N/A 처리', () => {
  it('관찰 기회 없음은 유효 응답·평균에서 빠진다', () => {
    const b11 = itemStats(rs).find(i => i.key === 'B11')!
    expect([b11.valid, b11.na.sort()]).toEqual([3, ['c', 'e']])
    expect(b11.mean).toBeCloseTo((3 + 4 + 3) / 3, 10)
  })
  it('관찰 기회 없음이 2명 이상인 문항은 해석 보류 목록에 이유와 함께 남는다', () => {
    expect(ins.held!.some(h => h.ref === 'team:behavior.B11')).toBe(true)
  })
  it('유효 응답이 3명 미만이면 그 문항으로 강점·불일치를 만들지 않는다', () => {
    const few = rs.map(r => ({ ...r, answers: { ...r.answers, behavior: { ...r.answers.behavior, B05: r.member_id === 'a' || r.member_id === 'b' ? 5 : 'na' } } as R0V3Answers }))
    const i2 = buildInsightsV3({ responses: few, nameOf })
    expect(i2.findings.some(f => f.id === 'domain_strength:safety')).toBe(false)
    expect(i2.held!.some(h => h.ref === 'team:behavior.B05' && h.reason.includes('유효 응답 2명'))).toBe(true)
  })
})

describe('① 강점 — 행동 평가 × 성공 사례 × 유지 행동', () => {
  it('상호 지원: 다수 4점 이상 + 성공 사례 2건 → 강점(복합), 낮게 본 1명은 반대 근거로 남김', () => {
    const f = find('domain_strength:support')!
    expect(f.signals).toEqual(['common', 'mismatch', 'composite'])
    expect(f.observed.filter(e => e.ref.endsWith(':success'))).toHaveLength(2)
    expect(f.counter.map(e => e.ref)).toContain('c:behavior.B07')
  })
  it('심리적 안전감 강점에는 실명·팀장 응답의 한계를 반드시 붙인다', () => {
    expect(find('domain_strength:safety')!.interpretation).toContain('단정하지 않습니다')
  })
  it('선호에 따라 같은 행동을 다르게 경험: 혼자 먼저 씨름 선호 ↔ 도움 요청(B07)', () => {
    const f = find('pref_behavior:when_stuck')!
    expect(f.observed[0].text).toContain('혼자 먼저 씨름')
    expect(f.interpretation).toContain('단정할 수는 없')
  })
})

describe('② 보완 — 가능성과 실제 경험 구분', () => {
  it('정보 공유를 기대한 2명이 실제로는 낮게 경험 → 가능성(보탬)과 실제(B·C)를 나눠 담음', () => {
    const f = find('need_gap:정보 공유')!
    expect(f.signals).toContain('common')
    expect(f.observed.some(e => e.text.startsWith('가능성 ·'))).toBe(true)
    expect(f.observed.some(e => e.ref === 'c:friction.C01')).toBe(true)
  })
})

describe('③ 실제 경험 — 분포·소수·공존', () => {
  it('정보 공유를 2점 이하·4점 이상으로 본 사람이 함께 → 인식 불일치 + 낮게 본 사람의 실제 마찰·장면을 함께', () => {
    const f = find('split:info')!
    expect(f.signals).toEqual(['mismatch', 'composite'])
    expect(f.observed.some(e => e.ref === 'c:friction_case')).toBe(true)
  })
  it('1명의 4회 이상 + 지정한 장면 → 소수 신호로 따로 남김(일반화 금지)', () => {
    const f = find('friction_minority:C02:d')!
    expect([f.basis, f.signals]).toEqual(['single', ['minority']])
    expect(f.observed.some(e => e.ref === 'd:friction_case')).toBe(true)
  })
  it('1명의 1회 + 서술 없음은 발견이 아니라 보류 목록에', () => {
    const one = rs.map(r => ({ ...r, answers: { ...r.answers, friction: { ...r.answers.friction, C03: r.member_id === 'e' ? 1 : 0 } } as R0V3Answers }))
    const i2 = buildInsightsV3({ responses: one, nameOf })
    expect(i2.findings.some(f => f.id.startsWith('friction') && f.id.includes('C03'))).toBe(false)
    expect(i2.held!.some(h => h.ref === 'e:friction.C03')).toBe(true)
  })
  it('서술은 응답자가 지정한 항목에만 잇는다(C02 서술이 C04에 붙지 않음)', () => {
    expect(find('friction:C04')!.observed.some(e => e.ref.endsWith('friction_case'))).toBe(false)
  })
  it('강점 영역에 실제 마찰도 있으면 공존으로(모순이라 하지 않음)', () => {
    const f = find('coexist:support')!
    expect(f.interpretation).toContain('모순이 아닙니다')
  })
  it('D04 관점 차이는 "본인의 짐작"으로 표시해 직접 경험과 구분', () => {
    expect(ins.notes.find(n => n.field === 'perspective')!.title).toContain('짐작')
  })
})

describe('④ 유지·개선', () => {
  it('개선 희망은 1명이어도 모두 후보로 남고, 순서는 문항 순서(인원순 아님)', () => {
    expect(ins.planV3!.improve.map(c => c.key)).toEqual(['goals', 'info', 'safety', 'execution', 'learning'])
    expect(ins.planV3!.improve.every(c => c.memberIds.length === 1)).toBe(true)
  })
  it('개선 후보마다 지지 근거와 다른 경험을 함께 — 모순이라 부르지 않음', () => {
    const info = ins.planV3!.improve.find(c => c.key === 'info')!
    expect(info.support.length).toBeGreaterThan(0)
    expect(info.contrary.length).toBeGreaterThan(0)
    expect(ins.findings.every(f => !/모순입니다|모순이 있/.test(f.interpretation ?? ''))).toBe(true)
  })
  it('팀장은 유지(K06), 팀원은 같은 영역 개선 + 행동 평가도 갈림 → 인식 불일치로 연결', () => {
    const f = find('keep_improve:K06')!
    expect(f.signals).toEqual(['mismatch'])
    expect(f.interpretation).toContain('높게')
  })
  it('같은 사람이 유지·개선을 함께 고른 것만으로는 발견을 만들지 않는다', () => {
    expect(find('keep_improve:K03')).toBeUndefined()
    expect(ins.planV3!.keep.find(k => k.key === 'K03')!.alsoImprove).toBe(true)
  })
  it('성공 사례를 쓴 사람이 직접 고른 유지 행동은 성공 사례와 연결', () => {
    expect(find('keep_success:K04')!.observed.some(e => e.ref === 'd:success')).toBe(true)
  })
  it('여러 명이 겪은 마찰이 개선 희망으로 이어지지 않으면 따로 묻는다', () => {
    const quiet = rs.map(r => ({ ...r, answers: { ...r.answers, improve: { areas: ['none'], other: null, situation: null, impact: null, change: null } } as R0V3Answers }))
    const i2 = buildInsightsV3({ responses: quiet, nameOf })
    expect(i2.findings.some(f => f.id === 'not_raised:C04')).toBe(true)
  })
  it('근거 없는 개선 희망은 해석 없이(null) 후보로 남고 보류 목록에 이유가 남는다', () => {
    const flat = Object.fromEntries(Object.keys(sampleAnswersV3().behavior).map(k => [k, 3])) as R0V3Answers['behavior']
    const calm = PEOPLE_V3.map(p => ({ member_id: p.id, answers: sampleAnswersV3({ behavior: flat, ...(p.id === 'a' ? { improve: { areas: ['learning'], situation: '회고가 없다' } } : {}) }) }))
    const i2 = buildInsightsV3({ responses: calm, nameOf })
    const f = i2.findings.find(x => x.id === 'improve:learning')!
    expect(f.interpretation).toBeNull()
    expect(i2.held!.some(h => h.ref === 'team:improve.learning')).toBe(true)
  })
})

describe('규칙 전반', () => {
  it('모든 근거는 원본 항목 ref를 가진다', () => {
    for (const f of ins.findings) for (const e of [...f.observed, ...f.counter]) expect(e.ref).toMatch(/^(team|[a-e]):/)
  })
  it('응답이 비어도 동작한다', () => {
    expect(buildInsightsV3({ responses: [], nameOf }).findings).toEqual([])
  })
})

describe('외부 LLM 분석용 데이터(r0-v3)', () => {
  const round = { id: 'round-x', title: 'R0', items_version: 'r0-v3', closed_at: '2026-11-06T00:00:00Z', roster: PEOPLE_V3.map(p => p.id) }
  const result = computeRoundResultV3(rs, round.roster)
  const { text } = buildAnalysisExport({ round, responses: rs, result, nameOf, pseudonymize: true })
  it('기본 가명 — 실명이 남지 않고 P1~P5로', () => {
    for (const p of PEOPLE_V3) expect(text).not.toContain(p.name)
    expect(Object.values(pseudonymMap(round.id, round.roster)).sort()).toEqual(['P1', 'P2', 'P3', 'P4', 'P5'])
  })
  it('문항 원문·척도·N/A 안내·유효 응답 수·버전이 들어간다', () => {
    expect(text).toContain('r0-v3')
    expect(text).toContain('behavior.B05: 문제나 우려, 반대 의견이 있을 때 이를 팀에 드러낼 수 있었다.')
    expect(text).toContain('중립(3점)이 아닙니다')
    expect(text).toMatch(/behavior\.B11: 유효 3명\(na 2\)/)
    expect(text).toContain('D04(관점 차이)는 응답자 본인의 짐작')
  })
  it('D01·D02·D03·C05 원문과 규칙 기반 발견·보류 지점을 담는다', () => {
    expect(text).toContain('검토 피드백이 마감 직전에')
    expect(text).toContain('바라는 변화')
    expect(text).toContain('## 앱의 규칙 기반 발견')
    expect(text).toContain('## 앱이 해석을 보류한 지점')
  })
  it('발견 근거는 [P#.behavior.B07] 형식으로 인용되고 되짚을 수 있다', () => {
    const refs = parseRefs(text)
    expect(refs.some(r => r.path.startsWith('behavior.'))).toBe(true)
    expect(refs.every(r => r.who === 'team' || /^P[1-5]$/.test(r.who))).toBe(true)
  })
  it('실명 포함을 고르면 P#(실명)으로', () => {
    const named = buildAnalysisExport({ round, responses: rs, result, nameOf, pseudonymize: false }).text
    expect(named).toContain('가팀장')
  })
})
