// 목표 4단계 계층 규칙 — 생성/수정 검증(API)과 상위 목표 드롭다운 필터링(화면) 양쪽에서 공유한다.
export type GoalLevel = 'yearly' | 'half' | 'quarter' | 'month'

export const GOAL_LEVELS: GoalLevel[] = ['yearly', 'half', 'quarter', 'month']

export const GOAL_LEVEL_LABEL: Record<GoalLevel, string> = {
  yearly: '연간',
  half: '반기',
  quarter: '분기',
  month: '월',
}

// 각 단계가 요구하는 상위 목표 단계. yearly는 최상위라 상위 목표가 없다.
export const PARENT_LEVEL: Record<GoalLevel, GoalLevel | null> = {
  yearly: null,
  half: 'yearly',
  quarter: 'half',
  month: 'quarter',
}

// PARENT_LEVEL의 역방향 — 이 단계 아래에 자식으로 올 수 있는 단계 (Drag & Drop 시
// 어떤 컨테이너에 어떤 레벨을 떨어뜨릴 수 있는지 판단하는 데 쓴다). month는 최하위라 자식이 없다.
export const CHILD_LEVEL: Record<GoalLevel, GoalLevel | null> = {
  yearly: 'half',
  half: 'quarter',
  quarter: 'month',
  month: null,
}

export function isGoalLevel(v: unknown): v is GoalLevel {
  return typeof v === 'string' && (GOAL_LEVELS as string[]).includes(v)
}
