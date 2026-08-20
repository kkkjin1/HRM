'use client'

import { useEffect, useRef, useState } from 'react'
import { EMOJI_LIBRARY, EMOJI_CATEGORIES, type Category } from '@/lib/emoji'

type Props = {
  onPick: (emoji: string) => void
  onOpenChange?: (open: boolean) => void
}

export default function EmojiPicker({ onPick, onOpenChange }: Props) {
  const [open, setOpenState] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>(EMOJI_CATEGORIES[0].key)
  const ref = useRef<HTMLDivElement>(null)

  function setOpen(v: boolean) {
    setOpenState(v)
    onOpenChange?.(v)
  }

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? EMOJI_LIBRARY.filter(e => e.keywords.some(k => k.toLowerCase().includes(q)))
    : EMOJI_LIBRARY.filter(e => e.category === category)

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[11px] rounded-full px-2 py-1 border border-dashed border-[#D8D8D2] text-[#9C9C96] hover:bg-[#F7F7F5] flex-shrink-0"
      >
        + 이모지
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1.5 w-[320px] bg-white border border-[#E8E8E4] rounded-xl shadow-lg p-2.5">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="검색 (예: 발바닥, 동물)"
            className="w-full text-[12px] border border-[#E8E8E4] rounded-md px-2 py-1.5 mb-2 focus:outline-none focus:border-[#5B54C4]"
          />
          {!q && (
            <div className="flex flex-wrap gap-1 mb-2">
              {EMOJI_CATEGORIES.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`text-[11px] whitespace-nowrap rounded-full px-2 py-1 ${
                    category === c.key ? 'bg-[#5B54C4] text-white' : 'bg-[#F7F7F5] text-[#9C9C96] hover:bg-[#F0EFFC]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-8 gap-0.5 max-h-[176px] overflow-y-auto">
            {filtered.map(e => (
              <button
                key={e.emoji}
                type="button"
                onClick={() => { onPick(e.emoji); setOpen(false); setQuery('') }}
                title={e.keywords[0]}
                className="text-[16px] rounded-md py-1 hover:bg-[#F0EFFC]"
              >
                {e.emoji}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-8 text-[11.5px] text-[#B0B8C1] text-center py-3">검색 결과 없음</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
