import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PLAN_ANALYSIS_PROMPT, PLAN_CATEGORIES, normalizeLearningLabels, SEED_MONTHS, buildPlanMarkdown, canEditPlan, cleanPlanText, nextMonthOf, normalizeMonth,
  type PlanAction, type PlanMonth,
} from './devPlan'

// 팀 발전계획 — 입력 정리, 월 계산, 시드 일치, LLM용 Markdown(계획/관찰 구분·비식별·지시문)

const act = (month_id: string, category: PlanAction['category'], o: Partial<PlanAction> = {}): PlanAction => ({
  id: `${month_id}-${category}`, month_id, category, focus: '초점', purpose: '목적', action_plan: '실행', evidence: '증거',
  status: 'planned', result: '', learned: '', follow_up: '', sort_order: 0, version: 1, updated_at: null, retro_questions: [], ...o,
})
const month = (id: string, m: string, o: Partial<PlanMonth> = {}): PlanMonth => ({
  id, month: m, theme: '주제', core_question: `${m} 핵심 질문`, next_question: '', learned_new: '', changed_view: '', still_unknown: '',
  baseline_round_id: 'r0', version: 1, updated_at: null, actions: PLAN_CATEGORIES.map(c => act(id, c)), ...o,
})
const baseline = { id: 'r0', title: 'R0 최초 팀 진단', items_version: 'r0-v3', closed_at: '2026-10-30T02:26:32Z', roster_n: 5, submitted_n: 5 }

describe('입력 정리·월 계산', () => {
  it('cleanPlanText: 문자열만, 제어 문자 제거, 길이 제한', () => {
    expect(cleanPlanText(3)).toBeNull()
    expect(cleanPlanText(' a‮b\r\nc ')).toBe('ab\nc')
    expect(cleanPlanText('x'.repeat(5000))!.length).toBe(4000)
  })
  it('normalizeMonth / nextMonthOf', () => {
    expect(normalizeMonth('2027-02')).toBe('2027-02-01')
    expect(normalizeMonth('2027-13')).toBeNull()
    expect(normalizeMonth('27-02')).toBeNull()
    expect(nextMonthOf('2026-12-01')).toBe('2027-01-01')
    expect(nextMonthOf('2027-01-01')).toBe('2027-02-01')
  })
  it('편집 권한은 팀장만', () => {
    expect(canEditPlan({ role: 'lead' })).toBe(true)
    expect(canEditPlan({ role: 'part_lead' })).toBe(false)
    expect(canEditPlan({ role: 'member' })).toBe(false)
    expect(canEditPlan(null)).toBe(false)
  })
})

describe('초기 계획 시드', () => {
  it('3개월 × 영역 3개, SQL 시드와 같은 문장', () => {
    expect(SEED_MONTHS.map(m => m.month)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
    // 11월 A/B/C는 add_plan_retro_questions.sql이 바꾼 문장이다
    const sql = readFileSync('supabase/add_team_dev_plan.sql', 'utf8') + readFileSync('supabase/add_plan_retro_questions.sql', 'utf8')
    for (const m of SEED_MONTHS) {
      expect(m.actions.map(a => a.category)).toEqual(PLAN_CATEGORIES)
      for (const v of [m.theme, m.core_question, m.next_question]) expect(sql).toContain(v)
      for (const a of m.actions) for (const v of [a.focus, a.purpose, a.action_plan, a.evidence]) expect(sql).toContain(v)
    }
  })
})

describe('LLM용 Markdown', () => {
  const months = [
    month('m11', '2026-11-01', {
      still_unknown: '수요자 가치 측정 방법',
      actions: [
        act('m11', 'strengthen', { status: 'done', result: '역할을 두 번 조정했다', learned: '조정 기준을 먼저 합의', follow_up: '조정 비용은?' }),
        act('m11', 'complement', { status: 'on_hold' }),
        act('m11', 'explore'),
      ],
    }),
    month('m12', '2026-12-01'),
  ]

  it('이번 달만: 해당 월만, 기준 해석·상태·지시문 포함', () => {
    const { text, months: n } = buildPlanMarkdown({ months, scope: 'm11', baseline })
    expect(n).toBe(1)
    expect(text).toContain('2026년 11월')
    expect(text).not.toContain('2026년 12월')
    expect(text).toContain('응답 5/5')
    expect(text).toContain('공동 목표 및 우선순위 정렬')
    expect(text).toContain('78점')                       // 비표준 환산값이라는 주의문
    expect(text).toContain('[계획]')
    expect(text).toContain('[관찰]')
    expect(text).toContain('완료 1, 보류 1')
    expect(text).toContain('역할을 두 번 조정했다')
    expect(text.trimEnd().endsWith(PLAN_ANALYSIS_PROMPT)).toBe(true)
  })
  it('실행 안 한 액션은 성과로 읽지 말라는 표시, 관찰 비어 있으면 (기록 없음)', () => {
    const { text } = buildPlanMarkdown({ months, scope: 'm11', baseline })
    const hold = text.slice(text.indexOf('#### B. 약점 보완'), text.indexOf('#### C. 미확인 탐색'))
    expect(hold).toContain('보류. 실행하지 않았거나 멈춘 액션이며 성과로 해석하지 말 것')
    expect(hold).toContain('실행 결과: (기록 없음)')
  })
  it('미해결 질문: 월말 모르는 것 + 후속 질문 모음', () => {
    const { text } = buildPlanMarkdown({ months, scope: 'm11', baseline })
    const sec = text.slice(text.indexOf('## 3. 미해결 질문'))
    expect(sec).toContain('수요자 가치 측정 방법')
    expect(sec).toContain('조정 비용은?')
  })
  it('전체 기간: 월 순서대로, 빈 목록이어도 텍스트는 비지 않음', () => {
    const { text, months: n } = buildPlanMarkdown({ months: [months[1], months[0]], scope: 'all', baseline })
    expect(n).toBe(2)
    expect(text.indexOf('2026년 11월')).toBeLessThan(text.indexOf('2026년 12월'))
    const empty = buildPlanMarkdown({ months: [], scope: 'all', baseline: null })
    expect(empty.months).toBe(0)
    expect(empty.text).toContain(PLAN_ANALYSIS_PROMPT)
  })
  it('설문 원문·응답자 정보를 넣지 않는다(입력에 없음 — 기준 요약은 집계만)', () => {
    const { text } = buildPlanMarkdown({ months, scope: 'all', baseline })
    expect(text).not.toMatch(/member_id|answers|김진일/)
    expect(text).toContain('실명 설문 응답과 개인별 응답 원문은 포함하지 않았다')
  })
  it('월말 학습 칸 이름을 바꾸면 복사 글에도 그 이름이 쓰인다(빈 이름은 기본값)', () => {
    const labels = normalizeLearningLabels({ learned_new: '강점 강화 회고', changed_view: '  ', still_unknown: 7 })
    expect(labels).toEqual({ learned_new: '강점 강화 회고', changed_view: '기존 해석이 달라진 것', still_unknown: '여전히 모르는 것' })
    const { text } = buildPlanMarkdown({ months, scope: 'm11', baseline, labels })
    expect(text).toContain('- 강점 강화 회고: (기록 없음)')
    expect(text).not.toContain('새롭게 확인한 것')
  })
})

describe('LLM용 Markdown — 회고 답변', () => {
  it('답변은 이름 없이 팀원 번호로, 질문별로 들어가고 다른 달 답변은 빠진다', () => {
    const qs = [{ key: 'q1', text: '도움이 된 순간', required: true }, { key: 'q2', text: '바꾸고 싶은 방식', required: false }]
    const m11 = month('m11', '2026-11-01', { actions: [act('m11', 'explore', { id: 'c11', retro_questions: qs })] })
    const m12 = month('m12', '2026-12-01', { actions: [act('m12', 'explore', { id: 'c12', retro_questions: qs })] })
    const answers = [
      { action_id: 'c11', member_id: 'uuid-b', question_key: 'q1', answer: '김철수 덕분에 빨랐다' },
      { action_id: 'c11', member_id: 'uuid-a', question_key: 'q1', answer: '접점 미리 맞춤' },
      { action_id: 'c12', member_id: 'uuid-c', question_key: 'q1', answer: '12월 답' },
    ]
    const { text } = buildPlanMarkdown({ months: [m11, m12], scope: 'm11', baseline, answers })
    expect(text).toContain('Q. 도움이 된 순간 (필수) — 답변 2명')
    expect(text).toContain('- 팀원1: 접점 미리 맞춤')
    expect(text).toContain('- 팀원2: 김철수 덕분에 빨랐다')
    expect(text).toContain('Q. 바꾸고 싶은 방식 (선택) — 답변 0명')
    expect(text).not.toContain('uuid-')
    expect(text).not.toContain('12월 답')
  })
})
