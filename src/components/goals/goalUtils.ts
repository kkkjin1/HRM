import type { Goal } from './types'

export function periodLabel(g: Pick<Goal, 'level' | 'year' | 'half' | 'quarter' | 'month'>) {
  switch (g.level) {
    case 'yearly': return `${g.year}`
    case 'half': return `${g.year} · ${g.half === 'h1' ? '상반기' : '하반기'}`
    case 'quarter': return `${g.year} · ${g.quarter}분기`
    case 'month': return `${g.year} · ${g.month}월`
  }
}

export function childrenOf(goals: Goal[], parentId: string | null) {
  return goals.filter(g => g.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order)
}
