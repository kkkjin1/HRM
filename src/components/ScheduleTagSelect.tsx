'use client'

// 일정 추가/수정 창의 "태그" — 팀 공용 목록을 알약 버튼으로 바로 고르고, 끝의 "편집"으로 목록 자체를 추가·삭제한다.
// 창을 열 때마다 서버를 기다리지 않도록 목록을 모듈에 한 번 받아 두고(같은 탭 동안 재사용), 브라우저에도 기억해
// 새로고침 직후 첫 창도 바로 그린다. 그 뒤 조용히 최신 목록으로 맞춘다.
// 목록에 없는 태그가 이미 붙은 일정(예전 자유 입력)은 그 값도 알약으로 남긴다.

import { useEffect, useState } from 'react'

type Tag = { id: string; name: string; sort_order: number }

const STORAGE_KEY = 'hrm_schedule_tags'
// 휴가 계열은 달력에서 칸 전체를 휴가로 덮는 태그라 초록으로 구분한다(page의 LEAVE_TAGS와 같은 목록).
const LEAVE = new Set(['휴가', '오전반차', '오후반차', '오전반반차', '오후반반차'])

let cache: Tag[] | null = null
let inflight: Promise<Tag[]> | null = null

function readStored(): Tag[] | null {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Tag[] | null } catch { return null }
}
function store(tags: Tag[]) {
  cache = tags
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tags)) } catch {}
}
function fetchTags(): Promise<Tag[]> {
  if (!inflight) {
    inflight = fetch('/api/schedule-tags')
      .then(r => r.json())
      .then(j => { const tags = (j.ok ? j.tags : cache ?? []) as Tag[]; store(tags); return tags })
      .catch(() => cache ?? [])
      .finally(() => { inflight = null })
  }
  return inflight
}

// 페이지가 뜰 때 미리 받아 둔다(첫 창도 기다림 없이).
export function prefetchScheduleTags() {
  if (!cache) void fetchTags()
}

export default function ScheduleTagSelect({ value, onChange }: { value: string; onChange: (tag: string) => void }) {
  const [tags, setTags] = useState<Tag[]>(() => cache ?? (typeof window !== 'undefined' ? readStored() : null) ?? [])
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void fetchTags().then(t => { if (active) setTags(t) })
    return () => { active = false }
  }, [])

  async function addTag() {
    const name = newName.trim()
    if (!name) return
    setError('')
    const res = await fetch('/api/schedule-tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) { setError(json?.error ?? '추가하지 못했습니다.'); return }
    const next = [...tags, json.tag as Tag]
    store(next)
    setTags(next)
    setNewName('')
  }

  async function removeTag(tag: Tag) {
    if (!confirm(`"${tag.name}" 태그를 목록에서 뺄까요?\n이미 이 태그가 붙은 일정은 그대로 남습니다.`)) return
    const res = await fetch('/api/schedule-tags', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: tag.id }) }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) { setError(json?.error ?? '삭제하지 못했습니다.'); return }
    const next = tags.filter(t => t.id !== tag.id)
    store(next)
    setTags(next)
    if (value === tag.name) onChange('')
  }

  const names = tags.map(t => t.name)
  const orphan = value && !names.includes(value) ? value : null

  const pill = (name: string, selected: boolean) => {
    const leave = LEAVE.has(name)
    return `text-[12px] rounded-full px-2.5 py-1 border transition-colors ${selected
      ? (leave ? 'bg-[#059669] border-[#059669] text-white' : 'bg-[#4C7FE0] border-[#4C7FE0] text-white')
      : (leave ? 'border-[#A7F3D0] text-[#047857] bg-[#ECFDF5] hover:border-[#059669]' : 'border-[#E5E8EB] text-[#4A5560] bg-white hover:border-[#4C7FE0]/60')}`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11.5px] font-medium text-[#7A8491]">태그</span>
        <button
          type="button"
          onClick={() => { setEditing(v => !v); setError('') }}
          className={`text-[11.5px] ${editing ? 'text-[#4C7FE0] font-medium' : 'text-[#9AA3AE] hover:text-[#4C7FE0]'}`}
        >
          {editing ? '편집 완료' : '편집'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {!editing && (
          <button type="button" onClick={() => onChange('')} className={pill('', value === '')}>없음</button>
        )}
        {tags.map(t => (
          editing ? (
            <span key={t.id} className={`inline-flex items-center gap-1 ${pill(t.name, false)} pr-1`}>
              {t.name}
              <button type="button" onClick={() => { void removeTag(t) }} aria-label={`${t.name} 빼기`} className="w-4 h-4 rounded-full text-[11px] text-[#9AA3AE] hover:text-red-500 hover:bg-red-50 flex items-center justify-center">×</button>
            </span>
          ) : (
            <button key={t.id} type="button" onClick={() => onChange(t.name)} className={pill(t.name, value === t.name)}>{t.name}</button>
          )
        ))}
        {!editing && orphan && (
          <button type="button" onClick={() => onChange(orphan)} title="목록에 없는 태그" className={`${pill(orphan, true)} opacity-80`}>{orphan}</button>
        )}
        {editing && (
          <form onSubmit={e => { e.preventDefault(); void addTag() }} className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="+ 새 태그"
              className="w-24 text-[12px] rounded-full border border-dashed border-[#C9CFD5] px-2.5 py-1 focus:outline-none focus:border-[#4C7FE0] bg-white"
            />
            {newName.trim() && <button type="submit" className="text-[11.5px] font-medium text-[#4C7FE0] px-1">추가</button>}
          </form>
        )}
      </div>
      {error && <p className="text-[11.5px] text-red-500 mt-1">{error}</p>}
    </div>
  )
}
