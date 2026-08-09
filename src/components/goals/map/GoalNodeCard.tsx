'use client'

import { Handle, Position } from '@xyflow/react'
import { periodLabel } from '../goalUtils'
import type { Goal } from '../types'

export default function GoalNodeCard({ data }: {
  data: { goal: Goal; onClick: () => void; onAddRelated: () => void }
}) {
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <button
        type="button"
        onClick={data.onClick}
        title={data.goal.name}
        className="nodrag text-left bg-white border border-[#E5E8EB] rounded-lg px-3 py-2 shadow-sm hover:border-[#4C7FE0]/50 transition-colors block"
        style={{ width: 180 }}
      >
        <div className="text-[15px] leading-none mb-1">{data.goal.icon}</div>
        <div className="text-[12.5px] text-[#1F2933] font-medium leading-snug line-clamp-2">{data.goal.name}</div>
        <div className="text-[10.5px] text-[#B0B8C1] mt-1">{periodLabel(data.goal)}</div>
      </button>
      <button
        type="button"
        onClick={data.onAddRelated}
        title="관련 항목 추가"
        className="nodrag absolute -right-2 -top-2 w-5 h-5 rounded-full bg-white border border-[#E5E8EB] text-[#7A8491] text-[12px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 hover:border-[#4C7FE0] hover:text-[#4C7FE0]"
      >
        +
      </button>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
