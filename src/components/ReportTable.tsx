'use client'

// 회의 상세의 "안건 표"와 "업무보고 표". 행은 회의마다 복사하지 않고 "아직 완료 안 한 행"이 그대로 이어서 보인다(lib/workReport).
// 간편함이 1원칙: 칸에서 벗어나면 자동 저장, 행 이름에서 Enter → 그 묶음 맨 아래 새 행 입력으로 이동.
// 한 표 안에 여러 묶음(section)을 둔다 — 안건 표는 [고정 안건][일반 안건], 업무보고 표는 팀원마다 한 묶음.
// agenda면 담당자 열이 붙는다. 업무보고 표에는 그 팀원이 담당인 안건도 같은 행으로 함께 보인다(어느 표에 써도 양쪽에 반영).

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import type { Member } from '@/lib/members'
import type { WorkReportState } from '@/lib/useWorkReport'
import type { FieldLock, PreviewSource } from '@/lib/useFieldLocks'
import { ownerIdsOf, REPORT_TEXT_MAX, REPORT_TITLE_MAX, type OpenAction, type ReportField, type ReportItem } from '@/lib/workReport'
import { dashToBullet } from '@/lib/dashBullet'

// 이번 회의의 결정사항/액션아이템 중 표의 행에서 등록한 것(page의 meetingItems에서 report_item_id로 거름).
export type LinkedMeetingItem = {
  id: string; kind: 'decision' | 'action'; content: string; owner: string; due_date: string | null; done: boolean; report_item_id: string
}

// 회의록 칸 잠금(lib/useFieldLocks)을 표 칸에도 쓴다 — 누가 칸을 클릭하면 다른 사람 화면에선 그 칸이 읽기 전용이 되고
// 그 사람이 치는 글이 실시간으로 보인다. 저장이 끝나야 풀린다. 잠금 칸 이름은 reportLockField.
export type ReportLocks = {
  lockOf: (field: string) => FieldLock | null
  acquire: (field: string) => boolean
  release: (field: string) => void
  preview: (field: string, text: string) => void
  previews: PreviewSource
}

export const reportLockField = (itemId: string, field: ReportField) => `report:${itemId}:${field}`

const noopSubscribe = () => () => {}

// 표 안의 한 묶음. header는 묶음 위 전체 폭 줄(팀원 이름 등), collapsed면 header만 보인다.
// onAdd가 있으면 묶음 맨 아래에 새 행 입력줄이 붙는다.
export type ReportSection = {
  key: string
  header?: ReactNode
  collapsed?: boolean
  items: ReportItem[]
  addPlaceholder?: string
  onAdd?: (title: string) => Promise<ReportItem | null>
  pinnedTone?: boolean
  // 머리줄이 화면 위에 고정돼 있는 동안 이 묶음을 보고 있으면 머리줄 바로 아래 한 줄로 같이 고정해 보여줄 내용(업무보고 표의 팀원 이름 등).
  stickyHeader?: ReactNode
  // 있으면 행 왼쪽에 끌기 손잡이(⠿)가 붙어 묶음 안에서 순서를 바꿀 수 있다. 바뀐 순서 전체를 넘긴다.
  onReorder?: (items: ReportItem[]) => void
}

type Props = {
  wr: WorkReportState
  locks: ReportLocks
  agenda: boolean
  sections: ReportSection[]
  members: Pick<Member, 'id' | 'name'>[]
  linked: LinkedMeetingItem[]
  // 행에서 이번 회의 결정사항/액션아이템으로 등록 — 기존 결정사항/액션 추가 로직(액션은 일정 자동 연동 포함)을 그대로 탄다.
  // owner: 액션 담당자 이름(업무보고는 그 팀원, 안건은 입력줄에서 고른 사람 — 기본은 안건 담당자).
  onAddLinked: (item: ReportItem, kind: 'decision' | 'action', content: string, dueDate: string, owner: string) => Promise<boolean>
  onToggleLinked: (action: LinkedMeetingItem) => void
  onCompletePriorAction: (action: OpenAction) => void
  // +액션 기한의 기본값 — 다음 회의 날짜(page가 계산). 입력줄에서 바로 바꿀 수 있다.
  defaultDue: string
  // 열 너비를 마우스로 조절하게 할 때 — 머리줄 칸 오른쪽 끝을 끌면 바뀐다. "이번 논의/업데이트" 열은 남는 폭을 채운다.
  colWidths?: ColWidths
  // 고정 안건 표 — 회의마다 바뀌지 않으니 안건명·담당자·방식(자유 텍스트)·고정 해제만 둔다.
  pinnedMode?: boolean
  onColWidthsChange?: (next: ColWidths) => void
  // 팀장이 아닌 사람이 볼 때 — 오늘 안건 표는 통째로 읽기 전용, 업무보고 표에선 함께 보이는 안건 행의 안건명·완료만 잠근다.
  lockAgenda?: boolean
}

export type ColWidths = { title: number; owner: number; prev: number; prevFb: number; feedback: number; link: number; done: number }
export const DEFAULT_COL_WIDTHS: ColWidths = { title: 190, owner: 100, prev: 210, prevFb: 170, feedback: 190, link: 200, done: 64 }
const MIN_COL_WIDTH = 64
// 완료 칸은 체크박스·"고정 해제" 버튼만 들어가서 더 좁게 둘 수 있다.
const minWidthOf = (key: keyof ColWidths) => (key === 'done' ? 44 : MIN_COL_WIDTH)
// 저장값이 비었거나 깨졌으면(음수·숫자 아님 — 브라우저가 무시해 칸이 제멋대로 배치된다) 칸마다 기본값/최솟값으로 되돌린다.
function sanitizeColWidths(v: Partial<ColWidths> | undefined): ColWidths {
  const out = { ...DEFAULT_COL_WIDTHS }
  for (const key of Object.keys(out) as (keyof ColWidths)[]) {
    const n = v?.[key]
    if (typeof n === 'number' && Number.isFinite(n)) out[key] = Math.max(minWidthOf(key), Math.round(n))
  }
  return out
}

// 머리줄 칸 오른쪽 끝의 끌기 손잡이.
// onStart: 끌기를 시작할 때 손잡이 요소를 받아 불려, 움직인 거리(px)를 받아 너비를 바꾸는 함수를 돌려준다.
// 포인터를 손잡이에 붙잡아 둬서(setPointerCapture) 창 밖에서 놓아도 끌기가 끝난다 — 예전엔 놓친 끌기가 남아
// 다음 끌기와 겹치며 너비가 꼬였다.
function ResizeHandle({ onStart }: { onStart: (el: HTMLElement) => (dx: number) => void }) {
  function onPointerDown(e: React.PointerEvent<HTMLSpanElement>) {
    e.preventDefault()
    const el = e.currentTarget
    const startX = e.clientX
    const apply = onStart(el)
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => apply(Math.round(ev.clientX - startX))
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('lostpointercapture', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('lostpointercapture', up)
  }
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      title="끌어서 열 너비 조절"
      onPointerDown={onPointerDown}
      className="absolute top-0 -right-[5px] z-10 h-full w-[10px] cursor-col-resize group/rh flex items-center justify-center"
    >
      {/* 늘 보이는 얇은 막대 — 마우스를 올리면 파랗게 굵어져 "여기를 끌면 된다"가 보이게 */}
      <span className="block h-[60%] w-[2px] rounded-full bg-[#D3D8DE] group-hover/rh:h-full group-hover/rh:w-[3px] group-hover/rh:bg-[#4C7FE0]" />
    </span>
  )
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
// 다른 사람이 이 칸을 쓰는 중이면 읽기 전용 + 그 사람이 치는 글(미리보기, 역시 칸별 구독)을 보여준다.
// 화면 값 = 미리보기(남이 쓰는 중) ?? 내 draft ?? 서버 값.
// 잠금은 포커스가 아니라 첫 입력 때 잡는다 — 방향키로 칸을 지나가기만 해도 남의 화면에 "작성 중"이 깜빡이지 않게.
function ReportCell({ wr, locks, itemId, field, placeholder, pending, readOnly, row, col }: { wr: WorkReportState; locks: ReportLocks; itemId: string; field: ReportField; placeholder: string; pending?: boolean; readOnly?: boolean; row: number; col: number }) {
  const key = wr.failureKey(itemId, field)
  const lockField = reportLockField(itemId, field)
  const lock = locks.lockOf(lockField)
  const { subscribeDraft, getDraft } = wr
  const subscribe = useCallback((listener: () => void) => subscribeDraft(key, listener), [subscribeDraft, key])
  const draft = useSyncExternalStore(subscribe, () => getDraft(key), () => undefined)
  const previewField = lock?.kind === 'other' ? lockField : null
  const { subscribePreview, getPreview } = locks.previews
  const subscribePv = useCallback(
    (listener: () => void) => (previewField ? subscribePreview(previewField, listener) : noopSubscribe()),
    [subscribePreview, previewField],
  )
  const preview = useSyncExternalStore(subscribePv, () => (previewField ? getPreview(previewField) : undefined), () => undefined)
  const value = preview ?? draft ?? wr.serverText(itemId, field)
  const failed = wr.failures[key]
  return (
    <div className={failed ? 'bg-red-50' : lock ? 'bg-[#F7F9FC]' : ''}>
      {lock && (
        <div className="flex items-center gap-1 px-2.5 pt-1.5 text-[10.5px] text-[#4C7FE0]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4C7FE0] animate-pulse flex-shrink-0" />
          {lock.kind === 'other' ? `${lock.name}님 작성 중` : '최신 내용 불러오는 중…'}
        </div>
      )}
      <AutoTextarea
        data-grid-row={row}
        data-grid-col={col}
        value={value}
        readOnly={pending || readOnly || !!lock}
        onChange={e => {
          if (readOnly || lock || !locks.acquire(lockField)) return
          const text = dashToBullet(e.target).slice(0, REPORT_TEXT_MAX)
          wr.change(itemId, field, text)
          locks.preview(lockField, text)
        }}
        onBlur={() => { void wr.blur(itemId, field).finally(() => locks.release(lockField)) }}
        placeholder={pending ? '저장 중…' : readOnly ? '' : placeholder}
        className={`block w-full min-h-[36px] text-[13px] leading-relaxed px-2.5 py-2 bg-transparent border-0 focus:outline-none resize-none overflow-hidden ${lock ? 'text-[#5B6570] cursor-not-allowed' : 'text-[#3A4249] focus:bg-[#F5F8FE]'}`}
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

// 안건 담당자 칸(여러 명) — 브라우저 기본 목록(select)은 운영체제 팝업이라 키 입력이 표와 섞여 동작이 들쭉날쭉해서,
// 직접 그리는 목록으로 둔다. Space/Enter로 열기 → ↑↓로 옮기고 Space/Enter로 한 명씩 체크·해제(바로 저장), Esc·Tab은 닫기.
// "담당자 없음"은 전부 비우고 닫는다. 처음 고른 사람이 대표 담당자(member_id)다.
// 닫혀 있을 때의 방향키·Tab은 그대로 표(onGridKeyDown)로 올라가 칸 이동이 된다.
function OwnerCell({ value, members, disabled, row, col, onChange }: {
  value: string[]; members: Pick<Member, 'id' | 'name'>[]; disabled?: boolean; row: number; col: number; onChange: (memberIds: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  // 목록은 표 밖(body)에 띄운다 — 표 상자가 가로 스크롤(overflow)이라 안에 그리면 아래 행·표 끝에서 잘려 가려졌다.
  // 버튼 위치 기준으로 놓고, 아래 공간이 모자라면 위로 펼친다. 스크롤·창 크기가 바뀌면 닫는다.
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null)
  const options = [{ id: null as string | null, name: '담당자 없음' }, ...members.map(m => ({ id: m.id as string | null, name: m.name }))]
  const names = value.map(id => members.find(m => m.id === id)?.name).filter((n): n is string => !!n)
  const openList = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const want = options.length * 26 + 10
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const up = below < want && above > below
    setPos({ left: r.left, width: Math.max(r.width, 130), ...(up ? { bottom: window.innerHeight - r.top + 2 } : { top: r.bottom + 2 }), maxHeight: Math.max(120, up ? above : below) })
    setHi(Math.max(0, options.findIndex(o => o.id === (value[0] ?? null))))
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!(e.target instanceof Node && listRef.current?.contains(e.target))) setOpen(false) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])
  const toggle = (id: string | null) => {
    if (id === null) { setOpen(false); if (value.length > 0) onChange([]); return }
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }

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
    else if (e.key === 'Enter' || e.key === ' ') toggle(options[hi].id)
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        data-grid-row={row}
        data-grid-col={col}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        title={names.length > 1 ? names.join(', ') : undefined}
        className={`w-full flex items-center justify-between gap-1 text-left text-[12.5px] rounded px-1.5 py-1 focus:outline-none focus:bg-[#F5F8FE] ${names.length ? 'text-[#3A4249]' : 'text-[#B0B8C1]'}`}
      >
        <span className="truncate">{names.length ? names.join(', ') : '담당자'}</span>
        <span className="text-[9px] text-[#B0B8C1] flex-shrink-0">▼</span>
      </button>
      {open && pos && createPortal(
        <ul
          ref={listRef}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          className="fixed z-[90] overflow-y-auto bg-white border border-[#E5E8EB] rounded-md shadow-lg py-1"
        >
          {options.map((o, i) => {
            const on = o.id !== null && value.includes(o.id)
            return (
              <li
                key={o.id ?? 'none'}
                onMouseDown={e => { e.preventDefault(); toggle(o.id) }}
                onMouseEnter={() => setHi(i)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] cursor-pointer ${i === hi ? 'bg-[#4C7FE0]/10' : ''} ${on ? 'text-[#4C7FE0] font-medium' : o.id ? 'text-[#3A4249]' : 'text-[#9AA3AE]'}`}
              >
                {o.id !== null && (
                  <span className={`flex-shrink-0 w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center text-[9px] leading-none ${on ? 'bg-[#4C7FE0] border-[#4C7FE0] text-white' : 'border-[#C4CBD2]'}`}>{on ? '✓' : ''}</span>
                )}
                {o.name}
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </div>
  )
}

// 고정 안건 "방식" 칸 — 회의와 무관하게 그 행에 계속 붙는 자유 텍스트. 칸에서 벗어나면 저장.
function NoteCell({ item, wr, row, col }: { item: ReportItem; wr: WorkReportState; row: number; col: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? item.note ?? ''
  return (
    <AutoTextarea
      data-grid-row={row}
      data-grid-col={col}
      value={value}
      readOnly={item.pending}
      onChange={e => setDraft(e.target.value.slice(0, 2000))}
      onBlur={() => {
        if (draft === null) return
        const next = draft
        void wr.setNote(item, next).then(() => setDraft(null))
      }}
      placeholder="방식 — 예: 근태 대시보드 캡처 공유"
      className="block w-full min-h-[36px] text-[13px] leading-relaxed px-2.5 py-2 bg-transparent border-0 focus:outline-none resize-none overflow-hidden text-[#3A4249] focus:bg-[#F5F8FE]"
    />
  )
}

// 이번 회의에 새로 생긴 행의 지난 기록 칸 — 쓸 내용이 없는 칸이라 아주 옅은 빗금으로만 표시한다(회색 덩어리는 너무 튀었다).
const NEW_ROW_PREV_CELL = 'bg-[#FCFCFD] bg-[repeating-linear-gradient(135deg,#ECEEF1_0_1px,transparent_1px_7px)]'

// "이번 논의/업데이트" 열의 파란 상자 — 칸 테두리(border)는 표에서 옆 칸 선과 겹치면 한쪽이 지워져 왼쪽·아래가 비었다.
// 칸 위에 얹은 덮개(::after)의 안쪽 그림자로 그려, 겹침이나 입력칸 배경과 상관없이 네 변이 다 보이게 한다.
// 머리줄은 위·양옆, 행은 양옆, 묶음 마지막 행은 아래까지. (Tailwind가 클래스를 찾을 수 있게 색을 글자 그대로 적는다.)
const FOCUS_COL_HEAD = 'relative after:absolute after:inset-0 after:pointer-events-none after:shadow-[inset_2px_0_0_#4C7FE073,inset_-2px_0_0_#4C7FE073,inset_0_2px_0_#4C7FE073]'
const FOCUS_COL = 'relative after:absolute after:inset-0 after:pointer-events-none after:shadow-[inset_2px_0_0_#4C7FE073,inset_-2px_0_0_#4C7FE073]'
const FOCUS_COL_LAST = 'relative after:absolute after:inset-0 after:pointer-events-none after:shadow-[inset_2px_0_0_#4C7FE073,inset_-2px_0_0_#4C7FE073,inset_0_-2px_0_#4C7FE073]'

// 머리줄 아래에 같이 고정하는 묶음 이름 줄의 높이.
const STICKY_BAR_H = 40

const fmtShort = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

// 키보드로 오가는 줄 — 데이터 행이거나 묶음의 새 행 입력줄.
type NavRow = { kind: 'item'; item: ReportItem } | { kind: 'new'; sectionKey: string }

export default function ReportTable({ wr, locks, agenda, sections, members, linked, onAddLinked, onToggleLinked, onCompletePriorAction, defaultDue, colWidths, onColWidthsChange, pinnedMode = false, lockAgenda = false }: Props) {
  const w = sanitizeColWidths(colWidths)
  const resizable = !!onColWidthsChange
  // 엑셀처럼 경계 양옆 두 칸만 너비를 주고받는다(나머지 칸은 그대로). 한쪽이 남는 폭을 채우는 칸(이번 논의·방식)이면
  // null로 두고 그 칸이 흡수한다 — 그래도 반대편 경계는 움직이지 않는다.
  // 기준은 저장값이 아니라 끌기 시작할 때 실제 그려진 칸 너비 — 둘이 어긋나 있으면 첫 움직임에 칸이 툭 튀었다.
  const handle = (left: keyof ColWidths | null, right: keyof ColWidths | null) => resizable ? (
    <ResizeHandle onStart={el => {
      const table = el.closest('table')
      const base = { ...w }
      for (const key of Object.keys(base) as (keyof ColWidths)[]) {
        const th = table?.querySelector<HTMLElement>(`th[data-col="${key}"]`)
        if (th) base[key] = Math.max(minWidthOf(key), th.offsetWidth)
      }
      return dx => {
        let d = dx
        if (left) d = Math.max(d, minWidthOf(left) - base[left])
        if (right) d = Math.min(d, base[right] - minWidthOf(right))
        const next = { ...base }
        if (left) next[left] = base[left] + d
        if (right) next[right] = base[right] - d
        onColWidthsChange?.(next)
      }
    }} />
  ) : null
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
  // 행 끌어 옮기기 — 끄는 행과, 놓을 자리(그 행의 위/아래).
  const [dragging, setDragging] = useState<{ sectionKey: string; id: string } | null>(null)
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null)

  function dropOn(section: ReportSection, target: ReportItem, after: boolean) {
    const d = dragging
    setDragging(null)
    setDropAt(null)
    if (!d || d.sectionKey !== section.key || d.id === target.id || !section.onReorder) return
    const moving = section.items.find(i => i.id === d.id)
    if (!moving) return
    const rest = section.items.filter(i => i.id !== d.id)
    const at = rest.findIndex(i => i.id === target.id) + (after ? 1 : 0)
    section.onReorder([...rest.slice(0, at), moving, ...rest.slice(at)])
  }
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({})
  const [newTitles, setNewTitles] = useState<Record<string, string>>({})
  const newInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // 결정/액션 입력줄의 기본 담당자 — 안건 표는 안건 담당자 전부, 업무보고 표는 그 묶음 팀원(묶음 key = 팀원 id).
  const nameOf = (id: string) => members.find(m => m.id === id)?.name ?? ''
  const ownerName = (item: ReportItem, sectionKey: string) => agenda
    ? ownerIdsOf(item).map(nameOf).filter(Boolean).join(', ')
    : nameOf(sectionKey) || nameOf(item.member_id ?? '')
  const noun = agenda ? '안건' : '업무'
  const cols = pinnedMode ? 5 : agenda ? 9 : 8
  // 키보드로 움직이는 칸(열 번호) — 지난 기록 칸은 건너뛰고, 결정·액션 칸은 [+결정] [+액션] 버튼이 각각 한 칸.
  const nav = pinnedMode
    ? { title: 0, owner: 1, note: 2, update: -1, feedback: -1, decision: -1, action: -1, done: 3, count: 4 }
    : agenda
      ? { title: 0, owner: 1, note: -1, update: 2, feedback: 3, decision: 4, action: 5, done: 6, count: 7 }
      : { title: 0, owner: -1, note: -1, update: 1, feedback: 2, decision: 3, action: 4, done: 5, count: 6 }
  // 칸 이동·고정 계산의 기준 — 공용 제목행 표면 그 표, 묶음 상자 표(업무보고)면 상자들을 감싼 div.
  const gridRef = useRef<HTMLElement | null>(null)
  // 묶음 머리줄(팀원 이름·자유 메모)은 표 전체 폭(1180px+)이 아니라 지금 보이는 폭에 맞춰 왼쪽에 붙여 둔다 —
  // 긴 메모가 가로 스크롤 끝까지 늘어나 읽기 어렵던 문제.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setViewW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 묶음마다 제목행을 두는 표(오늘 안건·업무보고) — 이름(대상자)·자유 메모 줄 아래에 그 묶음의 제목행(업무명·지난 업데이트…)이 오고
  // 그 밑에 행이 붙는다. 표 맨 위 공용 제목행이 메모 줄에 끊겨 "이번 업데이트" 파란 칸이 잘려 보이던 문제 때문.
  const sectionHeads = sections.some(sec => !!sec.stickyHeader)

  // 제목행 고정 — 표 상자가 가로 스크롤(overflow)이라 CSS sticky가 표 상자 안에서만 동작해 소용없다.
  // 바깥 스크롤 상자(회의창·회의록 본문)를 따라 보이는 맨 위에 붙여 둔다.
  //  - 공용 제목행 표(고정 안건): thead를 아래로 밀어 둔다.
  //  - 묶음 제목행 표(오늘 안건·업무보고): 지금 보는 묶음의 제목행이 화면 위로 지나가면 [이름 줄 + 제목행] 덮개를 맨 위에 띄운다.
  //    다음 팀원 이름 줄이 올라오면 덮개를 위로 밀어내며 그 팀원으로 바뀐다(연락처 앱의 ㄱ·ㄴ 머리글처럼).
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [stuckKey, setStuckKey] = useState<string | null>(null)
  useEffect(() => {
    if (pinnedMode) return
    const table = gridRef.current
    const box = scrollRef.current
    if (!table || !box) return
    let scroller: HTMLElement | null = box.parentElement
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    let raf = 0
    const update = () => {
      raf = 0
      const top = scroller ? scroller.getBoundingClientRect().top : 0
      const r = table.getBoundingClientRect()
      if (!sectionHeads) {
        const head = theadRef.current
        if (!head) return
        const off = Math.max(0, Math.min(top - r.top, r.height - head.offsetHeight * 2))
        head.style.transform = off > 0 ? `translateY(${off}px)` : ''
        head.style.boxShadow = off > 0 ? '0 2px 4px rgba(15, 23, 42, 0.06)' : ''
        return
      }
      const overlay = overlayRef.current
      // 지금 보는 묶음 = 이름 줄이 화면 맨 위를 지난 마지막 묶음. 그 묶음의 제목행까지 지나갔을 때만 덮개를 띄운다.
      let key: string | null = null
      let nextTop: number | null = null
      for (const tr of table.querySelectorAll<HTMLElement>('tr[data-sec-name]')) {
        const t = tr.getBoundingClientRect().top
        if (t <= top) key = tr.dataset.secName ?? null
        else { nextTop = t; break }
      }
      const colHead = key ? table.querySelector<HTMLElement>(`tr[data-sec-head="${CSS.escape(key)}"]`) : null
      if (!colHead || colHead.getBoundingClientRect().top > top) key = null
      setStuckKey(prev => (prev === key ? prev : key))
      if (!overlay) return
      if (!key) { overlay.style.visibility = 'hidden'; return }
      const h = overlay.offsetHeight
      // 지금 묶음 상자의 아래 끝에 닿으면 덮개도 같이 밀려 올라간다(다음 상자와 겹치지 않게).
      const boxEl = colHead?.closest<HTMLElement>('[data-sec-box]')
      const boxBottom = boxEl ? boxEl.getBoundingClientRect().bottom : (nextTop ?? r.bottom)
      const y = Math.min(top, boxBottom - h)
      overlay.style.visibility = 'visible'
      overlay.style.width = `${boxEl?.offsetWidth ?? table.offsetWidth}px`
      overlay.style.transform = `translateY(${Math.round(y - box.getBoundingClientRect().top)}px)`
      if (barRef.current) barRef.current.style.transform = `translateX(${box.scrollLeft}px)`
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update) }
    const target: HTMLElement | Window = scroller ?? window
    target.addEventListener('scroll', schedule, { passive: true })
    box.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const ro = new ResizeObserver(schedule)
    ro.observe(table)
    update()
    return () => {
      target.removeEventListener('scroll', schedule)
      box.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [pinnedMode, sectionHeads])

  const stuckSection = stuckKey ? sections.find(sec => sec.key === stuckKey) : undefined
  // 덮개가 새로 나타나거나 묶음이 바뀐 순간에도 자리를 바로 맞춘다(그다음부턴 스크롤 때 update가 맞춘다).
  useLayoutEffect(() => {
    const box = scrollRef.current
    if (barRef.current && box) barRef.current.style.transform = `translateX(${box.scrollLeft}px)`
  }, [stuckKey])

  // 화면에 보이는 순서대로 줄 번호를 매긴다(접힌 묶음은 건너뜀).
  const navRows: NavRow[] = []
  for (const s of sections) {
    if (s.collapsed) continue
    for (const item of s.items) navRows.push({ kind: 'item', item })
    if (s.onAdd) navRows.push({ kind: 'new', sectionKey: s.key })
  }
  const rowIndexOf = new Map<string, number>()
  navRows.forEach((r, i) => rowIndexOf.set(r.kind === 'item' ? r.item.id : `new:${r.sectionKey}`, i))

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
  function onGridKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return
    const el = e.target as HTMLElement
    const row = Number(el.dataset?.gridRow)
    const col = Number(el.dataset?.gridCol)
    if (Number.isNaN(row) || Number.isNaN(col)) return
    const isNew = (r: number) => navRows[r]?.kind === 'new'
    const text = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text') ? el as HTMLTextAreaElement | HTMLInputElement : null
    const go = (r: number, c: number) => {
      if (r < 0 || r >= navRows.length) return false
      return focusCell(r, isNew(r) ? 0 : c)
    }
    // 칸 순서대로 다음/이전으로 — 저장 중인 행처럼 그 칸이 없으면 그다음 칸으로 건너뛴다.
    // sameRow: 좌우 방향키는 줄을 넘지 않는다.
    const step = (dir: 1 | -1, sameRow: boolean) => {
      const order: [number, number][] = []
      navRows.forEach((r, i) => {
        if (r.kind === 'new') order.push([i, 0])
        else for (let c = 0; c < nav.count; c++) order.push([i, c])
      })
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

  // 앞 행 저장 응답을 기다리지 않는다 — 연달아 Enter로 여러 행을 빠르게 적을 수 있게(순서는 생성 시각으로 맞춰짐).
  async function submitNew(section: ReportSection) {
    const title = (newTitles[section.key] ?? '').trim()
    if (!title || !section.onAdd) return
    setNewTitles(p => ({ ...p, [section.key]: '' }))
    const item = await section.onAdd(title)
    // 실패하면 (새로 입력 중이 아닐 때) 입력값을 되돌려 다시 시도할 수 있게 한다
    if (!item) setNewTitles(p => ({ ...p, [section.key]: p[section.key] || title }))
  }

  async function commitTitle(item: ReportItem) {
    const draft = titleDrafts[item.id]
    if (draft === undefined) return
    if (!draft.trim()) { setTitleDrafts(p => { const n = { ...p }; delete n[item.id]; return n }); return } // 빈 이름은 저장하지 않고 원래 이름으로
    await wr.renameItem(item, draft.slice(0, REPORT_TITLE_MAX))
    setTitleDrafts(p => { const n = { ...p }; delete n[item.id]; return n })
  }

  // 고정 해제 = 이 회의에서 끝냄(완료와 같은 closed_on). 이 회의엔 남고 다음 회의부터 안 보인다.
  function togglePinnedClose(item: ReportItem, closedHere: boolean) {
    if (!closedHere && !confirm(`"${item.title}" 고정을 해제할까요?\n이 회의까지만 보이고 다음 회의부터는 나오지 않습니다(지난 회의록 내용은 그대로 남습니다).`)) return
    void wr.setDone(item, !closedHere)
  }

  // 오늘 안건 표를 팀장이 아닌 사람이 볼 때 — 행 전체를 읽기 전용으로.
  const tableLocked = lockAgenda && agenda && !pinnedMode
  const cell = (item: ReportItem, field: ReportField, placeholder: string, row: number) => (
    <ReportCell wr={wr} locks={locks} itemId={item.id} field={field} placeholder={placeholder} pending={item.pending} readOnly={tableLocked} row={row} col={field === 'update' ? nav.update : nav.feedback} />
  )

  function renderItem(item: ReportItem, section: ReportSection) {
    const sectionKey = section.key
    const reorderable = !!section.onReorder && !item.pending
    const isDragging = dragging?.id === item.id
    const dropLine = dragging && dragging.sectionKey === sectionKey && dropAt?.id === item.id && !isDragging
      ? (dropAt.after ? '[&>td]:shadow-[inset_0_-2px_0_#4C7FE0]' : '[&>td]:shadow-[inset_0_2px_0_#4C7FE0]')
      : ''
    const dragProps = section.onReorder ? {
      onDragOver: (e: React.DragEvent<HTMLTableRowElement>) => {
        if (!dragging || dragging.sectionKey !== sectionKey) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const r = e.currentTarget.getBoundingClientRect()
        const after = e.clientY > r.top + r.height / 2
        if (dropAt?.id !== item.id || dropAt.after !== after) setDropAt({ id: item.id, after })
      },
      onDrop: (e: React.DragEvent<HTMLTableRowElement>) => {
        if (!dragging || dragging.sectionKey !== sectionKey) return
        e.preventDefault()
        const r = e.currentTarget.getBoundingClientRect()
        dropOn(section, item, e.clientY > r.top + r.height / 2)
      },
    } : {}
    const dragHandle = section.onReorder ? (
      <span
        draggable={reorderable}
        onDragStart={e => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', item.id)
          const tr = e.currentTarget.closest('tr')
          if (tr) e.dataTransfer.setDragImage(tr, 16, 16)
          setDragging({ sectionKey, id: item.id })
        }}
        onDragEnd={() => { setDragging(null); setDropAt(null) }}
        title={reorderable ? '끌어서 순서 바꾸기' : undefined}
        className={`flex-shrink-0 self-stretch flex items-center pl-1.5 pr-0.5 text-[13px] leading-none select-none ${reorderable ? 'cursor-grab active:cursor-grabbing text-[#C4CBD2] hover:text-[#4C7FE0] opacity-0 group-hover:opacity-100' : 'invisible'}`}
      >⠿</span>
    ) : null
    const rowIndex = rowIndexOf.get(item.id) ?? -1
    const done = wr.isDoneHere(item)
    const pinned = !!item.pinned
    const prev = wr.previous[item.id]
    // 묶음의 마지막 행 — "이번 논의/업데이트" 파란 상자의 아래 선을 여기서 닫는다.
    const lastInSection = section.items[section.items.length - 1]?.id === item.id
    // 이번 회의에 처음 생긴 행(지난 회의엔 없었음) — 지난 기록 칸을 회색으로 막는다.
    const newHere = !prev && !!wr.date && item.start_date >= wr.date
    const mine = linked.filter(l => l.report_item_id === item.id)
    const prior = wr.openActions.filter(a => a.report_item_id === item.id)
    const composing = composer?.itemId === item.id ? composer : null
    const sharedAgenda = !agenda && item.kind === 'agenda'
    // 안건명·완료는 팀장만 — 오늘 안건 표에서든, 담당자 업무보고 묶음에 넘어간 안건 행에서든.
    const agendaLocked = tableLocked || (lockAgenda && sharedAgenda)
    const owner = ownerName(item, sectionKey)
    // 완료·삭제 칸은 표 오른쪽에 붙여 둔다(가로 스크롤해도 보이게) — 아래 칸 글이 비치지 않게 행 색을 불투명하게 깐다.
    const stickyBg = done ? 'bg-[#FAFBFB]' : pinned ? 'bg-[#FFFBEB]' : sharedAgenda ? 'bg-[#EEF7FD]' : 'bg-white'
    if (pinnedMode) {
      return (
        <tr key={`${sectionKey}:${item.id}`} className={`align-top border-b border-[#F2F3F5] group ${done ? 'bg-[#FAFBFB]' : 'bg-[#FFFBEB]'} ${item.pending ? 'opacity-60' : ''}`}>
          <td className="border-r border-[#F2F3F5]">
            <input
              data-grid-row={rowIndex}
              data-grid-col={nav.title}
              value={titleDrafts[item.id] ?? item.title}
              readOnly={item.pending}
              onChange={e => setTitleDrafts(p => ({ ...p, [item.id]: e.target.value }))}
              onBlur={() => { void commitTitle(item) }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); newInputRefs.current[sectionKey]?.focus() } }}
              placeholder="안건명"
              className={`w-full min-w-0 text-[13px] font-medium px-3 py-2 bg-transparent border-0 focus:outline-none focus:bg-[#F5F8FE] ${done ? 'line-through text-[#B0B8C1]' : 'text-[#1F2933]'}`}
            />
          </td>
          <td className="border-r border-[#F2F3F5] px-1 py-1">
            <OwnerCell value={ownerIdsOf(item)} members={members} disabled={item.pending} row={rowIndex} col={nav.owner} onChange={ids => { void wr.setOwners(item, ids) }} />
          </td>
          <td className="border-r border-[#F2F3F5]"><NoteCell item={item} wr={wr} row={rowIndex} col={nav.note} /></td>
          <td className="text-center pt-2">
            <button
              type="button"
              data-grid-row={rowIndex}
              data-grid-col={nav.done}
              disabled={item.pending}
              onClick={() => togglePinnedClose(item, done)}
              title={done ? '고정 해제 취소 — 다음 회의에도 계속 나옵니다' : '고정 해제 — 이 회의까지만 보이고 다음 회의부터 사라집니다'}
              className={`text-[10.5px] font-medium rounded px-1 py-0.5 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B45309]/40 ${done ? 'text-[#7A8491] border border-[#E5E8EB]' : 'text-[#92400E] border border-[#FCD34D] hover:bg-[#FEF3C7]'}`}
            >{done ? '해제 취소' : '고정 해제'}</button>
          </td>
          <td className="text-center pt-2">
            {!item.pending && <button
              onClick={() => { if (confirm(`"${item.title || '안건'}"를 삭제할까요? 모든 회차 기록이 함께 지워집니다.\n끝난 안건이라면 삭제 대신 고정 해제를 누르세요.`)) void wr.deleteItem(item) }}
              title="삭제"
              className="text-[11px] text-[#C4CBD2] hover:text-red-500 opacity-0 group-hover:opacity-100"
            >✕</button>}
          </td>
        </tr>
      )
    }
    return (
      <Fragment key={`${sectionKey}:${item.id}`}>
        <tr {...dragProps} className={`align-top border-b border-[#F2F3F5] group ${done ? 'bg-[#FAFBFB]' : pinned ? 'bg-[#FFFBEB]' : sharedAgenda ? 'bg-[#EEF7FD]' : ''} ${item.pending ? 'opacity-60' : ''} ${isDragging ? 'opacity-40' : ''} ${dropLine}`}>
          <td className="border-r border-[#F2F3F5]">
            <div className="flex items-center">
              {dragHandle}
              {pinned && <span title="고정 안건 — 해제할 때까지 매 회의에 이어서 나옵니다" className="flex-shrink-0 ml-2.5 -mr-1.5 text-[10.5px] font-semibold text-[#92400E] bg-[#FDE68A] rounded px-1 py-px">고정</span>}
              {sharedAgenda && !pinned && <span title="안건 표의 안건 — 여기 쓴 내용은 안건 표에도 보입니다" className="flex-shrink-0 ml-2.5 -mr-1.5 text-[10.5px] font-semibold text-[#2B7BB9] bg-[#D6ECFA] rounded px-1 py-px">안건</span>}
              <input
                data-grid-row={rowIndex}
                data-grid-col={nav.title}
                value={titleDrafts[item.id] ?? item.title}
                readOnly={item.pending || agendaLocked}
                title={agendaLocked ? '안건명은 팀장만 바꿀 수 있습니다' : undefined}
                onChange={e => { if (!agendaLocked) setTitleDrafts(p => ({ ...p, [item.id]: e.target.value })) }}
                onBlur={() => { void commitTitle(item) }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); newInputRefs.current[sectionKey]?.focus() } }}
                placeholder={agenda ? '안건명' : '업무명'}
                className={`w-full min-w-0 text-[13px] font-medium ${dragHandle ? 'pl-1.5 pr-3' : 'px-3'} py-2 bg-transparent border-0 focus:outline-none focus:bg-[#F5F8FE] ${done ? 'line-through text-[#B0B8C1]' : 'text-[#1F2933]'}`}
              />
            </div>
          </td>
          {agenda && (
            <td className="border-r border-[#F2F3F5] px-1 py-1">
              <OwnerCell
                value={ownerIdsOf(item)}
                members={members}
                disabled={item.pending || tableLocked}
                row={rowIndex}
                col={nav.owner}
                onChange={ids => { void wr.setOwners(item, ids) }}
              />
            </td>
          )}
          {/* 지난 기록 두 칸 — 지난 회의부터 있던 행은 연한 회색 글씨로만 가라앉히고, 이번 회의에 처음 생긴 행은
              지난 기록이 있을 수 없으니 칸 자체를 회색으로 막아 둔다. 이번 논의 칸은 파란 테두리로 띄워 오늘 쓸 곳에 눈이 가게 한다 */}
          <td className={`border-r border-[#F2F3F5] px-3 py-2 ${newHere ? NEW_ROW_PREV_CELL : ''}`}>
            {prev ? (
              <>
                <p className="text-[10.5px] text-[#C9CFD5] mb-0.5">{fmtShort(prev.meeting_date)}</p>
                {prev.update_text && <p className="text-[12px] text-[#B8BFC7] leading-relaxed whitespace-pre-wrap break-words">{prev.update_text}</p>}
              </>
            ) : !newHere && (
              <p className="text-[12px] text-[#D5DAE0]">—</p>
            )}
          </td>
          {/* 지난 피드백 — 직전 회차 피드백 칸에 적었던 내용(예전엔 지난 논의 아래 파란 ↳로 섞여 보였다) */}
          <td className={`border-r border-[#F2F3F5] px-3 py-2 ${newHere ? NEW_ROW_PREV_CELL : ''}`}>
            {prev?.feedback
              ? <p className="text-[12px] text-[#B8BFC7] leading-relaxed whitespace-pre-wrap break-words">{prev.feedback}</p>
              : !newHere && <p className="text-[12px] text-[#D5DAE0]">—</p>}
          </td>
          <td className={`${lastInSection ? FOCUS_COL_LAST : FOCUS_COL} ${sharedAgenda && !done ? '' : 'bg-white'}`}>{cell(item, 'update', agenda || sharedAgenda ? '이번 논의' : '이번 업데이트', rowIndex)}</td>
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
                    {l.content}
                    {l.kind === 'action' && (l.owner || l.due_date) && <span className="text-[#9AA3AE]">{l.owner ? ` · ${l.owner}` : ''}{l.due_date ? ` · ${fmtShort(l.due_date)}` : ''}</span>}
                  </span>
                </li>
              ))}
              {prior.map(a => (
                <li key={a.id} className="flex items-start gap-1.5 text-[12px] leading-snug" title={`${fmtShort(a.meeting_date)} 회의에서 등록한 액션`}>
                  <input type="checkbox" checked={false} onChange={() => onCompletePriorAction(a)} className="flex-shrink-0 mt-0.5" title="액션 완료" />
                  <span className="flex-1 break-words text-[#5B6570]">
                    {a.content}
                    <span className="text-[#9AA3AE]">{a.owner ? ` · ${a.owner}` : ''} · {a.due_date ? fmtShort(a.due_date) : `${fmtShort(a.meeting_date)} 등록`}</span>
                  </span>
                </li>
              ))}
            </ul>
            {!item.pending && !tableLocked && <div className={`flex gap-1 ${mine.length + prior.length > 0 ? 'mt-1.5' : ''} ${composing ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
              {(['decision', 'action'] as const).map(kind => (
                <button
                  key={kind}
                  type="button"
                  data-grid-row={rowIndex}
                  data-grid-col={kind === 'decision' ? nav.decision : nav.action}
                  onClick={() => setComposer(composing?.kind === kind ? null : { itemId: item.id, kind, text: item.title, due: kind === 'action' ? defaultDue : '', owner, row: rowIndex })}
                  className={`text-[11px] font-medium rounded px-1.5 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4C7FE0]/40 ${composing?.kind === kind ? 'bg-[#4C7FE0] text-white' : 'text-[#4C7FE0] bg-[#4C7FE0]/[0.08] hover:bg-[#4C7FE0]/15'}`}
                >+ {kind === 'decision' ? '결정' : '액션'}</button>
              ))}
            </div>}
          </td>
          <td className={`sticky right-8 z-[1] text-center pt-2 shadow-[inset_1px_0_0_#F2F3F5] ${stickyBg}`}>
            {pinned ? (
              <button
                type="button"
                data-grid-row={rowIndex}
                data-grid-col={nav.done}
                disabled={item.pending}
                onClick={() => togglePinnedClose(item, done)}
                title={done ? '고정 해제 취소 — 다음 회의에도 계속 나옵니다' : '고정 해제 — 이 회의까지만 보이고 다음 회의부터 사라집니다'}
                className={`text-[10.5px] font-medium rounded px-1 py-0.5 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B45309]/40 ${done ? 'text-[#7A8491] border border-[#E5E8EB]' : 'text-[#92400E] border border-[#FCD34D] hover:bg-[#FEF3C7]'}`}
              >{done ? '해제 취소' : '고정 해제'}</button>
            ) : (
              <input
                data-grid-row={rowIndex}
                data-grid-col={nav.done}
                type="checkbox"
                checked={done}
                disabled={item.pending || agendaLocked}
                onChange={() => { void wr.setDone(item, !done) }}
                title={agendaLocked ? '안건 완료는 팀장만 할 수 있습니다' : done ? '완료 취소' : '이 회의에서 완료 — 다음 회의부터 안 보입니다'}
                className={agendaLocked ? 'mt-0.5 cursor-not-allowed' : 'cursor-pointer mt-0.5'}
              />
            )}
          </td>
          <td className={`sticky right-0 z-[1] text-center pt-2 ${stickyBg}`}>
            {!item.pending && !sharedAgenda && !tableLocked && <button
              onClick={() => { if (confirm(`"${item.title || noun}"를 삭제할까요? 모든 회차의 ${agenda ? '논의' : '업데이트'}·피드백이 함께 지워집니다.\n끝난 ${agenda ? '안건이라면' : '업무라면'} 삭제 대신 ${pinned ? '고정 해제를 누르' : '완료를 체크하'}세요.`)) void wr.deleteItem(item) }}
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
                  {composing.kind === 'decision' ? '이번 회의 결정사항으로 등록' : agenda ? '액션아이템으로 등록' : `${owner}님 액션아이템으로 등록`}
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
                    className="w-28 flex-shrink-0 text-[13px] border border-[#D3DCEC] rounded-md px-2 py-1.5 bg-white"
                  >
                    <option value="">담당자 없음</option>
                    {owner.includes(',') && <option value={owner}>{owner}</option>}
                    {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                )}
                {composing.kind === 'action' && (
                  <input
                    type="date"
                    value={composing.due}
                    onChange={e => setComposer(c => c && { ...c, due: e.target.value })}
                    title="기한 — 담당자 일정 캘린더에 이 날짜로 올라갑니다"
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
  }

  const colGroup = (
    <colgroup>
      <col style={{ width: w.title }} />
      {agenda && <col style={{ width: w.owner }} />}
      <col style={{ width: w.prev }} />
      <col style={{ width: w.prevFb }} />
      <col />
      <col style={{ width: w.feedback }} />
      <col style={{ width: w.link }} />
      <col style={{ width: w.done }} />
      <col style={{ width: 32 }} />
    </colgroup>
  )
  const tableMinWidth = pinnedMode ? w.title + w.owner + w.done + 32 + 320 : Math.max(1180, w.title + (agenda ? w.owner : 0) + w.prev + w.prevFb + w.feedback + w.link + w.done + 32 + 280)
  // 제목행(업무명·지난 업데이트…) — 공용 thead, 묶음마다의 제목행, 고정 덮개가 같은 모양을 쓴다.
  const headRow = (sectionKey?: string) => (
    <tr data-sec-head={sectionKey} className="text-left text-[11.5px] font-semibold text-[#7A8491] border-b border-[#EEF0F2] bg-[#FAFBFB]">
      <th data-col="title" className="relative px-3 py-2">{agenda ? '안건명' : '업무명'}{handle('title', agenda ? 'owner' : 'prev')}</th>
      {agenda && <th data-col="owner" className="relative px-3 py-2">담당자{handle('owner', 'prev')}</th>}
      <th data-col="prev" className="relative px-3 py-2 text-[#A3ABB5] font-medium">{agenda ? '지난 논의' : '지난 업데이트'}{handle('prev', 'prevFb')}</th>
      <th data-col="prevFb" className="relative px-3 py-2 text-[#A3ABB5] font-medium">지난 피드백{handle('prevFb', null)}</th>
      <th className={`relative px-3 py-2 text-[#2F5FC4] bg-[#EEF3FD] ${FOCUS_COL_HEAD}`}>✏️ {agenda ? '이번 논의' : '이번 업데이트'}{handle(null, 'feedback')}</th>
      <th data-col="feedback" className="relative px-3 py-2">피드백{handle('feedback', 'link')}</th>
      <th data-col="link" className="relative px-3 py-2">결정·액션{handle('link', 'done')}</th>
      <th data-col="done" className="sticky right-8 z-[2] px-1 py-2 text-center bg-[#FAFBFB] shadow-[inset_1px_0_0_#EEF0F2]">완료</th>
      <th className="sticky right-0 z-[2] bg-[#FAFBFB]" />
    </tr>
  )

  // 묶음 하나의 줄들 — 이름·메모 줄, (묶음 제목행), 행, 새 행 입력줄.
  const sectionRows = (section: ReportSection) => (
    <>
      {section.header && (
        <tr data-sec-name={sectionHeads ? section.key : undefined} className={`border-b border-[#F2F3F5] ${sectionHeads ? 'bg-[#F7F9FC]' : 'bg-[#FAFBFB]'}`}>
          <td colSpan={cols} className={sectionHeads ? 'px-3.5 py-3' : 'px-3 py-1.5'}>
            <div className="sticky left-3" style={viewW ? { width: Math.max(240, viewW - 26) } : undefined}>{section.header}</div>
          </td>
        </tr>
      )}
      {sectionHeads && !section.collapsed && headRow(section.key)}
      {!section.collapsed && section.items.map(item => renderItem(item, section))}
      {!section.collapsed && section.onAdd && (
        <tr className="border-b border-[#F2F3F5] last:border-b-0">
          <td colSpan={cols} className={`px-3 py-1.5 ${section.pinnedTone ? 'bg-[#FFFBEB]/60' : ''}`}>
            <input
              ref={el => { newInputRefs.current[section.key] = el }}
              data-grid-row={rowIndexOf.get(`new:${section.key}`)}
              data-grid-col={0}
              value={newTitles[section.key] ?? ''}
              onChange={e => setNewTitles(p => ({ ...p, [section.key]: e.target.value.slice(0, REPORT_TITLE_MAX) }))}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void submitNew(section) } }}
              onBlur={() => { void submitNew(section) }}
              placeholder={section.addPlaceholder}
              className={`w-full text-[12.5px] px-0 py-1 bg-transparent border-0 focus:outline-none ${section.pinnedTone ? 'text-[#92400E] placeholder:text-[#C2A15E]' : 'text-[#3A4249] placeholder:text-[#B0B8C1]'}`}
            />
          </td>
        </tr>
      )}
    </>
  )

  // 묶음 상자 표(업무보고) — 팀원마다 둥근 상자(옅은 그림자) 하나씩. 표를 묶음마다 나눠도 열 너비(colgroup)·최소 폭이 같아 세로줄이 맞는다.
  // 상자는 overflow: clip으로 모서리를 자른다(hidden이면 상자가 스크롤 상자가 돼 오른쪽 완료 칸 sticky가 안 먹는다).
  if (sectionHeads) {
    return (
      <div ref={scrollRef} className="relative overflow-x-auto pb-1">
        <div ref={el => { gridRef.current = el }} onKeyDown={onGridKeyDown} className="space-y-5" style={{ minWidth: tableMinWidth }}>
          {sections.map(section => (
            <div key={section.key} data-sec-box className="bg-white border border-[#E3E7EC] rounded-xl [overflow:clip] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_3px_10px_rgba(15,23,42,0.05)]">
              <table className="w-full border-collapse table-fixed">
                {colGroup}
                <tbody>{sectionRows(section)}</tbody>
              </table>
            </div>
          ))}
        </div>
        <div ref={overlayRef} style={{ visibility: 'hidden' }} className="absolute left-0 top-0 z-[5] pointer-events-none bg-white border border-[#E3E7EC] rounded-t-xl [overflow:clip] shadow-[0_3px_8px_rgba(15,23,42,0.08)]">
          <div ref={barRef} style={{ width: viewW ? viewW - 2 : undefined, height: STICKY_BAR_H }} className="flex items-center px-2.5 bg-[#F7F9FC] border-b border-[#EEF0F2]">
            {stuckSection?.stickyHeader}
          </div>
          <table className="w-full border-collapse table-fixed pointer-events-auto">
            {colGroup}
            <thead>{headRow()}</thead>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="relative overflow-x-auto border border-[#E5E8EB] rounded-lg">
      <table
        ref={el => { gridRef.current = el }}
        onKeyDown={onGridKeyDown}
        className="w-full border-collapse table-fixed"
        style={{ minWidth: tableMinWidth }}
      >
        {pinnedMode ? (
          <>
            <colgroup>
              <col style={{ width: w.title }} />
              <col style={{ width: w.owner }} />
              <col />
              <col style={{ width: w.done }} />
              <col style={{ width: 32 }} />
            </colgroup>
            <thead className="bg-[#FAFBFB]">
              <tr className="text-left text-[11.5px] font-semibold text-[#7A8491] border-b border-[#EEF0F2]">
                <th data-col="title" className="relative px-3 py-2">안건명{handle('title', 'owner')}</th>
                <th data-col="owner" className="relative px-3 py-2">담당자{handle('owner', null)}</th>
                <th className="px-3 py-2">방식</th>
                <th data-col="done" className="px-1 py-2 text-center">완료</th>
                <th />
              </tr>
            </thead>
          </>
        ) : (<>
        {colGroup}
        <thead ref={theadRef} className="relative z-[3] bg-[#FAFBFB]">{headRow()}</thead>
        </>)}
        <tbody>
          {sections.map(section => <Fragment key={section.key}>{sectionRows(section)}</Fragment>)}
        </tbody>
      </table>
    </div>
  )
}

// 표 칸 저장 충돌 안내(칸 잠금이 있어 정상적으론 안 생김 — 순간 접속 끊김 등 예외 상황). 서버 최신값으로 바꾼 뒤
// 내가 쓴 내용은 여기 남겨 필요하면 복사해 다시 붙여넣게 한다.
export function ReportConflictDialog({ wr }: { wr: WorkReportState }) {
  const c = wr.conflict
  if (!c) return null
  const item = wr.items.find(i => i.id === c.itemId)
  const agenda = item?.kind === 'agenda'
  return (
    <div className="fixed inset-0 bg-black/30 z-[70] flex items-center justify-center px-4" onClick={() => wr.dismissConflict()}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#EEF0F2] w-full max-w-[560px] max-h-[80vh] overflow-y-auto p-5">
        <p className="text-[15px] font-semibold text-[#1F2933] mb-1">
          &quot;{item?.title || (agenda ? '안건' : '업무')}&quot; {c.field === 'update' ? (agenda ? '논의' : '업데이트') : '피드백'}가 그 사이 먼저 저장돼 최신 내용으로 바꿨습니다
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
  )
}
