'use client'

import { Handle, Position } from '@xyflow/react'

export default function PeriodNode({ data }: {
  data: { label: string; depth: number; collapsible: boolean; collapsed: boolean; hasContent: boolean; onToggle?: () => void }
}) {
  const isRoot = data.depth === 0
  return (
    <div
      className={`px-3 py-2 rounded-lg border text-[12.5px] font-medium flex items-center gap-1.5 select-none ${
        isRoot ? 'bg-[#1F2933] text-white border-[#1F2933]' : 'bg-[#F7F8F8] text-[#1F2933] border-[#E5E8EB]'
      }`}
      style={{ minWidth: 88 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      {data.collapsible && (
        <button type="button" onClick={data.onToggle} className="nodrag text-[10px] leading-none text-[#7A8491] hover:text-[#1F2933]">
          {data.collapsed ? '▸' : '▼'}
        </button>
      )}
      <span className={!data.hasContent ? 'opacity-45' : ''}>{data.label}</span>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
