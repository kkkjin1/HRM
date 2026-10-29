import { describe, expect, it } from 'vitest'
import { HEALTH_ITEMS } from '@/lib/teamHealth'
import { buildInsights, personLayerScore } from './insights'
import { buildAnalysisExport, parseRefs, pseudonymMap } from './exportData'
import { computeLegacyResult as computeRoundResult, type R0Answers } from './r0'
import { sampleAnswers } from './testFixtures'

const names: Record<string, string> = { a: '가', b: '나', c: '다', d: '라', e: '마' }
const nameOf = (id: string) => names[id] ?? id
// 층별 원점수(순채점 문항=값, 역채점 문항=6-값)로 응답을 만든다 → 개인 층 점수가 정확히 그 값이 된다.
const health = (byLayer: Record<string, number>) =>
  Object.fromEntries(HEALTH_ITEMS.map(i => [i.id, i.reverse ? 6 - (byLayer[i.layer] ?? 4) : (byLayer[i.layer] ?? 4)]))
const ws = (o: Partial<R0Answers['ws']>) => ({ ...sampleAnswers().ws, ...o })
const resp = (id: string, o: Partial<R0Answers>) => ({ member_id: id, answers: sampleAnswers(o) })

describe('buildInsights — 교차 분석', () => {
  const rs = [
    resp('a', { ws: ws({ feedback_pref: 'direct' }), health: health({ commitment: 2 }), strengths: ['commit'], keep: ['commit'], change: ['decision_clear'], friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 0 } }),
    resp('b', { ws: ws({ feedback_pref: 'direct' }), health: health({ commitment: 3 }), strengths: ['commit'], keep: ['commit'], change: [], friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 0 } }),
    resp('c', { ws: ws({ feedback_pref: 'direct' }), health: health({ commitment: 3 }), strengths: ['commit'], keep: ['own'], change: [], friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 0 } }),
    resp('d', { ws: ws({ feedback_pref: 'gentle', needs_tags: ['빠른 피드백'] }), health: health({ conflict: 2 }), strengths: ['help'], keep: ['help'], change: ['feedback_way'], friction: { feedback_pref: 3, when_stuck: 0, meeting_pref: 0, focus_time: 0 }, friction_note: '피드백이 너무 직설적이라 위축됐다' }),
    resp('e', { ws: ws({ feedback_pref: 'direct' }), health: health({ conflict: 5 }), strengths: ['own'], keep: ['own'], change: ['time_sync'], friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 0 } }),
  ]
  const ins = buildInsights({ responses: rs, nameOf })
  const kinds = (k: string) => ins.findings.filter(f => f.kind === k)

  it('다수가 꼽은 강점인데 관련 점수가 다른 층보다 낮으면 따로 표시하되, 서로 다른 문항이라 모순으로 단정하지 않는다', () => {
    const gap = kinds('strength_score_gap').find(f => f.id === 'strength_gap:commit')!
    expect(gap.signals).toContain('common')
    expect(gap.interpretation).toMatch(/모순을 뜻하지 않습니다/)
    expect(kinds('shared_strength').some(f => f.id === 'shared_strength:commit')).toBe(false)
  })
  it('1명의 가벼운 경험은 "몰림"으로 확대하지 않는다(2명 이상일 때만)', () => {
    expect(kinds('friction_cluster')).toHaveLength(0)
    expect(kinds('friction_common')).toHaveLength(0)
  })
  it('다수와 다른 선호를 가진 2명이 모두 불편을 답하면 "몰림" 발견, 다른 경험도 함께 보존', () => {
    const rs2 = [
      resp('a', { ws: ws({ feedback_pref: 'direct' }), friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 0 } }),
      resp('b', { ws: ws({ feedback_pref: 'direct' }), friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 0 } }),
      resp('c', { ws: ws({ feedback_pref: 'direct' }), friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 0 } }),
      resp('d', { ws: ws({ feedback_pref: 'gentle' }), friction: { feedback_pref: 1, when_stuck: 0, meeting_pref: 0, focus_time: 0 } }),
      resp('e', { ws: ws({ feedback_pref: 'gentle' }), friction: { feedback_pref: 2, when_stuck: 0, meeting_pref: 0, focus_time: 0 } }),
    ]
    const cl = buildInsights({ responses: rs2, nameOf }).findings.find(f => f.id === 'friction_cluster:feedback_pref')!
    expect(cl.basis).toBe('some')
    expect(cl.signals).toEqual(['common'])
    expect(cl.observed.map(e => e.ref).slice(0, 2)).toEqual(['d:friction.feedback_pref', 'e:friction.feedback_pref'])
    expect(cl.counter).toHaveLength(3)
  })
  it('조사는 받침에 맞춘다', async () => {
    const { josa } = await import('./insights')
    expect([josa('‘정보 공유’', '을/를'), josa('‘결정한 것을 지킨다’', '과/와'), josa('‘신뢰’', '을/를')]).toEqual(['‘정보 공유’를', '‘결정한 것을 지킨다’와', '‘신뢰’를'])
  })
  it('1명이지만 "자주"이고 서술을 남긴 경험은 소수 신호 — 단일 응답 표시, 서술 원문을 근거로', () => {
    const m = kinds('minority_signal')[0]
    expect(m.basis).toBe('single')
    expect(m.signals).toEqual(['minority'])
    expect(m.observed.some(e => e.ref === 'd:friction_note')).toBe(true)
    expect(m.interpretation).toMatch(/일반화할 근거는 없습니다/)
  })
  it('1명의 "한두 번"이라도 서술을 남기면 소수 신호, 서술도 "자주"도 없으면 발견을 만들지 않는다', () => {
    const base = { friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 0 } }
    const others = ['a', 'b', 'c', 'e'].map(id => resp(id, base))
    const withNote = buildInsights({ responses: [...others, resp('d', { friction: { ...base.friction, meeting_pref: 1 }, friction_note: '회의 안건이 전날 밤에 와서 준비를 못 했다' })], nameOf })
    expect(withNote.findings.find(f => f.id === 'minority:meeting_pref:d')!.signals).toEqual(['minority'])
    const noNote = buildInsights({ responses: [...others, resp('d', { friction: { ...base.friction, meeting_pref: 1 }, friction_note: null })], nameOf })
    expect(noNote.findings.filter(f => f.section === 3)).toHaveLength(0)
  })
  it('불편 서술은 그 사람이 불편을 답한 영역이 하나일 때만 그 영역에 잇는다', () => {
    const base = { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 0 }
    const rs3 = [...['a', 'b', 'c', 'e'].map(id => resp(id, { friction: base })), resp('d', { friction: { ...base, meeting_pref: 1, focus_time: 1 }, friction_note: '어떤 불편' })]
    expect(buildInsights({ responses: rs3, nameOf }).findings.filter(f => f.kind === 'minority_signal')).toHaveLength(0)
  })
  it('기대(빠른 피드백)와 관련 불편이 함께 나오면 복합 신호(+ 1명이지만 구체적이면 소수 신호)', () => {
    const f = kinds('need_unmet_signal')
    expect(f.map(x => x.id)).toEqual(['need_unmet:빠른 피드백'])
    expect(f[0].signals).toEqual(['composite', 'minority'])
  })
  it('같은 층을 2.5 이하와 4 이상으로 보는 사람이 함께 있으면 인식 불일치(판정하지 않음)', () => {
    const s = kinds('perception_split').find(f => f.id === 'split:conflict')!
    expect(s.signals).toEqual(['mismatch'])
    expect(s.interpretation).toMatch(/판정할 수 없고/)
  })
  it('유지와 개선이 같은 영역이어도 충돌로 보지 않는다', () => {
    const k = kinds('keep_change_same_area').find(f => f.id === 'keep_change:commit:decision_clear')!
    expect(k.interpretation).toMatch(/충돌을 뜻하지 않습니다/)
    expect(k.signals).toEqual([])
  })
  it('개선 희망은 모두 검토 후보 — 근거 유형만 붙이고, 응답 수로 순위를 매기지 않는다(문항 순서)', () => {
    const order = ins.plan.change.map(c => c.key)
    expect(order).toEqual(['decision_clear', 'feedback_way', 'time_sync'].filter(k => order.includes(k)))
    const dc = ins.plan.change.find(c => c.key === 'decision_clear')!
    expect(dc.signals).toEqual(['mismatch']) // 1명 희망(공통 아님) + 관련 층을 2점·4점으로 본 사람이 함께 있음, 다른 관점은 1가지뿐(복합 아님)
    expect(dc.evidence.some(e => e.text.includes('결정 이행'))).toBe(true)
    const fw = ins.plan.change.find(c => c.key === 'feedback_way')!
    expect(fw.signals).toEqual(['minority', 'composite']) // 1명의 '자주'+서술, 그리고 불편·기대 두 관점
    expect(ins.plan.change.find(c => c.key === 'time_sync')!.signals).toEqual([])
    expect(ins.findings.find(f => f.id === 'change:time_sync')!.interpretation).toBeNull()
  })
  it('같은 개선 희망이 여럿이면 공통 신호, 관련 층에 상반된 평가가 있으면 인식 불일치', () => {
    const rs4 = [
      resp('a', { change: ['decision_clear'], health: health({ commitment: 2 }) }),
      resp('b', { change: ['decision_clear'], health: health({ commitment: 5 }) }),
      resp('c', { change: [] }), resp('d', { change: [] }), resp('e', { change: [] }),
    ]
    const dc = buildInsights({ responses: rs4, nameOf }).plan.change.find(c => c.key === 'decision_clear')!
    expect(dc.signals).toEqual(['common', 'mismatch'])
  })
  it('해석 문장은 점수와 행동을 인과로 잇지 않는다', () => {
    const g = ins.findings.find(f => f.id === 'change:feedback_way')!
    expect(g.interpretation).toMatch(/이 행동 때문이라는 뜻도 아닙니다/)
    expect(g.interpretation).toMatch(/다음 단계에서 팀이 함께 정합니다/)
  })
  it('④ 유지/개선 계획은 따로 나뉜다', () => {
    expect(ins.plan.keep.map(k => k.key).sort()).toEqual(['commit', 'help', 'own'])
  })
  it('자유서술은 원문 그대로 근거로 보존', () => {
    expect(ins.notes.find(n => n.field === 'friction_note')!.items[0].text).toContain('위축됐다')
  })
  it('모든 발견에 확인 질문이 있고, 인과·모순·충돌·우선순위를 단정하는 표현을 쓰지 않는다', () => {
    expect(ins.findings.every(f => f.question.length > 0)).toBe(true)
    const all = JSON.stringify(ins.findings)
    expect(all).not.toMatch(/때문입니다|원인입니다|확실|모순입니다|충돌합니다|우선순위가 높|가장 시급|개선 가설 후보/)
    expect(ins.findings.every(f => Array.isArray(f.signals))).toBe(true)
  })
  it('응답이 없으면 아무것도 만들지 않는다', () => {
    expect(buildInsights({ responses: [], nameOf }).findings).toEqual([])
  })
  it('개인 층 점수는 역채점을 반영한다', () => {
    expect(personLayerScore(sampleAnswers({ health: health({ trust: 2 }) }), 'trust')).toBe(2)
  })
})

describe('v1 회차(keep 문항 없음)는 강점으로 유지 칸을 채운다', () => {
  const rs = ['a', 'b'].map(id => ({ member_id: id, answers: { ...sampleAnswers(), keep: undefined } }))
  it('keep이 없으면 strengths 기준', () => {
    expect(buildInsights({ responses: rs, nameOf }).plan.keep[0].refs[0]).toBe('a:strengths')
  })
})

describe('붙여 넣은 분석 본문 정리', () => {
  it('보이지 않는 제어 문자·방향 뒤집기 문자를 걷어 내고 줄바꿈은 둔다', async () => {
    const { sanitizeAnalysisText } = await import('./analyses')
    expect(sanitizeAnalysisText('a\u202Eb\u0000c\r\nd\te\u200Bf')).toBe('abc\nd\tef')
    expect(sanitizeAnalysisText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>') // 텍스트로만 보여 주므로 그대로
  })
  it('분석 패널은 본문을 HTML로 해석하지 않는다', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync(new URL('../../components/team/RoundAnalysisPanel.tsx', import.meta.url), 'utf8')
    expect(src).not.toMatch(/dangerouslySetInnerHTML\s*=|\.innerHTML\s*=/)
  })
})

describe('분석용 데이터 복사', () => {
  const rs = ['a', 'b', 'c'].map(id => ({ member_id: id, answers: sampleAnswers({ keep_note: `${id} 메모` }) }))
  const round = { id: 'round-xyz', title: 'R0', items_version: 'r0-v2', closed_at: '2026-11-06T00:00:00Z', roster: ['a', 'b', 'c'] }
  const result = computeRoundResult(rs, round.roster, 'r0-v2')
  it('기본은 가명 — 실명이 들어가지 않는다', () => {
    const { text } = buildAnalysisExport({ round, responses: rs, result, nameOf, pseudonymize: true })
    for (const n of ['가', '나', '다']) expect(text.includes(`(${n})`)).toBe(false)
    expect(text).toMatch(/### P1/)
    expect(text).toContain('이전에 익명으로 모은 조하리·건강도 응답은 포함하지 않았습니다')
    expect(text).toContain('별명·직책·특정 사건 같은 묘사는 그대로라 사람을 짐작할 수 있습니다')
  })
  it('가명일 때 규칙 기반 발견 제목·자유서술 속 실명도 가명으로 바뀐다', () => {
    const full: Record<string, string> = { a: '김진일', b: '박서연', c: '이도윤' }
    const nm = (id: string) => full[id] ?? id
    // 동료 2명이 c를 '꼼꼼함'으로 봤는데 c는 고르지 않음 → 제목에 c의 이름이 들어가는 발견
    const peers = (id: string): Record<string, string[]> => (id === 'c' ? {} : { c: ['insightful'] })
    const rs2 = ['a', 'b', 'c'].map(id => ({ member_id: id, answers: sampleAnswers({ jh_self: ['analytic', 'logical', 'creative'], jh_peers: peers(id), friction_note: id === 'a' ? '도윤님이 회의 때 바로 반박해서 위축됨, 서연 님도 비슷' : null }) }))
    const { text } = buildAnalysisExport({ round, responses: rs2, result: computeRoundResult(rs2, round.roster, 'r0-v2'), nameOf: nm, pseudonymize: true })
    for (const n of ['김진일', '박서연', '이도윤', '도윤', '서연']) expect(text.includes(n)).toBe(false)
    expect(text).toMatch(/P\d님이 회의 때 바로 반박/)
    const named = buildAnalysisExport({ round, responses: rs2, result: computeRoundResult(rs2, round.roster, 'r0-v2'), nameOf: nm, pseudonymize: false }).text
    expect(named).toContain('도윤님이 회의 때')
  })
  it('분석 요청에 근거 유형 구분·순위 금지·사실과 해석 구분을 담는다', () => {
    const { text } = buildAnalysisExport({ round, responses: rs, result, nameOf, pseudonymize: true })
    expect(text).toMatch(/공통 신호.*소수 신호.*인식 불일치.*복합 신호/)
    expect(text).toContain('응답 수로 중요도나 우선순위를 정하지 마세요')
    expect(text).toContain('"해석:"')
  })
  it('실명 포함을 고르면 P#(이름)으로', () => {
    expect(buildAnalysisExport({ round, responses: rs, result, nameOf, pseudonymize: false }).text).toMatch(/### P\d\((가|나|다)\)/)
  })
  it('가명은 회차마다 고정되고 명단 순서를 그대로 따르지 않는다', () => {
    expect(pseudonymMap('round-xyz', ['a', 'b', 'c'])).toEqual(pseudonymMap('round-xyz', ['c', 'b', 'a']))
    const many = ['m1', 'm2', 'm3', 'm4', 'm5']
    const orders = ['r1', 'r2', 'r3', 'r4'].map(r => many.map(id => pseudonymMap(r, many)[id]).join())
    expect(new Set(orders).size).toBeGreaterThan(1)
  })
  it('근거 인용 [P3.friction.feedback_pref]을 찾아낸다', () => {
    expect(parseRefs('관찰 [P3.friction.feedback_pref] 와 [team.change.feedback_way]')).toEqual([
      { raw: '[P3.friction.feedback_pref]', who: 'P3', path: 'friction.feedback_pref' },
      { raw: '[team.change.feedback_way]', who: 'team', path: 'change.feedback_way' },
    ])
  })
})
