'use client'

// 일정 추가/수정 창의 "태그" — 팀 공용 목록에서 드롭다운으로 고르고, 옆 "편집"으로 목록 자체를 추가·삭제한다.
// 목록은 창을 열 때 한 번 불러온다. 목록에 없는 태그가 이미 붙어 있는 일정(예전 자유 입력)은 그 값도 선택지로 남긴다.

import { useEffect, useState } from 'react'

type Tag = { id: string; name: string; sort_order: number }

export default function ScheduleTagSelect({ value, onChange }: { value: string; onChange: (tag: string) => void }) {
  const [tags, setTags] = useState<Tag[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/schedule-tags')
      .then(r => r.json())
      .then(j => { if (active) setTags(j.ok ? j.tags : []) })
      .catch(() => { if (active) setTags([]) })
    return () => { active = false }
  }, [])

  async function addTag() {
    const name = newName.trim()
    if (!name) return
    setError('')
    const res = await fetch('/api/schedule-tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) { setError(json?.error ?? '추가하지 못했습니다.'); return }
    setTags(prev => [...(prev ?? []), json.tag])
    setNewName('')
  }

  async function removeTag(tag: Tag) {
    if (!confirm(`"${tag.name}" 태그를 목록에서 뺄까요?\n이미 이 태그가 붙은 일정은 그대로 남습니다.`)) return
    const res = await fetch('/api/schedule-tags', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: tag.id }) }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (!json?.ok) { setError(json?.error ?? '삭제하지 못했습니다.'); return }
    setTags(prev => (prev ?? []).filter(t => t.id !== tag.id))
  }

  const names = (tags ?? []).map(t => t.name)
  const orphan = value && !names.includes(value) ? value : null

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
        >
          <option value="">태그 없음</option>
          {names.map(n => <option key={n} value={n}>{n}</option>)}
          {orphan && <option value={orphan}>{orphan} (목록에 없음)</option>}
        </select>
        <button
          type="button"
          onClick={() => { setEditing(v => !v); setError('') }}
          className={`text-[12px] rounded-lg px-2.5 border ${editing ? 'border-[#4C7FE0] text-[#4C7FE0] bg-[#4C7FE0]/5' : 'border-gray-200 text-gray-500 hover:text-[#4C7FE0]'}`}
        >
          {editing ? '완료' : '편집'}
        </button>
      </div>

      {editing && (
        <div className="border border-gray-200 rounded-lg p-2.5 bg-gray-50 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {tags === null && <span className="text-[11.5px] text-gray-400">불러오는 중…</span>}
            {tags?.length === 0 && <span className="text-[11.5px] text-gray-400">태그가 없습니다.</span>}
            {tags?.map(t => (
              <span key={t.id} className="inline-flex items-center gap-1 text-[12px] text-gray-700 bg-white border border-gray-200 rounded-full pl-2.5 pr-1 py-0.5">
                {t.name}
                <button type="button" onClick={() => { void removeTag(t) }} title="목록에서 빼기" className="w-4 h-4 rounded-full text-[11px] text-gray-400 hover:text-red-500 flex items-center justify-center">×</button>
              </span>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); void addTag() }} className="flex gap-1.5">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="새 태그 이름"
              className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-[12.5px] bg-white"
            />
            <button type="submit" disabled={!newName.trim()} className="text-[12px] font-medium text-white bg-[#4C7FE0] disabled:opacity-40 rounded-md px-2.5">추가</button>
          </form>
          {error && <p className="text-[11.5px] text-red-500">{error}</p>}
        </div>
      )}
    </div>
  )
}
