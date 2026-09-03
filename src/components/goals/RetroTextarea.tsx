'use client'

import { useEffect, useRef, useState } from 'react'
import { renderRetroMarkup } from './retroMarkup'

const AUTOSAVE_DELAY_MS = 1200

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const TOOLBAR_BTN_CLASS = 'w-6 h-6 flex items-center justify-center rounded text-[12px] text-[#7A8491] hover:bg-black/[0.04] hover:text-[#1F2933]'

// 회고류 텍스트 입력칸 하나. 타이핑을 멈추면 자동 저장되고, "저장" 버튼으로 즉시 저장할 수도 있다.
// **볼드**/*기울임*/"- " 목록 표기를 지원한다 — 편집 중엔 원문 그대로, 편집을 벗어나면(blur) 서식이 적용된 보기로 바뀐다.
// 부모가 대상(연/월/작성자 등)별로 다른 key를 줘서 대상이 바뀌면 이 컴포넌트 자체가 새로 마운트된다 —
// 그래서 value 변화를 되쫓는 동기화 effect 없이 useState 초기값만으로 충분하다.
// onSave는 실패 시 반드시 throw해야 한다 — 그래야 "저장됨"이 거짓으로 표시되지 않는다.
export default function RetroTextarea({ value, placeholder, rows, onSave }: {
  value: string
  placeholder: string
  rows: number
  onSave: (content: string) => Promise<void>
}) {
  const [text, setText] = useState(value)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [editing, setEditing] = useState(!value.trim())
  const savedRef = useRef(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  async function commit(next: string) {
    if (next === savedRef.current) { setStatus('idle'); return }
    setStatus('saving')
    try {
      await onSave(next)
      savedRef.current = next
      setStatus('saved')
      setTimeout(() => setStatus(prev => (prev === 'saved' ? 'idle' : prev)), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('회고 저장 실패:', err)
      setErrorMsg(message)
      setStatus('error')
    }
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

  async function handleBlur() {
    if (timerRef.current) { clearTimeout(timerRef.current); await commit(text) }
    if (text.trim()) setEditing(false)
  }

  function wrapSelection(before: string, after: string, placeholderWord: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = text.slice(start, end) || placeholderWord
    const next = text.slice(0, start) + before + selected + after + text.slice(end)
    handleChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = start + before.length
      el.selectionEnd = start + before.length + selected.length
    })
  }

  function toggleListPrefix() {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const lineStart = text.lastIndexOf('\n', start - 1) + 1
    const lineEndIdx = text.indexOf('\n', end)
    const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx
    const lines = text.slice(lineStart, lineEnd).split('\n')
    const allListed = lines.every(l => l.startsWith('- '))
    const nextBlock = lines.map(l => (allListed ? l.slice(2) : `- ${l}`)).join('\n')
    handleChange(text.slice(0, lineStart) + nextBlock + text.slice(lineEnd))
    requestAnimationFrame(() => el.focus())
  }

  const statusLabel = status === 'saving' ? '저장 중...' : status === 'saved' ? '저장됨' : status === 'pending' ? '자동 저장 대기 중' : status === 'error' ? `저장 실패${errorMsg ? `: ${errorMsg}` : ''}` : ''

  return (
    <div>
      {editing ? (
        <>
          <div className="flex items-center gap-1 mb-1">
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => wrapSelection('**', '**', '볼드')} className={`${TOOLBAR_BTN_CLASS} font-bold`}>B</button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => wrapSelection('*', '*', '기울임')} className={`${TOOLBAR_BTN_CLASS} italic`}>i</button>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={toggleListPrefix} className={`${TOOLBAR_BTN_CLASS} text-[14px]`}>•</button>
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => handleChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder}
            rows={rows}
            className="w-full border border-[#E5E8EB] rounded-lg px-3.5 py-3 text-[13.5px] leading-relaxed text-[#1F2933] focus:outline-none focus:border-[#4C7FE0] resize-none"
          />
          <div className="flex items-center justify-end gap-2 mt-1.5">
            <span className={`text-[11px] ${status === 'error' ? 'text-red-500' : 'text-[#B0B8C1]'}`}>{statusLabel}</span>
            <button type="button" onClick={handleSaveClick} className="text-[11.5px] font-medium text-[#4C7FE0] hover:text-[#3A6CC8] px-2 py-1 rounded-md hover:bg-black/[0.04]">저장</button>
          </div>
        </>
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="w-full min-h-[2.5rem] border border-transparent hover:border-[#E5E8EB] rounded-lg px-3.5 py-3 text-[13.5px] leading-relaxed text-[#1F2933] whitespace-pre-wrap break-words cursor-text"
        >
          {renderRetroMarkup(text)}
        </div>
      )}
    </div>
  )
}
