'use client'

import { useEffect, useState } from 'react'
import { CHILD_LEVEL, type GoalLevel } from '@/lib/goalLevels'
import { childrenOf, periodLabel } from './goalUtils'
import type { Goal } from './types'
import GoalModal from './GoalModal'

type DropHint = { parentId: string | null; year: number; index: number }
type ModalState =
  | { mode: 'create'; defaultLevel?: GoalLevel }
  | { mode: 'edit'; goal: Goal }

function slotMatches(hint: DropHint | null, parentId: string | null, year: number, index: number) {
  return !!hint && hint.parentId === parentId && hint.year === year && hint.index === index
}

function DropLine({
  depth, active, onOver, onLeave, onDrop,
}: {
  depth: number
  active: boolean
  onOver: () => void
  onLeave: () => void
  onDrop: () => void
}) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onOver() }}
      onDragLeave={onLeave}
      onDrop={e => { e.preventDefault(); onDrop() }}
      style={{ marginLeft: depth * 18 }}
      className={`h-2 rounded-full ${active ? 'bg-[#4C7FE0]/30' : ''}`}
    />
  )
}

function GoalNode({
  goal, depth, goals, dragId, dragGoalLevel, dropHint,
  onDragStart, onDragEnd, onHover, onLeaveHint, onDrop, onEdit, onDelete,
}: {
  goal: Goal
  depth: number
  goals: Goal[]
  dragId: string | null
  dragGoalLevel: GoalLevel | null
  dropHint: DropHint | null
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onHover: (hint: DropHint) => void
  onLeaveHint: (hint: DropHint) => void
  onDrop: (parentId: string | null, year: number, index: number) => void
  onEdit: (goal: Goal) => void
  onDelete: (goal: Goal) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const children = childrenOf(goals, goal.id)
  const acceptsChildLevel = CHILD_LEVEL[goal.level]
  const showSlots = dragId !== null && dragGoalLevel !== null && acceptsChildLevel === dragGoalLevel

  return (
    <div>
      <div
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', goal.id); onDragStart(goal.id) }}
        onDragEnd={onDragEnd}
        style={{ paddingLeft: depth * 18 }}
        className="flex items-center gap-2 py-1.5 group cursor-grab active:cursor-grabbing"
      >
        <span className="text-[15px] leading-none">{goal.icon}</span>
        <span className="text-[13.5px] text-[#1F2933]">{goal.name}</span>
        <span className="text-[11.5px] text-[#B0B8C1]">{periodLabel(goal)}</span>
        <div className="ml-auto relative opacity-0 group-hover:opacity-100">
          <button type="button" onClick={() => setMenuOpen(p => !p)} className="text-[13px] text-[#7A8491] hover:text-[#1F2933] px-1.5 py-0.5 rounded-md hover:bg-black/[0.04]">···</button>
          {menuOpen && (
            <div className="absolute right-0 top-6 bg-white border border-[#EEF0F2] rounded-lg shadow-sm py-1 w-24 z-10">
              <button type="button" onClick={() => { setMenuOpen(false); onEdit(goal) }} className="w-full text-left text-[12px] text-[#7A8491] hover:bg-[#F7F8F8] px-3 py-1.5">수정</button>
              <button type="button" onClick={() => { setMenuOpen(false); onDelete(goal) }} className="w-full text-left text-[12px] text-red-500 hover:bg-[#F7F8F8] px-3 py-1.5">삭제</button>
            </div>
          )}
        </div>
      </div>

      {showSlots ? (
        <>
          {Array.from({ length: children.length + 1 }, (_, i) => i).map(i => (
            <div key={i}>
              <DropLine
                depth={depth + 1}
                active={slotMatches(dropHint, goal.id, goal.year, i)}
                onOver={() => onHover({ parentId: goal.id, year: goal.year, index: i })}
                onLeave={() => onLeaveHint({ parentId: goal.id, year: goal.year, index: i })}
                onDrop={() => onDrop(goal.id, goal.year, i)}
              />
              {children[i] && (
                <GoalNode
                  goal={children[i]} depth={depth + 1} goals={goals} dragId={dragId} dragGoalLevel={dragGoalLevel} dropHint={dropHint}
                  onDragStart={onDragStart} onDragEnd={onDragEnd} onHover={onHover} onLeaveHint={onLeaveHint} onDrop={onDrop}
                  onEdit={onEdit} onDelete={onDelete}
                />
              )}
            </div>
          ))}
        </>
      ) : (
        children.map(child => (
          <GoalNode
            key={child.id}
            goal={child} depth={depth + 1} goals={goals} dragId={dragId} dragGoalLevel={dragGoalLevel} dropHint={dropHint}
            onDragStart={onDragStart} onDragEnd={onDragEnd} onHover={onHover} onLeaveHint={onLeaveHint} onDrop={onDrop}
            onEdit={onEdit} onDelete={onDelete}
          />
        ))
      )}
    </div>
  )
}

export default function GoalsPanel() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<ModalState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<DropHint | null>(null)

  useEffect(() => { loadGoals() }, [])

  async function loadGoals() {
    const res = await fetch('/api/goals')
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json()
    if (json.ok) setGoals(json.goals)
    else setError(json.error ?? '불러오기 실패')
    setLoaded(true)
  }

  async function submitCreate(payload: Record<string, unknown>) {
    const res = await fetch('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.status === 401) { window.location.href = '/login'; return { ok: false } }
    const json = await res.json()
    if (json.ok) setGoals(prev => [...prev, json.goal])
    return json
  }

  async function submitEdit(id: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/goals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.status === 401) { window.location.href = '/login'; return { ok: false } }
    const json = await res.json()
    if (json.ok) setGoals(prev => prev.map(g => g.id === id ? json.goal : g))
    return json
  }

  function handleDeleteClick(goal: Goal) {
    const hasChildren = goals.some(g => g.parent_id === goal.id)
    if (!hasChildren) {
      if (confirm(`"${goal.name}" 목표를 삭제할까요?`)) performDelete(goal.id, 'cascade')
      return
    }
    setDeleteTarget(goal)
  }

  async function performDelete(id: string, mode: 'cascade' | 'orphan') {
    const res = await fetch(`/api/goals/${id}?mode=${mode}`, { method: 'DELETE' })
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json()
    if (json.ok) {
      setGoals(prev => {
        if (mode === 'orphan') {
          return prev.filter(g => g.id !== id).map(g => g.parent_id === id ? { ...g, parent_id: null } : g)
        }
        const removeIds = new Set([id])
        let changed = true
        while (changed) {
          changed = false
          for (const g of prev) {
            if (g.parent_id && removeIds.has(g.parent_id) && !removeIds.has(g.id)) { removeIds.add(g.id); changed = true }
          }
        }
        return prev.filter(g => !removeIds.has(g.id))
      })
    } else {
      setError(json.error ?? '삭제에 실패했습니다.')
    }
    setDeleteTarget(null)
  }

  function computeMove(parentId: string | null, year: number, index: number) {
    const dragGoal = goals.find(g => g.id === dragId)
    if (!dragGoal) return null

    if (parentId) {
      const owner = goals.find(g => g.id === parentId)
      if (!owner || CHILD_LEVEL[owner.level] !== dragGoal.level) return null
    } else if (dragGoal.level !== 'yearly' || dragGoal.year !== year) {
      return null
    }

    const destAll = parentId ? childrenOf(goals, parentId) : goals.filter(g => g.parent_id === null && g.year === year && g.level === 'yearly')
    const destWithoutSelf = destAll.filter(g => g.id !== dragGoal.id)
    const clampedIndex = Math.max(0, Math.min(index, destWithoutSelf.length))
    const destIds = [...destWithoutSelf.slice(0, clampedIndex).map(g => g.id), dragGoal.id, ...destWithoutSelf.slice(clampedIndex).map(g => g.id)]

    const sourceParentId = dragGoal.parent_id
    const sameContainer = sourceParentId === parentId && (parentId !== null || dragGoal.year === year)

    const updates: { id: string; sort_order: number; parent_id?: string }[] = destIds.map((id, i) => ({
      id, sort_order: i, ...(id === dragGoal.id && !sameContainer ? { parent_id: parentId as string } : {}),
    }))

    if (!sameContainer) {
      const sourceAll = sourceParentId ? childrenOf(goals, sourceParentId) : goals.filter(g => g.parent_id === null && g.year === dragGoal.year && g.level === 'yearly')
      sourceAll.filter(g => g.id !== dragGoal.id).forEach((g, i) => updates.push({ id: g.id, sort_order: i }))
    }
    return updates
  }

  function handleDrop(parentId: string | null, year: number, index: number) {
    const updates = computeMove(parentId, year, index)
    setDropHint(null)
    setDragId(null)
    if (!updates || updates.length === 0) return

    setGoals(prev => prev.map(g => {
      const u = updates.find(x => x.id === g.id)
      if (!u) return g
      return { ...g, sort_order: u.sort_order, ...(u.parent_id !== undefined ? { parent_id: u.parent_id } : {}) }
    }))

    Promise.all(updates.map(u => fetch(`/api/goals/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(u.parent_id !== undefined ? { parent_id: u.parent_id, sort_order: u.sort_order } : { sort_order: u.sort_order }),
    })))
      .then(responses => { if (responses.some(r => !r.ok)) loadGoals() })
      .catch(() => loadGoals())
  }

  const dragGoalLevel = dragId ? goals.find(g => g.id === dragId)?.level ?? null : null
  const rootGoals = goals.filter(g => g.parent_id === null)
  const years = Array.from(new Set(rootGoals.map(g => g.year))).sort((a, b) => a - b)

  if (!loaded) return <p className="text-[13px] text-[#7A8491]">불러오는 중...</p>

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-[17px] font-semibold text-[#1F2933]">목표</h1>
          <p className="text-[12.5px] text-[#7A8491] mt-0.5">연간 · 반기 · 분기 · 월 목표를 관리하세요. (임시 목록 화면)</p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: 'create', defaultLevel: 'yearly' })}
          className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2 flex-shrink-0"
        >
          + 새 목표
        </button>
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {years.length === 0 && <p className="text-[13px] text-[#B0B8C1]">아직 등록된 목표가 없습니다.</p>}

      {years.map(year => {
        const items = rootGoals.filter(g => g.year === year).sort((a, b) => a.sort_order - b.sort_order)
        const showSlots = dragId !== null && dragGoalLevel === 'yearly'
        return (
          <div key={year} className="mb-5">
            <p className="text-[13px] font-semibold text-[#1F2933] mb-1.5">{year}년</p>
            {showSlots ? (
              Array.from({ length: items.length + 1 }, (_, i) => i).map(i => (
                <div key={i}>
                  <DropLine
                    depth={0}
                    active={slotMatches(dropHint, null, year, i)}
                    onOver={() => setDropHint({ parentId: null, year, index: i })}
                    onLeave={() => setDropHint(prev => (prev && prev.parentId === null && prev.year === year && prev.index === i) ? null : prev)}
                    onDrop={() => handleDrop(null, year, i)}
                  />
                  {items[i] && (
                    <GoalNode
                      goal={items[i]} depth={0} goals={goals} dragId={dragId} dragGoalLevel={dragGoalLevel} dropHint={dropHint}
                      onDragStart={setDragId} onDragEnd={() => { setDragId(null); setDropHint(null) }}
                      onHover={setDropHint} onLeaveHint={hint => setDropHint(prev => (prev && prev.parentId === hint.parentId && prev.year === hint.year && prev.index === hint.index) ? null : prev)}
                      onDrop={handleDrop} onEdit={g => setModal({ mode: 'edit', goal: g })} onDelete={handleDeleteClick}
                    />
                  )}
                </div>
              ))
            ) : (
              items.map(g => (
                <GoalNode
                  key={g.id}
                  goal={g} depth={0} goals={goals} dragId={dragId} dragGoalLevel={dragGoalLevel} dropHint={dropHint}
                  onDragStart={setDragId} onDragEnd={() => { setDragId(null); setDropHint(null) }}
                  onHover={setDropHint} onLeaveHint={hint => setDropHint(prev => (prev && prev.parentId === hint.parentId && prev.year === hint.year && prev.index === hint.index) ? null : prev)}
                  onDrop={handleDrop} onEdit={g2 => setModal({ mode: 'edit', goal: g2 })} onDelete={handleDeleteClick}
                />
              ))
            )}
          </div>
        )
      })}

      {modal && (
        <GoalModal
          goals={goals}
          initial={modal.mode === 'edit' ? modal.goal : undefined}
          defaultLevel={modal.mode === 'create' ? modal.defaultLevel : undefined}
          onClose={() => setModal(null)}
          onSubmit={payload => modal.mode === 'create' ? submitCreate(payload) : submitEdit(modal.goal.id, payload)}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 px-4" onClick={() => setDeleteTarget(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-lg p-5 w-full max-w-sm space-y-3">
            <p className="text-[14px] font-medium text-[#1F2933]">이 목표에는 연결된 하위 목표가 있습니다.</p>
            <p className="text-[12.5px] text-[#7A8491]">&quot;{deleteTarget.name}&quot;을(를) 어떻게 삭제할까요?</p>
            <div className="flex flex-col gap-2 pt-1">
              <button type="button" onClick={() => performDelete(deleteTarget.id, 'cascade')} className="text-[12.5px] font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg px-3 py-2">하위 목표까지 함께 삭제</button>
              <button type="button" onClick={() => performDelete(deleteTarget.id, 'orphan')} className="text-[12.5px] font-medium text-[#1F2933] border border-[#E5E8EB] rounded-lg px-3 py-2 hover:bg-[#F7F8F8]">하위 목표 연결 해제 후 삭제</button>
              <button type="button" onClick={() => setDeleteTarget(null)} className="text-[12.5px] text-[#7A8491] px-3 py-2">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
