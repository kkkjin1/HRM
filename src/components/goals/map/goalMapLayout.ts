import type { Goal, GoalPeriodParams } from '../types'
import type { MapNode, RelatedItem } from './mapTypes'

const HALVES: { half: 'h1' | 'h2'; label: string; quarters: (1 | 2 | 3 | 4)[] }[] = [
  { half: 'h1', label: '상반기', quarters: [1, 2] },
  { half: 'h2', label: '하반기', quarters: [3, 4] },
]

// 같은 기간의 목표를 모두 모아 노드 하나(세로 리스트 카드)로 묶는다 — 목표가 몇 개든
// 가로 폭에는 영향이 없고 카드 높이만 늘어난다. 목표가 없으면 아예 만들지 않는다.
function pushGroup(nodes: MapNode[], goalsForPeriod: Goal[], periodKey: string, depth: number, relatedItems: RelatedItem[]) {
  if (goalsForPeriod.length === 0) return
  const sorted = [...goalsForPeriod].sort((a, b) => a.sort_order - b.sort_order)
  const groupKey = `group:${periodKey}`
  nodes.push({ key: groupKey, kind: 'goalGroup', label: '', parentKey: periodKey, depth, collapsible: false, hasPeriodChildren: false, hasContent: true, goals: sorted })
  for (const g of sorted) {
    for (const item of relatedItems.filter(it => it.goal_id === g.id)) {
      nodes.push({ key: `related:${item.id}`, kind: 'related', label: item.title, parentKey: groupKey, depth: depth + 1, collapsible: false, hasPeriodChildren: false, hasContent: true, item })
    }
  }
}

// 목표 데이터(goals/relatedItems)로부터 캔버스에 그릴 논리 노드 전체를 만든다.
// 기간 계층은 실제 달력 포함관계 그대로다: 연간은 최상단의 독립된 가지, 반기는
// 상반기/하반기로 갈라지고 그 아래 "분기" 표지 노드 아래에 해당 분기 2개, 각 분기의
// "월" 표지 노드 아래에 해당 3개월이 중첩된다. 목표끼리는 어떤 연결도 만들지 않는다 —
// 각 기간 노드에는 그 기간의 목표를 모은 goalGroup 카드가 하나씩(있을 때만) 붙을 뿐이다.
export function buildMapNodes(goals: Goal[], relatedItems: RelatedItem[], year: number): MapNode[] {
  const yearGoals = goals.filter(g => g.year === year)
  const nodes: MapNode[] = []

  nodes.push({ key: 'root', kind: 'period', label: `${year}년`, parentKey: null, depth: 0, collapsible: false, hasPeriodChildren: true, hasContent: yearGoals.length > 0 })

  nodes.push({ key: 'cat:yearly', kind: 'period', label: '연간', parentKey: 'root', depth: 1, collapsible: true, hasPeriodChildren: false, hasContent: false })
  pushGroup(nodes, yearGoals.filter(g => g.level === 'yearly'), 'cat:yearly', 2, relatedItems)

  nodes.push({ key: 'cat:half', kind: 'period', label: '반기', parentKey: 'root', depth: 1, collapsible: true, hasPeriodChildren: true, hasContent: false })

  for (const h of HALVES) {
    const halfKey = `sub:half:${h.half}`
    nodes.push({ key: halfKey, kind: 'period', label: h.label, parentKey: 'cat:half', depth: 2, collapsible: true, hasPeriodChildren: true, hasContent: false })
    pushGroup(nodes, yearGoals.filter(g => g.level === 'half' && g.half === h.half), halfKey, 3, relatedItems)

    const quarterCatKey = `cat:quarter:${h.half}`
    nodes.push({ key: quarterCatKey, kind: 'period', label: '분기', parentKey: halfKey, depth: 3, collapsible: true, hasPeriodChildren: true, hasContent: false })

    for (const q of h.quarters) {
      const quarterKey = `sub:quarter:${q}`
      nodes.push({ key: quarterKey, kind: 'period', label: `${q}분기`, parentKey: quarterCatKey, depth: 4, collapsible: true, hasPeriodChildren: true, hasContent: false })
      pushGroup(nodes, yearGoals.filter(g => g.level === 'quarter' && g.quarter === q), quarterKey, 5, relatedItems)

      const monthCatKey = `cat:month:${q}`
      nodes.push({ key: monthCatKey, kind: 'period', label: '월', parentKey: quarterKey, depth: 5, collapsible: true, hasPeriodChildren: true, hasContent: false })

      const firstMonth = (q - 1) * 3 + 1
      for (const m of [firstMonth, firstMonth + 1, firstMonth + 2]) {
        const monthKey = `sub:month:${m}`
        nodes.push({ key: monthKey, kind: 'period', label: `${m}월`, parentKey: monthCatKey, depth: 6, collapsible: true, hasPeriodChildren: false, hasContent: false })
        pushGroup(nodes, yearGoals.filter(g => g.level === 'month' && g.month === m), monthKey, 7, relatedItems)
      }
    }
  }

  const byKey = new Map(nodes.map(n => [n.key, n]))
  for (const n of nodes) {
    if (n.kind !== 'goalGroup') continue
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

// 특정 기간 키가 목표를 직접 가질 수 있는 노드인지 (연간/상반기·하반기/1~4분기/1~12월) —
// "분기"·"월" 같은 순수 표지 노드와 구분해서, 비어 있을 때 빠른 추가(+) 버튼을 붙일지 정한다.
export function periodHoldsGoals(key: string): boolean {
  return key === 'cat:yearly' || key.startsWith('sub:half:') || key.startsWith('sub:quarter:') || key.startsWith('sub:month:')
}

// 기간 노드 key와 현재 연도로부터 목표 생성 모달에 넘길 파라미터를 만든다 —
// "8월 영역의 + 목표"를 누르면 목표 구분=월/연도=2026/월=8이 자동 선택되도록.
export function groupParamsForPeriodKey(key: string, year: number): GoalPeriodParams | null {
  if (key === 'cat:yearly') return { level: 'yearly', year }
  if (key.startsWith('sub:half:')) return { level: 'half', year, half: key.split(':')[2] as 'h1' | 'h2' }
  if (key.startsWith('sub:quarter:')) return { level: 'quarter', year, quarter: Number(key.split(':')[2]) as 1 | 2 | 3 | 4 }
  if (key.startsWith('sub:month:')) return { level: 'month', year, month: Number(key.split(':')[2]) }
  return null
}

// 접힌 기간 노드 아래의 모든 자손(하위 기간 노드/목표 그룹/보조 항목)을 제거한 "지금 보여야
// 할" 노드만 남긴다. nodes는 항상 부모가 자식보다 먼저 나오는 순서로 만들어지므로
// 한 번의 순방향 패스로 충분하다.
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

const LEAF_WIDTH = 230
const H_GAP = 32
const V_GAP = 110

// 저장된 위치가 없는 노드를 위한 간단한 tidy-tree 자동 배치 — 부모를 자식들의 가운데에 둔다.
// 목표 개수는 goalGroup 노드 "하나"의 높이에만 영향을 주고, 가로 폭 계산에는 전혀
// 관여하지 않는다 — 가로 폭을 늘리는 건 오직 기간 branch(반기/분기/월 개수)뿐이다.
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
