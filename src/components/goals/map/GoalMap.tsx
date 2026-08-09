'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, useReactFlow, type Node, type Edge, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Goal } from '../types'
import type { RelatedItem, RelatedItemType } from './mapTypes'
import { buildMapNodes, getVisibleNodes, computeAutoLayout } from './goalMapLayout'
import PeriodNode from './PeriodNode'
import GoalNodeCard from './GoalNodeCard'
import RelatedItemNode from './RelatedItemNode'
import RelatedItemModal from './RelatedItemModal'

const nodeTypes = { period: PeriodNode, goal: GoalNodeCard, related: RelatedItemNode }

type RelatedModalState = { mode: 'create'; goalId: string } | { mode: 'edit'; item: RelatedItem }

function GoalMapInner({ goals, year, onEditGoal }: { goals: Goal[]; year: number; onEditGoal: (g: Goal) => void }) {
  const { zoomIn, zoomOut } = useReactFlow()
  const [relatedItems, setRelatedItems] = useState<RelatedItem[]>([])
  const [savedPositions, setSavedPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [relatedModal, setRelatedModal] = useState<RelatedModalState | null>(null)
  const [zoomPct, setZoomPct] = useState(100)

  const allNodes = useMemo(() => buildMapNodes(goals, relatedItems, year), [goals, relatedItems, year])

  // 목표가 하나도 없는 빈 기간 노드는 접힌 채로 시작한다. 이 컴포넌트는 연도가 바뀔 때마다
  // (부모가 key={year}로) 통째로 새로 마운트되므로, 최초 1회 계산이면 충분하다.
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(
    () => new Set(allNodes.filter(n => n.collapsible && !n.hasContent).map(n => n.key))
  )

  async function loadRelatedItems() {
    const res = await fetch('/api/goal-related-items')
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json()
    if (json.ok) setRelatedItems(json.items)
  }

  async function loadPositions() {
    const res = await fetch(`/api/goal-map-nodes?year=${year}`)
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json()
    if (json.ok) {
      const map: Record<string, { x: number; y: number }> = {}
      for (const p of json.positions as { node_key: string; x: number; y: number }[]) map[p.node_key] = { x: p.x, y: p.y }
      setSavedPositions(map)
    }
  }

  useEffect(() => { loadRelatedItems() }, [])
  useEffect(() => { loadPositions() }, [])

  const visibleNodes = useMemo(() => getVisibleNodes(allNodes, collapsedKeys), [allNodes, collapsedKeys])
  const autoLayout = useMemo(() => computeAutoLayout(visibleNodes), [visibleNodes])

  function toggleCollapse(key: string) {
    setCollapsedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function expandAll() { setCollapsedKeys(new Set()) }
  function collapseAll() { setCollapsedKeys(new Set(allNodes.filter(n => n.collapsible).map(n => n.key))) }

  async function savePosition(key: string, x: number, y: number) {
    setSavedPositions(prev => ({ ...prev, [key]: { x, y } }))
    await fetch('/api/goal-map-nodes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, node_key: key, x, y }),
    })
  }

  async function resetLayout() {
    if (!confirm('이 연도의 노드 배치를 기본 상태로 되돌릴까요? 목표 데이터는 변경되지 않습니다.')) return
    setSavedPositions({})
    await fetch(`/api/goal-map-nodes?year=${year}`, { method: 'DELETE' })
  }

  async function submitRelatedCreate(goalId: string, payload: { type: RelatedItemType; title: string; content: string; url: string }) {
    const res = await fetch('/api/goal-related-items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal_id: goalId, ...payload }),
    })
    if (res.status === 401) { window.location.href = '/login'; return { ok: false } }
    const json = await res.json()
    if (json.ok) setRelatedItems(prev => [...prev, json.item])
    return json
  }

  async function submitRelatedEdit(id: string, payload: { type: RelatedItemType; title: string; content: string; url: string }) {
    const res = await fetch(`/api/goal-related-items/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (res.status === 401) { window.location.href = '/login'; return { ok: false } }
    const json = await res.json()
    if (json.ok) setRelatedItems(prev => prev.map(it => it.id === id ? json.item : it))
    return json
  }

  async function deleteRelated(id: string) {
    if (!confirm('이 항목을 삭제할까요?')) return
    const res = await fetch(`/api/goal-related-items/${id}`, { method: 'DELETE' })
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json()
    if (json.ok) setRelatedItems(prev => prev.filter(it => it.id !== id))
  }

  const flowNodes: Node[] = useMemo(() => visibleNodes.map(n => {
    const pos = savedPositions[n.key] ?? autoLayout[n.key] ?? { x: 0, y: 0 }
    if (n.kind === 'period') {
      return {
        id: n.key, type: 'period', position: pos, draggable: true,
        data: { label: n.label, depth: n.depth, collapsible: n.collapsible, collapsed: collapsedKeys.has(n.key), hasContent: n.hasContent, onToggle: () => toggleCollapse(n.key) },
      }
    }
    if (n.kind === 'goal' && n.goal) {
      const goal = n.goal
      return {
        id: n.key, type: 'goal', position: pos, draggable: true,
        data: { goal, onClick: () => onEditGoal(goal), onAddRelated: () => setRelatedModal({ mode: 'create', goalId: goal.id }) },
      }
    }
    const item = n.item!
    return {
      id: n.key, type: 'related', position: pos, draggable: true,
      data: { item, onEdit: () => setRelatedModal({ mode: 'edit', item }), onDelete: () => deleteRelated(item.id) },
    }
  }), [visibleNodes, savedPositions, autoLayout, collapsedKeys, onEditGoal])

  const flowEdges: Edge[] = useMemo(() => visibleNodes.filter(n => n.parentKey).map(n => ({
    id: `e:${n.parentKey}->${n.key}`, source: n.parentKey as string, target: n.key, type: 'smoothstep',
    style: { stroke: '#E5E8EB', strokeWidth: 1.25 },
  })), [visibleNodes])

  // 드래그 중 매 프레임 위치를 savedPositions에 실시간 반영해서(로컬 상태만) React Flow가
  // 스스로 관리하는 위치와 화면에 그려지는 위치가 어긋나지 않게 한다. 서버 저장은
  // onNodeDragStop에서 드래그가 끝났을 때 한 번만 한다.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const moves = changes.filter((c): c is NodeChange & { type: 'position'; position: { x: number; y: number } } => c.type === 'position' && !!c.position)
    if (moves.length === 0) return
    setSavedPositions(prev => {
      const next = { ...prev }
      for (const c of moves) next[c.id] = c.position
      return next
    })
  }, [])

  const onNodeDragStop = useCallback((_event: unknown, node: Node) => {
    savePosition(node.id, node.position.x, node.position.y)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  return (
    <div className="relative border border-[#E5E8EB] rounded-xl overflow-hidden" style={{ height: 'min(72vh, 760px)', minHeight: 0 }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onMove={(_event, viewport) => setZoomPct(Math.round(viewport.zoom * 100))}
        minZoom={0.5}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#E5E8EB" />
      </ReactFlow>

      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
        <button type="button" onClick={expandAll} className="text-[11px] text-[#7A8491] hover:text-[#1F2933] bg-white border border-gray-200 rounded-md px-2 py-1">전체 펼치기</button>
        <button type="button" onClick={collapseAll} className="text-[11px] text-[#7A8491] hover:text-[#1F2933] bg-white border border-gray-200 rounded-md px-2 py-1">전체 접기</button>
        <button type="button" onClick={resetLayout} className="text-[11px] text-[#7A8491] hover:text-[#1F2933] bg-white border border-gray-200 rounded-md px-2 py-1">배치 초기화</button>
        <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-md px-1 py-1">
          <button type="button" onClick={() => zoomOut()} className="w-5 h-5 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] text-[13px]">-</button>
          <span className="text-[11px] text-[#7A8491] w-9 text-center">{zoomPct}%</span>
          <button type="button" onClick={() => zoomIn()} className="w-5 h-5 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] text-[13px]">+</button>
        </div>
      </div>

      {relatedModal && (
        <RelatedItemModal
          initial={relatedModal.mode === 'edit' ? relatedModal.item : undefined}
          onClose={() => setRelatedModal(null)}
          onSubmit={payload => relatedModal.mode === 'create' ? submitRelatedCreate(relatedModal.goalId, payload) : submitRelatedEdit(relatedModal.item.id, payload)}
        />
      )}
    </div>
  )
}

export default function GoalMap(props: { goals: Goal[]; year: number; onEditGoal: (g: Goal) => void }) {
  return (
    <ReactFlowProvider>
      <GoalMapInner key={props.year} {...props} />
    </ReactFlowProvider>
  )
}
