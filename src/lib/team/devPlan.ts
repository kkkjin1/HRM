// 팀 발전계획(R0 이후 월별 탐구) — 서버(/api/team-plan)·화면·LLM용 복사가 같이 쓰는 타입·규칙·초기 데이터.
// 점수를 매달 다시 재는 계획이 아니다. R0에서 확인된 강점은 강화(A), 보완 신호는 보완(B), 아직 확인 못 한 조건은 탐색(C)한다.
// 계획(목적·실행·확인할 증거)과 관찰(실행 결과·배운 점·후속 질문)은 항상 나눠 저장하고, 복사할 때도 나눠 쓴다.
// 실명 설문 응답·개인별 기록은 여기 들어오지 않는다(R0 해석은 집계 요약만).

export type PlanCategory = 'strengthen' | 'complement' | 'explore'
export type PlanStatus = 'planned' | 'in_progress' | 'done' | 'on_hold'

export const PLAN_CATEGORIES: PlanCategory[] = ['strengthen', 'complement', 'explore']
export const PLAN_CATEGORY_LABEL: Record<PlanCategory, string> = { strengthen: '강점 강화', complement: '약점 보완', explore: '미확인 탐색' }
export const PLAN_CATEGORY_CODE: Record<PlanCategory, string> = { strengthen: 'A', complement: 'B', explore: 'C' }
export const PLAN_STATUSES: PlanStatus[] = ['planned', 'in_progress', 'done', 'on_hold']
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = { planned: '예정', in_progress: '진행 중', done: '완료', on_hold: '보류' }

export type PlanAction = {
  id: string; month_id: string; category: PlanCategory; focus: string
  purpose: string; action_plan: string; evidence: string
  status: PlanStatus; result: string; learned: string; follow_up: string
  sort_order: number; version: number; updated_at: string | null
}
export type PlanMonth = {
  id: string; month: string            // 'YYYY-MM-01'
  theme: string; core_question: string; next_question: string
  learned_new: string; changed_view: string; still_unknown: string
  baseline_round_id: string | null; version: number; updated_at: string | null
  actions: PlanAction[]
}
// 기준 회차 요약(집계만) — 응답 원문·응답자 이름은 내려 주지 않는다.
export type BaselineMeta = { id: string; title: string; items_version: string; closed_at: string | null; roster_n: number; submitted_n: number }

// 수정할 수 있는 칸(서버가 이 목록 밖의 칸은 무시한다)
export const MONTH_FIELDS = ['theme', 'core_question', 'next_question', 'learned_new', 'changed_view', 'still_unknown'] as const
export const ACTION_FIELDS = ['focus', 'purpose', 'action_plan', 'evidence', 'status', 'result', 'learned', 'follow_up'] as const
export type MonthField = typeof MONTH_FIELDS[number]
export type ActionField = typeof ACTION_FIELDS[number]
export const PLAN_TEXT_MAX = 4000

// 월말 학습 세 칸의 이름 — 기본값. 팀장이 회고 화면에서 바꾸면 팀 공용 설정 'retro_learning_labels'에 저장된다
// (예: 강점 강화 회고 / 약점 보완 회고 / 미확인 탐색 회고). 저장 칸(learned_new 등)은 그대로라 이름만 바뀐다.
export type LearningField = 'learned_new' | 'changed_view' | 'still_unknown'
export const LEARNING_FIELDS: LearningField[] = ['learned_new', 'changed_view', 'still_unknown']
export type LearningLabels = Record<LearningField, string>
export const DEFAULT_LEARNING_LABELS: LearningLabels = { learned_new: '새롭게 확인한 것', changed_view: '기존 해석이 달라진 것', still_unknown: '여전히 모르는 것' }
export const LEARNING_LABEL_MAX = 40
// 저장값(아무 모양이나 올 수 있음) → 빈 칸은 기본 이름으로 채운 이름표
export function normalizeLearningLabels(v: unknown): LearningLabels {
  const o = v && typeof v === 'object' ? v as Record<string, unknown> : {}
  const pick = (k: LearningField) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim().slice(0, LEARNING_LABEL_MAX) : DEFAULT_LEARNING_LABELS[k])
  return { learned_new: pick('learned_new'), changed_view: pick('changed_view'), still_unknown: pick('still_unknown') }
}

export const MONTH_FIELD_LABEL: Record<MonthField, string> = {
  theme: '이달의 주제', core_question: '핵심 질문', next_question: '다음 탐구 질문',
  learned_new: '새롭게 확인한 것', changed_view: '기존 해석이 달라진 것', still_unknown: '여전히 모르는 것',
}
export const ACTION_FIELD_LABEL: Record<ActionField, string> = {
  focus: '초점', purpose: '목적', action_plan: '구체적 실행', evidence: '확인할 증거',
  status: '진행상태', result: '실행 결과', learned: '배운 점', follow_up: '후속 질문',
}

// 팀 발전계획 편집 권한 — 진단 회차·외부 분석과 같은 규칙(팀장만). 팀원은 열람만.
export function canEditPlan(member: { role: string } | null | undefined) {
  return member?.role === 'lead'
}

// 입력 정리: 보이지 않는 제어 문자·글자 방향 문자 제거, 줄바꿈 통일, 길이 제한
const HIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g
export function cleanPlanText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  return v.replace(/\r\n?/g, '\n').replace(HIDDEN, '').trim().slice(0, PLAN_TEXT_MAX)
}

export function isPlanStatus(v: unknown): v is PlanStatus { return typeof v === 'string' && (PLAN_STATUSES as string[]).includes(v) }
export function isPlanCategory(v: unknown): v is PlanCategory { return typeof v === 'string' && (PLAN_CATEGORIES as string[]).includes(v) }

// 'YYYY-MM' 또는 'YYYY-MM-DD' → 'YYYY-MM-01'(잘못되면 null)
export function normalizeMonth(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(v.trim())
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2])
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return null
  return `${m[1]}-${m[2]}-01`
}
export const monthLabel = (month: string) => `${month.slice(0, 4)}.${month.slice(5, 7)}`
export const monthLabelLong = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`
export function nextMonthOf(month: string) {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7))
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

// ── R0 기준 해석(2026-10-30 마감, 응답 5/5) — 집계·해석 요약. 개인 응답·실명은 넣지 않는다 ──
export const R0_BASELINE = {
  date: '2026-10-30',
  confirmed: ['공동 목표 및 우선순위 정렬', '역할 재배분', '수시 조율과 도움 요청'],
  signals: ['선행 의사결정이 포함된 업무 인계에서 맥락 누락', '변경된 피드백의 기록 부족', '성공 경험의 노하우 전환 부족'],
  unknown: ['협업이 실제 성과 가치를 높이는지', '이견이 의사결정을 개선하는지', '개인의 성장과 팀의 지속가능성이 높아지는지'],
  cautions: [
    '기존 건강도 수치(예: 78점)는 참고용 비표준 환산값이다. 검증된 팀 건강도 점수가 아니며, 액션의 성공 기준으로 쓰지 않는다.',
    '보완 신호 중 단일 응답에서 나온 개선 가설은 팀 전체의 확정된 문제가 아니다.',
  ],
}

// ── 초기 3개월 계획 — supabase/add_team_dev_plan.sql의 시드와 같은 내용(미리보기·테스트용 원본) ──
type SeedAction = Pick<PlanAction, 'category' | 'focus' | 'purpose' | 'action_plan' | 'evidence'>
export type SeedMonth = { month: string; theme: string; core_question: string; next_question: string; actions: SeedAction[] }
export const SEED_MONTHS: SeedMonth[] = [
  {
    month: '2026-11-01', theme: '성과와 업무의 출발점',
    core_question: '우리는 함께 일하면서 실제로 더 가치 있는 결과를 만드는가?',
    next_question: '팀의 실행력은 좋은 결과를 보장하는가? 성과를 저해하는 구조는 무엇인가?',
    actions: [
      { category: 'strengthen', focus: '목표 정렬·역할 재배분',
        purpose: 'R0에서 긍정 근거가 확인된 목표 정렬·역할 재배분이 실제 공동 업무의 성과로 이어지는지 확인하고 강화한다.',
        action_plan: '중요한 공동 업무 1건을 선정하고 목표, 역할, 우선순위를 명확히 정한 뒤 진행 중 필요한 역할 조정을 실행한다.',
        evidence: '어떤 조정이 실제 성과에 기여했는지 구체적 사례를 남긴다.' },
      { category: 'complement', focus: '의사결정 맥락',
        purpose: '선행 의사결정이 포함된 업무 인계에서 맥락이 누락된다는 보완 신호를 실제 업무에서 확인하고 줄인다.',
        action_plan: '신규·이관 업무 착수 시 기존 확정사항, 미결정사항, 담당자 판단 범위를 구분해 인계한다.',
        evidence: '불필요한 가정·재검토가 발생한 사례와 발생하지 않은 사례를 비교한다.' },
      { category: 'explore', focus: '성과 가치',
        purpose: '협업이 실제 성과 가치를 높이는지(R0 미확인)를 결과물 수요자의 경험으로 탐색한다.',
        action_plan: '핵심 산출물 1~2건에 대해 결과물을 사용하는 현업 또는 경영진에게 기대 가치와 실제 활용·효과를 확인한다.',
        evidence: '팀이 생각한 성과와 실제 수요자가 경험한 가치의 차이를 분석한다.' },
    ],
  },
  {
    month: '2026-12-01', theme: '협력과 의사결정의 질',
    core_question: '우리는 서로 다른 생각과 역량을 결합해 더 나은 판단을 내리는가?',
    next_question: '의견을 말할 수 있는 팀과 다른 의견을 활용해 판단의 질을 높이는 팀은 어떻게 다른가?',
    actions: [
      { category: 'strengthen', focus: '상호 지원',
        purpose: 'R0에서 확인된 수시 조율과 도움 요청을 효과적인 협력 방식으로 정리해 다른 업무로 넓힌다.',
        action_plan: '2건의 협업 사례에서 도움 요청, 지원 범위 조율, 실제 기여 행동을 기록하고 효과적이었던 협력 방식을 다른 업무에 적용한다.',
        evidence: '협력이 개인 수행만으로 어려웠던 문제 해결에 어떤 차이를 만들었는지 확인한다.' },
      { category: 'complement', focus: '피드백의 연속성',
        purpose: '변경된 피드백이 기록되지 않는다는 보완 신호를 줄인다.',
        action_plan: '중요한 업무 방향이 변경될 때 기존 방향, 변경 방향, 이유, 적용 시점을 기존 업무 기록에 남긴다.',
        evidence: '피드백 변경으로 인한 해석 차이 또는 재작업 사례를 복기한다.' },
      { category: 'explore', focus: '건설적 이견',
        purpose: '이견이 의사결정을 개선하는지(R0 미확인)를 실제 의사결정에서 탐색한다.',
        action_plan: '중요한 의사결정 1건에서 서로 다른 대안과 반대 근거를 명시적으로 검토한다. 팀장은 가급적 팀원들의 대안 제시 이후 의견을 낸다.',
        evidence: '다른 의견으로 인해 실제 판단이 수정·보완되었는지, 수정되지 않았다면 그 이유가 합리적인지 살펴본다.' },
    ],
  },
  {
    month: '2027-01-01', theme: '팀 학습과 지속가능성',
    core_question: '우리는 함께 일할수록 개인도 성장하고 팀도 강해지는가?',
    next_question: '현재보다 구성원이 성장하고 팀이 지속가능해지려면 어떤 경험·권한·책임 구조가 필요한가?',
    actions: [
      { category: 'strengthen', focus: '실행·적응',
        purpose: '지난 두 달의 성공적인 조율 방식이 특정 구성원에 기대지 않고 재현되는지 확인한다.',
        action_plan: '지난 두 달의 성공적인 업무 조율 방식을 기존과 다른 공동 업무 1건에 적용한다.',
        evidence: '특정 구성원의 역량에 의존하지 않고도 유사한 성공 행동을 재현할 수 있는지 확인한다.' },
      { category: 'complement', focus: '경험의 자산화',
        purpose: '성공 경험이 노하우로 전환되지 않는다는 보완 신호를 줄인다.',
        action_plan: '구성원 1명의 실무 노하우를 공유하고 다른 구성원이 실제 업무에 적용해 본다.',
        evidence: '단순한 정보 공유가 아닌 타인의 문제 해결에 활용되었는지 확인한다.' },
      { category: 'explore', focus: '성장과 지속가능성',
        purpose: '함께 일하며 개인이 성장하고 팀의 지속가능성이 높아지는지(R0 미확인)를 탐색한다.',
        action_plan: '주요 업무 1건의 지식·판단·협업 의존도를 점검하고, 다른 구성원이 일부 과정을 이해·수행하는 교차 경험을 진행한다. 단, 책임과 승인 권한은 기존 담당자에게 유지한다.',
        evidence: '함께 일한 결과 구성원의 역량이 확장되었는지, 특정인 부재에도 팀이 대응 가능한 범위가 넓어졌는지 검토한다.' },
    ],
  },
]

// ── LLM용 복사(Markdown) ──
export const PLAN_ANALYSIS_PROMPT = '좋은 팀의 본질적 조건을 기준으로 ① 이번 달 새롭게 확인한 강점 ② 보완이 필요한 구조 ③ 기존 가설이 지지·반박된 부분 ④ 아직 미확인인 영역을 분석하라. 확인된 사실과 추정을 구분하고, 이전 질문을 기계적으로 반복하지 말라. 이를 바탕으로 다음 달 탐구 질문과 강점 강화·약점 보완·미확인 탐색 액션을 각 1개씩 제안하라.'

const STATUS_NOTE: Record<PlanStatus, string> = {
  planned: '실행 전. 아래 [관찰]이 비어 있으면 아직 결과가 없는 것이며 성과로 해석하지 말 것.',
  in_progress: '진행 중. [관찰]은 중간 기록이며 최종 결과가 아님.',
  done: '완료. [관찰]은 실행 후 남긴 기록.',
  on_hold: '보류. 실행하지 않았거나 멈춘 액션이며 성과로 해석하지 말 것.',
}

const quote = (v: string) => v.trim().split('\n').map(l => l.trim()).filter(Boolean).join(' / ')
const line = (label: string, v: string, empty = '(기록 없음)') => `- ${label}: ${v.trim() ? quote(v) : empty}`

function actionBlock(a: PlanAction) {
  const out = [
    `#### ${PLAN_CATEGORY_CODE[a.category]}. ${PLAN_CATEGORY_LABEL[a.category]}${a.focus.trim() ? ` — ${quote(a.focus)}` : ''}`,
    `- 진행상태: ${PLAN_STATUS_LABEL[a.status]} (${STATUS_NOTE[a.status]})`,
    '- [계획] 사전에 세운 의도',
    `  ${line('목적', a.purpose, '(미입력)')}`,
    `  ${line('구체적 실행', a.action_plan, '(미입력)')}`,
    `  ${line('확인할 증거', a.evidence, '(미입력)')}`,
    '- [관찰] 실제로 실행하고 남긴 기록',
    `  ${line('실행 결과', a.result)}`,
    `  ${line('배운 점', a.learned)}`,
    `  ${line('후속 질문', a.follow_up)}`,
  ]
  return out.join('\n')
}

function monthBlock(m: PlanMonth, labels: LearningLabels) {
  const counts = PLAN_STATUSES.map(s => [s, m.actions.filter(a => a.status === s).length] as const).filter(([, n]) => n > 0)
  const actions = PLAN_CATEGORIES.flatMap(c => m.actions.filter(a => a.category === c).sort((a, b) => a.sort_order - b.sort_order))
  return [
    `### ${monthLabelLong(m.month)}${m.theme.trim() ? ` — ${quote(m.theme)}` : ''}`,
    line('핵심 질문', m.core_question, '(미입력)'),
    line('다음 탐구 질문(계획 시점에 세운 질문)', m.next_question, '(미입력)'),
    `- 액션 ${m.actions.length}개${counts.length ? ` · ${counts.map(([s, n]) => `${PLAN_STATUS_LABEL[s]} ${n}`).join(', ')}` : ''}`,
    '',
    actions.length ? actions.map(actionBlock).join('\n\n') : '(이 달에는 등록된 액션이 없음)',
    '',
    '#### 월말 학습 [관찰]',
    line(labels.learned_new, m.learned_new),
    line(labels.changed_view, m.changed_view),
    line(labels.still_unknown, m.still_unknown),
  ].join('\n')
}

// scope: 특정 월 id 또는 'all'. 반환 text가 비어 있지 않음을 보장한다(월이 없어도 기준·지시문은 들어간다).
export function buildPlanMarkdown(input: { months: PlanMonth[]; scope: string | 'all'; baseline: BaselineMeta | null; now?: Date; labels?: LearningLabels }) {
  const labels = input.labels ?? DEFAULT_LEARNING_LABELS
  const sorted = [...input.months].sort((a, b) => a.month.localeCompare(b.month))
  const picked = input.scope === 'all' ? sorted : sorted.filter(m => m.id === input.scope)
  const b = input.baseline
  const range = input.scope === 'all'
    ? (picked.length ? `전체 기간(${monthLabel(picked[0].month)}~${monthLabel(picked[picked.length - 1].month)})` : '전체 기간')
    : (picked[0] ? monthLabelLong(picked[0].month) : '선택한 달')
  const now = input.now ?? new Date()
  const stamp = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(now)

  const unresolved: string[] = []
  for (const m of picked) {
    const tag = monthLabel(m.month)
    if (m.still_unknown.trim()) unresolved.push(`- [${tag} 월말 · ${labels.still_unknown}] ${quote(m.still_unknown)}`)
    for (const a of m.actions) if (a.follow_up.trim()) unresolved.push(`- [${tag} ${PLAN_CATEGORY_CODE[a.category]}. ${PLAN_CATEGORY_LABEL[a.category]}] ${quote(a.follow_up)}`)
    if (m.next_question.trim()) unresolved.push(`- [${tag} 계획 시점 탐구 질문] ${quote(m.next_question)}`)
  }

  const baselineHead = b
    ? `- 회차: ${b.title} (문항 ${b.items_version}${b.closed_at ? `, ${b.closed_at.slice(0, 10)} 마감` : ''}, 응답 ${b.submitted_n}/${b.roster_n})`
    : `- 회차: R0 최초 팀 진단 (${R0_BASELINE.date} 마감)`

  const text = [
    `# 팀빌딩(팀 발전계획) 기록 — ${range}`,
    '',
    `> 인사기획팀 Team Dynamics의 R0 최초 진단을 출발점으로, '좋은 팀이란 무엇인가?'를 월별로 탐구하는 계획과 실행 기록이다. 복사 시각: ${stamp}(KST).`,
    '',
    '## 읽는 법',
    '- [계획]은 실행 전에 세운 의도이고, [관찰]은 실제로 실행한 뒤 남긴 기록이다. [계획]을 결과나 성과로 읽지 말 것.',
    '- 진행상태가 예정·보류인 액션은 실행되지 않은 것이다. [관찰]이 "(기록 없음)"이면 근거가 없는 것이다.',
    '- 이 문서는 집계·비식별 요약만 담는다. 실명 설문 응답과 개인별 응답 원문은 포함하지 않았다.',
    '- 같은 문항·점수를 매달 반복 측정하는 계획이 아니다. 점수 변화로 성패를 판단하지 말 것.',
    '',
    '## 1. 기준: R0 최초 진단 해석',
    baselineHead,
    '',
    '### 긍정적 근거가 확인된 것 (강화 대상)',
    ...R0_BASELINE.confirmed.map(v => `- ${v}`),
    '',
    '### 보완 신호 (확정 문제가 아닌 가설)',
    ...R0_BASELINE.signals.map(v => `- ${v}`),
    '',
    '### 아직 확인하지 못한 것 (탐색 대상)',
    ...R0_BASELINE.unknown.map(v => `- ${v}`),
    '',
    '### 해석 주의',
    ...R0_BASELINE.cautions.map(v => `- ${v}`),
    '',
    '## 2. 월별 계획과 실행',
    '- 영역: A. 강점 강화(확인된 강점) / B. 약점 보완(보완 신호) / C. 미확인 탐색(아직 검증하지 못한 좋은 팀의 조건)',
    '',
    picked.length ? picked.map(m => monthBlock(m, labels)).join('\n\n---\n\n') : '(등록된 월별 계획이 없음)',
    '',
    '## 3. 미해결 질문',
    unresolved.length ? unresolved.join('\n') : '- (기록된 미해결 질문 없음)',
    '',
    '## 4. 분석 요청',
    PLAN_ANALYSIS_PROMPT,
    '',
  ].join('\n')
  return { text, months: picked.length }
}
