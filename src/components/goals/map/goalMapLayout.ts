import type { Goal, GoalPeriodParams } from '../types'
import type { MapNode, RelatedItem } from './mapTypes'

const HALVES: { half: 'h1' | 'h2'; label: string; quarters: (1 | 2 | 3 | 4)[] }[] = [
  { half: 'h1', label: '상반기', quarters: [1, 2] },
  { half: 'h2', label: '하반기', quarters: [3, 4] },
]

// 트리의 Y좌표(=depth)는 항상 이 고정된 "행 번호"로만 정해진다 — 실제 부모-자식 연결이
// 목표 카드를 거치는지 여부와 무관하게, 같은 레벨(예: 1분기/3분기)은 항상 같은 행에 온다.
// 카드 유무에 따라 depth를 그때그때 계산하면 목표가 있는 가지만 한 칸씩 밀려서
// 형제 가지끼리 계층선이 어긋나는 문제(요청사항 10번)가 생긴다.
const ROW_YEAR = 0
const ROW_YEARLY = 1
const ROW_YEARLY_CARD = 2
const ROW_HALF = 3
const ROW_HALF_CARD = 4
const ROW_QUARTER = 5
const ROW_QUARTER_CARD = 6
const ROW_MONTH = 7
const ROW_MONTH_CARD = 8
// 연관 항목은 항상 전체 스파인의 가장 아래보다 한 칸 더 아래에 둔다 — 연간/반기/분기
// 카드는 이제 다음 분기 갈래의 "부모"이기도 해서, 카드 바로 다음 행(depth+1)에 연관
// 항목을 두면 다음 분기/월 갈래와 같은 행에 겹쳐 보인다.
const RELATED_DEPTH = ROW_MONTH_CARD + 1

// 같은 기간의 목표를 모두 모아 노드 하나(세로 리스트 카드)로 묶는다 — 목표가 몇 개든
// 가로 폭에는 영향이 없고 카드 높이만 늘어난다(카드 내부는 최대 6개 + "더 보기"로 제한되어
// 있어 높이도 사실상 상한이 있다). 목표가 없으면 아예 만들지 않는다.
// 반환값(있으면 카드 key)은 호출부가 "다음 하위 분기를 카드 아래에 이어붙일지, 라벨 아래에
// 바로 이어붙일지"를 정하는 데 쓴다.
function pushGroup(nodes: MapNode[], goalsForPeriod: Goal[], periodKey: string, depth: number, relatedItems: RelatedItem[]): string | null {
  if (goalsForPeriod.length === 0) return null
  const sorted = [...goalsForPeriod].sort((a, b) => a.sort_order - b.sort_order)
  const groupKey = `group:${periodKey}`
  nodes.push({ key: groupKey, kind: 'goalGroup', label: '', parentKey: periodKey, depth, collapsible: false, hasPeriodChildren: false, hasContent: true, goals: sorted })
  for (const g of sorted) {
    for (const item of relatedItems.filter(it => it.goal_id === g.id)) {
      nodes.push({ key: `related:${item.id}`, kind: 'related', label: item.title, parentKey: groupKey, depth: RELATED_DEPTH, collapsible: false, hasPeriodChildren: false, hasContent: true, item })
    }
  }
  return groupKey
}

// 목표 데이터(goals/relatedItems)로부터 캔버스에 그릴 논리 노드 전체를 만든다.
// 전체 트리는 하나의 중앙 세로줄이다: 2026년 → 연간(목표 카드가 있으면 그 아래로) →
// 상반기/하반기 → 각 반기 목표 → 1~4분기 → 각 분기 목표 → 1~12월 → (월 목표가 있으면 그 아래).
// "분기"·"월" 같은 순수 구분 라벨은 더 이상 별도 노드로 만들지 않는다 — 실제 목표를 가질 수
// 있는 기간 노드(연간/반기/분기/월)만 남기고, 다음 단계는 그 기간의 목표 카드가 있으면 카드
// 밑에, 없으면 기간 노드 자신 밑에 바로 잇는다. 목표끼리는 어떤 연결도 만들지 않는다.
export function buildMapNodes(goals: Goal[], relatedItems: RelatedItem[], year: number): MapNode[] {
  const yearGoals = goals.filter(g => g.year === year)
  const nodes: MapNode[] = []

  nodes.push({ key: 'root', kind: 'period', label: `${year}년`, parentKey: null, depth: ROW_YEAR, collapsible: false, hasPeriodChildren: true, hasContent: yearGoals.length > 0 })

  // "연간"은 이제 반기 갈래 전체를 아래에 매다는 중간 트렁크라 접었을 때 나머지 트리가
  // 전부 사라져 버린다 — 되돌릴 방법이 없는 손해만 있고 얻는 건 없으므로 접기 자체를 막는다
  // (상반기/하반기처럼 "다른 쪽에 집중하려고 한쪽을 접는" 용도가 없는, 유일한 트렁크라서).
  nodes.push({ key: 'cat:yearly', kind: 'period', label: '연간', parentKey: 'root', depth: ROW_YEARLY, collapsible: false, hasPeriodChildren: true, hasContent: false })
  const yearlyGroupKey = pushGroup(nodes, yearGoals.filter(g => g.level === 'yearly'), 'cat:yearly', ROW_YEARLY_CARD, relatedItems)
  const yearlyAnchor = yearlyGroupKey ?? 'cat:yearly'

  for (const h of HALVES) {
    const halfKey = `sub:half:${h.half}`
    nodes.push({ key: halfKey, kind: 'period', label: h.label, parentKey: yearlyAnchor, depth: ROW_HALF, collapsible: true, hasPeriodChildren: true, hasContent: false })
    const halfGroupKey = pushGroup(nodes, yearGoals.filter(g => g.level === 'half' && g.half === h.half), halfKey, ROW_HALF_CARD, relatedItems)
    const halfAnchor = halfGroupKey ?? halfKey

    for (const q of h.quarters) {
      const quarterKey = `sub:quarter:${q}`
      nodes.push({ key: quarterKey, kind: 'period', label: `${q}분기`, parentKey: halfAnchor, depth: ROW_QUARTER, collapsible: true, hasPeriodChildren: true, hasContent: false })
      const quarterGroupKey = pushGroup(nodes, yearGoals.filter(g => g.level === 'quarter' && g.quarter === q), quarterKey, ROW_QUARTER_CARD, relatedItems)
      const quarterAnchor = quarterGroupKey ?? quarterKey

      const firstMonth = (q - 1) * 3 + 1
      for (const m of [firstMonth, firstMonth + 1, firstMonth + 2]) {
        const monthKey = `sub:month:${m}`
        nodes.push({ key: monthKey, kind: 'period', label: `${m}월`, parentKey: quarterAnchor, depth: ROW_MONTH, collapsible: true, hasPeriodChildren: false, hasContent: false })
        pushGroup(nodes, yearGoals.filter(g => g.level === 'month' && g.month === m), monthKey, ROW_MONTH_CARD, relatedItems)
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
// 비어 있을 때 빠른 추가(+) 버튼을 붙일지 정한다.
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
// 한 번의 순방향 패스로 충분하다. 목표 카드가 다음 분기/월 갈래의 부모인 경우에도, 그
// 카드가 숨겨지면(=자기 부모가 접힘) 카드에 연결된 다음 갈래도 자동으로 함께 숨는다.
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
function nodeBoxWidth(n: MapNode): number {
  if (n.kind === 'goalGroup') return LEAF_WIDTH
  if (n.kind === 'related') return RELATED_WIDTH
  if (n.depth === 0) return 92 // 연도
  if (n.key.startsWith('sub:month:')) return 58 // 월은 가장 작은 pill
  return 96 // 연간/상반기·하반기/1~4분기
}

// 저장된 위치가 없는 노드를 위한 tidy-tree 자동 배치.
//
// - 같은 depth는 항상 같은 Y (node.depth * V_GAP) — buildMapNodes가 depth를 실제 부모-자식
//   연결과 무관하게 고정된 "행 번호"로 매기기 때문에, 목표 카드 유무와 상관없이 형제 가지의
//   높이가 항상 맞는다.
// - 형제 노드는 항상 "그 형제들 중 가장 넓은 폭"으로 동일하게 칸을 나눠 가진다 (widthOf가 그
//   재귀적인 최대폭을 구하고, measure가 그 칸의 정중앙에 각 자식을 배치). 그래서 상반기/하반기,
//   분기, 월처럼 내용량이 다른 형제들도 항상 같은 간격·폭으로 늘어선다 (요청사항 4/5/9).
// - 부모는 항상 자기 자식 그룹 전체의 정중앙에 온다.
// - goalGroup(목표 카드)은 항상 정확히 LEAF_WIDTH 한 칸만 차지한다 — 목표가 1개든 10개든
//   카드 "내용"은 폭 계산에 전혀 관여하지 않고 카드 높이만 늘어난다. 연관 항목은 폭 계산에서
//   아예 제외하고, 자기 목표 그룹 바로 아래에 별도로 가운데 정렬해 배치한다.
export function computeAutoLayout(visibleNodes: MapNode[]): Record<string, { x: number; y: number }> {
  const byKey = new Map(visibleNodes.map(n => [n.key, n]))
  const childrenOf = new Map<string, MapNode[]>()
  for (const n of visibleNodes) {
    if (!n.parentKey || n.kind === 'related') continue
    const arr = childrenOf.get(n.parentKey) ?? []
    arr.push(n)
    childrenOf.set(n.parentKey, arr)
  }

  const widthCache = new Map<string, number>()
  function widthOf(key: string): number {
    if (widthCache.has(key)) return widthCache.get(key)!
    const children = childrenOf.get(key) ?? []
    if (children.length === 0) { widthCache.set(key, LEAF_WIDTH); return LEAF_WIDTH }
    const maxChildWidth = Math.max(...children.map(c => widthOf(c.key)))
    const w = children.length * maxChildWidth + (children.length - 1) * H_GAP
    widthCache.set(key, w)
    return w
  }

  const centerXOf: Record<string, number> = {}
  function measure(key: string, leftX: number, slotWidth: number) {
    centerXOf[key] = leftX + slotWidth / 2
    const children = childrenOf.get(key) ?? []
    if (children.length === 0) return
    const naturalWidth = widthOf(key)
    const maxChildWidth = Math.max(...children.map(c => widthOf(c.key)))
    let cursor = leftX + (slotWidth - naturalWidth) / 2
    for (const c of children) {
      measure(c.key, cursor, maxChildWidth)
      cursor += maxChildWidth + H_GAP
    }
  }

  const root = visibleNodes.find(n => n.parentKey === null)
  if (root) measure(root.key, 0, widthOf(root.key))

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
