'use client'

import { useRef, useState } from 'react'
import {
  CUSTOM_BLOCK_COLUMN_LABEL_MAX, CUSTOM_BLOCK_ICONS, CUSTOM_BLOCK_LABEL_MAX, DEFAULT_CUSTOM_BLOCK_ICON,
  type CustomBlockColumn,
} from '@/lib/customMeetingBlocks'

export type BlockEditorValue = { icon: string; label: string; capture: boolean; columns: CustomBlockColumn[] }

// 회의창 박스 만들기·고치기 칸 — 아이콘 · 이름 · 캡처 켬/끔 · 1칸/1행 2열(칸 이름).
// 글자를 칠 때마다 page 전체가 다시 그려지지 않게 입력값을 이 칸 안에만 둔다.
// Enter = 확정(한글 조합 중 Enter는 무시), Esc = 취소. 이름이 비었으면 확정 버튼이 꺼진다.
export default function BlockNameInput({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: Partial<BlockEditorValue>
  submitLabel: string
  onSubmit: (v: BlockEditorValue) => void
  onCancel: () => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const col1Ref = useRef<HTMLInputElement>(null)
  const col2Ref = useRef<HTMLInputElement>(null)
  const [icon, setIcon] = useState(initial?.icon ?? DEFAULT_CUSTOM_BLOCK_ICON)
  const [picking, setPicking] = useState(false)
  const [capture, setCapture] = useState(initial?.capture ?? true)
  const [twoCols, setTwoCols] = useState((initial?.columns?.length ?? 1) === 2)
  const [hasName, setHasName] = useState(!!initial?.label?.trim())

  const submit = () => {
    const label = nameRef.current?.value.trim() ?? ''
    if (!label) { nameRef.current?.focus(); return }
    const c1 = col1Ref.current?.value.trim() ?? ''
    const c2 = col2Ref.current?.value.trim() ?? ''
    onSubmit({ icon, label, capture, columns: twoCols ? [{ label: c1 }, { label: c2 }] : [{ label: '' }] })
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') { e.preventDefault(); submit() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
  }
  const toggle = (on: boolean, set: (v: boolean) => void, onText: string, offText: string) => (
    <span className="inline-flex rounded-md border border-[#E5E8EB] overflow-hidden text-[12px]">
      {[true, false].map(v => (
        <button key={String(v)} type="button" onClick={() => set(v)}
          className={`px-2.5 py-1 ${on === v ? 'bg-[#4C7FE0] text-white' : 'bg-white text-[#7A8491] hover:bg-[#F3F6FA]'}`}>
          {v ? onText : offText}
        </button>
      ))}
    </span>
  )

  return (
    <span className="inline-flex flex-col gap-2" onKeyDown={onKey}>
      <span className="relative inline-flex items-center gap-1.5 flex-wrap">
        <button type="button" onClick={() => setPicking(p => !p)} title="아이콘 고르기"
          className="w-8 h-8 flex items-center justify-center text-[17px] border border-[#E5E8EB] hover:border-[#4C7FE0] rounded-md bg-white">{icon}</button>
        <input ref={nameRef} autoFocus defaultValue={initial?.label ?? ''} maxLength={CUSTOM_BLOCK_LABEL_MAX}
          placeholder="박스 이름 (예: 휴직/기타)" onChange={e => setHasName(!!e.target.value.trim())}
          className="text-[15px] font-semibold text-[#1F2933] border border-[#4C7FE0] rounded-md px-2 py-0.5 h-8 w-[240px] max-w-full focus:outline-none" />
        {picking && (
          <span className="absolute left-0 top-full mt-1 z-30 grid grid-cols-10 gap-0.5 p-1.5 bg-white border border-[#E5E8EB] rounded-lg shadow-lg w-max">
            {CUSTOM_BLOCK_ICONS.map(ic => (
              <button key={ic} type="button" onClick={() => { setIcon(ic); setPicking(false); nameRef.current?.focus() }}
                className={`w-8 h-8 flex items-center justify-center text-[17px] rounded hover:bg-[#EEF4FD] ${ic === icon ? 'bg-[#EEF4FD] ring-1 ring-[#4C7FE0]' : ''}`}>{ic}</button>
            ))}
          </span>
        )}
      </span>
      <span className="inline-flex items-center gap-3 flex-wrap text-[12px] text-[#5B6570]">
        <span className="inline-flex items-center gap-1.5">캡처 {toggle(capture, setCapture, '켬', '끔')}</span>
        <span className="inline-flex items-center gap-1.5">칸 {toggle(!twoCols, v => setTwoCols(!v), '1칸', '1행 2열')}</span>
      </span>
      {twoCols && (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <input ref={col1Ref} defaultValue={initial?.columns?.[0]?.label ?? ''} maxLength={CUSTOM_BLOCK_COLUMN_LABEL_MAX} placeholder="왼쪽 칸 이름 (예: 휴직)"
            className="text-[12.5px] border border-[#E5E8EB] focus:border-[#4C7FE0] rounded-md px-2 h-7 w-[180px] focus:outline-none" />
          <input ref={col2Ref} defaultValue={initial?.columns?.[1]?.label ?? ''} maxLength={CUSTOM_BLOCK_COLUMN_LABEL_MAX} placeholder="오른쪽 칸 이름 (예: 기타)"
            className="text-[12.5px] border border-[#E5E8EB] focus:border-[#4C7FE0] rounded-md px-2 h-7 w-[180px] focus:outline-none" />
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <button type="button" onClick={submit} disabled={!hasName}
          className="text-[12px] px-3 py-1 rounded-md bg-[#4C7FE0] text-white disabled:opacity-40">{submitLabel}</button>
        <button type="button" onClick={onCancel} className="text-[12px] px-3 py-1 rounded-md text-[#7A8491] hover:bg-black/[0.04]">취소</button>
        <span className="text-[11px] text-[#9AA3AE]">Enter 확정 · Esc 취소</span>
      </span>
    </span>
  )
}
