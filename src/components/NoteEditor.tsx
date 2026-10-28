'use client'

// 개인업무 자유노트의 문서 편집기(Tiptap). 노션·워드 같은 쓰는 감각을 목표로 한다.
// - 위쪽 고정 툴바(워드식): 실행취소 · 글자 스타일 · 굵게/기울임/밑줄/취소선/코드 · 글자색/형광펜 · 목록/번호/체크 · 정렬 ·
//   인용/구분선/코드블록 · 링크 · 표(표 안에 있으면 행·열 추가/삭제 묶음이 더 나온다)
// - 글자를 고르면 바로 위에 뜨는 서식바(BubbleMenu)
// - 줄 맨 앞이나 띄어쓰기 뒤에서 "/" → 블록 메뉴(↑↓ 이동, Enter 선택, Esc 닫기)
// - 마크다운식 단축 입력(Tiptap 기본): "# " 제목, "- " 목록, "1. " 번호, "[] " 체크, "> " 인용, "```" 코드, "---" 구분선
// 본문은 HTML로 저장한다(sanitizeNoteHtml을 거친 값). 예전 contentEditable 노트(<div>/<span style>)도 그대로 열린다.
// 부모가 note.id로 key를 줘서 노트가 바뀌면 이 컴포넌트째 새로 마운트된다 — 값은 마운트 시 1회만 심는다.
// 노트를 옮기거나 닫을 때(언마운트) 아직 안 보낸 변경은 그 자리에서 바로 저장한다.
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color, BackgroundColor } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { Placeholder, CharacterCount } from '@tiptap/extensions'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml'

const AUTOSAVE_DELAY_MS = 800
const TITLE_MAX = 120

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

const TEXT_COLORS = [
  { label: '기본', value: '' },
  { label: '회색', value: '#7A8491' },
  { label: '빨강', value: '#DC2626' },
  { label: '주황', value: '#D97706' },
  { label: '초록', value: '#059669' },
  { label: '파랑', value: '#2563EB' },
  { label: '청록', value: '#0891B2' },
]
const HIGHLIGHT_COLORS = [
  { label: '노랑', value: '#FEF08A' },
  { label: '주황', value: '#FED7AA' },
  { label: '초록', value: '#BBF7D0' },
  { label: '파랑', value: '#BFDBFE' },
  { label: '분홍', value: '#FBCFE8' },
  { label: '회색', value: '#E5E7EB' },
]

// ── 아이콘(선 아이콘, 24 그리드) ─────────────────────────────────────────
const ICONS = {
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  bold: 'M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z',
  italic: 'M19 4h-9M14 20H5M15 4 9 20',
  underline: 'M6 4v6a6 6 0 0 0 12 0V4M4 20h16',
  strike: 'M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16',
  code: 'm16 18 6-6-6-6M8 6l-6 6 6 6',
  bullet: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  ordered: 'M10 6h11M10 12h11M10 18h11M4 4h1v5M4 9h2M6 20H4c0-1.5 2-2.5 2-4a1 1 0 0 0-2 0',
  task: 'M3 4h6v6H3zM3 17l2 2 4-4M13 7h8M13 17h8',
  quote: 'M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6',
  hr: 'M3 12h18',
  codeBlock: 'M4 4h16v16H4zM10 9l-2.5 3 2.5 3M14 9l2.5 3-2.5 3',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  table: 'M3 3h18v18H3zM3 9h18M3 15h18M9 9v12M15 9v12',
  alignLeft: 'M3 6h18M3 12h12M3 18h16',
  alignCenter: 'M3 6h18M6 12h12M4 18h16',
  alignRight: 'M3 6h18M9 12h12M5 18h16',
  clear: 'M4 7V4h16v3M12 4v9M9 20h6M15 15l5 5M20 15l-5 5',
  chevron: 'm6 9 6 6 6-6',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  back: 'm15 18-6-6 6-6',
}
function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}
function HighlighterIcon({ color }: { color?: string }) {
  return (
    <span className="relative flex flex-col items-center">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m9 11-6 6v3h3l6-6" />
        <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
      </svg>
      <span className="block w-4 h-[3px] rounded-full mt-px" style={{ background: color || '#FEF08A' }} />
    </span>
  )
}
function TextColorIcon({ color }: { color?: string }) {
  return (
    <span className="flex flex-col items-center leading-none">
      <span className="text-[13px] font-bold">A</span>
      <span className="block w-4 h-[3px] rounded-full mt-0.5" style={{ background: color || '#1F2933' }} />
    </span>
  )
}

// ── 툴바 부품 ────────────────────────────────────────────────────────────
// onMouseDown preventDefault — 버튼을 눌러도 본문 커서/선택이 풀리지 않게.
function Btn({ title, onClick, active, disabled, wide, dark, children }: {
  title: string; onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void; active?: boolean; disabled?: boolean; wide?: boolean; dark?: boolean; children: ReactNode
}) {
  const base = dark
    ? (active ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white')
    : (active ? 'bg-[#E8EEFB] text-[#2457C5]' : 'text-[#4B5563] hover:bg-[#F1F3F5] hover:text-[#111827]')
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className={`h-8 ${wide ? 'px-1.5' : 'w-[30px]'} flex-shrink-0 flex items-center justify-center gap-1 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none ${base}`}
    >{children}</button>
  )
}
function Sep({ dark }: { dark?: boolean }) {
  return <span className={`w-px h-5 mx-[3px] flex-shrink-0 ${dark ? 'bg-white/15' : 'bg-[#E5E7EB]'}`} />
}

// 바깥을 누르면 닫히는 작은 드롭다운. 툴바가 가로 스크롤(overflow)이라 메뉴는 portal로 body에 띄운다.
function Dropdown({ trigger, children, width = 180 }: {
  trigger: (open: boolean, toggle: (e: ReactMouseEvent<HTMLElement>) => void) => ReactNode
  children: (close: () => void) => ReactNode
  width?: number
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const open = pos !== null
  function toggle(e: ReactMouseEvent<HTMLElement>) {
    if (open) { setPos(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 6 })
  }
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      setPos(null)
    }
    function onClose() { setPos(null) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [open])
  return (
    <span ref={anchorRef} className="flex-shrink-0">
      {trigger(open, toggle)}
      {pos && createPortal(
        <div
          ref={menuRef}
          onMouseDown={e => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault() }}
          className="fixed z-[90] bg-white border border-[#E5E7EB] rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.14)] overflow-hidden"
          style={{ left: pos.left, top: pos.top, width }}
        >
          {children(() => setPos(null))}
        </div>,
        document.body,
      )}
    </span>
  )
}

function ColorGrid({ colors, onPick, onClear, clearLabel, swatch }: {
  colors: { label: string; value: string }[]
  onPick: (v: string) => void
  onClear: () => void
  clearLabel: string
  swatch: 'text' | 'fill'
}) {
  return (
    <div className="p-2.5">
      <div className="grid grid-cols-6 gap-1.5">
        {colors.filter(c => c.value).map(c => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onClick={() => onPick(c.value)}
            className="w-7 h-7 rounded-md border border-black/10 flex items-center justify-center hover:scale-110 transition-transform"
            style={swatch === 'fill' ? { background: c.value } : { background: '#fff' }}
          >
            {swatch === 'text' && <span className="text-[14px] font-bold" style={{ color: c.value }}>A</span>}
          </button>
        ))}
      </div>
      <button type="button" onClick={onClear} className="mt-2 w-full text-[12px] text-[#4B5563] hover:bg-[#F3F4F6] rounded-md py-1.5">{clearLabel}</button>
    </div>
  )
}

function LinkForm({ initial, onApply, onRemove }: { initial: string; onApply: (href: string) => void; onRemove: () => void }) {
  const [href, setHref] = useState(initial)
  return (
    <form
      className="p-2.5 flex flex-col gap-2"
      onSubmit={e => { e.preventDefault(); onApply(href.trim()) }}
    >
      <input
        autoFocus
        value={href}
        onChange={e => setHref(e.target.value)}
        placeholder="https:// 링크 붙여넣기"
        className="w-full text-[13px] border border-[#E5E7EB] rounded-md px-2.5 py-1.5 outline-none focus:border-[#4C7FE0]"
      />
      <div className="flex justify-end gap-1.5">
        {initial && <button type="button" onClick={onRemove} className="text-[12px] text-[#DC2626] hover:bg-red-50 rounded-md px-2.5 py-1">링크 제거</button>}
        <button type="submit" className="text-[12px] text-white bg-[#1F2933] hover:bg-[#333E4C] rounded-md px-3 py-1">적용</button>
      </div>
    </form>
  )
}

// ── 블록 스타일 / "/" 메뉴 항목 ───────────────────────────────────────────
type BlockItem = { key: string; label: string; hint: string; badge: string; keywords: string; run: (e: Editor) => void }
const BLOCK_ITEMS: BlockItem[] = [
  { key: 'p', label: '본문', hint: '일반 텍스트', badge: 'T', keywords: 'text paragraph 본문 텍스트 글', run: e => e.chain().focus().setParagraph().run() },
  { key: 'h1', label: '제목 1', hint: '큰 제목', badge: 'H1', keywords: 'h1 heading 제목1 큰제목', run: e => e.chain().focus().setHeading({ level: 1 }).run() },
  { key: 'h2', label: '제목 2', hint: '중간 제목', badge: 'H2', keywords: 'h2 heading 제목2 중간제목', run: e => e.chain().focus().setHeading({ level: 2 }).run() },
  { key: 'h3', label: '제목 3', hint: '작은 제목', badge: 'H3', keywords: 'h3 heading 제목3 소제목', run: e => e.chain().focus().setHeading({ level: 3 }).run() },
  { key: 'bullet', label: '글머리 목록', hint: '- 로 시작', badge: '•', keywords: 'bullet list ul 목록 글머리', run: e => e.chain().focus().toggleBulletList().run() },
  { key: 'ordered', label: '번호 목록', hint: '1. 로 시작', badge: '1.', keywords: 'number ordered ol 번호 목록', run: e => e.chain().focus().toggleOrderedList().run() },
  { key: 'task', label: '체크리스트', hint: '[] 로 시작', badge: '☑', keywords: 'todo task check 체크 할일 투두', run: e => e.chain().focus().toggleTaskList().run() },
  { key: 'quote', label: '인용', hint: '> 로 시작', badge: '❝', keywords: 'quote blockquote 인용', run: e => e.chain().focus().toggleBlockquote().run() },
  { key: 'code', label: '코드 블록', hint: '``` 로 시작', badge: '</>', keywords: 'code 코드', run: e => e.chain().focus().toggleCodeBlock().run() },
  { key: 'hr', label: '구분선', hint: '--- 입력', badge: '—', keywords: 'divider hr line 구분선 선', run: e => e.chain().focus().setHorizontalRule().run() },
  { key: 'table', label: '표', hint: '3 × 3', badge: '⊞', keywords: 'table 표 테이블', run: e => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
]
const STYLE_ITEMS = BLOCK_ITEMS.slice(0, 4)

type SlashState = { from: number; to: number; query: string; left: number; top: number; index: number }

function filterBlocks(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return BLOCK_ITEMS
  return BLOCK_ITEMS.filter(i => i.label.toLowerCase().includes(q) || i.keywords.toLowerCase().includes(q))
}

function fmtEdited(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `오늘 ${time}`
  const sameYear = d.getFullYear() === today.getFullYear()
  return `${d.toLocaleDateString('ko-KR', sameYear ? { month: 'long', day: 'numeric' } : { year: 'numeric', month: 'long', day: 'numeric' })} ${time}`
}

// 툴바 활성 표시용 상태. useEditorState는 첫 변경(transaction) 전엔 값을 주지 않아서, 그 전엔 직접 계산한 값으로 그린다.
function selectToolbarState(e: Editor) {
  return {
    bold: e.isActive('bold'),
    italic: e.isActive('italic'),
    underline: e.isActive('underline'),
    strike: e.isActive('strike'),
    code: e.isActive('code'),
    bullet: e.isActive('bulletList'),
    ordered: e.isActive('orderedList'),
    task: e.isActive('taskList'),
    quote: e.isActive('blockquote'),
    codeBlock: e.isActive('codeBlock'),
    link: e.isActive('link'),
    linkHref: (e.getAttributes('link').href as string | undefined) ?? '',
    table: e.isActive('table'),
    h1: e.isActive('heading', { level: 1 }),
    h2: e.isActive('heading', { level: 2 }),
    h3: e.isActive('heading', { level: 3 }),
    alignCenter: e.isActive({ textAlign: 'center' }),
    alignRight: e.isActive({ textAlign: 'right' }),
    color: (e.getAttributes('textStyle').color as string | undefined) ?? '',
    highlight: (e.getAttributes('highlight').color as string | undefined) ?? '',
    canUndo: e.can().undo(),
    canRedo: e.can().redo(),
    chars: e.storage.characterCount.characters() as number,
  }
}

export default function NoteEditor({ title: initialTitle, body: initialBody, updatedAt, onSave, onDelete, onBack, focusTitle }: {
  title: string
  body: string
  updatedAt: string
  onSave: (next: { title: string; body: string }) => Promise<void>
  onDelete?: () => void
  onBack?: () => void
  focusTitle?: boolean
}) {
  const [title, setTitle] = useState(initialTitle)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [linkBubbleOpen, setLinkBubbleOpen] = useState(false)
  const [initialHtml] = useState(() => sanitizeNoteHtml(initialBody))
  const titleRef = useRef(initialTitle)
  const bodyRef = useRef(initialHtml)
  const savedRef = useRef({ title: initialTitle, body: initialHtml })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSaveRef = useRef(onSave)
  const slashRef = useRef<SlashState | null>(null)
  const dismissedSlashAt = useRef<number | null>(null)
  const titleInputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)

  async function commit() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const next = { title: titleRef.current, body: bodyRef.current }
    const prev = savedRef.current
    if (next.title === prev.title && next.body === prev.body) { if (mountedRef.current) setStatus(s => (s === 'dirty' ? 'saved' : s)); return }
    if (mountedRef.current) setStatus('saving')
    try {
      await onSaveRef.current(next)
      savedRef.current = next
      if (mountedRef.current) setStatus(titleRef.current === next.title && bodyRef.current === next.body ? 'saved' : 'dirty')
    } catch (err) {
      if (!mountedRef.current) return
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }
  const commitRef = useRef(commit)

  function schedule() {
    setStatus('dirty')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void commitRef.current() }, AUTOSAVE_DELAY_MS)
  }

  // "/" 메뉴 — 커서 바로 앞 글자가 (줄 맨 앞 또는 공백 뒤의) "/검색어"면 연다.
  function updateSlash(editor: Editor) {
    const { selection } = editor.state
    if (!selection.empty || editor.isActive('codeBlock')) { setSlash(null); return }
    const { $from } = selection
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
    const m = /(?:^|\s)\/([^\s/]{0,20})$/.exec(before)
    if (!m) { dismissedSlashAt.current = null; setSlash(null); return }
    const from = $from.pos - m[1].length - 1
    if (dismissedSlashAt.current === from) { setSlash(null); return }
    const coords = editor.view.coordsAtPos(from)
    const menuH = 340
    const top = coords.bottom + menuH > window.innerHeight - 8 ? Math.max(8, coords.top - menuH - 6) : coords.bottom + 6
    setSlash(prev => ({
      from, to: $from.pos, query: m[1], left: Math.min(coords.left, window.innerWidth - 268), top,
      index: prev && prev.from === from && prev.query === m[1] ? prev.index : 0,
    }))
  }

  function runBlock(editor: Editor, item: BlockItem) {
    const s = slashRef.current
    if (s) editor.chain().focus().deleteRange({ from: s.from, to: s.to }).run()
    item.run(editor)
    setSlash(null)
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' } },
      }),
      TextStyle,
      Color,
      BackgroundColor,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      CharacterCount,
      Placeholder.configure({
        includeChildren: false,
        placeholder: ({ node }) => node.type.name === 'heading'
          ? `제목 ${node.attrs.level}`
          : "'/' 를 눌러 블록 추가, 또는 바로 작성하세요",
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: { class: 'note-prose outline-none', spellcheck: 'false' },
      handleKeyDown: (view, event) => {
        const s = slashRef.current
        if (!s || event.isComposing) return false
        const items = filterBlocks(s.query)
        if (event.key === 'Escape') { dismissedSlashAt.current = s.from; setSlash(null); return true }
        if (!items.length) return false
        if (event.key === 'ArrowDown') { setSlash({ ...s, index: (s.index + 1) % items.length }); return true }
        if (event.key === 'ArrowUp') { setSlash({ ...s, index: (s.index - 1 + items.length) % items.length }); return true }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const ed = editorInstanceRef.current
          if (ed) runBlock(ed, items[Math.min(s.index, items.length - 1)])
          return true
        }
        return false
      },
    },
    onCreate: ({ editor }) => {
      // 예전 형식(<div> 등)을 Tiptap이 정규화한 값을 기준값으로 — 열기만 했는데 "바뀜"으로 저장되지 않게.
      const rebase = () => {
        bodyRef.current = sanitizeNoteHtml(editor.getHTML())
        savedRef.current = { ...savedRef.current, body: bodyRef.current }
      }
      rebase()
      // 열면서 Tiptap이 덧붙이는 정리 변경(표 보정·끝 빈 줄 등)도 사용자 수정이 아니다 — 한 박자 뒤 기준값을 다시 잡고 예약 저장을 취소한다.
      setTimeout(() => {
        if (editor.isDestroyed || titleRef.current !== savedRef.current.title) return
        rebase()
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
        setStatus('idle')
      }, 0)
      if (focusTitle) titleInputRef.current?.focus()
    },
    onUpdate: ({ editor }) => {
      bodyRef.current = sanitizeNoteHtml(editor.getHTML())
      schedule()
      updateSlash(editor)
    },
    onSelectionUpdate: ({ editor }) => updateSlash(editor),
    onBlur: () => { void commitRef.current() },
  })
  const editorInstanceRef = useRef<Editor | null>(null)
  // 에디터 콜백(키 입력·언마운트)이 항상 최신 함수·상태를 보도록 렌더 뒤에 ref를 맞춘다.
  useLayoutEffect(() => {
    onSaveRef.current = onSave
    slashRef.current = slash
    commitRef.current = commit
    editorInstanceRef.current = editor
  })

  const tracked = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? selectToolbarState(e) : null),
  })
  const st = tracked ?? (editor ? selectToolbarState(editor) : null)

  // 언마운트(다른 노트로 이동·닫기) 시 안 보낸 변경을 바로 저장한다.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void commitRef.current()
    }
  }, [])

  // 제목 칸은 내용 길이에 맞춰 자동으로 늘어난다(긴 제목도 줄바꿈).
  useEffect(() => {
    const el = titleInputRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  function handleTitleChange(v: string) {
    const next = v.replace(/\n/g, ' ').slice(0, TITLE_MAX)
    setTitle(next)
    titleRef.current = next
    schedule()
  }

  function applyLink(e: Editor, href: string) {
    if (!href) { e.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    const url = /^(https?:\/\/|mailto:)/i.test(href) ? href : `https://${href}`
    if (e.state.selection.empty && !e.isActive('link')) {
      e.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href: url } }] }).run()
    } else {
      e.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  const styleLabel = st?.h1 ? '제목 1' : st?.h2 ? '제목 2' : st?.h3 ? '제목 3' : '본문'
  const slashItems = slash ? filterBlocks(slash.query) : []
  const statusLabel = status === 'saving' ? '저장 중…' : status === 'dirty' ? '수정 중' : status === 'saved' ? '저장됨' : status === 'error' ? '저장 실패' : ''

  return (
    <div
      className="flex flex-col h-full min-h-0 bg-white"
      onKeyDown={e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void commit() }
      }}
    >
      {/* ── 고정 툴바 ── */}
      <div className="flex items-start gap-1 border-b border-[#ECEEF1] px-2 sm:px-3 py-1.5 flex-shrink-0 bg-white">
        {onBack && (
          <span className="md:hidden flex items-center">
            <Btn title="목록으로" onClick={onBack}><Icon d={ICONS.back} /></Btn>
            <Sep />
          </span>
        )}
        <div className="flex items-center flex-wrap gap-y-0.5 gap-x-0.5 min-w-0 flex-1">
          {editor && st && (
            <>
              <Btn title="실행 취소 (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!st.canUndo}><Icon d={ICONS.undo} /></Btn>
              <Btn title="다시 실행 (Ctrl+Shift+Z)" onClick={() => editor.chain().focus().redo().run()} disabled={!st.canRedo}><Icon d={ICONS.redo} /></Btn>
              <Sep />
              <Dropdown width={190} trigger={(open, toggle) => (
                <Btn title="글자 스타일" onClick={toggle} active={open} wide>
                  <span className="text-[13px] font-medium w-[46px] text-left">{styleLabel}</span>
                  <Icon d={ICONS.chevron} size={14} />
                </Btn>
              )}>
                {close => (
                  <div className="py-1">
                    {STYLE_ITEMS.map(item => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => { item.run(editor); close() }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#F3F4F6] text-[#111827] ${item.key === 'h1' ? 'text-[19px] font-bold' : item.key === 'h2' ? 'text-[16.5px] font-bold' : item.key === 'h3' ? 'text-[14.5px] font-semibold' : 'text-[13.5px]'}`}
                      >
                        {item.label}
                        {styleLabel === item.label && <span className="text-[#2457C5] text-[12px]">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </Dropdown>
              <Sep />
              <Btn title="굵게 (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()} active={st.bold}><Icon d={ICONS.bold} /></Btn>
              <Btn title="기울임 (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()} active={st.italic}><Icon d={ICONS.italic} /></Btn>
              <Btn title="밑줄 (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()} active={st.underline}><Icon d={ICONS.underline} /></Btn>
              <Btn title="취소선 (Ctrl+Shift+S)" onClick={() => editor.chain().focus().toggleStrike().run()} active={st.strike}><Icon d={ICONS.strike} /></Btn>
              <Btn title="인라인 코드 (Ctrl+E)" onClick={() => editor.chain().focus().toggleCode().run()} active={st.code}><Icon d={ICONS.code} /></Btn>
              <Sep />
              <Dropdown width={232} trigger={(open, toggle) => (
                <Btn title="글자색" onClick={toggle} active={open}><TextColorIcon color={st.color} /></Btn>
              )}>
                {close => (
                  <ColorGrid
                    colors={TEXT_COLORS}
                    swatch="text"
                    clearLabel="기본 색으로"
                    onPick={v => { editor.chain().focus().setColor(v).run(); close() }}
                    onClear={() => { editor.chain().focus().unsetColor().run(); close() }}
                  />
                )}
              </Dropdown>
              <Dropdown width={232} trigger={(open, toggle) => (
                <Btn title="형광펜" onClick={toggle} active={open}><HighlighterIcon color={st.highlight} /></Btn>
              )}>
                {close => (
                  <ColorGrid
                    colors={HIGHLIGHT_COLORS}
                    swatch="fill"
                    clearLabel="형광펜 지우기"
                    onPick={v => { editor.chain().focus().setHighlight({ color: v }).run(); close() }}
                    onClear={() => { editor.chain().focus().unsetHighlight().unsetBackgroundColor().run(); close() }}
                  />
                )}
              </Dropdown>
              <Sep />
              <Btn title="글머리 목록 (Ctrl+Shift+8)" onClick={() => editor.chain().focus().toggleBulletList().run()} active={st.bullet}><Icon d={ICONS.bullet} /></Btn>
              <Btn title="번호 목록 (Ctrl+Shift+7)" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={st.ordered}><Icon d={ICONS.ordered} /></Btn>
              <Btn title="체크리스트 (Ctrl+Shift+9)" onClick={() => editor.chain().focus().toggleTaskList().run()} active={st.task}><Icon d={ICONS.task} /></Btn>
              <Sep />
              <Dropdown width={150} trigger={(open, toggle) => (
                <Btn title="정렬" onClick={toggle} active={open} wide>
                  <Icon d={st.alignCenter ? ICONS.alignCenter : st.alignRight ? ICONS.alignRight : ICONS.alignLeft} />
                  <Icon d={ICONS.chevron} size={12} />
                </Btn>
              )}>
                {close => (
                  <div className="py-1">
                    {([['left', '왼쪽 정렬', ICONS.alignLeft], ['center', '가운데 정렬', ICONS.alignCenter], ['right', '오른쪽 정렬', ICONS.alignRight]] as const).map(([align, label, d]) => (
                      <button key={align} type="button" onClick={() => { editor.chain().focus().setTextAlign(align).run(); close() }} className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#111827] hover:bg-[#F3F4F6]">
                        <Icon d={d} size={15} />{label}
                      </button>
                    ))}
                  </div>
                )}
              </Dropdown>
              <Sep />
              <Btn title="인용" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={st.quote}><Icon d={ICONS.quote} /></Btn>
              <Btn title="코드 블록" onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={st.codeBlock}><Icon d={ICONS.codeBlock} /></Btn>
              <Btn title="구분선" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Icon d={ICONS.hr} /></Btn>
              <Dropdown width={280} trigger={(open, toggle) => (
                <Btn title="링크" onClick={toggle} active={open || st.link}><Icon d={ICONS.link} /></Btn>
              )}>
                {close => (
                  <LinkForm
                    initial={st.linkHref}
                    onApply={href => { applyLink(editor, href); close() }}
                    onRemove={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); close() }}
                  />
                )}
              </Dropdown>
              <Btn title="표 넣기" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} active={st.table}><Icon d={ICONS.table} /></Btn>
              {st.table && (
                <div className="flex items-center gap-0.5 ml-1 pl-1.5 border-l border-[#E5E7EB] flex-shrink-0">
                  {[
                    { label: '행 +', title: '아래에 행 추가', run: () => editor.chain().focus().addRowAfter().run() },
                    { label: '열 +', title: '오른쪽에 열 추가', run: () => editor.chain().focus().addColumnAfter().run() },
                    { label: '행 −', title: '현재 행 삭제', run: () => editor.chain().focus().deleteRow().run() },
                    { label: '열 −', title: '현재 열 삭제', run: () => editor.chain().focus().deleteColumn().run() },
                    { label: '머리행', title: '머리행 켜기/끄기', run: () => editor.chain().focus().toggleHeaderRow().run() },
                    { label: '표 삭제', title: '표 전체 삭제', run: () => editor.chain().focus().deleteTable().run() },
                  ].map(b => (
                    <button
                      key={b.label}
                      type="button"
                      title={b.title}
                      onMouseDown={e => e.preventDefault()}
                      onClick={b.run}
                      className={`h-7 px-2 rounded-md text-[12px] whitespace-nowrap ${b.label === '표 삭제' ? 'text-[#DC2626] hover:bg-red-50' : 'text-[#4B5563] hover:bg-[#F1F3F5]'}`}
                    >{b.label}</button>
                  ))}
                </div>
              )}
              <Sep />
              <Btn title="서식 지우기" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Icon d={ICONS.clear} /></Btn>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 pl-2 h-8">
          <span
            title={status === 'error' ? errorMsg : undefined}
            className={`text-[11.5px] whitespace-nowrap flex items-center gap-1 ${status === 'error' ? 'text-red-500' : 'text-[#9AA3AE]'}`}
          >
            {status === 'saved' && <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />}
            {status === 'error' ? <button type="button" onClick={() => void commit()} className="underline">저장 실패 · 다시 시도</button> : statusLabel}
          </span>
          {onDelete && (
            <Btn title="노트 삭제" onClick={onDelete}><Icon d={ICONS.trash} size={15} /></Btn>
          )}
        </div>
      </div>

      {/* ── 문서 영역 ── */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" onScroll={() => { if (slash) setSlash(null) }}>
        <div className="max-w-[780px] mx-auto px-6 sm:px-14 pt-10 sm:pt-14">
          <textarea
            ref={titleInputRef}
            rows={1}
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            onBlur={() => { void commit() }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); editor?.commands.focus('start') }
              if (e.key === 'ArrowDown' && !e.nativeEvent.isComposing) { const el = e.currentTarget; if (el.selectionStart === el.value.length) { e.preventDefault(); editor?.commands.focus('start') } }
            }}
            placeholder="제목 없음"
            className="w-full resize-none overflow-hidden text-[30px] sm:text-[34px] leading-[1.25] font-bold tracking-[-0.01em] text-[#111827] placeholder:text-[#D5DAE1] outline-none bg-transparent"
          />
          <div className="flex items-center gap-2 text-[12px] text-[#9AA3AE] mt-2 mb-6 pb-5 border-b border-[#F1F3F5]">
            <span>{fmtEdited(updatedAt)} 수정</span>
            {st && <><span>·</span><span>{st.chars.toLocaleString()}자</span></>}
          </div>
          <EditorContent editor={editor} />
        </div>
        {/* 문서 아래 빈 곳을 눌러도 마지막 줄로 커서가 가게 */}
        <div className="min-h-[45vh] cursor-text" onClick={() => editor?.commands.focus('end')} />
      </div>

      {/* ── 글자 선택 시 뜨는 서식바 ── */}
      {editor && st && (
        <BubbleMenu
          editor={editor}
          options={{ placement: 'top', offset: 8 }}
          shouldShow={({ editor: e, state }) => {
            const s = state.selection
            const inMenu = !!(document.activeElement as HTMLElement | null)?.closest('[data-note-bubble]')
            return (e.isFocused || inMenu) && s instanceof TextSelection && !s.empty && !e.isActive('codeBlock')
          }}
        >
          <div data-note-bubble className="flex items-center gap-0.5 bg-[#1F2933] rounded-lg px-1 py-1 shadow-[0_10px_28px_rgba(15,23,42,0.28)]">
            {linkBubbleOpen ? (
              <form
                className="flex items-center gap-1 px-1"
                onSubmit={e => {
                  e.preventDefault()
                  const v = (new FormData(e.currentTarget).get('href') as string).trim()
                  applyLink(editor, v)
                  setLinkBubbleOpen(false)
                }}
              >
                <input
                  name="href"
                  autoFocus
                  defaultValue={st.linkHref}
                  placeholder="링크 붙여넣고 Enter"
                  onKeyDown={e => { if (e.key === 'Escape') { setLinkBubbleOpen(false); editor.commands.focus() } }}
                  onBlur={() => setLinkBubbleOpen(false)}
                  className="w-[220px] text-[12.5px] bg-white/10 text-white placeholder:text-white/40 rounded px-2 py-1 outline-none"
                />
              </form>
            ) : (
              <>
                <Dropdown width={190} trigger={(open, toggle) => (
                  <Btn dark title="글자 스타일" onClick={toggle} active={open} wide>
                    <span className="text-[12.5px] font-medium">{styleLabel}</span>
                    <Icon d={ICONS.chevron} size={13} />
                  </Btn>
                )}>
                  {close => (
                    <div className="py-1">
                      {STYLE_ITEMS.map(item => (
                        <button key={item.key} type="button" onClick={() => { item.run(editor); close() }} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#F3F4F6]">{item.label}</button>
                      ))}
                    </div>
                  )}
                </Dropdown>
                <Sep dark />
                <Btn dark title="굵게" onClick={() => editor.chain().focus().toggleBold().run()} active={st.bold}><Icon d={ICONS.bold} size={15} /></Btn>
                <Btn dark title="기울임" onClick={() => editor.chain().focus().toggleItalic().run()} active={st.italic}><Icon d={ICONS.italic} size={15} /></Btn>
                <Btn dark title="밑줄" onClick={() => editor.chain().focus().toggleUnderline().run()} active={st.underline}><Icon d={ICONS.underline} size={15} /></Btn>
                <Btn dark title="취소선" onClick={() => editor.chain().focus().toggleStrike().run()} active={st.strike}><Icon d={ICONS.strike} size={15} /></Btn>
                <Btn dark title="인라인 코드" onClick={() => editor.chain().focus().toggleCode().run()} active={st.code}><Icon d={ICONS.code} size={15} /></Btn>
                <Sep dark />
                <Dropdown width={232} trigger={(open, toggle) => (
                  <Btn dark title="글자색" onClick={toggle} active={open}><TextColorIcon color={st.color || '#fff'} /></Btn>
                )}>
                  {close => (
                    <ColorGrid colors={TEXT_COLORS} swatch="text" clearLabel="기본 색으로"
                      onPick={v => { editor.chain().focus().setColor(v).run(); close() }}
                      onClear={() => { editor.chain().focus().unsetColor().run(); close() }} />
                  )}
                </Dropdown>
                <Dropdown width={232} trigger={(open, toggle) => (
                  <Btn dark title="형광펜" onClick={toggle} active={open}><HighlighterIcon color={st.highlight} /></Btn>
                )}>
                  {close => (
                    <ColorGrid colors={HIGHLIGHT_COLORS} swatch="fill" clearLabel="형광펜 지우기"
                      onPick={v => { editor.chain().focus().setHighlight({ color: v }).run(); close() }}
                      onClear={() => { editor.chain().focus().unsetHighlight().unsetBackgroundColor().run(); close() }} />
                  )}
                </Dropdown>
                <Btn dark title="링크 (붙여넣기)" onClick={() => setLinkBubbleOpen(true)} active={st.link}><Icon d={ICONS.link} size={15} /></Btn>
              </>
            )}
          </div>
        </BubbleMenu>
      )}

      {/* ── "/" 블록 메뉴 ── */}
      {editor && slash && slashItems.length > 0 && createPortal(
        <div
          onMouseDown={e => e.preventDefault()}
          className="fixed z-[90] w-[260px] max-h-[340px] overflow-y-auto bg-white border border-[#E5E7EB] rounded-xl shadow-[0_14px_36px_rgba(15,23,42,0.16)] py-1.5"
          style={{ left: slash.left, top: slash.top }}
        >
          <p className="px-3 pt-0.5 pb-1.5 text-[11px] font-medium text-[#9AA3AE]">블록 넣기{slash.query && ` · "${slash.query}"`}</p>
          {slashItems.map((item, i) => (
            <button
              key={item.key}
              type="button"
              onMouseEnter={() => setSlash(s => (s ? { ...s, index: i } : s))}
              onClick={() => runBlock(editor, item)}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 mx-1 rounded-lg text-left ${i === slash.index ? 'bg-[#F1F3F5]' : ''}`}
              style={{ width: 'calc(100% - 8px)' }}
            >
              <span className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-[12.5px] font-semibold text-[#374151]">{item.badge}</span>
              <span className="min-w-0">
                <span className="block text-[13.5px] text-[#111827] leading-tight">{item.label}</span>
                <span className="block text-[11.5px] text-[#9AA3AE] leading-tight mt-0.5">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
