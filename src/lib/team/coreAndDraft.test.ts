import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIN_VALID, buildInsightsV3, itemStats } from './insightsV3'
import { CORE_MAX, buildCoreSummary } from './coreThemesV3'
import { BEHAVIOR_ITEMS, FRICTION_V3_ITEMS, type R0V3Answers } from './r0v3'
import { ANSWERS_V3, PEOPLE_V3, sampleAnswersV3 } from './fixturesV3'
import { DRAFT_PREFIX, clearDraft, draftKey, loadDraft, purgeDrafts, saveDraft } from './r0Draft'

const nameOf = (id: string) => PEOPLE_V3.find(p => p.id === id)?.name ?? id
const rs = PEOPLE_V3.map(p => ({ member_id: p.id, answers: ANSWERS_V3[p.id] }))
const withB = (key: string, byId: Record<string, number | 'na'>) =>
  rs.map(r => ({ ...r, answers: { ...r.answers, behavior: { ...r.answers.behavior, [key]: byId[r.member_id] ?? r.answers.behavior[key] } } as R0V3Answers }))

describe('유효 응답 수 — 실제 값과 보류 기준', () => {
  it('가상 5명 응답에는 B 12문항·C 4문항이 모두 있다(관찰 기회 없음 외 결측 없음)', () => {
    for (const r of rs) {
      expect(BEHAVIOR_ITEMS.every(i => r.answers.behavior[i.key] !== undefined), r.member_id).toBe(true)
      expect(FRICTION_V3_ITEMS.every(i => r.answers.friction[i.key] !== undefined), r.member_id).toBe(true)
    }
  })
  it('B11 = 3·4·na·3·na → 유효 3명, 결측 없음 → 보류가 아니라 "한계 안내(caution)"', () => {
    const b11 = itemStats(rs).find(i => i.key === 'B11')!
    expect([b11.valid, b11.na.length, b11.valid + b11.na.length]).toEqual([3, 2, 5])
    const ins = buildInsightsV3({ responses: rs, nameOf })
    const h = ins.held!.filter(x => x.ref === 'team:behavior.B11')
    expect(h.map(x => x.level)).toEqual(['caution'])
  })
  it('경계값: 유효 3명(=MIN_VALID)이면 팀 단위 해석에 쓰인다 — 인식 불일치 발견', () => {
    expect(MIN_VALID).toBe(3)
    // B12를 a=4, b=4, c=1, d=na, e=na → 유효 3명, 낮음·높음 공존
    const ins = buildInsightsV3({ responses: withB('B12', { a: 4, b: 4, c: 1, d: 'na', e: 'na' }), nameOf })
    expect(ins.findings.find(f => f.id === 'split:learning')!.observed.some(e => e.ref === 'c:behavior.B12')).toBe(true)
    expect(ins.held!.find(x => x.ref === 'team:behavior.B12')?.level).toBe('caution')
  })
  it('경계값: 유효 2명이면 팀 단위 해석(불일치·강점·선호 비교)에서 빠지고 보류(held) — 낮게 답한 원본은 사유에 보존', () => {
    // B12 a=4, c=1, 나머지 na → 유효 2명. B11도 유효 3명이라 learning 영역의 불일치는 B12 없이 판단된다
    const ins = buildInsightsV3({ responses: withB('B12', { a: 4, b: 'na', c: 1, d: 'na', e: 'na' }), nameOf })
    const split = ins.findings.find(f => f.id === 'split:learning')
    expect(split?.observed.some(e => e.ref.endsWith('behavior.B12')) ?? false).toBe(false)
    const h = ins.held!.find(x => x.ref === 'team:behavior.B12')!
    expect(h.level).toBe('held')
    expect(h.reason).toContain('유효 응답 2명')
    expect(h.reason).toContain('다팀원 1점')
  })
  it('경계값: 유효 2명인 문항은 선호 그룹 비교를 만들지 않는다(B07 ↔ 막혔을 때)', () => {
    const ins = buildInsightsV3({ responses: withB('B07', { a: 4, b: 'na', c: 2, d: 'na', e: 'na' }), nameOf })
    expect(ins.findings.some(f => f.id === 'pref_behavior:when_stuck')).toBe(false)
  })
  it('유효 응답이 적어도 개인의 소수 경험(1명 4회 이상 마찰)은 그대로 발견으로 남는다', () => {
    const ins = buildInsightsV3({ responses: withB('B05', { a: 'na', b: 'na', c: 'na' }), nameOf })
    expect(ins.findings.some(f => f.id === 'friction_minority:C02:d')).toBe(true)
  })
  it('유효 응답이 적은 문항의 개인 낮은 응답은 개선 후보의 지지 근거(개인 경험)로는 남는다', () => {
    const ins = buildInsightsV3({ responses: withB('B12', { a: 4, b: 'na', c: 1, d: 'na', e: 'na' }), nameOf })
    expect(ins.planV3!.improve.find(c => c.key === 'learning')!.support.some(e => e.text.includes('다팀원'))).toBe(true)
  })
})

describe('핵심 역학 요약', () => {
  const ins = buildInsightsV3({ responses: rs, nameOf })
  const s = buildCoreSummary(ins)
  it('최대 5개, 발견은 한 주제에만(중복 없음), 주제의 모든 발견은 ①~④에 실제로 있다', () => {
    expect(s.themes.length).toBeGreaterThanOrEqual(1)
    expect(s.themes.length).toBeLessThanOrEqual(CORE_MAX)
    const ids = s.themes.flatMap(t => t.findingIds)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(ins.findings.some(f => f.id === id)).toBe(true)
    for (const t of s.themes) for (const l of t.lines) expect(t.findingIds).toContain(l.findingId)
  })
  it('빈도순이 아니다 — 근거 파트가 2가지 이상이거나 소수 경험이 있는 주제만', () => {
    for (const t of s.themes) expect(t.parts.length >= 2 || t.lines.some(l => l.label === '소수 경험')).toBe(true)
  })
  it('1명의 4회 이상 피드백 마찰(소수 신호)이 요약에서 빠지지 않는다', () => {
    expect(s.themes.some(t => t.findingIds.includes('friction_minority:C02:d'))).toBe(true)
  })
  it('강점과 다른 경험이 함께 있는 영역은 강점·긴장을 한 주제로 묶는다(상호 지원)', () => {
    const t = s.themes.find(x => x.domain === 'support')!
    expect(t.kind).toBe('strength_tension')
    expect(t.lines.map(l => l.label)).toEqual(expect.arrayContaining(['강점', '다르게 경험', '실제 마찰']))
  })
  it('요약에 못 든 영역은 이유와 함께 알려 준다', () => {
    expect(s.omitted.map(o => o.domain)).toContain('learning')
  })
  it('마찰·다른 경험이 없으면 긴장 주제를 만들지 않는다(모두 4점 + 같은 유지 행동 → 강점 주제만)', () => {
    const calm = PEOPLE_V3.map(p => ({ member_id: p.id, answers: sampleAnswersV3() }))
    const s2 = buildCoreSummary(buildInsightsV3({ responses: calm, nameOf }))
    expect(s2.themes.every(t => t.kind === 'strength')).toBe(true)
  })
  it('근거가 겹치지 않으면 억지로 채우지 않는다 — 모두 3점·마찰 없음·개선 없음이면 요약 0개', () => {
    const flat = Object.fromEntries(BEHAVIOR_ITEMS.map(i => [i.key, 3])) as R0V3Answers['behavior']
    const quiet = PEOPLE_V3.map(p => ({ member_id: p.id, answers: sampleAnswersV3({ behavior: flat, keep: ['K07'] }) }))
    const s2 = buildCoreSummary(buildInsightsV3({ responses: quiet, nameOf }))
    expect(s2.themes).toEqual([])
  })
  it('요약 줄은 해석이 아니라 사람·숫자 사실(brief)', () => {
    const t = s.themes.find(x => x.domain === 'support')!
    expect(t.lines.find(l => l.label === '강점')!.text).toMatch(/B07 4점 이상 4\/5명/)
  })
})

describe('임시 저장 격리', () => {
  const mem = new Map<string, string>()
  const fake = {
    get length() { return mem.size }, key: (i: number) => [...mem.keys()][i] ?? null,
    getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) }, clear: () => mem.clear(),
  }
  beforeEach(() => { mem.clear(); (globalThis as { window?: unknown }).window = { localStorage: fake } })
  afterEach(() => { delete (globalThis as { window?: unknown }).window })
  const me = { version: 'r0-v3', roundId: 'r1', memberId: 'm1' }
  const a = sampleAnswersV3({ perspective: '초안' })

  it('키에 문항 버전·회차·사용자가 들어가고, 같은 사람·회차·버전이면 복원된다', () => {
    saveDraft(me, null, a)
    expect([...mem.keys()]).toEqual([`${DRAFT_PREFIX}r0-v3.r1.m1`])
    expect(loadDraft(me, null)?.perspective).toBe('초안')
  })
  it('다른 사용자·다른 회차·다른 버전으로는 복원되지 않는다', () => {
    saveDraft(me, null, a)
    expect(loadDraft({ ...me, memberId: 'm2' }, null)).toBeNull()
    expect(loadDraft({ ...me, roundId: 'r2' }, null)).toBeNull()
    expect(loadDraft({ ...me, version: 'r0-v2' }, null)).toBeNull()
  })
  it('키를 바꿔치기한 값(값 속 사용자가 다름)·구버전 모양의 초안은 버린다', () => {
    mem.set(draftKey(me), JSON.stringify({ schema: 1, ...me, memberId: 'm2', basedOn: null, savedAt: 'x', answers: a }))
    expect(loadDraft(me, null)).toBeNull()
    expect(mem.has(draftKey(me))).toBe(false)
    mem.set(draftKey(me), JSON.stringify({ schema: 1, ...me, basedOn: null, savedAt: 'x', answers: { ws: {}, health: {}, strengths: [] } }))
    expect(loadDraft(me, null)).toBeNull()
    mem.set(draftKey(me), '{깨진 값')
    expect(loadDraft(me, null)).toBeNull()
  })
  it('초안 이후 서버의 내 응답이 바뀌었으면(다른 기기에서 제출) 오래된 초안을 버린다', () => {
    saveDraft(me, '2026-11-01T00:00:00Z', a)
    expect(loadDraft(me, '2026-11-02T00:00:00Z')).toBeNull()
  })
  it('화면을 열면 지금 열린 회차 × 나의 초안만 남기고 다른 계정·끝난 회차·옛 키는 지운다', () => {
    saveDraft(me, null, a)
    saveDraft({ ...me, memberId: 'm2' }, null, a)
    saveDraft({ ...me, roundId: 'old' }, null, a)
    mem.set('hrm.r0v3.draft.mock-r0.c', '{}')
    mem.set('other.app.key', 'keep')
    expect(purgeDrafts(me)).toBe(3)
    expect([...mem.keys()].sort()).toEqual([draftKey(me), 'other.app.key'].sort())
  })
  it('열린 회차가 없거나 로그아웃이면 진단 초안을 모두 지운다(다른 앱 키는 그대로)', () => {
    saveDraft(me, null, a)
    mem.set('other.app.key', 'keep')
    purgeDrafts(null)
    expect([...mem.keys()]).toEqual(['other.app.key'])
  })
  it('제출·초기화 시 지우는 clearDraft', () => {
    saveDraft(me, null, a)
    clearDraft(me)
    expect(mem.size).toBe(0)
  })
  it('저장소를 쓸 수 없으면 조용히 건너뛴다', () => {
    delete (globalThis as { window?: unknown }).window
    expect(() => { saveDraft(me, null, a); loadDraft(me, null); purgeDrafts(null) }).not.toThrow()
  })
})
