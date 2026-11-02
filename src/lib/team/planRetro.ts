// 팀빌딩 회고 질문 — 팀빌딩 액션(team_plan_actions.retro_questions)에 붙은 질문을 그달 개인 회고에서 답한다.
// 답변은 team_plan_retro_answers((액션, 팀원, 질문 key)마다 1행)에 저장하고 팀 전체가 읽는다. 쓰기는 본인 답만.
// 팀빌딩 C(미확인 탐색)처럼 팀원 체감을 모아 다음 달 계획의 근거로 쓰려는 것 — 서버(/api/plan-retro)·화면이 같이 쓴다.

import { PLAN_CATEGORY_CODE, PLAN_CATEGORY_LABEL, type PlanCategory } from '@/lib/team/devPlan'

export type RetroQuestion = { key: string; text: string; required: boolean }
// 화면용: 질문 + 어느 액션에 붙은 질문인지
export type PlanRetroQuestion = RetroQuestion & { action_id: string; category: PlanCategory; focus: string }
export type PlanRetroAnswer = { action_id: string; member_id: string; question_key: string; answer: string }
export type PlanRetroAnswerNamed = PlanRetroAnswer & { member_name: string }   // 팀빌딩 화면 모아보기용

export const RETRO_QUESTION_MAX = 10
export const RETRO_QUESTION_TEXT_MAX = 300
export const RETRO_ANSWER_MAX = 2000

// 저장값(jsonb, 아무 모양이나 올 수 있음) → 질문 목록. key·text가 없는 항목과 중복 key는 버린다.
export function normalizeRetroQuestions(v: unknown): RetroQuestion[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: RetroQuestion[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const key = typeof o.key === 'string' ? o.key.trim().slice(0, 40) : ''
    const text = typeof o.text === 'string' ? o.text.trim().slice(0, RETRO_QUESTION_TEXT_MAX) : ''
    if (!key || !text || seen.has(key)) continue
    seen.add(key)
    out.push({ key, text, required: o.required === true })
    if (out.length >= RETRO_QUESTION_MAX) break
  }
  return out
}

export const answerId = (actionId: string, memberId: string, key: string) => `${actionId}:${memberId}:${key}`

// 팀원 한 명이 아직 답하지 않은 필수 질문 수
export function missingRequired(questions: PlanRetroQuestion[], answers: Map<string, string>, memberId: string) {
  return questions.filter(q => q.required && !(answers.get(answerId(q.action_id, memberId, q.key)) ?? '').trim()).length
}

export const actionTitle = (q: Pick<PlanRetroQuestion, 'category' | 'focus'>) =>
  `${PLAN_CATEGORY_CODE[q.category]}. ${PLAN_CATEGORY_LABEL[q.category]}${q.focus.trim() ? ` — ${q.focus.trim()}` : ''}`
