'use client'

// 업무보고 표의 팀원 묶음 맨 위 자유 메모 — 표에 행으로 넣기 애매한 이번 회의 공유사항을 적는다.
// 저장소는 예전 "팀원별 진행사항"(team_log_meeting_progress, 회의×팀원 한 칸)을 그대로 쓴다 — 그래서 예전 회의에
// 써 둔 진행사항도 이 칸에 그대로 보인다. 칸에서 벗어나면 저장하고, 서버가 version으로 동시편집 충돌을 막는다
// (그 사이 다른 사람이 저장했으면 최신 내용으로 바꾸고 내가 쓴 글은 알림으로 남긴다).

import { useLayoutEffect, useRef, useState } from 'react'

export type ProgressRow = { id: string; meeting_id: string; member_id: string; content: string; updated_at: string | null; version: number; updated_by: string | null }

type Props = {
  meetingId: string
  memberId: string
  memberName: string
  row: ProgressRow | undefined
  onSaved: (row: ProgressRow) => void
  onError: (message: string) => void
  onUnauthorized: () => void
}

export default function MemberNote({ meetingId, memberId, memberName, row, onSaved, onError, onUnauthorized }: Props) {
  // 편집 중일 때만 draft를 들고, 아니면 서버 값을 그대로 보여준다(다른 사람 저장이 realtime으로 바로 보이게).
  const [draft, setDraft] = useState<{ text: string; baseText: string; baseVersion: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const value = draft?.text ?? row?.content ?? ''

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
      onError(`${memberName}님 메모를 그 사이 ${json.current?.updated_by ?? '다른 분'}님이 먼저 고쳐 최신 내용으로 바꿨습니다. 내가 쓴 내용: "${sent.slice(0, 60)}${sent.length > 60 ? '…' : ''}"`)
      return
    }
    if (!json?.ok) { onError(json?.error ?? '메모를 저장하지 못했습니다.'); return }
    const saved = json.progress as ProgressRow
    onSaved(saved)
    // 저장하는 사이 더 입력했으면 방금 저장한 내 내용 위에서 계속 쓰는 것으로 본다.
    setDraft(d => (d && d.text !== sent ? { ...d, baseText: sent, baseVersion: saved.version } : null))
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={e => {
        const text = e.target.value.slice(0, 5000)
        setDraft(d => d ? { ...d, text } : { text, baseText: row?.content ?? '', baseVersion: row?.version ?? 0 })
      }}
      onBlur={() => { void save() }}
      placeholder={`${memberName}님 자유 메모 — 표에 넣기 애매한 이번 회의 공유사항 (칸에서 벗어나면 자동 저장)`}
      className={`block w-full text-[13.5px] leading-relaxed text-[#3A4249] bg-white border border-[#E5E8EB] rounded-md px-2.5 py-1.5 resize-none overflow-hidden focus:outline-none focus:border-[#4C7FE0] placeholder:text-[#C0C6CD] ${saving ? 'opacity-70' : ''}`}
    />
  )
}
