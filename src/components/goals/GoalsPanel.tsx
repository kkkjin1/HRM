'use client'

import { Fragment, useEffect, useState } from 'react'
import { GOAL_LEVELS, GOAL_LEVEL_LABEL, type GoalLevel } from '@/lib/goalLevels'
import { periodLabel, sortBySortOrder } from './goalUtils'
import type { Goal, GoalPeriodParams } from './types'
import GoalModal from './GoalModal'
import GoalMap from './map/GoalMap'
import RetroPanel from './RetroPanel'

type View = 'manage' | 'map' | 'retro'

type Group = GoalPeriodParams
type ModalState = { mode: 'create'; group: Group } | { mode: 'edit'; goal: Goal }

function sameGroup(g: Goal, group: Group) {
  return g.level === group.level && g.year === group.year
    && (group.level !== 'half' || g.half === group.half)
    && (group.level !== 'quarter' || g.quarter === group.quarter)
    && (group.level !== 'month' || g.month === group.month)
}

function siblingsOf(goals: Goal[], group: Group) {
  return sortBySortOrder(goals.filter(g => sameGroup(g, group)))
}

function DropLine({ accepts, active, onOver, onLeave, onDrop }: { accepts: boolean; active: boolean; onOver: () => void; onLeave: () => void; onDrop: () => void }) {
  // accepts가 false일 때도 이 엘리먼트 자체는 항상 DOM에 존재해야 한다 — 드래그 시작과
  // 동시에 리렌더되며 새로 마운트되면 그 프레임에 드롭 타겟이 아직 없어 드롭을 놓칠 수 있다.
  return (
    <div
      onDragOver={e => { if (!accepts) return; e.preventDefault(); onOver() }}
      onDragLeave={() => { if (accepts) onLeave() }}
      onDrop={e => { if (!accepts) return; e.preventDefault(); onDrop() }}
      className={`h-2 rounded-full ${accepts && active ? 'bg-[#4C7FE0]/30' : ''}`}
    />
  )
}

function GoalRow({ goal, onEdit, onDelete, onDragStart, onDragEnd }: {
  goal: Goal
  onEdit: (g: Goal) => void
  onDelete: (g: Goal) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', goal.id); onDragStart(goal.id) }}
      onDragEnd={onDragEnd}
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
  )
}

function GoalList({
  title, items, group, dragId, dragGoalLevel, dropHint, onHover, onLeaveHint, onDrop, onAdd, onEdit, onDelete, onDragStart, onDragEnd,
}: {
  title: string
  items: Goal[]
  group: Group
  dragId: string | null
  dragGoalLevel: GoalLevel | null
  dropHint: { key: string; index: number } | null
  onHover: (key: string, index: number) => void
  onLeaveHint: (key: string, index: number) => void
  onDrop: (group: Group, index: number) => void
  onAdd: () => void
  onEdit: (g: Goal) => void
  onDelete: (g: Goal) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
}) {
  const listKey = `${group.level}:${group.year}:${group.half ?? ''}:${group.quarter ?? ''}:${group.month ?? ''}`
  const acceptsDrop = dragId !== null && dragGoalLevel === group.level

  return (
    <div>
      <p className="text-[13px] font-semibold text-[#1F2933] mb-1">{title}</p>
      {items.length === 0 && !acceptsDrop && <p className="text-[12.5px] text-[#B0B8C1] py-1">아직 등록된 목표가 없습니다.</p>}
      {items.map((g, i) => (
        <Fragment key={g.id}>
          <DropLine
            accepts={acceptsDrop}
            active={dropHint?.key === listKey && dropHint.index === i}
            onOver={() => onHover(listKey, i)}
            onLeave={() => onLeaveHint(listKey, i)}
            onDrop={() => onDrop(group, i)}
          />
          <GoalRow goal={g} onEdit={onEdit} onDelete={onDelete} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        </Fragment>
      ))}
      <DropLine
        accepts={acceptsDrop}
        active={dropHint?.key === listKey && dropHint.index === items.length}
        onOver={() => onHover(listKey, items.length)}
        onLeave={() => onLeaveHint(listKey, items.length)}
        onDrop={() => onDrop(group, items.length)}
      />
      <button type="button" onClick={onAdd} className="text-[12px] font-medium text-[#4C7FE0] hover:text-[#3A6CC8] mt-1.5">+ 목표 추가</button>
    </div>
  )
}

export default function GoalsPanel() {
  const now = new Date()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('manage')
  const [activeLevel, setActiveLevel] = useState<GoalLevel>('yearly')
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>((Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4)
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ key: string; index: number } | null>(null)

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
    if (!confirm(`"${goal.name}" 목표를 삭제할까요?`)) return
    performDelete(goal.id)
  }

  async function performDelete(id: string) {
    const res = await fetch(`/api/goals/${id}`, { method: 'DELETE' })
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json()
    if (json.ok) setGoals(prev => prev.filter(g => g.id !== id))
    else setError(json.error ?? '삭제에 실패했습니다.')
  }

  function handleDrop(target: Group, index: number) {
    const dragGoal = goals.find(g => g.id === dragId)
    setDropHint(null)
    setDragId(null)
    if (!dragGoal || dragGoal.level !== target.level) return

    const destAll = siblingsOf(goals, target)
    const destWithoutSelf = destAll.filter(g => g.id !== dragGoal.id)
    const clampedIndex = Math.max(0, Math.min(index, destWithoutSelf.length))
    const destIds = [...destWithoutSelf.slice(0, clampedIndex).map(g => g.id), dragGoal.id, ...destWithoutSelf.slice(clampedIndex).map(g => g.id)]
    const isSameGroup = sameGroup(dragGoal, target)

    const updates: { id: string; sort_order: number; half?: 'h1' | 'h2'; quarter?: 1 | 2 | 3 | 4; month?: number }[] = destIds.map((id, i) => ({
      id, sort_order: i,
      ...(id === dragGoal.id && !isSameGroup ? { half: target.half, quarter: target.quarter, month: target.month } : {}),
    }))

    if (!isSameGroup) {
      const sourceGroup: Group = { level: dragGoal.level, year: dragGoal.year, half: dragGoal.half ?? undefined, quarter: dragGoal.quarter ?? undefined, month: dragGoal.month ?? undefined }
      siblingsOf(goals, sourceGroup).filter(g => g.id !== dragGoal.id).forEach((g, i) => updates.push({ id: g.id, sort_order: i }))
    }

    setGoals(prev => prev.map(g => {
      const u = updates.find(x => x.id === g.id)
      if (!u) return g
      return {
        ...g, sort_order: u.sort_order,
        half: u.half !== undefined ? u.half : g.half,
        quarter: u.quarter !== undefined ? u.quarter : g.quarter,
        month: u.month !== undefined ? u.month : g.month,
      }
    }))

    Promise.all(updates.map(u => fetch(`/api/goals/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sort_order: u.sort_order, ...(u.half !== undefined ? { half: u.half } : {}), ...(u.quarter !== undefined ? { quarter: u.quarter } : {}), ...(u.month !== undefined ? { month: u.month } : {}) }),
    })))
      .then(responses => { if (responses.some(r => !r.ok)) loadGoals() })
      .catch(() => loadGoals())
  }

  function moveToGroup(target: Group) {
    handleDrop(target, siblingsOf(goals, target).length)
  }

  function openCreate(group: Group) { setModal({ mode: 'create', group }) }

  const dragGoalLevel = dragId ? goals.find(g => g.id === dragId)?.level ?? null : null

  const dndProps = {
    dragId, dragGoalLevel, dropHint,
    onHover: (key: string, index: number) => setDropHint({ key, index }),
    onLeaveHint: (key: string, index: number) => setDropHint(prev => (prev && prev.key === key && prev.index === index) ? null : prev),
    onDrop: handleDrop,
    onEdit: (g: Goal) => setModal({ mode: 'edit', goal: g }),
    onDelete: handleDeleteClick,
    onDragStart: setDragId,
    onDragEnd: () => { setDragId(null); setDropHint(null) },
  }

  if (!loaded) return <p className="text-[13px] text-[#7A8491]">불러오는 중...</p>

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h1 className="text-[17px] font-semibold text-[#1F2933]">목표</h1>
          <p className="text-[12.5px] text-[#7A8491] mt-0.5">연간 · 반기 · 분기 · 월 목표를 관리하세요.</p>
        </div>
        {view === 'manage' && (
          <button
            type="button"
            onClick={() => openCreate(
              activeLevel === 'yearly' ? { level: 'yearly', year: selectedYear }
                : activeLevel === 'half' ? { level: 'half', year: selectedYear, half: 'h1' }
                  : activeLevel === 'quarter' ? { level: 'quarter', year: selectedYear, quarter: selectedQuarter }
                    : { level: 'month', year: selectedYear, month: selectedMonth }
            )}
            className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2 flex-shrink-0"
          >
            + 새 목표
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          {(['manage', 'map', 'retro'] as const).map(v => (
            <button
              key={v} onClick={() => setView(v)}
              className={`text-[12px] px-2.5 py-1 rounded-md transition-colors ${view === v ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
            >
              {v === 'manage' ? '목표 관리' : v === 'map' ? '목표 맵' : '회고'}
            </button>
          ))}
        </div>

        {(view === 'map' || view === 'retro') && (
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">‹</button>
            <p className="text-[13px] font-medium text-[#1F2933] w-[64px] text-center">{selectedYear}년</p>
            <button onClick={() => setSelectedYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">›</button>
          </div>
        )}
      </div>

      {view === 'map' && (
        <GoalMap
          goals={goals}
          year={selectedYear}
          onEditGoal={g => setModal({ mode: 'edit', goal: g })}
          onCreateGoal={group => openCreate(group)}
          onDeleteGoal={handleDeleteClick}
        />
      )}

      {view === 'retro' && <RetroPanel year={selectedYear} />}

      {view === 'manage' && (
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          {GOAL_LEVELS.map(l => (
            <button
              key={l} onClick={() => setActiveLevel(l)}
              className={`text-[12px] px-2.5 py-1 rounded-md transition-colors ${activeLevel === l ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
            >
              {GOAL_LEVEL_LABEL[l]}
            </button>
          ))}
        </div>

        {activeLevel === 'month' ? (
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedMonth(m => { if (m === 1) { setSelectedYear(y => y - 1); return 12 } return m - 1 })} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">‹</button>
            <p className="text-[13px] font-medium text-[#1F2933] w-[92px] text-center">{selectedYear}년 {selectedMonth}월</p>
            <button onClick={() => setSelectedMonth(m => { if (m === 12) { setSelectedYear(y => y + 1); return 1 } return m + 1 })} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">›</button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">‹</button>
            <p className="text-[13px] font-medium text-[#1F2933] w-[64px] text-center">{selectedYear}년</p>
            <button onClick={() => setSelectedYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">›</button>
          </div>
        )}
      </div>
      )}

      {view === 'manage' && activeLevel === 'yearly' && (
        <div className="border border-[#E5E8EB] rounded-xl p-4 bg-white">
          <GoalList
            title="연간 목표"
            items={siblingsOf(goals, { level: 'yearly', year: selectedYear })}
            group={{ level: 'yearly', year: selectedYear }}
            onAdd={() => openCreate({ level: 'yearly', year: selectedYear })}
            {...dndProps}
          />
        </div>
      )}

      {view === 'manage' && activeLevel === 'half' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-[#E5E8EB] rounded-xl p-4 bg-white">
            <GoalList
              title="상반기"
              items={siblingsOf(goals, { level: 'half', year: selectedYear, half: 'h1' })}
              group={{ level: 'half', year: selectedYear, half: 'h1' }}
              onAdd={() => openCreate({ level: 'half', year: selectedYear, half: 'h1' })}
              {...dndProps}
            />
          </div>
          <div className="border border-[#E5E8EB] rounded-xl p-4 bg-white">
            <GoalList
              title="하반기"
              items={siblingsOf(goals, { level: 'half', year: selectedYear, half: 'h2' })}
              group={{ level: 'half', year: selectedYear, half: 'h2' }}
              onAdd={() => openCreate({ level: 'half', year: selectedYear, half: 'h2' })}
              {...dndProps}
            />
          </div>
        </div>
      )}

      {view === 'manage' && activeLevel === 'quarter' && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            {([1, 2, 3, 4] as const).map(q => (
              <button
                key={q}
                onClick={() => setSelectedQuarter(q)}
                onDragOver={e => { if (dragGoalLevel === 'quarter' && q !== selectedQuarter) e.preventDefault() }}
                onDrop={e => { e.preventDefault(); if (dragGoalLevel === 'quarter') { moveToGroup({ level: 'quarter', year: selectedYear, quarter: q }); setSelectedQuarter(q) } }}
                className={`text-[12px] px-2.5 py-1 rounded-md transition-colors border ${selectedQuarter === q ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]' : 'bg-white text-[#7A8491] border-gray-200 hover:bg-black/[0.04]'}`}
              >
                {q}분기
              </button>
            ))}
          </div>
          <div className="border border-[#E5E8EB] rounded-xl p-4 bg-white">
            <GoalList
              title={`${selectedQuarter}분기 목표`}
              items={siblingsOf(goals, { level: 'quarter', year: selectedYear, quarter: selectedQuarter })}
              group={{ level: 'quarter', year: selectedYear, quarter: selectedQuarter }}
              onAdd={() => openCreate({ level: 'quarter', year: selectedYear, quarter: selectedQuarter })}
              {...dndProps}
            />
          </div>
        </div>
      )}

      {view === 'manage' && activeLevel === 'month' && (
        <div className="border border-[#E5E8EB] rounded-xl p-4 bg-white">
          <GoalList
            title={`${selectedMonth}월 목표`}
            items={siblingsOf(goals, { level: 'month', year: selectedYear, month: selectedMonth })}
            group={{ level: 'month', year: selectedYear, month: selectedMonth }}
            onAdd={() => openCreate({ level: 'month', year: selectedYear, month: selectedMonth })}
            {...dndProps}
          />
        </div>
      )}

      {modal && (
        <GoalModal
          initial={modal.mode === 'edit' ? modal.goal : undefined}
          defaultLevel={modal.mode === 'create' ? modal.group.level : undefined}
          defaultYear={modal.mode === 'create' ? modal.group.year : undefined}
          defaultHalf={modal.mode === 'create' ? modal.group.half : undefined}
          defaultQuarter={modal.mode === 'create' ? modal.group.quarter : undefined}
          defaultMonth={modal.mode === 'create' ? modal.group.month : undefined}
          onClose={() => setModal(null)}
          onSubmit={payload => modal.mode === 'create' ? submitCreate(payload) : submitEdit(modal.goal.id, payload)}
        />
      )}
    </div>
  )
}
