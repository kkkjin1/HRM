import type { GoalLevel } from '@/lib/goalLevels'

export type Goal = {
  id: string
  name: string
  level: GoalLevel
  parent_id: string | null
  year: number
  half: 'h1' | 'h2' | null
  quarter: 1 | 2 | 3 | 4 | null
  month: number | null
  icon: string
  description: string
  sort_order: number
  created_at: string
}

export type GoalDraft = {
  id: string | null
  name: string
  level: GoalLevel
  parent_id: string | null
  year: number
  half: 'h1' | 'h2'
  quarter: 1 | 2 | 3 | 4
  month: number
  icon: string
  description: string
}
