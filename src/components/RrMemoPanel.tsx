'use client'

// R&R 메모 페이지 — R&R 업무명을 누르면 뜨는 큰 팝업. 회차 카드(1차 기획 → 2차 개선 → …)가 시간순으로 쌓이고,
// 카드마다 오른쪽에 팀장 피드백 칸(RrFeedbackBox)이 붙는다 — 기획 내용을 보면서 바로 쓴다.
// 카드는 평소 읽기 전용 HTML로 보이고, "수정"을 누른 카드 하나만 그 자리에서 문서 편집기(NoteEditor)로 바뀐다
// (편집기는 자동 저장, 닫거나 다른 카드로 옮기면 남은 변경을 바로 저장한다). 저장은 version으로 동시편집 충돌을 막는다.
// 권한(lib/rrMemo): 본문은 담당자·팀장, 피드백 칸은 팀장만 — 서버(/api/rr-entries)가 다시 확인한다.
//
// 실시간(lib/useFieldLocks, 채널 키 rr-{R&R id}): 카드 단위 잠금. 누가 카드를 고치는 동안 다른 사람 화면엔
// "OO님 작성 중"과 치는 내용이 실시간으로 보이고(미리보기), 그 카드는 못 고친다. 다른 카드는 동시에 고칠 수 있다.
// 잠금은 편집을 닫고 저장이 끝난 뒤에 풀고, 풀리면 다른 사람은 최신값을 다시 읽는다. 카드 추가·삭제·첨부·되돌리기는
// "목록 바뀜" 신호(notifyChanged)로 알려 다시 읽게 한다.
// 백업: 화면엔 없고 서버가 바뀌기 전 내용을 rr_entry_history에 조용히 남긴다(복구가 필요하면 DB에서).

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import NoteEditor from '@/components/NoteEditor'
import RrFeedbackBox, { RrFeedbackRow, feedbackFieldOf } from '@/components/RrFeedbackBox'
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml'
import { createClient } from '@/lib/supabase/client'
import { useFieldLocks, type FieldLocks } from '@/lib/useFieldLocks'
import {
  RR_ATTACHMENT_BUCKET, RR_ATTACHMENT_EXTS, RR_ATTACHMENT_MAX_BYTES, RR_KIND_TONE,
  canPinRr, canWriteRrFeedback, canWriteRrKind, fmtFileSize, nextRrRound, rrEntryLabels, rrFileExt, sortRrEntries,
  RR_LINK_RE, type RrAttachment, type RrEntry,
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
// 카드는 긴 문서라 입력 없이 5분이 지나면 편집을 닫는다(저장 후 잠금 해제)
const RR_LOCK_IDLE_MS = 5 * 60 * 1000
const fieldOf = (entryId: string) => `entry:${entryId}`
const noopSubscribe = () => () => {}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  const w = '일월화수목금토'[new Date(y, m - 1, day).getDay()]
  return `${y}.${m}.${day} (${w})`
}

// 다른 사람이 고치는 중인 카드 — 미리보기({title, body} JSON)를 구독해 그 카드만 다시 그린다(패널 전체를 다시 그리지 않게).
function CardBody({ entry, locks, live, canEdit, onEdit }: { entry: RrEntry; locks: FieldLocks; live: boolean; canEdit: boolean; onEdit: () => void }) {
  const field = live ? fieldOf(entry.id) : null
  const subscribe = useCallback((l: () => void) => (field ? locks.subscribePreview(field, l) : noopSubscribe()), [locks, field])
  const raw = useSyncExternalStore(subscribe, () => (field ? locks.getPreview(field) : undefined), () => undefined)
  let title = entry.title
  let body = entry.body
  if (raw) {
    try { const p = JSON.parse(raw) as { title?: string; body?: string }; title = p.title ?? title; body = p.body ?? body } catch { /* 깨진 미리보기는 무시 */ }
  }
  return (
    <>
      {raw !== undefined && title && <p className="px-4 pb-1 text-[15px] font-bold text-[#1F2933]">{title}</p>}
      {body.trim() ? (
        <div
          className={`note-prose px-4 pb-4 text-[14px] text-[#1F2933] ${canEdit && !live ? 'cursor-text' : ''}`}
          onDoubleClick={() => { if (canEdit && !live) onEdit() }}
          dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(body) }}
        />
      ) : (
        <p className="px-4 pb-4 text-[12.5px] text-[#B0B7C0]">{live ? '작성 중…' : '내용 없음'}</p>
      )}
    </>
  )
}

export default function RrMemoPanel({ item, groupName, me, onClose, onTogglePin, onCountChange }: Props) {
  const [entries, setEntries] = useState<RrEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  // 팀장이 피드백을 쓰려고 좌우로 연 카드(본문 수정 중이 아니어도)
  const [fbOpenId, setFbOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [attachments, setAttachments] = useState<RrAttachment[]>([])
  // 카드별 올리는 중인 파일 수
  const [uploading, setUploading] = useState<Record<string, number>>({})
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  // 링크 첨부 입력 — 어느 카드에서 열었는지와 입력값
  const [linkFor, setLinkFor] = useState<string | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileTargetRef = useRef<string | null>(null)
  // 카드별 최신 version — 편집기는 마운트 때 값만 받으므로 저장마다 여기서 꺼내 쓴다
  const versionRef = useRef(new Map<string, number>())
  // 카드별 진행 중인 저장 — 편집을 닫을 때 이게 끝난 뒤 잠금을 푼다
  const pendingSaveRef = useRef(new Map<string, Promise<unknown>>())
  const editingIdRef = useRef<string | null>(null)
  useEffect(() => { editingIdRef.current = editingId })
  const onCountRef = useRef(onCountChange)
  useEffect(() => { onCountRef.current = onCountChange })

  const sorted = useMemo(() => sortRrEntries(entries), [entries])
  const labels = useMemo(() => rrEntryLabels(sorted), [sorted])
  const canAddRound = canWriteRrKind(me, groupName, 'plan')
  const nextRound = nextRrRound(sorted)
  const isLead = canWriteRrFeedback(me)
  const canPin = canPinRr(me, groupName)

  // 서버에서 카드·첨부를 다시 읽는다. version은 내려가지 않게(늦게 온 응답이 방금 저장한 version을 되돌리지 않도록).
  const reload = useCallback(async () => {
    const res = await fetch(`/api/rr-entries?target_id=${item.id}`).catch(() => null)
    const j = res ? await res.json().catch(() => null) : null
    if (!j?.ok) { setError(j?.error ?? '불러오지 못했습니다.'); return }
    const list = j.entries as RrEntry[]
    for (const e of list) versionRef.current.set(e.id, Math.max(versionRef.current.get(e.id) ?? 0, e.version))
    setEntries(list)
    setAttachments((j.attachments ?? []) as RrAttachment[])
    setLoaded(true)
  }, [item.id])

  const locks = useFieldLocks(`rr-${item.id}`, me?.name ?? '팀원', {
    idleMs: RR_LOCK_IDLE_MS,
    onReleased: () => reload(),
    onChanged: () => { void reload() },
    onLost: (field, holderName) => {
      if (editingIdRef.current && fieldOf(editingIdRef.current) === field) setEditingId(null)
      setError(`${holderName}님이 먼저 이 카드를 고치기 시작했습니다.`)
    },
    onIdle: field => {
      const id = editingIdRef.current
      if (id && fieldOf(id) === field) { void closeEdit(); return }
      // 피드백 칸 — 커서를 빼면 칸이 저장하고 잠금을 푼다
      const el = document.activeElement as HTMLElement | null
      if (field.startsWith('fb:') && el?.tagName === 'TEXTAREA') el.blur()
      else locks.release(field)
    },
  })
  const locksRef = useRef(locks)
  useEffect(() => { locksRef.current = locks })

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 팝업을 열 때 서버에서 처음 한 번 불러온다
  useEffect(() => { void reload() }, [reload])
  useEffect(() => { if (loaded) onCountRef.current(entries.length) }, [entries.length, loaded])

  // 편집 닫기 — 편집기가 언마운트되며 남은 변경을 저장하고, 그 저장이 끝나면 잠금을 푼다(다른 사람은 이 신호로 최신값을 읽는다).
  function closeEdit() {
    const id = editingIdRef.current
    if (!id) return Promise.resolve()
    setEditingId(null)
    return new Promise<void>(resolve => {
      setTimeout(() => {
        void Promise.resolve(pendingSaveRef.current.get(id)).catch(() => {}).finally(() => { locksRef.current.release(fieldOf(id)); resolve() })
      }, 0)
    })
  }

  function startEdit(id: string) {
    if (editingIdRef.current === id) return
    const lock = locks.lockOf(fieldOf(id))
    if (lock) { setError(lock.kind === 'other' ? `${lock.name}님이 작성 중인 카드입니다.` : '최신 내용을 불러오는 중입니다. 잠시 후 다시 눌러 주세요.'); return }
    void closeEdit().then(() => {
      if (!locksRef.current.acquire(fieldOf(id))) { setError('다른 분이 작성 중인 카드입니다.'); return }
      setError('')
      setFbOpenId(cur => (cur === id ? cur : null))
      setEditingId(id)
    })
  }

  async function handleClose() {
    await closeEdit()
    onClose()
  }

  // ESC — 편집 중이면 편집만 닫고(자동 저장), 아니면 팝업을 닫는다
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (fbOpenId) setFbOpenId(null)
      else if (editingIdRef.current) void closeEdit()
      else void handleClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  function applyEntry(e: RrEntry) {
    versionRef.current.set(e.id, Math.max(versionRef.current.get(e.id) ?? 0, e.version))
    setEntries(prev => prev.map(x => (x.id === e.id ? e : x)))
  }

  function patch(id: string, fields: Partial<Pick<RrEntry, 'title' | 'body' | 'kind' | 'entry_date'>>) {
    const run = async () => {
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
    // 같은 카드 저장은 차례로(version이 꼬이지 않게)
    const prev = pendingSaveRef.current.get(id) ?? Promise.resolve()
    const p = prev.catch(() => {}).then(run)
    pendingSaveRef.current.set(id, p)
    void p.catch(() => {}).finally(() => { if (pendingSaveRef.current.get(id) === p) pendingSaveRef.current.delete(id) })
    return p
  }

  async function saveFeedback(id: string, feedback: string, expectedVersion: number) {
    const res = await fetch('/api/rr-entries', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, feedback, expected_feedback_version: expectedVersion }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (res?.status === 409 && json?.conflict) {
      if (json.current) applyEntry(json.current as RrEntry)
      throw new Error(`그 사이 ${json.current?.feedback_by ?? '다른 분'}님이 피드백을 고쳐 최신 내용으로 바꿨습니다. 내가 쓴 내용: "${feedback.slice(0, 60)}${feedback.length > 60 ? '…' : ''}"`)
    }
    if (!json?.ok) throw new Error(json?.error ?? '피드백을 저장하지 못했습니다.')
    const saved = json.entry as RrEntry
    applyEntry(saved)
    return saved
  }

  async function addEntry() {
    if (adding) return
    setAdding(true)
    setError('')
    await closeEdit()
    const res = await fetch('/api/rr-entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: item.id }),
    }).catch(() => null)
    setAdding(false)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) { setError(json?.error ?? '카드를 만들지 못했습니다.'); return }
    const e = json.entry as RrEntry
    versionRef.current.set(e.id, e.version)
    locks.acquire(fieldOf(e.id))
    setEntries(prev => [...prev, e])
    setEditingId(e.id)
    locks.notifyChanged()
    requestAnimationFrame(() => document.getElementById(`rr-entry-${e.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  // 첨부 올리기: 서버가 업로드 허가 주소 발급 → 브라우저가 버킷에 직접 올림 → 서버가 확인 후 목록 등록
  async function uploadFiles(entryId: string, files: File[]) {
    if (!files.length) return
    setError('')
    const supabase = createClient()
    let added = false
    for (const file of files) {
      const ext = rrFileExt(file.name)
      if (!RR_ATTACHMENT_EXTS.includes(ext)) { setError(`올릴 수 없는 파일 형식입니다: ${file.name}`); continue }
      if (file.size > RR_ATTACHMENT_MAX_BYTES) { setError(`20MB를 넘는 파일은 올릴 수 없습니다: ${file.name}`); continue }
      setUploading(prev => ({ ...prev, [entryId]: (prev[entryId] ?? 0) + 1 }))
      try {
        const meta = { entry_id: entryId, file_name: file.name, size: file.size }
        const signRes = await fetch('/api/rr-attachments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sign', ...meta }) })
        const sign = await signRes.json().catch(() => null)
        if (!sign?.ok) throw new Error(sign?.error ?? '업로드 준비에 실패했습니다.')
        const up = await supabase.storage.from(RR_ATTACHMENT_BUCKET).uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type || 'application/octet-stream' })
        if (up.error) throw new Error(up.error.message)
        const commitRes = await fetch('/api/rr-attachments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'commit', path: sign.path, ...meta }) })
        const commit = await commitRes.json().catch(() => null)
        if (!commit?.ok) throw new Error(commit?.error ?? '첨부를 등록하지 못했습니다.')
        setAttachments(prev => [...prev, commit.attachment as RrAttachment])
        added = true
      } catch (err) {
        setError(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setUploading(prev => ({ ...prev, [entryId]: Math.max(0, (prev[entryId] ?? 1) - 1) }))
      }
    }
    if (added) locks.notifyChanged()
  }

  async function removeAttachment(a: RrAttachment) {
    if (!window.confirm(`"${a.file_name}" ${a.url ? '링크' : '첨부'}를 지울까요?`)) return
    const res = await fetch('/api/rr-attachments', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) { setError(json?.error ?? '첨부를 지우지 못했습니다.'); return }
    setAttachments(prev => prev.filter(x => x.id !== a.id))
    locks.notifyChanged()
  }

  // 본문 캡처 붙여넣기·이미지 올리기(팀 공용 이미지 주소를 돌려받아 본문에 넣는다)
  async function uploadRrImage(file: File) {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/rr-image', { method: 'POST', body: form }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) throw new Error(json?.error ?? '이미지를 올리지 못했습니다.')
    return json.url as string
  }

  // 링크 첨부 — 큰 자료(드라이브·노션·사내 문서)는 파일 대신 주소만 붙인다
  async function addLink(entryId: string) {
    const url = linkUrl.trim()
    if (!RR_LINK_RE.test(url)) { setError('http:// 또는 https:// 로 시작하는 주소를 넣어 주세요.'); return }
    const res = await fetch('/api/rr-attachments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'link', entry_id: entryId, url, label: linkLabel.trim() }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) { setError(json?.error ?? '링크를 붙이지 못했습니다.'); return }
    setAttachments(prev => [...prev, json.attachment as RrAttachment])
    setLinkFor(null); setLinkUrl(''); setLinkLabel('')
    locks.notifyChanged()
  }

  function openLinkForm(entryId: string) {
    setLinkFor(cur => (cur === entryId ? null : entryId))
    setLinkUrl(''); setLinkLabel('')
  }

  function pickFiles(entryId: string) {
    fileTargetRef.current = entryId
    fileInputRef.current?.click()
  }

  async function removeEntry(e: RrEntry) {
    if (locks.lockOf(fieldOf(e.id))) { setError('다른 분이 작성 중인 카드는 지울 수 없습니다.'); return }
    if (!window.confirm(`"${labels.get(e.id)}" 카드를 지울까요? 첨부파일도 함께 지워집니다.`)) return
    const res = await fetch('/api/rr-entries', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) { setError(json?.error ?? '지우지 못했습니다.'); return }
    setEntries(prev => prev.filter(x => x.id !== e.id))
    setAttachments(prev => prev.filter(x => x.entry_id !== e.id))
    locks.notifyChanged()
  }

  async function changeMeta(e: RrEntry, fields: Partial<Pick<RrEntry, 'entry_date'>>) {
    setError('')
    try { await patch(e.id, fields); locks.notifyChanged() } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-2 sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) void handleClose() }}>
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
            <button type="button" onClick={() => void handleClose()} aria-label="닫기" className="w-8 h-8 flex items-center justify-center rounded-md text-[#7A8491] hover:bg-black/[0.05] text-[18px]">×</button>
          </div>
        </div>

        {/* 회차 카드 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4 space-y-3">
          {error && (
            <p className="flex items-start gap-2 text-[12.5px] text-[#C53030] bg-[#FDECEC] border border-[#F5C2C2] rounded-lg px-3 py-2">
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError('')} aria-label="닫기" className="text-[#C53030]/70 hover:text-[#C53030]">×</button>
            </p>
          )}
          {!loaded && !error && <p className="text-[13px] text-[#9AA3AE] py-6 text-center">불러오는 중…</p>}
          {loaded && sorted.length === 0 && (
            <p className="text-[13px] text-[#9AA3AE] py-10 text-center">
              아직 기록이 없습니다.{canAddRound ? ' 아래에서 1차 기획부터 남겨 보세요.' : ''}
            </p>
          )}
          {sorted.map(e => {
            const canEdit = canWriteRrKind(me, groupName, e.kind)
            const editing = editingId === e.id
            const lock = editing ? null : locks.lockOf(fieldOf(e.id))
            const fbLock = locks.lockOf(feedbackFieldOf(e.id))
            // 좌우 화면: 본문 수정 중이거나 팀장이 피드백을 쓰려고 열었을 때만. 평소엔 본문 아래 음영 줄(RrFeedbackRow).
            const split = (editing || fbOpenId === e.id) && (isLead || !!e.feedback.trim() || fbLock?.kind === 'other')
            const openFeedback = isLead && !editing ? () => {
              if (fbLock?.kind === 'other') { setError(`${fbLock.name}님이 피드백을 쓰는 중입니다.`); return }
                      setFbOpenId(e.id)
            } : undefined
            const files = attachments.filter(a => a.entry_id === e.id)
            const busy = uploading[e.id] ?? 0
            // 파일을 카드 위로 끌어다 놓으면 첨부(편집기 안의 이미지 끌어놓기와 겹치지 않게 편집 중엔 끔)
            const dropProps = canEdit && !editing ? {
              onDragOver: (ev: React.DragEvent) => { if (!ev.dataTransfer.types.includes('Files')) return; ev.preventDefault(); if (dragOverId !== e.id) setDragOverId(e.id) },
              onDragLeave: (ev: React.DragEvent) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDragOverId(null) },
              onDrop: (ev: React.DragEvent) => { ev.preventDefault(); setDragOverId(null); void uploadFiles(e.id, Array.from(ev.dataTransfer.files)) },
            } : {}
            return (
              <div key={e.id} id={`rr-entry-${e.id}`} {...dropProps} className={`bg-white rounded-xl border ${dragOverId === e.id ? 'border-[#4C7FE0] ring-2 ring-[#4C7FE0]/20' : editing ? 'border-[#4C7FE0]/50 shadow-md' : lock?.kind === 'other' ? 'border-[#4C7FE0]/40' : 'border-[#E5E8EB] shadow-sm'} ${e.kind === 'feedback' ? 'ml-6 sm:ml-10' : ''}`}>
                <div className="flex items-center gap-2 px-4 pt-3 pb-2 flex-wrap">
                  <span className={`text-[12px] font-semibold border rounded-full px-2.5 py-0.5 ${RR_KIND_TONE[e.kind]}`}>{labels.get(e.id)}</span>
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
                  {!editing && !lock && e.title && <span className="text-[13.5px] font-semibold text-[#1F2933] truncate">· {e.title}</span>}
                  {lock && (
                    <span className="flex items-center gap-1 text-[11.5px] text-[#4C7FE0]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4C7FE0] animate-pulse" />
                      {lock.kind === 'other' ? `${lock.name}님 작성 중` : '최신 내용 불러오는 중…'}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    {openFeedback && fbOpenId !== e.id && (
                      <button type="button" onClick={openFeedback} title="기획 내용을 보며 오른쪽에 피드백 쓰기" className="text-[12px] text-[#92400E] hover:bg-[#FFF3D6] rounded-md px-2 py-0.5">
                        💬 피드백
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <button type="button" onClick={() => pickFiles(e.id)} disabled={busy > 0} title="파일 첨부 (카드 위로 끌어다 놓아도 됩니다)" className="text-[12px] text-[#5B6570] hover:text-[#2F5FC4] hover:bg-[#EAF1FD] rounded-md px-2 py-0.5 disabled:opacity-50">
                          {busy > 0 ? `올리는 중… ${busy}` : '📎 파일'}
                        </button>
                        <button type="button" onClick={() => openLinkForm(e.id)} title="자료 링크 붙이기 (드라이브·노션 등 — 큰 파일은 링크로)" className={`text-[12px] rounded-md px-2 py-0.5 ${linkFor === e.id ? 'bg-[#EAF1FD] text-[#2F5FC4]' : 'text-[#5B6570] hover:text-[#2F5FC4] hover:bg-[#EAF1FD]'}`}>
                          🔗 링크
                        </button>
                        <button
                          type="button"
                          disabled={!!lock}
                          onClick={() => (editing ? void closeEdit() : startEdit(e.id))}
                          className={`text-[12px] rounded-md px-2 py-0.5 disabled:opacity-40 ${editing ? 'bg-[#4C7FE0] text-white hover:bg-[#3A6CC8]' : 'text-[#5B6570] hover:text-[#2F5FC4] hover:bg-[#EAF1FD]'}`}
                        >
                          {editing ? '완료' : '수정'}
                        </button>
                        {!editing && (
                          <button type="button" disabled={!!lock} onClick={() => void removeEntry(e)} className="text-[12px] text-[#B0B7C0] hover:text-[#C53030] hover:bg-[#FDECEC] rounded-md px-2 py-0.5 disabled:opacity-40">삭제</button>
                        )}
                      </>
                    )}
                  </div>
                </div>


                <div className={split ? 'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-3 px-0 md:pr-4 pb-0 md:pb-4' : ''}>
                <div className="min-w-0">
                {editing ? (
                  <div className="h-[62vh] min-h-[360px] border-t border-[#ECEEF1] rounded-bl-xl overflow-hidden">
                    <NoteEditor
                      key={e.id}
                      title={e.title}
                      body={e.body}
                      updatedAt={e.updated_at}
                      focusTitle={false}
                      onSave={next => patch(e.id, { title: next.title, body: next.body })}
                      onChange={next => locks.sendPreview(fieldOf(e.id), JSON.stringify(next))}
                      uploadImage={uploadRrImage}
                      wide
                    />
                  </div>
                ) : (
                  <CardBody entry={e} locks={locks} live={lock?.kind === 'other'} canEdit={canEdit} onEdit={() => startEdit(e.id)} />
                )}
                {linkFor === e.id && (
                  <form
                    onSubmit={ev => { ev.preventDefault(); void addLink(e.id) }}
                    className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-t border-[#F2F3F5] bg-[#F9FBFF]"
                  >
                    <input autoFocus value={linkUrl} onChange={ev => setLinkUrl(ev.target.value)} placeholder="https:// 자료 주소" className="flex-[2_1_220px] min-w-0 text-[12.5px] border border-[#D6E2F8] rounded-md px-2 py-1 bg-white focus:outline-none focus:border-[#4C7FE0]" />
                    <input value={linkLabel} onChange={ev => setLinkLabel(ev.target.value)} placeholder="표시 이름 (비우면 주소)" className="flex-[1_1_140px] min-w-0 text-[12.5px] border border-[#D6E2F8] rounded-md px-2 py-1 bg-white focus:outline-none focus:border-[#4C7FE0]" />
                    <button type="submit" className="text-[12px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-md px-2.5 py-1 whitespace-nowrap">붙이기</button>
                    <button type="button" onClick={() => setLinkFor(null)} className="text-[12px] text-[#7A8491] hover:text-[#1F2933] px-1.5 py-1 whitespace-nowrap">취소</button>
                  </form>
                )}
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-t border-[#F2F3F5]">
                    {files.map(a => (
                      <span key={a.id} className="group/att inline-flex items-center gap-1 text-[12px] bg-[#F7F8FA] border border-[#E5E8EB] rounded-md pl-2 pr-1 py-0.5 max-w-full">
                        {a.url ? (
                          <a href={a.url} target="_blank" rel="noopener noreferrer" title={`${a.url} · ${a.uploaded_by} 붙임 · 새 창으로 열기`} className="text-[#2F5FC4] hover:underline truncate max-w-[260px]">🔗 {a.file_name}</a>
                        ) : (
                          <>
                            <a href={`/api/rr-attachments?id=${a.id}`} title={`${a.file_name} · ${a.uploaded_by} 올림 · 눌러서 내려받기`} className="text-[#2F5FC4] hover:underline truncate max-w-[260px]">📎 {a.file_name}</a>
                            <span className="text-[10.5px] text-[#9AA3AE] flex-shrink-0">{fmtFileSize(a.size)}</span>
                          </>
                        )}
                        {canEdit && (
                          <button type="button" onClick={() => void removeAttachment(a)} aria-label="첨부 지우기" className="text-[#B0B7C0] hover:text-[#C53030] px-0.5 opacity-0 group-hover/att:opacity-100 focus:opacity-100">×</button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                </div>
                {split && (
                  <div className="px-4 md:px-0 pb-4 md:pb-0">
                    <RrFeedbackBox
                      key={e.id}
                      entry={e}
                      locks={locks}
                      canWrite={isLead}
                      onSave={(text, v) => saveFeedback(e.id, text, v)}
                      onError={msg => setError(msg)}
                      onDone={fbOpenId === e.id ? () => setFbOpenId(null) : undefined}
                      autoFocus={fbOpenId === e.id}
                    />
                  </div>
                )}
                </div>
                {!split && <RrFeedbackRow entry={e} locks={locks} onOpen={openFeedback} />}
              </div>
            )
          })}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={RR_ATTACHMENT_EXTS.map(x => `.${x}`).join(',')}
          className="hidden"
          onChange={ev => {
            const target = fileTargetRef.current
            const picked = Array.from(ev.target.files ?? [])
            ev.target.value = ''
            if (target) void uploadFiles(target, picked)
          }}
        />

        {/* 회차 추가 */}
        {canAddRound && (
          <div className="flex items-center gap-2 px-5 py-3 bg-white border-t border-[#ECEEF1] flex-shrink-0">
            <button type="button" disabled={adding} onClick={() => void addEntry()} className={`text-[13px] font-semibold border rounded-full px-4 py-1.5 hover:brightness-95 disabled:opacity-50 ${RR_KIND_TONE[nextRound.kind]}`}>
              + {nextRound.label}
            </button>
            <span className="text-[11.5px] text-[#9AA3AE]">{sorted.length ? '피드백을 반영한 다음 회차를 이어서 씁니다' : '첫 기획부터 시작합니다'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
