'use client'

// 회의수정 서랍 → 팀원 카드의 [업무보고] — 그 팀원의 업무 행을 표로 크게 띄운다.
// 행은 회의마다 복사하지 않고 "아직 완료 안 한 업무"가 그대로 이어서 보인다(lib/workReport).
// 간편함이 1원칙: 칸에서 벗어나면 자동 저장, 업무명에서 Enter → 맨 아래 새 업무 입력으로 이동.
// mode 'agenda'면 같은 표를 서랍 '안건'의 [안건 표]로 쓴다 — 팀원 탭 대신 안건 전체 목록, 담당자 열이 붙는다.

import { Fragment, useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'
import Avatar from '@/components/Avatar'
import ClickableAvatar from '@/components/ClickableAvatar'
import type { Member } from '@/lib/members'
import type { WorkReportState } from '@/lib/useWorkReport'
import { REPORT_TEXT_MAX, REPORT_TITLE_MAX, type OpenAction, type ReportField, type ReportItem, type ReportKind } from '@/lib/workReport'

// 이번 회의의 결정사항/액션아이템 중 업무보고 행에서 등록한 것(page의 meetingItems에서 report_item_id로 거름).
export type LinkedMeetingItem = {
  id: string; kind: 'decision' | 'action'; content: string; owner: string; due_date: string | null; done: boolean; report_item_id: string
}

type AvatarMember = Parameters<typeof ClickableAvatar>[0]['member']

type Props = {
  wr: WorkReportState
  mode: ReportKind
  members: Pick<Member, 'id' | 'name'>[]
  memberId: string // mode 'report'에서만 쓴다
  onMemberChange: (memberId: string) => void
  avatarFor: (name: string) => AvatarMember
  onClose: () => void
  linked: LinkedMeetingItem[]
  // 행에서 이번 회의 결정사항/액션아이템으로 등록 — 기존 결정사항/액션 추가 로직(액션은 일정 자동 연동 포함)을 그대로 탄다.
  // owner: 액션 담당자 이름(업무보고는 그 팀원, 안건은 입력줄에서 고른 사람 — 기본은 안건 담당자).
  onAddLinked: (item: ReportItem, kind: 'decision' | 'action', content: string, dueDate: string, owner: string) => Promise<boolean>
  onToggleLinked: (action: LinkedMeetingItem) => void
  onCompletePriorAction: (action: OpenAction) => void
}

type Composer = { itemId: string; kind: 'decision' | 'action'; text: string; due: string; owner: string; row: number }

// 내용 길이에 맞춰 높이가 늘어나는 textarea — 표 행 높이가 글 양에 따라 자연스럽게 맞춰진다.
function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

// 업데이트/피드백 한 칸. 입력 중인 글은 훅의 칸별 구독(subscribeDraft)으로 읽어서, 키를 칠 때 이 칸만 다시 그려진다.
function ReportCell({ wr, itemId, field, placeholder, pending, row, col }: { wr: WorkReportState; itemId: string; field: ReportField; placeholder: string; pending?: boolean; row: number; col: number }) {
  const key = wr.failureKey(itemId, field)
  const { subscribeDraft, getDraft } = wr
  const subscribe = useCallback((listener: () => void) => subscribeDraft(key, listener), [subscribeDraft, key])
  const draft = useSyncExternalStore(subscribe, () => getDraft(key), () => undefined)
  const value = draft ?? wr.serverText(itemId, field)
  const failed = wr.failures[key]
  return (
    <div className={failed ? 'bg-red-50' : ''}>
      <AutoTextarea
        data-grid-row={row}
        data-grid-col={col}
        value={value}
        readOnly={pending}
        onChange={e => wr.change(itemId, field, e.target.value.slice(0, REPORT_TEXT_MAX))}
        onBlur={() => wr.blur(itemId, field)}
        placeholder={pending ? '저장 중…' : placeholder}
        className="block w-full min-h-[36px] text-[13px] text-[#3A4249] leading-relaxed px-2.5 py-2 bg-transparent border-0 focus:outline-none focus:bg-[#F5F8FE] resize-none overflow-hidden"
      />
      {failed && (
        <div className="flex items-center gap-2 px-2.5 pb-1.5">
          <span className="text-[11px] text-red-500">저장 실패</span>
          <button type="button" onClick={() => wr.retry(itemId, field)} className="text-[11px] font-medium text-red-600 hover:underline">다시 시도</button>
        </div>
      )}
    </div>
  )
}

// 안건 담당자 칸 — 브라우저 기본 목록(select)은 운영체제 팝업이라 키 입력이 표와 섞여 동작이 들쭉날쭉해서,
// 표 안에 직접 그리는 목록으로 둔다. Space/Enter로 열기 → ↑↓로 고르기 → Enter로 확정, Esc는 닫기.
// 닫혀 있을 때의 방향키·Tab은 그대로 표(onGridKeyDown)로 올라가 칸 이동이 된다.
function OwnerCell({ value, members, disabled, row, col, onPick }: {
  value: string | null; members: Pick<Member, 'id' | 'name'>[]; disabled?: boolean; row: number; col: number; onPick: (memberId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const options = [{ id: null as string | null, name: '담당자 없음' }, ...members.map(m => ({ id: m.id as string | null, name: m.name }))]
  const current = members.find(m => m.id === value)
  const openList = () => { setHi(Math.max(0, options.findIndex(o => o.id === value))); setOpen(true) }
  const pick = (id: string | null) => { setOpen(false); if (id !== value) onPick(id) }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.nativeEvent.isComposing) return
    if (!open) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); openList() }
      return
    }
    if (e.key === 'Tab') { setOpen(false); return }
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'ArrowDown') setHi(h => Math.min(options.length - 1, h + 1))
    else if (e.key === 'ArrowUp') setHi(h => Math.max(0, h - 1))
    else if (e.key === 'Enter' || e.key === ' ') pick(options[hi].id)
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-grid-row={row}
        data-grid-col={col}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className={`w-full flex items-center justify-between gap-1 text-left text-[12.5px] rounded px-1.5 py-1 focus:outline-none focus:bg-[#F5F8FE] ${current ? 'text-[#3A4249]' : 'text-[#B0B8C1]'}`}
      >
        <span className="truncate">{current?.name ?? '담당자'}</span>
        <span className="text-[9px] text-[#B0B8C1] flex-shrink-0">▼</span>
      </button>
      {open && (
        <ul className="absolute left-0 top-full mt-0.5 z-20 w-full min-w-[110px] bg-white border border-[#E5E8EB] rounded-md shadow-lg py-1">
          {options.map((o, i) => (
            <li
              key={o.id ?? 'none'}
              onMouseDown={e => { e.preventDefault(); pick(o.id) }}
              onMouseEnter={() => setHi(i)}
              className={`px-2.5 py-1 text-[12.5px] cursor-pointer ${i === hi ? 'bg-[#4C7FE0]/10 text-[#4C7FE0]' : o.id ? 'text-[#3A4249]' : 'text-[#9AA3AE]'}`}
            >
              {o.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const fmtShort = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

export default function WorkReportModal({ wr, mode, members, memberId, onMemberChange, avatarFor, onClose, linked, onAddLinked, onToggleLinked, onCompletePriorAction }: Props) {
  const [composer, setComposer] = useState<Composer | null>(null)
  const [composerSaving, setComposerSaving] = useState(false)

  async function submitComposer(item: ReportItem) {
    if (!composer || composerSaving || !composer.text.trim()) return
    setComposerSaving(true)
    const ok = await onAddLinked(item, composer.kind, composer.text, composer.due, composer.owner)
    setComposerSaving(false)
    if (ok) closeComposer()
  }
  // 결정/액션 입력줄을 닫으면 연 버튼으로 포커스를 돌려 키보드로 계속 이어갈 수 있게 한다.
  function closeComposer() {
    const c = composer
    setComposer(null)
    if (c) focusCell(c.row, c.kind === 'decision' ? nav.decision : nav.action)
  }
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({})
  const [newTitle, setNewTitle] = useState('')
  const newInputRef = useRef<HTMLInputElement>(null)

  const agenda = mode === 'agenda'
  const member = members.find(m => m.id === memberId)
  const rows = agenda ? wr.items.filter(i => i.kind === 'agenda') : wr.items.filter(i => i.kind === 'report' && i.member_id === memberId)
  const countFor = (id: string) => wr.items.filter(i => i.kind === 'report' && i.member_id === id && !wr.isDoneHere(i)).length
  const ownerName = (item: ReportItem) => members.find(m => m.id === item.member_id)?.name ?? ''
  const noun = agenda ? '안건' : '업무'
  const cols = agenda ? 8 : 7
  // 키보드로 움직이는 칸(열 번호) — 지난 기록 칸은 건너뛰고, 결정·액션 칸은 [+결정] [+액션] 버튼이 각각 한 칸.
  // 맨 아래 새 행 입력줄은 행 rows.length, 열 0.
  const nav = agenda
    ? { title: 0, owner: 1, update: 2, feedback: 3, decision: 4, action: 5, done: 6, count: 7 }
    : { title: 0, owner: -1, update: 1, feedback: 2, decision: 3, action: 4, done: 5, count: 6 }
  const gridRef = useRef<HTMLTableElement>(null)

  function focusCell(row: number, col: number) {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-grid-row="${row}"][data-grid-col="${col}"]`)
    if (!el || (el as HTMLInputElement).disabled) return false
    el.focus()
    if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text')) {
      const n = el.value.length
      el.setSelectionRange(n, n)
    }
    return true
  }

  // 엑셀처럼: 방향키로 위아래·옆 칸 이동(글 칸에서는 커서가 글의 처음/끝에 닿았을 때만 칸을 넘어감),
  // Tab/Shift+Tab으로 다음/이전 칸(줄 끝이면 다음 줄 첫 칸). 담당자 목록 조작은 OwnerCell이 맡는다.
  function onGridKeyDown(e: KeyboardEvent<HTMLTableElement>) {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return
    const el = e.target as HTMLElement
    const row = Number(el.dataset?.gridRow)
    const col = Number(el.dataset?.gridCol)
    if (Number.isNaN(row) || Number.isNaN(col)) return
    const newRow = rows.length
    const text = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text') ? el as HTMLTextAreaElement | HTMLInputElement : null
    const go = (r: number, c: number) => {
      if (r < 0 || r > newRow) return false
      return focusCell(r, r === newRow ? 0 : c)
    }
    // 칸 순서대로 다음/이전으로 — 저장 중인 행처럼 그 칸이 없으면 그다음 칸으로 건너뛴다.
    // sameRow: 좌우 방향키는 줄을 넘지 않는다.
    const step = (dir: 1 | -1, sameRow: boolean) => {
      const order: [number, number][] = []
      for (let r = 0; r < newRow; r++) for (let c = 0; c < nav.count; c++) order.push([r, c])
      order.push([newRow, 0])
      let i = order.findIndex(([r, c]) => r === row && c === col) + dir
      for (; i >= 0 && i < order.length; i += dir) {
        const [r, c] = order[i]
        if (sameRow && r !== row) return false
        if (focusCell(r, c)) return true
      }
      return false
    }

    if (e.key === 'Tab') {
      if (step(e.shiftKey ? -1 : 1, false)) e.preventDefault()
      return
    }
    if (!e.key.startsWith('Arrow') || e.shiftKey) return
    const start = text?.selectionStart ?? 0
    const end = text?.selectionEnd ?? 0
    const len = text?.value.length ?? 0
    if (e.key === 'ArrowLeft') {
      if (text && !(start === 0 && end === 0)) return
      if (step(-1, true)) e.preventDefault()
      return
    }
    if (e.key === 'ArrowRight') {
      if (text && !(start === len && end === len)) return
      if (step(1, true)) e.preventDefault()
      return
    }
    const up = e.key === 'ArrowUp'
    const target = up ? row - 1 : row + 1
    if (el instanceof HTMLTextAreaElement) {
      const atEdge = up ? start === 0 && end === 0 : start === len && end === len
      if (!atEdge) {
        // 여러 줄 글: 브라우저가 먼저 줄 사이로 커서를 옮기게 두고, 첫 줄(마지막 줄)에 있었던 거라 커서가 글의
        // 처음(끝)으로 가 버렸으면 그 자리에서 바로 칸을 넘어간다(자동 줄바꿈된 긴 줄도 눈에 보이는 줄 기준으로 맞음).
        const firstLine = !el.value.slice(0, start).includes('\n')
        const lastLine = !el.value.slice(end).includes('\n')
        setTimeout(() => {
          if (document.activeElement !== el) return
          const s2 = el.selectionStart
          const e2 = el.selectionEnd
          const unchanged = s2 === start && e2 === end
          const hitEdge = up ? firstLine && s2 === 0 && e2 === 0 : lastLine && s2 === len && e2 === len
          if (unchanged || hitEdge) go(target, col)
        })
        return
      }
    }
    if (go(target, col)) e.preventDefault()
  }

  // 앞 행 저장 응답을 기다리지 않는다 — 연달아 Enter로 여러 업무를 빠르게 적을 수 있게(순서는 생성 시각으로 맞춰짐).
  async function submitNew() {
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    const item = agenda ? await wr.addItem(null, title, 'agenda') : await wr.addItem(memberId, title)
    if (!item) setNewTitle(cur => cur || title) // 실패하면 (새로 입력 중이 아닐 때) 입력값을 되돌려 다시 시도할 수 있게 한다
  }

  async function commitTitle(item: ReportItem) {
    const draft = titleDrafts[item.id]
    if (draft === undefined) return
    if (!draft.trim()) { setTitleDrafts(p => { const n = { ...p }; delete n[item.id]; return n }); return } // 빈 업무명은 저장하지 않고 원래 이름으로
    await wr.renameItem(item, draft.slice(0, REPORT_TITLE_MAX))
    setTitleDrafts(p => { const n = { ...p }; delete n[item.id]; return n })
  }

  const cell = (item: ReportItem, field: ReportField, placeholder: string, row: number) => (
    <ReportCell wr={wr} itemId={item.id} field={field} placeholder={placeholder} pending={item.pending} row={row} col={field === 'update' ? nav.update : nav.feedback} />
  )

  const c = wr.conflict
  const conflictItem = c ? wr.items.find(i => i.id === c.itemId) : undefined

  return (
    <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] w-full max-w-[1280px] h-[88vh] flex flex-col overflow-hidden">
        {/* 상단: 팀원 탭 */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#EEF0F2] flex-shrink-0">
          <p className="text-[15px] font-semibold text-[#1F2933] flex-shrink-0">{agenda ? '안건' : '업무보고'}</p>
          {wr.date && <span className="text-[12px] text-[#9AA3AE] flex-shrink-0">{fmtShort(wr.date)} 회의</span>}
          {agenda ? <span className="flex-1" /> : <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => onMemberChange(m.id)}
                className={`inline-flex items-center gap-1.5 text-[12.5px] rounded-full pl-1 pr-2.5 py-1 flex-shrink-0 ${m.id === memberId ? 'bg-[#4C7FE0]/10 text-[#4C7FE0] font-medium' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
              >
                <Avatar member={avatarFor(m.name)} size={18} />
                {m.name}
                <span className="text-[11px] opacity-70">{countFor(m.id)}</span>
              </button>
            ))}
          </div>}
          <button onClick={onClose} className="text-[13px] font-medium text-[#7A8491] hover:text-[#1F2933] px-2.5 py-1.5 rounded-md hover:bg-black/[0.04] flex-shrink-0">닫기</button>
        </div>

        {/* 표 */}
        <div className="flex-1 overflow-auto">
          {!wr.loaded ? (
            <p className="text-[12.5px] text-[#B0B8C1] py-10 text-center">불러오는 중…</p>
          ) : (
            <table ref={gridRef} onKeyDown={onGridKeyDown} className="w-full min-w-[1180px] border-collapse table-fixed">
              <colgroup>
                <col style={{ width: 190 }} />
                {agenda && <col style={{ width: 110 }} />}
                <col style={{ width: 260 }} />
                <col />
                <col style={{ width: 220 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 52 }} />
                <col style={{ width: 40 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#FAFBFB]">
                <tr className="text-left text-[11.5px] font-semibold text-[#7A8491] border-b border-[#EEF0F2]">
                  <th className="px-3 py-2">{agenda ? '안건명' : '업무명'}</th>
                  {agenda && <th className="px-3 py-2">담당자</th>}
                  <th className="px-3 py-2">{agenda ? '지난 논의' : '지난 업데이트'}</th>
                  <th className="px-3 py-2 text-[#1F2933]">{agenda ? '이번 논의' : '이번 업데이트'}</th>
                  <th className="px-3 py-2">피드백</th>
                  <th className="px-3 py-2">결정·액션</th>
                  <th className="px-1 py-2 text-center">완료</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((item, rowIndex) => {
                  const done = wr.isDoneHere(item)
                  const prev = wr.previous[item.id]
                  const mine = linked.filter(l => l.report_item_id === item.id)
                  const prior = wr.openActions.filter(a => a.report_item_id === item.id)
                  const composing = composer?.itemId === item.id ? composer : null
                  return (
                    <Fragment key={item.id}>
                    <tr className={`align-top border-b border-[#F2F3F5] group ${done ? 'bg-[#FAFBFB]' : ''} ${item.pending ? 'opacity-60' : ''}`}>
                      <td className="border-r border-[#F2F3F5]">
                        <input
                          data-grid-row={rowIndex}
                          data-grid-col={nav.title}
                          value={titleDrafts[item.id] ?? item.title}
                          readOnly={item.pending}
                          onChange={e => setTitleDrafts(p => ({ ...p, [item.id]: e.target.value }))}
                          onBlur={() => { void commitTitle(item) }}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); newInputRef.current?.focus() } }}
                          placeholder={agenda ? '안건명' : '업무명'}
                          className={`w-full text-[13px] font-medium px-3 py-2 bg-transparent border-0 focus:outline-none focus:bg-[#F5F8FE] ${done ? 'line-through text-[#B0B8C1]' : 'text-[#1F2933]'}`}
                        />
                      </td>
                      {agenda && (
                        <td className="border-r border-[#F2F3F5] px-1 py-1">
                          <OwnerCell
                            value={item.member_id}
                            members={members}
                            disabled={item.pending}
                            row={rowIndex}
                            col={nav.owner}
                            onPick={id => { void wr.setOwner(item, id) }}
                          />
                        </td>
                      )}
                      <td className="border-r border-[#F2F3F5] bg-[#FAFBFB] px-3 py-2">
                        {prev ? (
                          <>
                            <p className="text-[10.5px] text-[#9AA3AE] mb-0.5">{fmtShort(prev.meeting_date)}</p>
                            {prev.update_text && <p className="text-[12.5px] text-[#5B6570] leading-relaxed whitespace-pre-wrap break-words">{prev.update_text}</p>}
                            {prev.feedback && <p className="text-[12px] text-[#4C7FE0] leading-relaxed whitespace-pre-wrap break-words mt-1">↳ {prev.feedback}</p>}
                          </>
                        ) : (
                          <p className="text-[12px] text-[#C9CFD5]">—</p>
                        )}
                      </td>
                      <td className="border-r border-[#F2F3F5]">{cell(item, 'update', agenda ? '이번 논의' : '이번 업데이트', rowIndex)}</td>
                      <td className="border-r border-[#F2F3F5]">{cell(item, 'feedback', '피드백', rowIndex)}</td>
                      <td className="border-r border-[#F2F3F5] px-2.5 py-2">
                        <ul className="space-y-1">
                          {mine.map(l => (
                            <li key={l.id} className="flex items-start gap-1.5 text-[12px] leading-snug">
                              {l.kind === 'decision' ? (
                                <span className="flex-shrink-0 text-[10.5px] font-semibold text-[#7A5AF8] bg-[#7A5AF8]/10 rounded px-1 py-px">결정</span>
                              ) : (
                                <input type="checkbox" checked={l.done} onChange={() => onToggleLinked(l)} className="flex-shrink-0 mt-0.5" title="액션 완료" />
                              )}
                              <span className={`flex-1 break-words ${l.done ? 'line-through text-[#B0B8C1]' : 'text-[#3A4249]'}`}>
                                {l.content}{l.due_date && <span className="text-[#9AA3AE]"> · {fmtShort(l.due_date)}</span>}
                              </span>
                            </li>
                          ))}
                          {prior.map(a => (
                            <li key={a.id} className="flex items-start gap-1.5 text-[12px] leading-snug" title={`${fmtShort(a.meeting_date)} 회의에서 등록한 액션`}>
                              <input type="checkbox" checked={false} onChange={() => onCompletePriorAction(a)} className="flex-shrink-0 mt-0.5" title="액션 완료" />
                              <span className="flex-1 break-words text-[#5B6570]">
                                {a.content}
                                <span className="text-[#9AA3AE]"> · {a.due_date ? fmtShort(a.due_date) : `${fmtShort(a.meeting_date)} 등록`}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                        {!item.pending && <div className={`flex gap-1 ${mine.length + prior.length > 0 ? 'mt-1.5' : ''} ${composing ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
                          {(['decision', 'action'] as const).map(kind => (
                            <button
                              key={kind}
                              type="button"
                              data-grid-row={rowIndex}
                              data-grid-col={kind === 'decision' ? nav.decision : nav.action}
                              onClick={() => setComposer(composing?.kind === kind ? null : { itemId: item.id, kind, text: item.title, due: '', owner: agenda ? ownerName(item) : member?.name ?? '', row: rowIndex })}
                              className={`text-[11px] font-medium rounded px-1.5 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4C7FE0]/40 ${composing?.kind === kind ? 'bg-[#4C7FE0] text-white' : 'text-[#4C7FE0] bg-[#4C7FE0]/[0.08] hover:bg-[#4C7FE0]/15'}`}
                            >+ {kind === 'decision' ? '결정' : '액션'}</button>
                          ))}
                        </div>}
                      </td>
                      <td className="text-center pt-2.5">
                        <input
                          data-grid-row={rowIndex}
                          data-grid-col={nav.done}
                          type="checkbox"
                          checked={done}
                          disabled={item.pending}
                          onChange={() => { void wr.setDone(item, !done) }}
                          title={done ? '완료 취소' : '이 회의에서 완료 — 다음 회의부터 안 보입니다'}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="text-center pt-2">
                        {!item.pending && <button
                          onClick={() => { if (confirm(`"${item.title || noun}"를 삭제할까요? 모든 회차의 ${agenda ? '논의' : '업데이트'}·피드백이 함께 지워집니다.\n끝난 ${agenda ? '안건이라면' : '업무라면'} 삭제 대신 완료를 체크하세요.`)) void wr.deleteItem(item) }}
                          title="삭제"
                          className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100"
                        >✕</button>}
                      </td>
                    </tr>
                    {composing && (
                      <tr className="bg-[#F5F8FE] border-b border-[#E3EAF8]">
                        <td colSpan={cols} className="px-3 py-2">
                          <form onSubmit={e => { e.preventDefault(); void submitComposer(item) }} className="flex items-center gap-2">
                            <span className="text-[11.5px] font-semibold text-[#4C7FE0] flex-shrink-0">
                              {composing.kind === 'decision' ? '이번 회의 결정사항으로 등록' : agenda ? '액션아이템으로 등록' : `${member?.name ?? ''}님 액션아이템으로 등록`}
                            </span>
                            <input
                              autoFocus
                              value={composing.text}
                              onChange={e => setComposer(c => c && { ...c, text: e.target.value.slice(0, 500) })}
                              onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeComposer() } }}
                              className="flex-1 min-w-0 text-[13px] border border-[#D3DCEC] rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-[#4C7FE0]"
                            />
                            {composing.kind === 'action' && agenda && (
                              <select
                                value={composing.owner}
                                onChange={e => setComposer(c => c && { ...c, owner: e.target.value })}
                                title="담당자"
                                className="w-24 flex-shrink-0 text-[13px] border border-[#D3DCEC] rounded-md px-2 py-1.5 bg-white"
                              >
                                <option value="">담당자 없음</option>
                                {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                              </select>
                            )}
                            {composing.kind === 'action' && (
                              <input
                                type="date"
                                value={composing.due}
                                onChange={e => setComposer(c => c && { ...c, due: e.target.value })}
                                title="기한 (선택)"
                                className="w-[130px] flex-shrink-0 text-[13px] border border-[#D3DCEC] rounded-md px-2 py-1.5 bg-white"
                              />
                            )}
                            <button type="submit" disabled={composerSaving || !composing.text.trim()} className="flex-shrink-0 text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-50 rounded-md px-3 py-1.5">등록</button>
                            <button type="button" onClick={closeComposer} className="flex-shrink-0 text-[12.5px] text-[#7A8491] hover:text-[#1F2933] px-2 py-1.5">취소</button>
                          </form>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
                <tr>
                  <td colSpan={cols} className="px-3 py-2">
                    <input
                      ref={newInputRef}
                      data-grid-row={rows.length}
                      data-grid-col={0}
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value.slice(0, REPORT_TITLE_MAX))}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void submitNew() } }}
                      onBlur={() => { void submitNew() }}
                      autoFocus={rows.length === 0}
                      placeholder={agenda ? '+ 안건 추가 (Enter)' : `+ ${member?.name ?? ''} 업무 추가 (Enter)`}
                      className="w-full text-[13px] text-[#3A4249] px-0 py-1 bg-transparent border-0 focus:outline-none placeholder:text-[#B0B8C1]"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <p className="flex-shrink-0 px-5 py-2 border-t border-[#EEF0F2] text-[11px] text-[#9AA3AE]">
          방향키·Tab으로 칸 이동{agenda ? ' · 담당자는 Space로 열고 Enter로 선택' : ''} · 완료는 Space · 칸에서 벗어나면 자동 저장됩니다 · 완료한 {noun}{agenda ? '은' : '는'} 이번 회의에만 남고 다음 회의부터 사라집니다 · 완료 안 한 {noun}{agenda ? '은' : '는'} 다음 회의에 그대로 이어집니다
        </p>
      </div>

      {c && (
        <div className="fixed inset-0 bg-black/30 z-[70] flex items-center justify-center px-4" onClick={e => { e.stopPropagation(); wr.dismissConflict() }}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] w-full max-w-[560px] max-h-[80vh] overflow-y-auto p-5">
            <p className="text-[15px] font-semibold text-[#1F2933] mb-1">
              &quot;{conflictItem?.title || noun}&quot; {c.field === 'update' ? (agenda ? '논의' : '업데이트') : '피드백'}가 그 사이 먼저 저장돼 최신 내용으로 바꿨습니다
            </p>
            <p className="text-[12.5px] text-[#7A8491] mb-4">{c.updatedBy ? `${c.updatedBy}님이 저장했습니다.` : '다른 분이 저장했습니다.'} 내가 쓴 내용은 아래에 남겨뒀어요 — 필요하면 복사해서 다시 붙여넣으세요.</p>
            <div className="border border-[#E5E8EB] rounded-lg p-3 mb-4">
              <p className="text-[11.5px] font-semibold text-[#1F2933] mb-1.5">내가 쓴 내용 (저장 안 됨)</p>
              <p className="text-[12.5px] text-[#3A4249] leading-relaxed whitespace-pre-wrap break-words max-h-[240px] overflow-y-auto">
                {c.localText || <span className="text-[#B0B8C1]">내용이 없습니다.</span>}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { void navigator.clipboard.writeText(c.localText).catch(() => {}) }} className="text-[12.5px] font-medium text-[#4C7FE0] border border-[#4C7FE0]/40 hover:bg-[#4C7FE0]/5 rounded-lg px-3.5 py-2">내 내용 복사</button>
              <button onClick={() => wr.dismissConflict()} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
