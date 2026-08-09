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
