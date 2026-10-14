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

// 타일 아이콘 — 이름 첫 글자 + 주소별로 고정된 색(같은 사이트는 늘 같은 색).
const TILE_COLORS = ['#4C7FE0', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#0891B2', '#EF4444', '#6B7280']
function hashOf(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function initialOf(title: string) {
  return (title.trim()[0] ?? '?').toUpperCase()
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
    // ESC로도 닫는다(추가·수정 중이던 입력은 버린다).
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(false)
      setDraft(null)
      setSaveError('')
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
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

  // 그룹(중분류)으로 줄을 나누지 않고 추가한 순서대로 한 격자에 이어 붙인다 — 그룹명은 타일 위에 작게만 적는다.
  const groupNames = Array.from(new Set(links.map(l => l.group_name).filter(Boolean)))

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
        <div className="absolute z-30 top-full left-0 sm:left-auto sm:right-0 mt-2 w-[460px] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
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
            {/* 한 줄에 4개씩 타일 — 타일을 누르면 새 탭으로 이동한다. 위 작은 글씨는 중분류(그룹). */}
            {links.length > 0 && (
              <div className="grid grid-cols-4 gap-2 px-3 py-1.5">
                {links.map(l => (
                  <div key={l.id} className="relative group">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${l.group_name ? `[${l.group_name}] ` : ''}${l.title}\n${l.url}`}
                      className="h-[96px] flex flex-col items-center justify-center gap-1 rounded-xl border border-gray-100 bg-[#FAFAF9] px-1.5 text-center hover:bg-white hover:border-[#4C7FE0]/40 hover:shadow-sm transition-all"
                    >
                      <span className="text-[10px] leading-none text-gray-400 truncate max-w-full h-[11px]">{l.group_name}</span>
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-bold text-white flex-shrink-0"
                        style={{ background: TILE_COLORS[hashOf(hostOf(l.url)) % TILE_COLORS.length] }}
                      >
                        {initialOf(l.title)}
                      </span>
                      <span className="text-[11.5px] leading-tight text-gray-700 line-clamp-2 break-all">{l.title}</span>
                    </a>
                    {editing && (
                      <div className="absolute -top-1.5 -right-1.5 flex gap-0.5">
                        <button
                          onClick={() => { setDraft({ id: l.id, title: l.title, url: l.url, group_name: l.group_name }); setSaveError('') }}
                          title="수정"
                          className="w-5 h-5 rounded-full bg-white border border-gray-200 shadow-sm text-[10px] text-gray-500 hover:text-[#4C7FE0] flex items-center justify-center"
                        >✎</button>
                        <button
                          onClick={() => removeLink(l)}
                          title="삭제"
                          className="w-5 h-5 rounded-full bg-white border border-gray-200 shadow-sm text-[11px] text-gray-500 hover:text-red-500 flex items-center justify-center"
                        >×</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {loaded && (
            <div className="border-t border-gray-100 px-3.5 py-2.5">
              {draft ? (
                <form onSubmit={e => { e.preventDefault(); void submitDraft() }} className="space-y-1.5">
                  <input autoFocus value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} placeholder="URL (https://…)" className={inputCls} />
                  <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="이름 (비우면 주소로 표시)" className={inputCls} />
                  <input value={draft.group_name} onChange={e => setDraft({ ...draft, group_name: e.target.value })} list={listId} placeholder="중분류 (예: 노무, 급여 — 타일 위에 작게 표시, 비워도 됨)" className={inputCls} />
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
