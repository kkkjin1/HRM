'use client'

import { Handle, Position } from '@xyflow/react'

export default function PeriodNode({ data }: {
  data: {
    label: string
    depth: number
    compact: boolean
    collapsible: boolean
    collapsed: boolean
    hasContent: boolean
    onToggle?: () => void
    onQuickAdd?: () => void
  }
}) {
  const isRoot = data.depth === 0

  return (
    <div
      className={`group relative flex items-center select-none ${
        isRoot
          ? 'gap-1.5 px-3 py-2 rounded-lg bg-[#1F2933] text-white text-[12.5px] font-medium'
          : data.compact
            ? 'gap-1 px-2 py-1 rounded-md bg-[#F7F8F8] border border-[#E5E8EB] text-[11px] font-medium text-[#1F2933]'
            : 'gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7F8F8] border border-[#E5E8EB] text-[12.5px] font-medium text-[#1F2933]'
      }`}
      style={{ minWidth: data.compact ? 52 : 88 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      {data.collapsible && (
        <button type="button" onClick={data.onToggle} className={`nodrag leading-none text-[#7A8491] hover:text-[#1F2933] ${data.compact ? 'text-[9px]' : 'text-[10px]'}`}>
          {data.collapsed ? '▸' : '▼'}
        </button>
      )}
      <span className={!data.hasContent ? 'opacity-45' : ''}>{data.label}</span>
      {data.onQuickAdd && (
        <button
          type="button"
          onClick={data.onQuickAdd}
          title="목표 추가"
          className="nodrag opacity-0 group-hover:opacity-100 w-4 h-4 rounded-full bg-white border border-[#E5E8EB] text-[#7A8491] hover:text-[#4C7FE0] hover:border-[#4C7FE0] flex items-center justify-center text-[10px] leading-none ml-0.5 flex-shrink-0"
        >
          +
        </button>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
