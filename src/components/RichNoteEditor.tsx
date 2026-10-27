'use client'

// 개인업무 자유노트의 리치 에디터 — 큰 제목 칸(일반 입력)과 서식 있는 본문(contentEditable)을 분리해서
// 노션처럼 제목/본문이 한눈에 구분되게 한다. 본문 서식: 굵게/기울임/밑줄/제목 크기/목록 + 글자색/형광펜.
// 본문 값은 markdown이 아니라 HTML 그대로 저장한다(색상·형광펜은 HTML이라야 자연스럽다).
// 부모가 note.id로 key를 줘서 노트가 바뀌면 이 컴포넌트째 새로 마운트된다 — 그래서 값을 되쫓는
// 동기화 effect 없이 마운트 시 1회 심는 것으로 충분하다(RetroTextarea와 같은 패턴).
import { useEffect, useRef, useState } from 'react'
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml'

const AUTOSAVE_DELAY_MS = 800
const TITLE_MAX = 120

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const TEXT_COLORS = [
  { label: '기본', value: '#1F2933' },
  { label: '빨강', value: '#DC2626' },
  { label: '주황', value: '#D97706' },
  { label: '초록', value: '#059669' },
  { label: '파랑', value: '#4C7FE0' },
  { label: '보라', value: '#7C3AED' },
]
const HIGHLIGHT_COLORS = [
  { label: '노랑', value: '#FEF08A' },
  { label: '초록', value: '#BBF7D0' },
  { label: '파랑', value: '#BFDBFE' },
  { label: '분홍', value: '#FBCFE8' },
]
const TEXT_STYLES = [
  { label: '제목', tag: '<h2>', className: 'text-[16px] font-bold' },
  { label: '소제목', tag: '<h3>', className: 'text-[14px] font-semibold' },
  { label: '본문', tag: '<div>', className: 'text-[13.5px] font-normal' },
]

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
const ICONS = {
  bold: 'M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z',
  italic: 'M15 4h-5M9 20h-5M15 4 9 20',
  underline: 'M6 4v6a6 6 0 0 0 12 0V4M4 20h16',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  chevron: 'm6 9 6 6 6-6',
}
function HighlighterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 11-6 6v3h3l6-6" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </svg>
  )
}

function ToolbarBtn({ title, onClick, active, wide, children }: { title: string; onClick: () => void; active?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className={`h-7 ${wide ? 'px-2' : 'w-7'} flex-shrink-0 flex items-center justify-center gap-0.5 rounded-md transition-colors ${active ? 'bg-white shadow-sm text-[#1F2933]' : 'text-[#7A8491] hover:bg-white hover:text-[#1F2933] hover:shadow-sm'}`}
    >{children}</button>
  )
}
function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5 bg-[#F3F4F6] rounded-lg p-0.5">{children}</div>
}
function Popover({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-9 z-10 bg-white border border-[#EDEFF2] rounded-xl shadow-[0_8px_24px_rgba(15,23,42,0.12)]`}>
      {children}
    </div>
  )
}

export default function RichNoteEditor({ title: initialTitle, body: initialBody, onSave, placeholder, autoFocus }: {
  title: string
  body: string
  onSave: (next: { title: string; body: string }) => Promise<void>
  placeholder: string
  autoFocus?: boolean
}) {
  const [title, setTitle] = useState(initialTitle)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [empty, setEmpty] = useState(!initialBody.replace(/<[^>]*>/g, '').trim())
  const [colorOpen, setColorOpen] = useState(false)
  const [markOpen, setMarkOpen] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef(initialTitle)
  const savedRef = useRef({ title: initialTitle, body: initialBody })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    try { document.execCommand('defaultParagraphSeparator', false, 'div') } catch {}
    try { document.execCommand('styleWithCSS', false, 'true') } catch {}
    el.innerHTML = initialBody || ''
    if (!autoFocus) return
    if (!initialTitle.trim()) { titleInputRef.current?.focus(); return }
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  function closeMenus() { setColorOpen(false); setMarkOpen(false); setStyleOpen(false) }

  async function commit(next: { title: string; body: string }) {
    const prev = savedRef.current
    if (next.title === prev.title && next.body === prev.body) { setStatus('idle'); return }
    setStatus('saving')
    try {
      await onSave(next)
      savedRef.current = next
      setStatus('saved')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  function currentBody() {
    return sanitizeNoteHtml(editorRef.current?.innerHTML ?? '')
  }

  function schedule() {
    if (timerRef.current) clearTimeout(timerRef.current)
    const snapshot = { title: titleRef.current, body: currentBody() }
    timerRef.current = setTimeout(() => commit(snapshot), AUTOSAVE_DELAY_MS)
  }

  function handleTitleChange(v: string) {
    const next = v.slice(0, TITLE_MAX)
    setTitle(next)
    titleRef.current = next
    schedule()
  }

  function handleBodyInput() {
    const el = editorRef.current
    if (!el) return
    setEmpty(!el.textContent?.trim())
    schedule()
  }

  function handleBlur() {
    if (timerRef.current) { clearTimeout(timerRef.current); void commit({ title: titleRef.current, body: currentBody() }) }
  }

  function exec(cmd: string, val?: string) {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
    handleBodyInput()
  }

  const statusLabel = status === 'saving' ? '저장 중…' : status === 'saved' ? '저장됨' : status === 'error' ? `저장 실패${errorMsg ? `: ${errorMsg}` : ''}` : ''

  return (
    <div>
      <input
        ref={titleInputRef}
        value={title}
        onChange={e => handleTitleChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); editorRef.current?.focus() } }}
        placeholder="제목 없음"
        className="w-full text-[21px] font-bold text-[#1F2933] placeholder:text-[#D5DAE1] outline-none mb-3"
      />
      <div className="flex items-center gap-1.5 flex-wrap pb-3 mb-4 border-b border-[#F0F1F3]">
        <ToolbarGroup>
          <div className="relative">
            <ToolbarBtn title="글자 스타일" onClick={() => { setStyleOpen(v => !v); setColorOpen(false); setMarkOpen(false) }} active={styleOpen} wide>
              <span className="text-[12.5px] font-semibold">Aa</span>
              <Icon d={ICONS.chevron} />
            </ToolbarBtn>
            {styleOpen && (
              <Popover>
                <div className="py-1 w-28">
                  {TEXT_STYLES.map(s => (
                    <button
                      key={s.label}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { exec('formatBlock', s.tag); setStyleOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-[#1F2933] hover:bg-[#F7F8FA] ${s.className}`}
                    >{s.label}</button>
                  ))}
                </div>
              </Popover>
            )}
          </div>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarBtn title="굵게" onClick={() => exec('bold')}><Icon d={ICONS.bold} /></ToolbarBtn>
          <ToolbarBtn title="기울임" onClick={() => exec('italic')}><Icon d={ICONS.italic} /></ToolbarBtn>
          <ToolbarBtn title="밑줄" onClick={() => exec('underline')}><Icon d={ICONS.underline} /></ToolbarBtn>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarBtn title="목록" onClick={() => exec('insertUnorderedList')}><Icon d={ICONS.list} /></ToolbarBtn>
        </ToolbarGroup>
        <ToolbarGroup>
          <div className="relative">
            <ToolbarBtn title="글자색" onClick={() => { setColorOpen(v => !v); setMarkOpen(false); setStyleOpen(false) }} active={colorOpen}>
              <span className="text-[13px] font-bold" style={{ color: '#DC2626' }}>A</span>
            </ToolbarBtn>
            {colorOpen && (
              <Popover>
                <div className="p-2 flex gap-1.5">
                  {TEXT_COLORS.map(c => (
                    <button key={c.value} type="button" title={c.label} onMouseDown={e => e.preventDefault()} onClick={() => { exec('foreColor', c.value); setColorOpen(false) }} className="w-6 h-6 rounded-full border border-black/10 flex-shrink-0 hover:scale-110 transition-transform" style={{ background: c.value }} />
                  ))}
                </div>
              </Popover>
            )}
          </div>
          <div className="relative">
            <ToolbarBtn title="형광펜" onClick={() => { setMarkOpen(v => !v); setColorOpen(false); setStyleOpen(false) }} active={markOpen}>
              <HighlighterIcon />
            </ToolbarBtn>
            {markOpen && (
              <Popover align="right">
                <div className="p-2 flex gap-1.5">
                  {[...HIGHLIGHT_COLORS, { label: '지우기', value: 'transparent' }].map(c => (
                    <button key={c.value} type="button" title={c.label} onMouseDown={e => e.preventDefault()} onClick={() => { exec('hiliteColor', c.value); setMarkOpen(false) }} className="w-6 h-6 rounded-full border border-black/10 flex-shrink-0 hover:scale-110 transition-transform" style={{ background: c.value }} />
                  ))}
                </div>
              </Popover>
            )}
          </div>
        </ToolbarGroup>
        <span className={`ml-auto text-[11px] flex-shrink-0 ${status === 'error' ? 'text-red-500' : 'text-[#B0B8C1]'}`}>{statusLabel}</span>
      </div>
      <div className="relative min-h-[140px]">
        {empty && <span className="absolute top-0 left-0 text-[14.5px] text-[#C4CBD2] pointer-events-none">{placeholder}</span>}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleBodyInput}
          onBlur={handleBlur}
          onFocus={closeMenus}
          className="outline-none text-[14.5px] leading-[1.75] text-[#3A4249] whitespace-pre-wrap break-words min-h-full [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&>div]:mb-1.5 [&_h2]:text-[16px] [&_h2]:font-bold [&_h2]:text-[#1F2933] [&_h2]:mt-1.5 [&_h2]:mb-1 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-[#1F2933] [&_h3]:mt-1.5 [&_h3]:mb-1"
        />
      </div>
    </div>
  )
}
