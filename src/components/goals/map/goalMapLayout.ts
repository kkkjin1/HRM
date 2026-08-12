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
const RELATED_WIDTH = 130
const H_GAP = 32
const V_GAP = 110

// 각 노드 종류가 실제로 화면에 그려지는 대략적인 폭 — place()가 계산한 "칸의 가운데"에
// 노드를 정확히 중앙정렬하려면 칸 폭(LEAF_WIDTH)이 아니라 그 노드 자신의 폭을 빼야 한다.
// (이전 버전은 모든 노드에 LEAF_WIDTH/2를 일괄로 빼서, 작은 기간 pill들이 칸 왼쪽으로
// 쏠려 보이는 게 "노드가 불규칙하게 어긋나 보이는" 현상의 핵심 원인이었다.)
function nodeBoxWidth(n: MapNode): number {
  if (n.kind === 'goalGroup') return LEAF_WIDTH
  if (n.kind === 'related') return RELATED_WIDTH
  if (n.depth === 0) return 92 // 연도
  if (n.key.startsWith('sub:month:')) return 58 // 월은 가장 작은 pill
  return 96 // 연간/반기/상반기·하반기/분기 표지/1~4분기
}

// 저장된 위치가 없는 노드를 위한 tidy-tree 자동 배치.
//
// - 같은 depth는 항상 같은 Y (node.depth * V_GAP).
// - 부모는 항상 자기 자식 그룹 전체 폭의 정중앙에 온다 (widthOf가 재귀적으로 자식 폭의
//   합을 구하고, place가 그 중앙에 배치).
// - goalGroup(목표 카드)은 항상 정확히 LEAF_WIDTH 한 칸만 차지한다 — 목표가 1개든
//   10개든 카드 "내용"은 폭 계산에 전혀 관여하지 않고 카드 높이만 늘어난다. 연관 항목은
//   폭 계산에서 아예 제외하고, 자기 목표 그룹 바로 아래에 별도로 가운데 정렬해 배치한다.
// - "연간"은 2026년 바로 아래에 상반기/하반기와 나란히 규칙을 만드는 축이 아니라 옆에
//   붙는 독립 가지이므로, 반기 백본의 중앙 계산(root 위치)에서 완전히 제외하고 그
//   왼쪽에 자기 폭만큼만 따로 배치한다.
export function computeAutoLayout(visibleNodes: MapNode[]): Record<string, { x: number; y: number }> {
  const byKey = new Map(visibleNodes.map(n => [n.key, n]))
  const childrenOf = new Map<string, MapNode[]>()
  for (const n of visibleNodes) {
    if (!n.parentKey || n.kind === 'related') continue
    const arr = childrenOf.get(n.parentKey) ?? []
    arr.push(n)
    childrenOf.set(n.parentKey, arr)
  }
  const rootChildren = (childrenOf.get('root') ?? []).filter(n => n.key !== 'cat:yearly')
  if (childrenOf.has('root')) childrenOf.set('root', rootChildren)

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

  const centerXOf: Record<string, number> = {}
  function measure(key: string, leftX: number) {
    const w = widthOf(key)
    centerXOf[key] = leftX + w / 2
    let cursor = leftX
    for (const c of childrenOf.get(key) ?? []) {
      measure(c.key, cursor)
      cursor += widthOf(c.key) + H_GAP
    }
  }

  const root = visibleNodes.find(n => n.parentKey === null)
  if (root) {
    measure(root.key, 0)
    if (byKey.has('cat:yearly')) {
      const yearlyWidth = widthOf('cat:yearly')
      measure('cat:yearly', -(yearlyWidth + H_GAP))
    }
  }

  const positions: Record<string, { x: number; y: number }> = {}
  for (const n of visibleNodes) {
    if (n.kind === 'related') continue
    const cx = centerXOf[n.key]
    if (cx === undefined) continue
    positions[n.key] = { x: cx - nodeBoxWidth(n) / 2, y: n.depth * V_GAP }
  }

  // 연관 항목: 소속 목표 그룹의 계산된 중앙 아래에, 항목끼리 가운데 정렬된 가로줄로 배치.
  const relatedByGroup = new Map<string, MapNode[]>()
  for (const n of visibleNodes) {
    if (n.kind !== 'related' || !n.parentKey) continue
    const arr = relatedByGroup.get(n.parentKey) ?? []
    arr.push(n)
    relatedByGroup.set(n.parentKey, arr)
  }
  for (const [groupKey, items] of relatedByGroup) {
    const groupPos = positions[groupKey]
    const groupNode = byKey.get(groupKey)
    if (!groupPos || !groupNode) continue
    const groupCenterX = groupPos.x + nodeBoxWidth(groupNode) / 2
    const totalWidth = items.length * RELATED_WIDTH + (items.length - 1) * H_GAP
    let cursor = groupCenterX - totalWidth / 2
    for (const item of items) {
      positions[item.key] = { x: cursor, y: item.depth * V_GAP }
      cursor += RELATED_WIDTH + H_GAP
    }
  }

  return positions
}
