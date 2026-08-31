'use client'

import { useEffect, useRef, useState } from 'react'

const AUTOSAVE_DELAY_MS = 1200

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved'

// 회고류 텍스트 입력칸 하나. 타이핑을 멈추면 자동 저장되고, "저장" 버튼으로 즉시 저장할 수도 있다.
// 부모가 대상(연/월/작성자 등)별로 다른 key를 줘서 대상이 바뀌면 이 컴포넌트 자체가 새로 마운트된다 —
// 그래서 value 변화를 되쫓는 동기화 effect 없이 useState 초기값만으로 충분하다.
export default function RetroTextarea({ value, placeholder, rows, onSave }: {
  value: string
  placeholder: string
  rows: number
  onSave: (content: string) => Promise<void>
}) {
  const [text, setText] = useState(value)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const savedRef = useRef(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  async function commit(next: string) {
    if (next === savedRef.current) { setStatus('idle'); return }
    setStatus('saving')
    await onSave(next)
    savedRef.current = next
    setStatus('saved')
    setTimeout(() => setStatus(prev => (prev === 'saved' ? 'idle' : prev)), 1500)
  }

  function handleChange(next: string) {
    setText(next)
    setStatus('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => commit(next), AUTOSAVE_DELAY_MS)
  }

  function handleSaveClick() {
    if (timerRef.current) clearTimeout(timerRef.current)
    commit(text)
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full border border-[#E5E8EB] rounded-lg px-3.5 py-3 text-[13.5px] leading-relaxed text-[#1F2933] focus:outline-none focus:border-[#4C7FE0] resize-none"
      />
      <div className="flex items-center justify-end gap-2 mt-1.5">
        <span className="text-[11px] text-[#B0B8C1]">
          {status === 'saving' ? '저장 중...' : status === 'saved' ? '저장됨' : status === 'pending' ? '자동 저장 대기 중' : ''}
        </span>
        <button
          type="button"
          onClick={handleSaveClick}
          className="text-[11.5px] font-medium text-[#4C7FE0] hover:text-[#3A6CC8] px-2 py-1 rounded-md hover:bg-black/[0.04]"
        >
          저장
        </button>
      </div>
    </div>
  )
}
