import type { GoalLevel } from '@/lib/goalLevels'
import type { Goal } from '../types'
import type { MapNode, RelatedItem } from './mapTypes'

const CATEGORIES: { key: string; label: string; level: GoalLevel }[] = [
  { key: 'cat:yearly', label: '연간', level: 'yearly' },
  { key: 'cat:half', label: '반기', level: 'half' },
  { key: 'cat:quarter', label: '분기', level: 'quarter' },
  { key: 'cat:month', label: '월', level: 'month' },
]

function pushGoal(nodes: MapNode[], g: Goal, parentKey: string, depth: number, relatedItems: RelatedItem[]) {
  const goalKey = `goal:${g.id}`
  nodes.push({ key: goalKey, kind: 'goal', label: g.name, parentKey, depth, collapsible: false, hasContent: true, goal: g })
  for (const item of relatedItems.filter(it => it.goal_id === g.id)) {
    nodes.push({ key: `related:${item.id}`, kind: 'related', label: item.title, parentKey: goalKey, depth: depth + 1, collapsible: false, hasContent: true, item })
  }
}

// 목표 데이터(goals/relatedItems)로부터 캔버스에 그릴 논리 노드 전체를 만든다.
// 기간 노드(연도/연간/반기/상반기.../월/1~12월)는 항상 고정된 뼈대로 존재하고,
// 그 아래 실제 목표는 있으면 붙고 없으면 비어 있는 채로 남는다.
export function buildMapNodes(goals: Goal[], relatedItems: RelatedItem[], year: number): MapNode[] {
  const yearGoals = goals.filter(g => g.year === year)
  const nodes: MapNode[] = []

  nodes.push({ key: 'root', kind: 'period', label: `${year}년`, parentKey: null, depth: 0, collapsible: false, hasContent: yearGoals.length > 0 })

  for (const cat of CATEGORIES) {
    nodes.push({ key: cat.key, kind: 'period', label: cat.label, parentKey: 'root', depth: 1, collapsible: true, hasContent: false })

    if (cat.level === 'yearly') {
      for (const g of yearGoals.filter(g => g.level === 'yearly').sort((a, b) => a.sort_order - b.sort_order)) {
        pushGoal(nodes, g, cat.key, 2, relatedItems)
      }
    } else if (cat.level === 'half') {
      for (const half of ['h1', 'h2'] as const) {
        const subKey = `sub:half:${half}`
        nodes.push({ key: subKey, kind: 'period', label: half === 'h1' ? '상반기' : '하반기', parentKey: cat.key, depth: 2, collapsible: true, hasContent: false })
        for (const g of yearGoals.filter(g => g.level === 'half' && g.half === half).sort((a, b) => a.sort_order - b.sort_order)) {
          pushGoal(nodes, g, subKey, 3, relatedItems)
        }
      }
    } else if (cat.level === 'quarter') {
      for (const q of [1, 2, 3, 4] as const) {
        const subKey = `sub:quarter:${q}`
        nodes.push({ key: subKey, kind: 'period', label: `${q}분기`, parentKey: cat.key, depth: 2, collapsible: true, hasContent: false })
        for (const g of yearGoals.filter(g => g.level === 'quarter' && g.quarter === q).sort((a, b) => a.sort_order - b.sort_order)) {
          pushGoal(nodes, g, subKey, 3, relatedItems)
        }
      }
    } else {
      for (let m = 1; m <= 12; m++) {
        const subKey = `sub:month:${m}`
        nodes.push({ key: subKey, kind: 'period', label: `${m}월`, parentKey: cat.key, depth: 2, collapsible: true, hasContent: false })
        for (const g of yearGoals.filter(g => g.level === 'month' && g.month === m).sort((a, b) => a.sort_order - b.sort_order)) {
          pushGoal(nodes, g, subKey, 3, relatedItems)
        }
      }
    }
  }

  const byKey = new Map(nodes.map(n => [n.key, n]))
  for (const n of nodes) {
    if (n.kind !== 'goal') continue
    let p = n.parentKey
    while (p) {
      const pn = byKey.get(p)
      if (!pn) break
      pn.hasContent = true
      p = pn.parentKey
    }
  }

  return nodes
}

// 접힌 기간 노드 아래의 모든 자손(하위 기간 노드/목표/보조 항목)을 제거한 "지금 보여야 할" 노드만 남긴다.
// nodes는 항상 부모가 자식보다 먼저 나오는 순서로 만들어지므로 한 번의 순방향 패스로 충분하다.
export function getVisibleNodes(nodes: MapNode[], collapsedKeys: Set<string>): MapNode[] {
  const visible: MapNode[] = []
  const visibleKeys = new Set<string>()
  for (const n of nodes) {
    if (n.parentKey === null) { visible.push(n); visibleKeys.add(n.key); continue }
    if (!visibleKeys.has(n.parentKey) || collapsedKeys.has(n.parentKey)) continue
    visible.push(n)
    visibleKeys.add(n.key)
  }
  return visible
}

const LEAF_WIDTH = 200
const H_GAP = 28
const V_GAP = 130

// 저장된 위치가 없는 노드를 위한 간단한 tidy-tree 자동 배치 — 부모를 자식들의 가운데에 둔다.
export function computeAutoLayout(visibleNodes: MapNode[]): Record<string, { x: number; y: number }> {
  const byKey = new Map(visibleNodes.map(n => [n.key, n]))
  const childrenOf = new Map<string, MapNode[]>()
  for (const n of visibleNodes) {
    if (!n.parentKey) continue
    const arr = childrenOf.get(n.parentKey) ?? []
    arr.push(n)
    childrenOf.set(n.parentKey, arr)
  }

  const widthCache = new Map<string, number>()
  function widthOf(key: string): number {
    if (widthCache.has(key)) return widthCache.get(key)!
    const children = childrenOf.get(key) ?? []
    const w = children.length === 0
      ? LEAF_WIDTH
      : children.reduce((sum, c, i) => sum + widthOf(c.key) + (i > 0 ? H_GAP : 0), 0)
    widthCache.set(key, w)
    return w
  }

  const positions: Record<string, { x: number; y: number }> = {}
  function place(key: string, leftX: number) {
    const node = byKey.get(key)
    if (!node) return
    const w = widthOf(key)
    const centerX = leftX + w / 2
    positions[key] = { x: centerX - LEAF_WIDTH / 2, y: node.depth * V_GAP }
    let cursor = leftX
    for (const c of childrenOf.get(key) ?? []) {
      place(c.key, cursor)
      cursor += widthOf(c.key) + H_GAP
    }
  }

  const root = visibleNodes.find(n => n.parentKey === null)
  if (root) place(root.key, 0)
  return positions
}
