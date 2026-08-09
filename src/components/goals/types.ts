import type { GoalLevel } from '@/lib/goalLevels'

export type Goal = {
  id: string
  name: string
  level: GoalLevel
  year: number
  half: 'h1' | 'h2' | null
  quarter: 1 | 2 | 3 | 4 | null
  month: number | null
  icon: string
  description: string
  sort_order: number
  created_at: string
}

// 목표 생성 모달을 특정 기간으로 미리 채워서 열 때 쓰는 파라미터.
// GoalsPanel(목표 관리)과 GoalMap(목표 맵) 양쪽에서 같은 모양으로 공유한다.
export type GoalPeriodParams = { level: GoalLevel; year: number; half?: 'h1' | 'h2'; quarter?: 1 | 2 | 3 | 4; month?: number }
