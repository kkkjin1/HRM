'use client'

// R&R 메모 페이지 — R&R 업무명을 누르면 뜨는 큰 팝업. 회차 카드(1차 기획 → 피드백 → 2차 개선 …)가 시간순으로 쌓인다.
// 카드는 평소 읽기 전용 HTML로 보이고, "수정"을 누른 카드 하나만 그 자리에서 문서 편집기(NoteEditor)로 바뀐다
// (편집기는 자동 저장, 닫거나 다른 카드로 옮기면 남은 변경을 바로 저장한다). 저장은 version으로 동시편집 충돌을 막는다.
// 권한(lib/rrMemo): 담당자·팀장만 쓰고 피드백은 팀장만 — 서버(/api/rr-entries)가 다시 확인한다.

import { useEffect, useMemo, useRef, useState } from 'react'
import NoteEditor from '@/components/NoteEditor'
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml'
import {
  RR_ENTRY_KINDS, RR_KIND_LABEL, RR_KIND_TONE, canPinRr, canWriteRrKind, rrEntryLabels, sortRrEntries,
  type RrEntry, type RrEntryKind,
} from '@/lib/rrMemo'
import type { MemberRole } from '@/lib/data'

type Props = {
  item: { id: string; title: string; status: 'active' | 'hold' | 'done'; pinned?: boolean }
  groupName: string
  me: { name: string; role: MemberRole } | null
  onClose: () => void
  onTogglePin: () => void
  onCountChange: (count: number) => void
}

const STATUS_LABEL = { active: '진행', hold: '보류', done: '완료' } as const

function fmtDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  const w = '일월화수목금토'[new Date(y, m - 1, day).getDay()]
  return `${y}.${m}.${day} (${w})`
}

export default function RrMemoPanel({ item, groupName, me, onClose, onTogglePin, onCountChange }: Props) {
  const [entries, setEntries] = useState<RrEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // 편집 중 카드의 최신 version — 편집기는 마운트 때 값만 받으므로 저장마다 여기서 꺼내 쓴다
  const versionRef = useRef(new Map<string, number>())
  const scrollRef = useRef<HTMLDivElement>(null)
  const onCountRef = useRef(onCountChange)
  useEffect(() => { onCountRef.current = onCountChange })

  const sorted = useMemo(() => sortRrEntries(entries), [entries])
  const labels = useMemo(() => rrEntryLabels(sorted), [sorted])
  const writableKinds = RR_ENTRY_KINDS.filter(k => canWriteRrKind(me, groupName, k))
  const canPin = canPinRr(me, groupName)

  useEffect(() => {
    let active = true
    fetch(`/api/rr-entries?target_id=${item.id}`)
      .then(r => r.json())
      .then(j => {
        if (!active) return
        if (!j?.ok) { setError(j?.error ?? '불러오지 못했습니다.'); return }
        const list = j.entries as RrEntry[]
        list.forEach(e => versionRef.current.set(e.id, e.version))
        setEntries(list)
        setLoaded(true)
      })
      .catch(() => { if (active) setError('불러오지 못했습니다.') })
    return () => { active = false }
  }, [item.id])

  useEffect(() => { if (loaded) onCountRef.current(entries.length) }, [entries.length, loaded])

  // ESC — 편집 중이면 편집만 닫고(자동 저장), 아니면 팝업을 닫는다
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (editingId) setEditingId(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editingId, onClose])

  function applyEntry(e: RrEntry) {
    versionRef.current.set(e.id, e.version)
    setEntries(prev => prev.map(x => (x.id === e.id ? e : x)))
  }

  async function patch(id: string, fields: Partial<Pick<RrEntry, 'title' | 'body' | 'kind' | 'entry_date'>>) {
    const res = await fetch('/api/rr-entries', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, expected_version: versionRef.current.get(id) ?? 1, ...fields }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (res?.status === 409 && json?.conflict) {
      if (json.current) applyEntry(json.current as RrEntry)
      throw new Error(`그 사이 ${json.current?.updated_by ?? '다른 분'}님이 이 카드를 고쳤습니다. 편집을 닫았다가 다시 열어 최신 내용에서 이어 써 주세요.`)
    }
    if (!json?.ok) throw new Error(json?.error ?? '저장하지 못했습니다.')
    applyEntry(json.entry as RrEntry)
  }

  async function addEntry(kind: RrEntryKind) {
    if (adding) return
    setAdding(true)
    setError('')
    const res = await fetch('/api/rr-entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: item.id, kind }),
    }).catch(() => null)
    setAdding(false)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) { setError(json?.error ?? '카드를 만들지 못했습니다.'); return }
    const e = json.entry as RrEntry
    versionRef.current.set(e.id, e.version)
    setEntries(prev => [...prev, e])
    setEditingId(e.id)
    setJustCreatedId(e.id)
    requestAnimationFrame(() => document.getElementById(`rr-entry-${e.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  async function removeEntry(e: RrEntry) {
    if (!window.confirm(`"${labels.get(e.id)}" 카드를 지울까요? 되돌릴 수 없습니다.`)) return
    const res = await fetch('/api/rr-entries', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) { setError(json?.error ?? '지우지 못했습니다.'); return }
    if (editingId === e.id) setEditingId(null)
    setEntries(prev => prev.filter(x => x.id !== e.id))
  }

  async function changeMeta(e: RrEntry, fields: Partial<Pick<RrEntry, 'kind' | 'entry_date'>>) {
    setError('')
    try { await patch(e.id, fields) } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-2 sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex flex-col w-full max-w-[920px] h-full max-h-[92vh] bg-[#F7F8FA] rounded-2xl shadow-2xl overflow-hidden">
        {/* 머리 */}
        <div className="flex items-center gap-2 px-5 py-3 bg-white border-b border-[#ECEEF1] flex-shrink-0">
          {item.pinned && <span title="프로젝트로 고정됨">📌</span>}
          <h2 className="text-[16px] font-bold text-[#1F2933] truncate">{item.title}</h2>
          <span className="text-[11px] text-[#7A8491] bg-[#F3F4F6] rounded-full px-2 py-0.5 flex-shrink-0">{STATUS_LABEL[item.status]}</span>
          <span className="text-[12px] text-[#9AA3AE] flex-shrink-0">{groupName}</span>
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            {canPin && (
              <button type="button" onClick={onTogglePin} className="text-[12px] text-[#5B6570] hover:text-[#2F5FC4] hover:bg-[#EAF1FD] rounded-md px-2 py-1">
                {item.pinned ? '고정 해제' : '📌 프로젝트로 고정'}
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 flex items-center justify-center rounded-md text-[#7A8491] hover:bg-black/[0.05] text-[18px]">×</button>
          </div>
        </div>

        {/* 회차 카드 */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4 space-y-3">
          {error && <p className="text-[12.5px] text-[#C53030] bg-[#FDECEC] border border-[#F5C2C2] rounded-lg px-3 py-2">{error}</p>}
          {!loaded && !error && <p className="text-[13px] text-[#9AA3AE] py-6 text-center">불러오는 중…</p>}
          {loaded && sorted.length === 0 && (
            <p className="text-[13px] text-[#9AA3AE] py-10 text-center">
              아직 기록이 없습니다.{writableKinds.length > 0 ? ' 아래에서 1차 기획부터 남겨 보세요.' : ''}
            </p>
          )}
          {sorted.map(e => {
            const canEdit = canWriteRrKind(me, groupName, e.kind)
            const editing = editingId === e.id
            const kindChoices = RR_ENTRY_KINDS.filter(k => k === e.kind || canWriteRrKind(me, groupName, k))
            return (
              <div key={e.id} id={`rr-entry-${e.id}`} className={`bg-white rounded-xl border ${editing ? 'border-[#4C7FE0]/50 shadow-md' : 'border-[#E5E8EB] shadow-sm'} ${e.kind === 'feedback' ? 'ml-6 sm:ml-10' : ''}`}>
                <div className="flex items-center gap-2 px-4 pt-3 pb-2 flex-wrap">
                  {editing && canEdit ? (
                    <select
                      value={e.kind}
                      onChange={ev => void changeMeta(e, { kind: ev.target.value as RrEntryKind })}
                      className={`text-[12px] font-semibold border rounded-full px-2 py-0.5 ${RR_KIND_TONE[e.kind]}`}
                    >
                      {kindChoices.map(k => <option key={k} value={k}>{RR_KIND_LABEL[k]}</option>)}
                    </select>
                  ) : (
                    <span className={`text-[12px] font-semibold border rounded-full px-2.5 py-0.5 ${RR_KIND_TONE[e.kind]}`}>{labels.get(e.id)}</span>
                  )}
                  {editing && canEdit ? (
                    <input
                      type="date"
                      value={e.entry_date}
                      onChange={ev => { if (ev.target.value) void changeMeta(e, { entry_date: ev.target.value }) }}
                      className="text-[12px] border border-[#E5E8EB] rounded-md px-1.5 py-0.5"
                    />
                  ) : (
                    <span className="text-[12px] text-[#7A8491]">{fmtDate(e.entry_date)}</span>
                  )}
                  <span className="text-[12px] text-[#9AA3AE]">{e.author_name}</span>
                  {!editing && e.title && <span className="text-[13.5px] font-semibold text-[#1F2933] truncate">· {e.title}</span>}
                  {canEdit && (
                    <div className="ml-auto flex items-center gap-1">
                      <button type="button" onClick={() => setEditingId(editing ? null : e.id)} className={`text-[12px] rounded-md px-2 py-0.5 ${editing ? 'bg-[#4C7FE0] text-white hover:bg-[#3A6CC8]' : 'text-[#5B6570] hover:text-[#2F5FC4] hover:bg-[#EAF1FD]'}`}>
                        {editing ? '완료' : '수정'}
                      </button>
                      {!editing && (
                        <button type="button" onClick={() => void removeEntry(e)} className="text-[12px] text-[#B0B7C0] hover:text-[#C53030] hover:bg-[#FDECEC] rounded-md px-2 py-0.5">삭제</button>
                      )}
                    </div>
                  )}
                </div>
                {editing ? (
                  <div className="h-[62vh] min-h-[360px] border-t border-[#ECEEF1] rounded-b-xl overflow-hidden">
                    <NoteEditor
                      key={e.id}
                      title={e.title}
                      body={e.body}
                      updatedAt={e.updated_at}
                      focusTitle={false}
                      onSave={next => patch(e.id, { title: next.title, body: next.body })}
                      wide
                    />
                  </div>
                ) : e.body.trim() ? (
                  <div className="note-prose px-4 pb-4 text-[14px] text-[#1F2933] cursor-text" onDoubleClick={() => { if (canEdit) setEditingId(e.id) }} dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(e.body) }} />
                ) : (
                  <p className="px-4 pb-4 text-[12.5px] text-[#B0B7C0]">{justCreatedId === e.id ? '' : '내용 없음'}</p>
                )}
              </div>
            )
          })}
        </div>

        {/* 회차 추가 */}
        {writableKinds.length > 0 && (
          <div className="flex items-center gap-1.5 px-5 py-3 bg-white border-t border-[#ECEEF1] flex-shrink-0 flex-wrap">
            <span className="text-[12px] text-[#7A8491] mr-1">+ 회차 추가</span>
            {writableKinds.map(k => (
              <button key={k} type="button" disabled={adding} onClick={() => void addEntry(k)} className={`text-[12px] font-medium border rounded-full px-3 py-1 hover:brightness-95 disabled:opacity-50 ${RR_KIND_TONE[k]}`}>
                {RR_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
