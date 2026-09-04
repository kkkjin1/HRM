'use client'

import { useEffect, useRef, useState } from 'react'
import { renderRetroMarkup, markupToHtml } from './retroMarkup'

const AUTOSAVE_DELAY_MS = 1200

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const TOOLBAR_BTN_CLASS = 'w-6 h-6 flex items-center justify-center rounded text-[12px] text-[#7A8491] hover:bg-black/[0.04] hover:text-[#1F2933]'
const EDITOR_CLASS = 'w-full border border-[#E5E8EB] rounded-lg text-[13.5px] leading-relaxed text-[#1F2933] focus:outline-none focus:border-[#4C7FE0] whitespace-pre-wrap break-words overflow-y-auto [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-0.5'

// 줄 하나(최상위 div 또는 목록의 li 하나)를 **볼드**/*기울임* 마크다운 텍스트로 되돌린다.
function inlineToMarkup(node: Node): string {
  let out = ''
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? ''
      return
    }
    if (!(child instanceof HTMLElement)) return
    const tag = child.tagName
    if (tag === 'BR') { out += ''; return }
    if (tag === 'B' || tag === 'STRONG') { out += `**${inlineToMarkup(child)}**`; return }
    if (tag === 'I' || tag === 'EM') { out += `*${inlineToMarkup(child)}*`; return }
    out += inlineToMarkup(child)
  })
  return out
}

// contentEditable의 현재 DOM을 원본 저장 형식(마크다운 텍스트)으로 직렬화한다.
// DOM을 읽기만 하고 건드리지 않으므로 타이핑 중 커서 위치나 한글 조합에 영향이 없다.
function domToMarkup(container: HTMLElement): string {
  const lines: string[] = []
  container.childNodes.forEach(node => {
    if (node instanceof HTMLElement && node.tagName === 'UL') {
      node.querySelectorAll(':scope > li').forEach(li => lines.push(`- ${inlineToMarkup(li)}`))
      return
    }
    if (node.nodeType === Node.TEXT_NODE) { lines.push(node.textContent ?? ''); return }
    if (node instanceof HTMLElement) { lines.push(inlineToMarkup(node)); return }
  })
  return lines.join('\n')
}

// 회고류 텍스트 입력칸 하나. 타이핑을 멈추면 자동 저장되고, "저장" 버튼으로 즉시 저장할 수도 있다.
// 편집 중에도 볼드/기울임/목록이 실제 서식으로 바로 보인다(B/i/• 버튼 = 브라우저 네이티브 서식 적용) —
// 편집을 벗어나면(blur) 읽기 전용 보기로 바뀐다.
// 부모가 대상(연/월/작성자 등)별로 다른 key를 줘서 대상이 바뀌면 이 컴포넌트 자체가 새로 마운트된다 —
// 그래서 value 변화를 되쫓는 동기화 effect 없이 useState 초기값만으로 충분하다.
// onSave는 실패 시 반드시 throw해야 한다 — 그래야 "저장됨"이 거짓으로 표시되지 않는다.
// readOnly: 쓰기 권한이 없는 사용자에게 보여줄 때 true — 편집 모드 진입 자체를 막고 항상 보기 모드로만 렌더링한다.
// compact: 질문/답변처럼 짧은 한두 줄짜리 칸 전용 — 서식(B/i/•) 툴바를 없애고 여백을 줄여 세로 길이를 줄인다.
// toolbar: false면 compact 여부와 무관하게 서식 툴바만 숨긴다(칸 크기·여백은 그대로 유지).
export default function RetroTextarea({ value, placeholder, rows, heightVh = 55, fixedHeight = false, onSave, readOnly = false, compact = false, toolbar = true }: {
  value: string
  placeholder: string
  rows: number
  heightVh?: number
  fixedHeight?: boolean
  onSave: (content: string) => Promise<void>
  readOnly?: boolean
  compact?: boolean
  toolbar?: boolean
}) {
  const [text, setText] = useState(value)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [editing, setEditing] = useState(!readOnly && !value.trim())
  const savedRef = useRef(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  // 편집 모드에 들어갈 때 한 번만 저장된 마크다운을 실제 서식(HTML)으로 풀어 채운다.
  // 이후 타이핑은 브라우저가 직접 DOM을 갱신하므로 여기서 다시 손대지 않는다(커서 튐 방지).
  useEffect(() => {
    if (!editing || !editorRef.current) return
    try { document.execCommand('defaultParagraphSeparator', false, 'div') } catch {}
    editorRef.current.innerHTML = markupToHtml(text)
    editorRef.current.focus()
    const range = document.createRange()
    range.selectNodeContents(editorRef.current)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

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

  function handleInput() {
    if (!editorRef.current) return
    handleChange(domToMarkup(editorRef.current))
  }

  function handleSaveClick() {
    if (timerRef.current) clearTimeout(timerRef.current)
    commit(text)
  }

  async function handleBlur() {
    if (timerRef.current) { clearTimeout(timerRef.current); await commit(text) }
    if (text.trim()) setEditing(false)
  }

  function applyFormat(command: 'bold' | 'italic' | 'insertUnorderedList') {
    editorRef.current?.focus()
    document.execCommand(command)
    handleInput()
  }

  const statusLabel = status === 'saving' ? '저장 중...' : status === 'saved' ? '저장됨' : status === 'pending' ? '자동 저장 대기 중' : status === 'error' ? `저장 실패${errorMsg ? `: ${errorMsg}` : ''}` : ''

  const padClass = compact ? 'px-2.5 py-1.5' : 'px-3.5 py-3'

  return (
    <div>
      {editing ? (
        <>
          {!compact && toolbar && (
            <div className="flex items-center gap-1 mb-1">
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('bold')} className={`${TOOLBAR_BTN_CLASS} font-bold`}>B</button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('italic')} className={`${TOOLBAR_BTN_CLASS} italic`}>i</button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('insertUnorderedList')} className={`${TOOLBAR_BTN_CLASS} text-[14px]`}>•</button>
            </div>
          )}
          <div className="relative">
            {!text.trim() && (
              <span className={`absolute inset-0 ${padClass} text-[13.5px] leading-relaxed text-[#B0B8C1] pointer-events-none`}>{placeholder}</span>
            )}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onBlur={handleBlur}
              style={fixedHeight ? { height: `${heightVh}vh` } : { minHeight: `${(compact ? Math.min(rows, 1.3) : rows) * 1.8}em`, maxHeight: `${heightVh}vh` }}
              className={`${EDITOR_CLASS} ${padClass}`}
            />
          </div>
          <div className={`flex items-center justify-end gap-2 ${compact ? 'mt-1' : 'mt-1.5'}`}>
            <span className={`text-[11px] ${status === 'error' ? 'text-red-500' : 'text-[#B0B8C1]'}`}>{statusLabel}</span>
            <button type="button" onClick={handleSaveClick} className="text-[11.5px] font-medium text-[#4C7FE0] hover:text-[#3A6CC8] px-2 py-1 rounded-md hover:bg-black/[0.04]">저장</button>
          </div>
        </>
      ) : (
        <div
          onClick={() => { if (!readOnly) setEditing(true) }}
          className={`w-full ${compact ? 'min-h-[1.75rem]' : 'min-h-[2.5rem]'} border border-transparent rounded-lg ${padClass} text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${readOnly ? 'text-[#1F2933]' : 'hover:border-[#E5E8EB] cursor-text text-[#1F2933]'}`}
        >
          {text.trim() ? renderRetroMarkup(text) : <span className="text-[#B0B8C1]">{placeholder}</span>}
        </div>
      )}
    </div>
  )
}
