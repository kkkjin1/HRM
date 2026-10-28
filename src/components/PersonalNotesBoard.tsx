'use client'

// 개인업무 탭의 "자유노트" — 에버노트식 2단: 왼쪽 노트 목록(검색·정렬·끌어서 순서 바꾸기) + 오른쪽 문서 편집기(NoteEditor).
// 모달 없이 탭 안에서 바로 고르고 쓴다. 좁은 화면(모바일)에서는 목록 ↔ 편집기를 한 장씩 보여준다.
// 마지막으로 연 노트는 브라우저에 기억해 다음에 들어와도 그 노트부터 열린다(편의 기능이라 실패해도 무시).
import { useEffect, useMemo, useState } from 'react'
import NoteEditor from '@/components/NoteEditor'
import { noteHtmlToText } from '@/lib/sanitizeNoteHtml'

export type PersonalNote = { id: string; title: string; content: string; sort_order: number; created_at: string; updated_at: string }

type SortMode = 'manual' | 'updated' | 'created'
const SORT_LABEL: Record<SortMode, string> = { manual: '직접 정한 순서', updated: '최근 수정 순', created: '만든 날짜 순' }
const SELECTED_KEY = 'hrm_personal_note_selected'
const SORT_KEY = 'hrm_personal_note_sort'
const LIST_COLLAPSED_KEY = 'hrm_personal_note_list_collapsed'

function readLocal(key: string) { try { return window.localStorage.getItem(key) } catch { return null } }
function writeLocal(key: string, v: string) { try { window.localStorage.setItem(key, v) } catch {} }

function fmtListDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return '어제'
  return d.getFullYear() === now.getFullYear()
    ? d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    : d.toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' })
}

export default function PersonalNotesBoard({ notes, onAdd, onSave, onDelete, onReorder, onUploadImage }: {
  notes: PersonalNote[]
  onAdd: () => Promise<PersonalNote | null>
  onSave: (id: string, title: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (orderedIds: string[]) => void
  onUploadImage?: (file: File) => Promise<string>
}) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('manual')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null)
  const [mobileEditor, setMobileEditor] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null)
  // 왼쪽 목록 접기(데스크톱) — 접으면 얇은 띠만 남고 편집기가 넓어진다. 이 브라우저에 기억한다.
  const [listCollapsed, setListCollapsed] = useState(false)

  useEffect(() => {
    const saved = readLocal(SORT_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === 'manual' || saved === 'updated' || saved === 'created') setSort(saved)
    if (readLocal(LIST_COLLAPSED_KEY) === '1') setListCollapsed(true)
  }, [])

  function toggleList(next: boolean) {
    setListCollapsed(next)
    writeLocal(LIST_COLLAPSED_KEY, next ? '1' : '0')
  }

  // 목록이 처음 들어오면(또는 고른 노트가 사라지면) 기억해 둔 노트 → 없으면 맨 위 노트를 연다.
  useEffect(() => {
    if (selectedId && notes.some(n => n.id === selectedId)) return
    const remembered = readLocal(SELECTED_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(!notes.length ? null : remembered && notes.some(n => n.id === remembered) ? remembered : notes[0].id)
  }, [notes, selectedId])

  const texts = useMemo(() => new Map(notes.map(n => [n.id, noteHtmlToText(n.content ?? '')])), [notes])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? notes.filter(n => (n.title ?? '').toLowerCase().includes(q) || (texts.get(n.id) ?? '').toLowerCase().includes(q))
      : notes
    if (sort === 'manual') return filtered
    const key = sort === 'updated' ? 'updated_at' : 'created_at'
    return [...filtered].sort((a, b) => b[key].localeCompare(a[key]))
  }, [notes, texts, query, sort])

  const canDrag = sort === 'manual' && !query.trim()
  const selected = notes.find(n => n.id === selectedId) ?? null

  function select(id: string) {
    setSelectedId(id)
    setMobileEditor(true)
    writeLocal(SELECTED_KEY, id)
  }

  function changeSort(next: SortMode) {
    setSort(next)
    writeLocal(SORT_KEY, next)
  }

  async function handleAdd() {
    setAdding(true)
    try {
      const created = await onAdd()
      if (created) { setQuery(''); setJustCreatedId(created.id); select(created.id) }
    } finally {
      setAdding(false)
    }
  }

  function handleDelete(note: PersonalNote) {
    const label = (note.title ?? '').trim() || '제목 없는 노트'
    if (!confirm(`"${label}"을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return
    if (note.id === selectedId) {
      const idx = visible.findIndex(n => n.id === note.id)
      const neighbor = visible[idx + 1] ?? visible[idx - 1] ?? null
      setSelectedId(neighbor?.id ?? null)
      if (neighbor) writeLocal(SELECTED_KEY, neighbor.id)
      else setMobileEditor(false)
    }
    void onDelete(note.id)
  }

  function handleDrop(target: PersonalNote, after: boolean) {
    const from = dragId
    setDragId(null)
    setDropAt(null)
    if (!from || from === target.id) return
    const rest = notes.filter(n => n.id !== from)
    const at = rest.findIndex(n => n.id === target.id) + (after ? 1 : 0)
    const moving = notes.find(n => n.id === from)
    if (!moving) return
    onReorder([...rest.slice(0, at), moving, ...rest.slice(at)].map(n => n.id))
  }

  return (
    <div className="bg-white border border-[#E5E8EB] rounded-xl overflow-hidden flex h-[calc(100vh-150px)] min-h-[560px] shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      {/* ── 왼쪽: 노트 목록 ── */}
      {listCollapsed && (
        <div className="hidden md:flex flex-col items-center gap-1.5 w-11 flex-shrink-0 border-r border-[#ECEEF1] bg-[#FAFAFB] py-3">
          <button type="button" onClick={() => toggleList(false)} title="노트 목록 펼치기" aria-label="노트 목록 펼치기" className="w-8 h-8 flex items-center justify-center rounded-md text-[#7A8491] hover:text-[#111827] hover:bg-black/[0.05]">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 4h18v16H3zM9 4v16M13 10l2 2-2 2" /></svg>
          </button>
          <button type="button" onClick={handleAdd} disabled={adding} title="새 노트" aria-label="새 노트" className="w-8 h-8 flex items-center justify-center rounded-md text-white bg-[#2457C5] hover:bg-[#1D4AAB] disabled:opacity-50">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <span className="mt-1 text-[11px] font-medium text-[#9AA3AE] [writing-mode:vertical-rl] tracking-wider">자유노트 {notes.length}</span>
        </div>
      )}
      <aside className={`${mobileEditor && selected ? 'hidden' : 'flex'} ${listCollapsed ? 'md:hidden' : 'md:flex'} w-full md:w-[300px] lg:w-[320px] flex-shrink-0 flex-col border-r border-[#ECEEF1] bg-[#FAFAFB] min-h-0`}>
        <div className="px-4 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[15px] font-bold text-[#111827] flex items-center gap-1.5">
              자유노트
              <span className="text-[12px] font-medium text-[#9AA3AE]">{notes.length}</span>
            </p>
            <span className="flex items-center gap-1">
            <button type="button" onClick={() => toggleList(true)} title="노트 목록 접기" aria-label="노트 목록 접기" className="hidden md:flex w-7 h-7 items-center justify-center rounded-md text-[#9AA3AE] hover:text-[#111827] hover:bg-black/[0.05]">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 4h18v16H3zM9 4v16M16 10l-2 2 2 2" /></svg>
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding}
              className="flex items-center gap-1 text-[12.5px] font-semibold text-white bg-[#2457C5] hover:bg-[#1D4AAB] disabled:opacity-50 rounded-lg pl-2.5 pr-3 py-1.5 shadow-sm transition-colors"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
              새 노트
            </button>
            </span>
          </div>
          <div className="relative">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#9AA3AE" strokeWidth="2" strokeLinecap="round" className="absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="노트 검색"
              className="w-full text-[13px] bg-white border border-[#E5E7EB] rounded-lg pl-8 pr-7 py-1.5 outline-none focus:border-[#4C7FE0] focus:ring-2 focus:ring-[#4C7FE0]/15 placeholder:text-[#B0B8C1]"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="검색어 지우기" className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-[#9AA3AE] hover:text-[#111827]">✕</button>
            )}
          </div>
          <div className="flex items-center justify-between mt-2.5">
            <select
              value={sort}
              onChange={e => changeSort(e.target.value as SortMode)}
              className="text-[11.5px] text-[#6B7280] bg-transparent outline-none cursor-pointer hover:text-[#111827]"
            >
              {(Object.keys(SORT_LABEL) as SortMode[]).map(k => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
            </select>
            {canDrag && notes.length > 1 && <span className="text-[11px] text-[#B0B8C1]">끌어서 순서 변경</span>}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
          {notes.length === 0 ? (
            <div className="text-center px-4 py-12">
              <p className="text-[13px] text-[#6B7280] mb-1">아직 노트가 없어요</p>
              <p className="text-[12px] text-[#9AA3AE]">업무 아이디어, 생각 정리, 회의 준비 — 뭐든 좋아요.</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-center text-[12.5px] text-[#9AA3AE] py-10">&quot;{query}&quot;와 일치하는 노트가 없어요</p>
          ) : (
            <ul className="space-y-0.5">
              {visible.map(note => {
                const title = (note.title ?? '').trim()
                const text = texts.get(note.id) ?? ''
                const active = note.id === selectedId
                const dropLine = dragId && dragId !== note.id && dropAt?.id === note.id
                  ? (dropAt.after ? 'after:bottom-[-2px]' : 'after:top-[-2px]') + ' after:absolute after:left-2 after:right-2 after:h-[2px] after:bg-[#4C7FE0] after:rounded-full'
                  : ''
                return (
                  <li
                    key={note.id}
                    draggable={canDrag}
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragId(note.id) }}
                    onDragEnd={() => { setDragId(null); setDropAt(null) }}
                    onDragOver={e => {
                      if (!dragId || dragId === note.id) return
                      e.preventDefault()
                      const r = e.currentTarget.getBoundingClientRect()
                      const after = e.clientY > r.top + r.height / 2
                      if (dropAt?.id !== note.id || dropAt.after !== after) setDropAt({ id: note.id, after })
                    }}
                    onDrop={e => { e.preventDefault(); handleDrop(note, dropAt?.after ?? false) }}
                    className={`group relative ${dropLine} ${dragId === note.id ? 'opacity-40' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => select(note.id)}
                      className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${active ? 'bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-[#E5E7EB]' : 'hover:bg-[#F0F2F4]'}`}
                    >
                      {active && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-[#2457C5]" />}
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`text-[13.5px] font-semibold truncate ${title ? 'text-[#111827]' : 'text-[#9AA3AE]'}`}>{title || '제목 없음'}</p>
                        <span className="text-[11px] text-[#9AA3AE] flex-shrink-0 group-hover:opacity-0 transition-opacity">{fmtListDate(note.updated_at)}</span>
                      </div>
                      <p className={`text-[12.5px] leading-[1.5] mt-0.5 line-clamp-2 break-all ${text ? 'text-[#6B7280]' : 'text-[#C4CBD2]'}`}>{text || '내용 없음'}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(note)}
                      title="삭제"
                      aria-label="노트 삭제"
                      className="absolute right-2 top-2 w-6 h-6 flex items-center justify-center rounded-md text-[#9AA3AE] hover:text-[#DC2626] hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ── 오른쪽: 문서 편집기 ── */}
      <section className={`${mobileEditor && selected ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 flex-col min-h-0`}>
        {selected ? (
          <NoteEditor
            key={selected.id}
            title={selected.title ?? ''}
            body={selected.content ?? ''}
            updatedAt={selected.updated_at}
            focusTitle={selected.id === justCreatedId}
            onSave={next => onSave(selected.id, next.title, next.body)}
            onDelete={() => handleDelete(selected)}
            onBack={() => setMobileEditor(false)}
            uploadImage={onUploadImage}
            wide={listCollapsed}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF3FD] flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2457C5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>
            </div>
            <p className="text-[14px] font-semibold text-[#111827]">노트를 고르거나 새로 만들어 보세요</p>
            <button type="button" onClick={handleAdd} disabled={adding} className="text-[13px] font-medium text-[#2457C5] hover:underline disabled:opacity-50">+ 새 노트 만들기</button>
          </div>
        )}
      </section>
    </div>
  )
}
