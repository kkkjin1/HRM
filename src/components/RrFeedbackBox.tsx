'use client'

// R&R 메모 회차 카드의 "팀장 피드백".
// - RrFeedbackBox: 수정 중(좌우로 나뉜 화면) 오른쪽 칸 — 제목 없이 바로 쓰는 글상자(팀장만, 나머지는 읽기). "완료"로 닫는다.
// - RrFeedbackRow: 평소(완료 후) 본문 아래 음영 줄 — 다른 사람이 쓰는 중이면 실시간으로 보인다.
// 쓰는 동안 칸을 잠그고(lib/useFieldLocks, 칸 이름 fb:{카드id}) 다른 사람 화면엔 치는 글이 실시간으로 보인다.
// 입력을 멈추면 1.5초 뒤, 칸을 벗어나면 바로 저장하고, 칸을 벗어난 저장이 끝나면 잠금을 푼다.
// 저장은 feedback_version으로 충돌을 막는다(본문 version과 따로라 담당자의 본문 편집과 서로 막지 않는다).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { FieldLocks } from '@/lib/useFieldLocks'
import type { RrEntry } from '@/lib/rrMemo'
import { RR_FEEDBACK_MAX } from '@/lib/rrMemo'
import { markdownToHtml } from '@/lib/markdown'

export const feedbackFieldOf = (entryId: string) => `fb:${entryId}`
const AUTOSAVE_MS = 1500
const noopSubscribe = () => () => {}

function fmtStamp(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Props = {
  entry: RrEntry
  locks: FieldLocks
  canWrite: boolean
  // 저장 — 성공하면 최신 카드, 충돌·실패면 throw
  onSave: (text: string, expectedVersion: number) => Promise<RrEntry>
  onError: (message: string) => void
  onDone?: () => void // "완료" — 좌우 화면을 닫고 음영 줄로
  autoFocus?: boolean
}

// 다른 사람이 쓰는 중인 피드백 미리보기 구독(그 칸만 다시 그린다)
function useLivePreview(locks: FieldLocks, field: string | null) {
  const subscribe = useCallback((l: () => void) => (field ? locks.subscribePreview(field, l) : noopSubscribe()), [locks, field])
  return useSyncExternalStore(subscribe, () => (field ? locks.getPreview(field) : undefined), () => undefined)
}

// 평소 화면 — 본문 아래 음영 줄. 피드백이 없고 아무도 안 쓰면 그리지 않는다. 팀장은 눌러서 바로 고치러 간다.
export function RrFeedbackRow({ entry, locks, onOpen }: { entry: RrEntry; locks: FieldLocks; onOpen?: () => void }) {
  const field = feedbackFieldOf(entry.id)
  const lock = locks.lockOf(field)
  const preview = useLivePreview(locks, lock?.kind === 'other' ? field : null)
  const text = preview ?? entry.feedback
  if (!text.trim() && lock?.kind !== 'other') return null
  return (
    <div
      onClick={onOpen}
      className={`border-t border-[#F3DB94] bg-[#FFF8E6] px-4 py-2.5 rounded-b-xl ${onOpen ? 'cursor-pointer hover:bg-[#FFF3D6]' : ''}`}
      title={onOpen ? '눌러서 피드백 고치기' : undefined}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[12px] font-semibold text-[#92400E]">💬 팀장 피드백</span>
        {lock?.kind === 'other' ? (
          <span className="flex items-center gap-1 text-[11px] text-[#4C7FE0]"><span className="w-1.5 h-1.5 rounded-full bg-[#4C7FE0] animate-pulse" />{lock.name}님 작성 중</span>
        ) : entry.feedback_at ? (
          <span className="text-[11px] text-[#B7791F]/80">{entry.feedback_by} · {fmtStamp(entry.feedback_at)}</span>
        ) : null}
      </div>
      {/* 글상자에 쓴 마크다운(- 목록, **굵게**, # 제목 등)을 서식으로 보여준다 */}
      <div className="note-prose text-[13.5px] leading-relaxed text-[#3A4249] break-words" dangerouslySetInnerHTML={{ __html: markdownToHtml(text || '…') }} />
    </div>
  )
}

export default function RrFeedbackBox({ entry, locks, canWrite, onSave, onError, onDone, autoFocus }: Props) {
  const field = feedbackFieldOf(entry.id)
  const [draft, setDraft] = useState<{ text: string; baseVersion: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef(draft)
  useLayoutEffect(() => { draftRef.current = draft })
  const savingRef = useRef<Promise<void> | null>(null)

  const lock = locks.lockOf(field)
  // 남이 먼저 잡은 칸이면 내 저장 안 된 입력은 버린다(안내는 패널의 onLost)
  if (lock?.kind === 'other' && draft) setDraft(null)
  const preview = useLivePreview(locks, lock?.kind === 'other' ? field : null)
  const value = preview ?? draft?.text ?? entry.feedback

  // 부모(그리드 칸) 높이를 채우되, 내용이 더 길면 그만큼 늘어난다
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.flex = 'none'
    el.style.height = 'auto'
    const h = el.scrollHeight
    el.style.flex = ''
    el.style.height = ''
    el.style.minHeight = `${h}px`
  }, [value])

  function save(): Promise<void> {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const d = draftRef.current
    if (!d) return savingRef.current ?? Promise.resolve()
    const run = async () => {
      const sent = d.text
      setSaving(true)
      try {
        const saved = await onSave(sent, d.baseVersion)
        // 저장하는 사이 더 입력했으면 방금 저장한 내용 위에서 계속 쓰는 것으로 본다
        setDraft(cur => (cur && cur.text !== sent ? { ...cur, baseVersion: saved.feedback_version } : null))
      } catch (err) {
        setDraft(null)
        onError(err instanceof Error ? err.message : String(err))
      } finally {
        setSaving(false)
      }
    }
    const p = (savingRef.current ?? Promise.resolve()).then(run)
    savingRef.current = p
    void p.finally(() => { if (savingRef.current === p) savingRef.current = null })
    return p
  }

  // 칸을 닫을 때(완료·ESC·다른 카드로) 남은 입력을 저장하고 잠금을 푼다
  const saveRef = useRef(save)
  useLayoutEffect(() => { saveRef.current = save })
  const releaseRef = useRef(() => locks.release(field))
  useLayoutEffect(() => { releaseRef.current = () => locks.release(field) })
  useEffect(() => {
    if (autoFocus && canWrite) ref.current?.focus()
    return () => { void saveRef.current().finally(() => releaseRef.current()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트·언마운트 때만
  }, [])

  if (!canWrite && !entry.feedback.trim() && !preview) return null

  return (
    <div className="flex flex-col h-full min-h-[140px] bg-[#FFFBF0] border border-[#F3DB94] rounded-lg overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[#F3DB94]/70 flex-shrink-0">
        <span className="text-[12px] font-semibold text-[#92400E]">💬 팀장 피드백</span>
        {lock?.kind === 'other' ? (
          <span className="flex items-center gap-1 text-[11px] text-[#4C7FE0]"><span className="w-1.5 h-1.5 rounded-full bg-[#4C7FE0] animate-pulse" />{lock.name}님 작성 중</span>
        ) : lock?.kind === 'syncing' ? (
          <span className="text-[11px] text-[#9AA3AE]">불러오는 중…</span>
        ) : saving ? (
          <span className="text-[11px] text-[#9AA3AE]">저장 중…</span>
        ) : entry.feedback_at && entry.feedback.trim() ? (
          <span className="text-[11px] text-[#B7791F]/80">{entry.feedback_by} · {fmtStamp(entry.feedback_at)}</span>
        ) : null}
        {onDone && (
          <button type="button" onClick={onDone} className="ml-auto text-[11.5px] font-medium text-white bg-[#B7791F] hover:bg-[#975A16] rounded-md px-2 py-0.5">완료</button>
        )}
      </div>
      <textarea
        ref={ref}
        value={value}
        readOnly={!canWrite || !!lock}
        maxLength={RR_FEEDBACK_MAX}
        onChange={ev => {
          // 잠금은 포커스가 아니라 첫 입력 때 잡는다 — 클릭만 해도 남의 화면에 "작성 중"이 뜨지 않게
          if (!canWrite || lock || !locks.acquire(field)) return
          const text = ev.target.value
          setDraft(d => (d ? { ...d, text } : { text, baseVersion: entry.feedback_version }))
          locks.sendPreview(field, text)
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => { void save() }, AUTOSAVE_MS)
        }}
        onBlur={() => { void save().finally(() => locks.release(field)) }}
        placeholder={canWrite ? '기획 내용을 보며 바로 피드백을 남기세요 (자동 저장 · - 목록, **굵게** 같은 마크다운 사용 가능)' : ''}
        className={`flex-1 w-full resize-none overflow-hidden bg-transparent px-2.5 py-2 text-[13.5px] leading-relaxed focus:outline-none placeholder:text-[#C9B27A] ${lock ? 'text-[#5B6570] cursor-not-allowed' : 'text-[#3A4249]'}`}
      />
    </div>
  )
}
