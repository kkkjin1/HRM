// 목표 기간 단위 — 연간/반기/분기/월은 서로 연결되지 않는 독립 그룹이다 (OKR식 상하위 구조 아님).
export type GoalLevel = 'yearly' | 'half' | 'quarter' | 'month'

export const GOAL_LEVELS: GoalLevel[] = ['yearly', 'half', 'quarter', 'month']

export const GOAL_LEVEL_LABEL: Record<GoalLevel, string> = {
  yearly: '연간',
  half: '반기',
  quarter: '분기',
  month: '월',
}

export function isGoalLevel(v: unknown): v is GoalLevel {
  return typeof v === 'string' && (GOAL_LEVELS as string[]).includes(v)
}
