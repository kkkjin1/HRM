'use client'

import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { RELATED_ITEM_TYPE_LABEL, type RelatedItem } from './mapTypes'

export default function RelatedItemNode({ data }: {
  data: { item: RelatedItem; onEdit: () => void; onDelete: () => void }
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="bg-white border border-[#EEF0F2] rounded-md px-2 py-1.5" style={{ width: 120 }}>
        <div className="text-[9.5px] text-[#B0B8C1] mb-0.5">{RELATED_ITEM_TYPE_LABEL[data.item.type]}</div>
        <div className="text-[11px] text-[#1F2933] truncate">{data.item.title}</div>
      </div>
      <button
        type="button"
        onClick={() => setMenuOpen(p => !p)}
        className="nodrag absolute -right-1.5 -top-1.5 w-4 h-4 rounded-full bg-white border border-[#E5E8EB] text-[8px] text-[#7A8491] opacity-0 group-hover:opacity-100 flex items-center justify-center"
      >
        ···
      </button>
      {menuOpen && (
        <div className="nodrag absolute right-0 top-5 bg-white border border-[#EEF0F2] rounded-lg shadow-sm py-1 w-20 z-10">
          <button type="button" onClick={() => { setMenuOpen(false); data.onEdit() }} className="w-full text-left text-[11px] text-[#7A8491] hover:bg-[#F7F8F8] px-2 py-1">수정</button>
          <button type="button" onClick={() => { setMenuOpen(false); data.onDelete() }} className="w-full text-left text-[11px] text-red-500 hover:bg-[#F7F8F8] px-2 py-1">삭제</button>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
