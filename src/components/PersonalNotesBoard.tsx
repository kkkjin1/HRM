'use client'

// 개인업무 탭의 "자유노트" — 팀원마다 칸반 카드처럼 여러 장을 쓰는 보드. 작은 카드는 미리보기만 보여주고,
// 누르면 화면을 많이 채우는 큰 모달로 열려 바로 편집 모드부터 시작한다(RichNoteEditor — 굵게/기울임/밑줄/
// 소제목/목록 + 글자색/형광펜, HTML로 저장).
import { useEffect, useState } from 'react'
import RichNoteEditor from '@/components/RichNoteEditor'
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml'

export type PersonalNote = { id: string; title: string; content: string; sort_order: number; created_at: string; updated_at: string }

// 카드마다 위쪽에 얇게 다른 색 띠를 둬서(순서대로 순환) 보드가 단조롭지 않게 — sticky note 느낌.
const ACCENTS = ['#4C7FE0', '#D97706', '#059669', '#DB2777', '#7C3AED', '#0891B2']

function fmtUpdated(iso: string) {
  const d = new Date(iso)
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

export default function PersonalNotesBoard({ notes, onAdd, onSave, onDelete, onReorder }: {
  notes: PersonalNote[]
  onAdd: () => Promise<PersonalNote | null>
  onSave: (id: string, title: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (orderedIds: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const openNote = notes.find(n => n.id === openId) ?? null

  useEffect(() => {
    if (!openId) return
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpenId(null) }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [openId])

  async function handleAdd() {
    setAdding(true)
    try {
      const created = await onAdd()
      if (created) setOpenId(created.id)
    } finally {
      setAdding(false)
    }
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
    <div>
      <div className="flex items-center justify-between mb-3.5">
        <p className="text-[14px] font-semibold text-[#1F2933] flex items-center gap-1.5">
          <span className="text-[16px]">📓</span> 자유노트
        </p>
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="flex items-center gap-1 text-[12.5px] font-medium text-white bg-[#1F2933] hover:bg-[#333E4C] disabled:opacity-50 rounded-full px-3.5 py-1.5 shadow-sm transition-colors"
        >
          <span className="text-[13px] leading-none">+</span> 새 카드
        </button>
      </div>

      {notes.length === 0 ? (
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="w-full flex flex-col items-center gap-1.5 text-[13px] text-[#B0B8C1] border-2 border-dashed border-[#E3E7EC] rounded-2xl py-10 hover:border-[#4C7FE0] hover:text-[#4C7FE0] hover:bg-[#F7F9FE] transition-colors"
        >
          <span className="text-[22px]">＋</span>
          눌러서 첫 카드를 만들어보세요 — 업무 아이디어, 생각 정리, 뭐든 좋아요.
        </button>
      ) : (
        <div className="columns-1 sm:columns-2 xl:columns-3 gap-3.5 [column-fill:_balance]">
          {notes.map((note, i) => {
            const title = note.title ?? ''
            const dropLine = dragId && dragId !== note.id && dropAt?.id === note.id
              ? (dropAt.after ? 'shadow-[inset_0_-2px_0_#4C7FE0]' : 'shadow-[inset_0_2px_0_#4C7FE0]')
              : ''
            return (
              <div
                key={note.id}
                draggable
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
                className={`group relative break-inside-avoid mb-3.5 bg-white border border-[#EDEFF2] rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_6px_16px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all duration-150 ${dragId === note.id ? 'opacity-40' : ''} ${dropLine}`}
              >
                <div className="h-[3px]" style={{ background: ACCENTS[i % ACCENTS.length] }} />
                <div className="flex items-center justify-between px-3.5 pt-2.5">
                  <span className="cursor-grab active:cursor-grabbing text-[12px] text-[#D5DAE1] hover:text-[#7A8491]" title="끌어서 순서 바꾸기">⠿</span>
                  <button
                    type="button"
                    onClick={() => { if (confirm('이 카드를 삭제할까요?')) void onDelete(note.id) }}
                    title="삭제"
                    className="text-[11px] text-[#D5DAE1] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >✕</button>
                </div>
                <button type="button" onClick={() => setOpenId(note.id)} className="w-full text-left px-3.5 pb-3 pt-1.5 min-h-[110px]">
                  {title.trim() && (
                    <p className="text-[14.5px] font-bold text-[#1F2933] mb-1 truncate">{title}</p>
                  )}
                  {note.content.replace(/<[^>]*>/g, '').trim() ? (
                    <div
                      className="text-[13px] text-[#7A8491] leading-relaxed break-words line-clamp-5 [&_ul]:list-disc [&_ul]:pl-5 [&_h2]:text-[13.5px] [&_h2]:font-bold [&_h2]:text-[#5B6472] [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-[#5B6472]"
                      dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(note.content) }}
                    />
                  ) : !title.trim() ? (
                    <p className="text-[13.5px] text-[#C4CBD2]">눌러서 작성…</p>
                  ) : null}
                </button>
                <div className="px-3.5 pb-2.5 -mt-1">
                  <span className="text-[10.5px] text-[#C4CBD2]">{fmtUpdated(note.updated_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {openNote && (
        <div className="fixed inset-0 bg-[#0F172A]/45 backdrop-blur-sm z-[70] flex items-start justify-center overflow-y-auto p-4 sm:p-10" onClick={() => setOpenId(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white w-full max-w-[680px] rounded-[20px] shadow-[0_24px_70px_rgba(15,23,42,0.28)] flex flex-col max-h-[85vh] my-auto">
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-[#F0F1F3] flex-shrink-0">
              <span className="text-[11.5px] text-[#B0B8C1]">{fmtUpdated(openNote.updated_at)} 수정</span>
              <button type="button" onClick={() => setOpenId(null)} className="text-[13px] text-[#7A8491] hover:text-[#1F2933] w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/[0.04] flex-shrink-0">✕</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-7 sm:px-10 py-7">
              <RichNoteEditor
                key={openNote.id}
                title={openNote.title ?? ''}
                body={openNote.content ?? ''}
                placeholder="자유롭게 적어보세요. 벗어나면 자동 저장됩니다."
                autoFocus
                onSave={next => onSave(openNote.id, next.title, next.body)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
