'use client'

// 상단 메뉴 "아카이빙" — HR 사례(근태·휴가/급여·보상/계약·고용/퇴직/노무/채용/평가/기타)를 검색 가능하게 보관.

import { useEffect, useMemo, useState } from 'react'
import { ARCHIVE_CATEGORIES, ARCHIVE_CATEGORY_COLOR, type ArchiveCategory, type ArchiveCase } from '@/lib/archiveCategories'
import { useCurrentMember } from '@/lib/useCurrentMember'
import ArchiveCaseModal from './ArchiveCaseModal'

type Filter = '전체' | ArchiveCategory
type ModalState = { mode: 'create' } | { mode: 'edit'; item: ArchiveCase }

function matchesSearch(item: ArchiveCase, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [item.title, item.situation, item.conclusion, ...item.keywords].join(' ').toLowerCase()
  return haystack.includes(q)
}

export default function ArchivingPanel() {
  const { me } = useCurrentMember()
  const [cases, setCases] = useState<ArchiveCase[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('전체')
  const [modal, setModal] = useState<ModalState | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)

  async function loadCases() {
    const res = await fetch('/api/archive-cases')
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json()
    if (json.ok) setCases(json.cases)
    else setError(json.error ?? '불러오기 실패')
    setLoaded(true)
  }

  useEffect(() => { loadCases() }, [])

  async function submitCreate(payload: Record<string, unknown>) {
    const res = await fetch('/api/archive-cases', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, author: me?.name ?? '' }),
    })
    if (res.status === 401) { window.location.href = '/login'; return { ok: false } }
    const json = await res.json()
    if (json.ok) setCases(prev => [json.case, ...prev])
    return json
  }

  async function submitEdit(id: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/archive-cases/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.status === 401) { window.location.href = '/login'; return { ok: false } }
    const json = await res.json()
    if (json.ok) setCases(prev => prev.map(c => c.id === id ? json.case : c))
    return json
  }

  function handleDelete(item: ArchiveCase) {
    if (!confirm(`"${item.title}" 사례를 삭제할까요?`)) return
    performDelete(item.id)
  }

  async function performDelete(id: string) {
    const res = await fetch(`/api/archive-cases/${id}`, { method: 'DELETE' })
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json()
    if (json.ok) setCases(prev => prev.filter(c => c.id !== id))
    else setError(json.error ?? '삭제에 실패했습니다.')
  }

  const filteredCases = useMemo(
    () => cases.filter(c => (filter === '전체' || c.category === filter) && matchesSearch(c, search)),
    [cases, filter, search]
  )

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {modal && (
        <ArchiveCaseModal
          initial={modal.mode === 'edit' ? modal.item : undefined}
          onClose={() => setModal(null)}
          onSubmit={payload => modal.mode === 'edit' ? submitEdit(modal.item.id, payload) : submitCreate(payload)}
        />
      )}

      <div className="flex-shrink-0 px-6 pt-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[23px] font-semibold text-[#1F2933]">아카이빙</h1>
            <p className="text-[13.5px] text-[#7A8491] mt-1">HR 사례를 유형별로 기록하고 검색하세요.</p>
          </div>
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-4 py-2.5 flex-shrink-0"
          >
            + 새 사례 등록
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 px-6 pb-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 사례명·상황·결론·키워드 검색"
          className="w-full text-[13.5px] border border-[#E5E8EB] rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-[#4C7FE0] bg-white"
        />
      </div>

      <div className="flex-shrink-0 px-6 pb-3 flex items-center gap-1 flex-wrap">
        <button
          onClick={() => setFilter('전체')}
          className={`text-[12px] px-2.5 py-1.5 rounded-md transition-colors flex-shrink-0 ${filter === '전체' ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
        >
          전체
        </button>
        {ARCHIVE_CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className="text-[12px] px-2.5 py-1.5 rounded-md transition-colors flex-shrink-0"
            style={filter === c ? { backgroundColor: ARCHIVE_CATEGORY_COLOR[c], color: 'white' } : { color: '#7A8491' }}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-8">
        {loaded && filteredCases.length === 0 && (
          <p className="text-[12.5px] text-[#B0B8C1] py-6 text-center">
            {cases.length === 0 ? '아직 등록된 사례가 없습니다.' : '검색/필터 결과가 없습니다.'}
          </p>
        )}
        {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}

        <div className="space-y-2.5">
          {filteredCases.map(item => {
            const isOpen = openId === item.id
            return (
              <div key={item.id} className="border border-[#E5E8EB] rounded-xl overflow-hidden bg-white">
                <div
                  onClick={() => setOpenId(p => p === item.id ? null : item.id)}
                  className="px-4 py-3 cursor-pointer flex items-start justify-between gap-3 hover:bg-[#F7F8F8]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className="text-[11px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0"
                        style={{ backgroundColor: `${ARCHIVE_CATEGORY_COLOR[item.category]}1A`, color: ARCHIVE_CATEGORY_COLOR[item.category] }}
                      >
                        {item.category}
                      </span>
                      <p className="text-[14.5px] font-semibold text-[#1F2933] truncate">{item.title}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.keywords.map(k => (
                        <span key={k} className="text-[11px] text-[#7A8491] bg-[#F3F4F6] rounded-full px-1.5 py-0.5">{k}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 relative">
                    <span className="text-[11.5px] text-[#B0B8C1]">{item.created_at.slice(0, 10)}</span>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setMenuId(p => p === item.id ? null : item.id) }}
                      className="text-[14px] text-[#7A8491] hover:text-[#1F2933] px-1.5 py-0.5 rounded-md hover:bg-black/[0.04]"
                    >···</button>
                    {menuId === item.id && (
                      <div className="absolute right-0 top-7 bg-white border border-[#EEF0F2] rounded-lg shadow-sm py-1 w-24 z-10">
                        <button
                          onClick={e => { e.stopPropagation(); setMenuId(null); setModal({ mode: 'edit', item }) }}
                          className="w-full text-left text-[12px] text-[#7A8491] hover:bg-[#F7F8F8] px-3 py-1.5"
                        >수정</button>
                        <button
                          onClick={e => { e.stopPropagation(); setMenuId(null); handleDelete(item) }}
                          className="w-full text-left text-[12px] text-red-500 hover:bg-[#F7F8F8] px-3 py-1.5"
                        >삭제</button>
                      </div>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-[#EEF0F2] pt-3 space-y-3">
                    <div>
                      <p className="text-[11.5px] font-semibold text-[#7A8491] mb-1">상황</p>
                      <p className="text-[13.5px] text-[#3A4249] leading-relaxed whitespace-pre-wrap break-words">
                        {item.situation || <span className="text-[#B0B8C1]">내용이 없습니다.</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11.5px] font-semibold text-[#7A8491] mb-1">결론</p>
                      <p className="text-[13.5px] text-[#3A4249] leading-relaxed whitespace-pre-wrap break-words">
                        {item.conclusion || <span className="text-[#B0B8C1]">내용이 없습니다.</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[11.5px] text-[#B0B8C1]">
                      {item.author && <span>{item.author}</span>}
                      {item.slack_url && (
                        <a href={item.slack_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[#4C7FE0] hover:underline">
                          원문 슬랙 보기 →
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
