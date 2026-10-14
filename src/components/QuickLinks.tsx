'use client'

// 상단바 "🔗" — 팀이 자주 가는 페이지 URL을 모아두는 공용 바로가기. 어느 메뉴에서든 바로 연다.
// 목록은 팝오버를 처음 열 때 한 번 불러온다(헤더에 상시 마운트되므로 페이지 로드마다 부르지 않으려고).

import { useEffect, useId, useRef, useState } from 'react'

type QuickLink = { id: string; title: string; url: string; group_name: string; sort_order: number; created_at: string }
type Draft = { id: string | null; title: string; url: string; group_name: string }

const EMPTY_DRAFT: Draft = { id: null, title: '', url: '', group_name: '' }

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export default function QuickLinks() {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [links, setLinks] = useState<QuickLink[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  useEffect(() => {
    if (!open || loaded) return
    let active = true
    fetch('/api/quick-links')
      .then(r => r.json())
      .then(json => {
        if (!active) return
        if (json.ok) { setLinks(json.links); setLoaded(true); setLoadError('') }
        else setLoadError('바로가기를 불러오지 못했습니다.')
      })
      .catch(() => { if (active) setLoadError('바로가기를 불러오지 못했습니다.') })
    return () => { active = false }
  }, [open, loaded])

  const groups: [string, QuickLink[]][] = []
  for (const l of links) {
    const g = groups.find(([name]) => name === l.group_name)
    if (g) g[1].push(l)
    else groups.push([l.group_name, [l]])
  }
  // 그룹 없는 링크는 맨 아래 "기타"로
  groups.sort((a, b) => (a[0] === '' ? 1 : 0) - (b[0] === '' ? 1 : 0))
  const groupNames = groups.map(([name]) => name).filter(Boolean)

  async function submitDraft() {
    if (!draft || !draft.url.trim() || saving) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch('/api/quick-links', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const json = await res.json()
      if (!json.ok) { setSaveError(json.error || '저장하지 못했습니다.'); return }
      setLinks(prev => draft.id ? prev.map(l => l.id === draft.id ? json.link : l) : [...prev, json.link])
      setDraft(null)
    } catch {
      setSaveError('저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function removeLink(link: QuickLink) {
    if (!window.confirm(`"${link.title}" 바로가기를 삭제할까요?`)) return
    const res = await fetch('/api/quick-links', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: link.id }) }).catch(() => null)
    const json = await res?.json().catch(() => null)
    if (json?.ok) setLinks(prev => prev.filter(l => l.id !== link.id))
    else window.alert('삭제하지 못했습니다.')
  }

  const inputCls = 'w-full text-[12.5px] border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-[#4C7FE0]'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title="바로가기"
        className={`w-7 h-7 flex items-center justify-center rounded-full text-[13px] ${open ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
      >
        🔗
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 sm:left-auto sm:right-0 mt-2 w-[340px] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-100">
            <p className="text-[12.5px] font-semibold text-gray-800">바로가기</p>
            <button
              onClick={() => { setEditing(v => !v); setDraft(null); setSaveError('') }}
              className={`text-[11.5px] ${editing ? 'text-[#4C7FE0] font-medium' : 'text-gray-400 hover:text-[#4C7FE0]'}`}
            >
              {editing ? '완료' : '편집'}
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto py-1.5">
            {loadError && <p className="text-[12px] text-red-500 px-3.5 py-2">{loadError}</p>}
            {!loadError && !loaded && <p className="text-[12px] text-gray-400 text-center py-6">불러오는 중…</p>}
            {loaded && links.length === 0 && !draft && (
              <p className="text-[12px] text-gray-400 text-center py-6">아직 바로가기가 없습니다.<br />자주 가는 페이지를 추가해보세요.</p>
            )}
            {groups.map(([name, items]) => (
              <div key={name || '__none'} className="px-2 py-1">
                <p className="text-[10.5px] font-semibold text-gray-400 px-1.5 mb-0.5">{name || '기타'}</p>
                {items.map(l => (
                  <div key={l.id} className="group flex items-center gap-1 rounded-md hover:bg-gray-50">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 px-1.5 py-1.5 flex items-baseline gap-2"
                    >
                      <span className="text-[12.5px] text-gray-700 truncate">{l.title}</span>
                      <span className="text-[10.5px] text-gray-400 truncate flex-shrink-[2]">{hostOf(l.url)}</span>
                    </a>
                    {editing && (
                      <>
                        <button
                          onClick={() => { setDraft({ id: l.id, title: l.title, url: l.url, group_name: l.group_name }); setSaveError('') }}
                          title="수정"
                          className="text-[11.5px] text-gray-400 hover:text-[#4C7FE0] px-1"
                        >✎</button>
                        <button onClick={() => removeLink(l)} title="삭제" className="text-[12px] text-gray-400 hover:text-red-500 px-1 mr-1">×</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {loaded && (
            <div className="border-t border-gray-100 px-3.5 py-2.5">
              {draft ? (
                <form onSubmit={e => { e.preventDefault(); void submitDraft() }} className="space-y-1.5">
                  <input autoFocus value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} placeholder="URL (https://…)" className={inputCls} />
                  <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="이름 (비우면 주소로 표시)" className={inputCls} />
                  <input value={draft.group_name} onChange={e => setDraft({ ...draft, group_name: e.target.value })} list={listId} placeholder="그룹 (예: 노무, 급여 — 비우면 기타)" className={inputCls} />
                  <datalist id={listId}>{groupNames.map(g => <option key={g} value={g} />)}</datalist>
                  {saveError && <p className="text-[11.5px] text-red-500">{saveError}</p>}
                  <div className="flex justify-end gap-1.5 pt-0.5">
                    <button type="button" onClick={() => { setDraft(null); setSaveError('') }} className="text-[12px] text-gray-500 px-2.5 py-1 rounded-md hover:bg-gray-100">취소</button>
                    <button type="submit" disabled={!draft.url.trim() || saving} className="text-[12px] text-white bg-[#4C7FE0] disabled:opacity-50 px-2.5 py-1 rounded-md">
                      {saving ? '저장 중…' : draft.id ? '수정' : '추가'}
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => { setDraft(EMPTY_DRAFT); setSaveError('') }} className="text-[12px] text-[#4C7FE0] hover:underline">+ 바로가기 추가</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
