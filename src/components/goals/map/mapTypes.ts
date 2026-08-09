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
// period(기간 그룹, 자체 데이터 없음) / goal(실제 목표) / related(목표에 붙인 보조 항목).
export type MapNode = {
  key: string
  kind: 'period' | 'goal' | 'related'
  label: string
  parentKey: string | null
  depth: number
  collapsible: boolean
  hasContent: boolean // period 노드 전용 — 이 아래에 목표가 하나라도 있는지 (초기 접힘 여부 판단용)
  goal?: import('../types').Goal
  item?: RelatedItem
}
