'use client'

import { useRef, useState } from 'react'
import { CUSTOM_BLOCK_ICONS, CUSTOM_BLOCK_LABEL_MAX, DEFAULT_CUSTOM_BLOCK_ICON } from '@/lib/customMeetingBlocks'

// 회의창 박스 아이콘 + 이름 입력칸 — 글자를 칠 때마다 page 전체가 다시 그려지지 않게 입력값을 이 칸 안에만 둔다.
// Enter = 확정, Esc = 취소, 이 칸(아이콘 목록 포함) 밖으로 벗어나면 확정(이름이 비었으면 취소). 한글 조합 중 Enter는 무시한다.
export default function BlockNameInput({ initial = '', initialIcon = DEFAULT_CUSTOM_BLOCK_ICON, placeholder, onSubmit, onCancel }: {
  initial?: string
  initialIcon?: string
  placeholder?: string
  onSubmit: (label: string, icon: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const doneRef = useRef(false)
  const [icon, setIcon] = useState(initialIcon)
  const [picking, setPicking] = useState(false)
  const finish = (save: boolean) => {
    if (doneRef.current) return
    doneRef.current = true
    const v = ref.current?.value.trim() ?? ''
    if (save && v) onSubmit(v, icon)
    else onCancel()
  }
  return (
    <span
      className="relative inline-flex items-center gap-1.5"
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) finish(true) }}
    >
      <button
        type="button"
        onClick={() => setPicking(p => !p)}
        title="아이콘 고르기"
        className="w-8 h-8 flex items-center justify-center text-[17px] border border-[#E5E8EB] hover:border-[#4C7FE0] rounded-md bg-white"
      >{icon}</button>
      <input
        ref={ref}
        autoFocus
        defaultValue={initial}
        maxLength={CUSTOM_BLOCK_LABEL_MAX}
        placeholder={placeholder}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') { e.preventDefault(); finish(true) }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false) }
        }}
        className="text-[15px] font-semibold text-[#1F2933] border border-[#4C7FE0] rounded-md px-2 py-0.5 h-8 w-[240px] max-w-full focus:outline-none"
      />
      {picking && (
        <span className="absolute left-0 top-full mt-1 z-30 grid grid-cols-10 gap-0.5 p-1.5 bg-white border border-[#E5E8EB] rounded-lg shadow-lg w-max">
          {CUSTOM_BLOCK_ICONS.map(ic => (
            <button
              key={ic}
              type="button"
              onClick={() => { setIcon(ic); setPicking(false); ref.current?.focus() }}
              className={`w-8 h-8 flex items-center justify-center text-[17px] rounded hover:bg-[#EEF4FD] ${ic === icon ? 'bg-[#EEF4FD] ring-1 ring-[#4C7FE0]' : ''}`}
            >{ic}</button>
          ))}
        </span>
      )}
    </span>
  )
}
