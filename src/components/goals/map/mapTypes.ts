export type RelatedItemType = 'memo' | 'action' | 'idea' | 'link' | 'free'

export const RELATED_ITEM_TYPE_LABEL: Record<RelatedItemType, string> = {
  memo: '메모',
  action: '실행 항목',
  idea: '아이디어',
  link: '링크',
  free: '자유 항목',
}

export type RelatedItem = {
  id: string
  goal_id: string
  type: RelatedItemType
  title: string
  content: string
  url: string
  created_at: string
}

export type NodePosition = { x: number; y: number }

// 캔버스 위 논리 노드 하나. kind별로 무엇을 그리는지가 다르다:
// period(기간 그룹, 자체 데이터 없음) / goalGroup(같은 기간의 목표들을 세로 리스트로 묶은
// 카드 하나 — 목표가 늘어나도 가로 폭이 아니라 카드 높이만 늘어나게 하기 위함) /
// related(목표에 붙인 보조 항목).
export type MapNode = {
  key: string
  kind: 'period' | 'goalGroup' | 'related'
  label: string
  parentKey: string | null
  depth: number
  collapsible: boolean
  // 자식으로 다른 기간 노드를 가진 기간 노드인지 (반기/상반기/하반기/분기/1~4분기/월).
  // "전체 접기"는 이 값이 false인 노드(연간, 1~12월 — 자식이 목표 그룹뿐인 말단)만 접는다.
  // 그래야 연도·반기·분기 같은 구분 구조 자체는 항상 남아있는다.
  hasPeriodChildren: boolean
  hasContent: boolean // period 노드 전용 — 이 아래에 목표가 하나라도 있는지 (초기 접힘 여부 판단용)
  goals?: import('../types').Goal[] // kind === 'goalGroup' 전용, 정렬된 목표 리스트
  item?: RelatedItem
}
