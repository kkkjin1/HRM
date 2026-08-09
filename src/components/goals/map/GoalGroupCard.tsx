'use client'

import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { GOAL_LEVEL_LABEL } from '@/lib/goalLevels'
import type { Goal } from '../types'

const VISIBLE_LIMIT = 6

export default function GoalGroupCard({ data }: {
  data: {
    goals: Goal[]
    onAdd: () => void
    onEditGoal: (g: Goal) => void
    onDeleteGoal: (g: Goal) => void
    onAddRelated: (goalId: string) => void
  }
}) {
  const [showAll, setShowAll] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const { goals } = data
  const title = `${GOAL_LEVEL_LABEL[goals[0].level]} 목표`
  const visible = showAll ? goals : goals.slice(0, VISIBLE_LIMIT)
  const hiddenCount = goals.length - visible.length

  return (
    <div className="bg-white border border-[#E5E8EB] rounded-lg shadow-sm" style={{ width: 230 }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div className="flex items-center justify-between px-3 py-2 border-b border-[#F0F1F2]">
        <span className="text-[12px] font-semibold text-[#1F2933]">{title}</span>
        <button type="button" onClick={data.onAdd} className="nodrag text-[11px] font-medium text-[#4C7FE0] hover:text-[#3A6CC8]">+ 목표</button>
      </div>

      <div className="py-1">
        {visible.map(g => (
          <div key={g.id} className="group/row relative flex items-center gap-1.5 px-3 py-1.5 border-b border-[#F7F8F8] last:border-b-0">
            <span className="text-[13px] leading-none flex-shrink-0">{g.icon}</span>
            <span className="text-[11.5px] text-[#1F2933] truncate flex-1" title={g.name}>{g.name}</span>
            <button
              type="button"
              onClick={() => data.onAddRelated(g.id)}
              title="연관 항목 추가"
              className="nodrag opacity-0 group-hover/row:opacity-100 w-4 h-4 rounded-full text-[#7A8491] hover:text-[#4C7FE0] flex items-center justify-center text-[11px] leading-none flex-shrink-0"
            >
              +
            </button>
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpenId(p => p === g.id ? null : g.id)}
                className="nodrag opacity-0 group-hover/row:opacity-100 text-[11px] text-[#7A8491] hover:text-[#1F2933] px-1"
              >
                ···
              </button>
              {menuOpenId === g.id && (
                <div className="nodrag absolute right-0 top-5 bg-white border border-[#EEF0F2] rounded-lg shadow-sm py-1 w-20 z-10">
                  <button type="button" onClick={() => { setMenuOpenId(null); data.onEditGoal(g) }} className="w-full text-left text-[11px] text-[#7A8491] hover:bg-[#F7F8F8] px-2.5 py-1.5">수정</button>
                  <button type="button" onClick={() => { setMenuOpenId(null); data.onDeleteGoal(g) }} className="w-full text-left text-[11px] text-red-500 hover:bg-[#F7F8F8] px-2.5 py-1.5">삭제</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {hiddenCount > 0 && (
          <button type="button" onClick={() => setShowAll(true)} className="nodrag w-full text-left text-[11px] text-[#7A8491] hover:text-[#4C7FE0] px-3 py-1.5">
            + {hiddenCount}개 더 보기
          </button>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
