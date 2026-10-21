'use client'

// 업무보고 표의 팀원 묶음 맨 위 자유 메모 — 표에 행으로 넣기 애매한 이번 회의 공유사항을 적는다.
// 저장소는 예전 "팀원별 진행사항"(team_log_meeting_progress, 회의×팀원 한 칸)을 그대로 쓴다 — 그래서 예전 회의에
// 써 둔 진행사항도 이 칸에 그대로 보인다. 칸에서 벗어나면 저장하고, 서버가 version으로 동시편집 충돌을 막는다
// (그 사이 다른 사람이 저장했으면 최신 내용으로 바꾸고 내가 쓴 글은 알림으로 남긴다).

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { FieldLock, PreviewSource } from '@/lib/useFieldLocks'

export type ProgressRow = { id: string; meeting_id: string; member_id: string; content: string; updated_at: string | null; version: number; updated_by: string | null }

type Props = {
  meetingId: string
  memberId: string
  memberName: string
  row: ProgressRow | undefined
  onSaved: (row: ProgressRow) => void
  onError: (message: string) => void
  onUnauthorized: () => void
  // 오늘 안건 메모처럼 팀원 메모가 아닌 곳에 쓸 때 — 안내문과 충돌 알림의 이름을 바꾼다.
  placeholder?: string
  label?: string
  // 칸 배경·테두리 색(Tailwind 클래스). 없으면 흰 배경.
  tone?: string
  // 회의록 칸 잠금(lib/useFieldLocks) — 다른 칸들과 같이, 누가 쓰기 시작하면 남의 화면에선 읽기 전용이 되고
  // 그 사람이 치는 글이 실시간으로 보인다. 잠금은 첫 입력 때 잡고 저장이 끝나면 푼다. 칸 이름은 progressLockField.
  locks?: NoteLocks
  // 보기만 — 오늘 안건 메모를 팀장이 아닌 사람이 볼 때.
  readOnly?: boolean
}

export type NoteLocks = {
  lockOf: (field: string) => FieldLock | null
  acquire: (field: string) => boolean
  release: (field: string) => void
  preview: (field: string, text: string) => void
  previews: PreviewSource
}

export const progressLockField = (memberId: string) => `progress:${memberId}`

const noopSubscribe = () => () => {}

export default function MemberNote({ meetingId, memberId, memberName, row, onSaved, onError, onUnauthorized, placeholder, label, tone, locks, readOnly = false }: Props) {
  // 편집 중일 때만 draft를 들고, 아니면 서버 값을 그대로 보여준다(다른 사람 저장이 realtime으로 바로 보이게).
  const [draft, setDraft] = useState<{ text: string; baseText: string; baseVersion: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const lockField = progressLockField(memberId)
  const lock = locks?.lockOf(lockField) ?? null
  // 남이 잡은 칸이면 내 저장 안 된 입력은 버린다(거의 동시에 잡아 진 경우 — 안내는 page의 onLost가 띄운다).
  if (lock?.kind === 'other' && draft) setDraft(null)
  const previewField = lock?.kind === 'other' ? lockField : null
  const subscribePreview = locks?.previews.subscribePreview
  const getPreview = locks?.previews.getPreview
  const subscribePv = useCallback(
    (listener: () => void) => (previewField && subscribePreview ? subscribePreview(previewField, listener) : noopSubscribe()),
    [subscribePreview, previewField],
  )
  const preview = useSyncExternalStore(subscribePv, () => (previewField && getPreview ? getPreview(previewField) : undefined), () => undefined)
  const value = preview ?? draft?.text ?? row?.content ?? ''

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  async function save() {
    if (!draft || saving) return
    if (draft.text === draft.baseText) { setDraft(null); return }
    setSaving(true)
    const sent = draft.text
    const res = await fetch('/api/meeting-progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id: meetingId, member_id: memberId, content: sent, expected_version: draft.baseVersion }),
    }).catch(() => null)
    setSaving(false)
    if (res?.status === 401) { onUnauthorized(); return }
    const json = res ? await res.json().catch(() => null) : null
    if (res?.status === 409 && json?.conflict) {
      if (json.current) onSaved(json.current as ProgressRow)
      setDraft(null)
      onError(`${label ?? `${memberName}님 메모`}를 그 사이 ${json.current?.updated_by ?? '다른 분'}님이 먼저 고쳐 최신 내용으로 바꿨습니다. 내가 쓴 내용: "${sent.slice(0, 60)}${sent.length > 60 ? '…' : ''}"`)
      return
    }
    if (!json?.ok) { onError(json?.error ?? '메모를 저장하지 못했습니다.'); return }
    const saved = json.progress as ProgressRow
    onSaved(saved)
    // 저장하는 사이 더 입력했으면 방금 저장한 내 내용 위에서 계속 쓰는 것으로 본다.
    setDraft(d => (d && d.text !== sent ? { ...d, baseText: sent, baseVersion: saved.version } : null))
  }

  return (
    <div>
      {lock && (
        <div className="flex items-center gap-1 pb-1 text-[10.5px] text-[#4C7FE0]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4C7FE0] animate-pulse flex-shrink-0" />
          {lock.kind === 'other' ? `${lock.name}님 작성 중` : '최신 내용 불러오는 중…'}
        </div>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={value}
        readOnly={readOnly || !!lock}
        onChange={e => {
          // 잠금은 포커스가 아니라 첫 입력 때 잡는다 — 클릭만 해도 남의 화면에 "작성 중"이 뜨지 않게.
          if (readOnly || lock || (locks && !locks.acquire(lockField))) return
          const text = e.target.value.slice(0, 5000)
          setDraft(d => d ? { ...d, text } : { text, baseText: row?.content ?? '', baseVersion: row?.version ?? 0 })
          locks?.preview(lockField, text)
        }}
        onBlur={() => { void save().finally(() => locks?.release(lockField)) }}
        placeholder={readOnly ? '' : placeholder ?? `${memberName}님 자유 메모 — 표에 넣기 애매한 이번 회의 공유사항 (칸에서 벗어나면 자동 저장)`}
        className={`block w-full text-[13.5px] leading-relaxed ${lock ? 'text-[#5B6570] cursor-not-allowed' : 'text-[#3A4249]'} ${tone ?? 'bg-white border-[#E5E8EB]'} border rounded-md px-2.5 py-1.5 resize-none overflow-hidden focus:outline-none focus:border-[#4C7FE0] placeholder:text-[#C0C6CD] ${saving ? 'opacity-70' : ''}`}
      />
    </div>
  )
}
