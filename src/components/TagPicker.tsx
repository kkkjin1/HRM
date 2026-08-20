'use client'

import { useEffect, useRef, useState } from 'react'
import type { Member } from '@/lib/members'

type Props = {
  members: Member[]
  onPick: (name: string) => void
}

export default function TagPicker({ members, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-[11px] rounded-full px-2 py-1 border border-dashed border-[#D8D8D2] text-[#9C9C96] hover:bg-[#F7F7F5] flex-shrink-0"
      >
        @ 태그
      </button>
      {open && (
        <div className="absolute z-20 bottom-full left-0 mb-1.5 w-[160px] bg-white border border-[#E8E8E4] rounded-xl shadow-lg p-1.5 max-h-[200px] overflow-y-auto">
          {members.length === 0 && <p className="text-[11.5px] text-[#B0B8C1] text-center py-2">멤버 없음</p>}
          {members.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onPick(m.name); setOpen(false) }}
              className="w-full text-left text-[12.5px] rounded-lg px-2 py-1.5 hover:bg-[#F0EFFC]"
            >
              @{m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
