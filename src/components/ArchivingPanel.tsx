'use client'

// 상단 메뉴 "아카이빙" — HR 사례(근태·휴가/급여·보상/계약·고용/퇴직/노무/채용/평가/기타)를 검색 가능하게 보관.

import { useEffect, useMemo, useState } from 'react'
import { ARCHIVE_CATEGORIES, ARCHIVE_CATEGORY_COLOR, type ArchiveCategory, type ArchiveCase } from '@/lib/archiveCategories'
import { useCurrentMember } from '@/lib/useCurrentMember'
import ArchiveCaseModal from './ArchiveCaseModal'

type Filter = '전체' | ArchiveCategory
// pending: 아카이빙 "정리 필요"의 회의 결정사항을 사례로 옮기는 중 — 저장하면 그 결정사항을 정리 완료로 표시한다.
type ModalState = { mode: 'create' } | { mode: 'edit'; item: ArchiveCase } | { mode: 'pending'; item: PendingDecision }
type PendingDecision = { id: string; content: string; created_at: string; meeting_id: string; meeting_title: string; meeting_date: string; source_title: string }

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
  // 정리 필요 — 회의창에서 "결정"으로 등록했지만 아직 사례로 정리하지 않은 것
  const [pending, setPending] = useState<PendingDecision[]>([])
  const [showPending, setShowPending] = useState(false)

  async function loadPending() {
    const res = await fetch('/api/archive-pending').catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (json?.ok) setPending(json.items)
  }

  async function markPending(id: string, caseId: string | null) {
    const res = await fetch('/api/archive-pending', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, archive_case_id: caseId }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    if (json?.ok) setPending(prev => prev.filter(p => p.id !== id))
    else setError(json?.error ?? '정리 상태를 저장하지 못했습니다.')
  }

  function skipPending(item: PendingDecision) {
    if (!confirm(`"${item.content.slice(0, 40)}"\n\n사례로 남기지 않고 정리 필요 목록에서 뺄까요?`)) return
    void markPending(item.id, null)
  }

  async function submitFromPending(item: PendingDecision, payload: Record<string, unknown>) {
    const json = await submitCreate(payload)
    if (json.ok && json.case?.id) await markPending(item.id, json.case.id)
    return json
  }

  async function loadCases() {
    const res = await fetch('/api/archive-cases')
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json()
    if (json.ok) setCases(json.cases)
    else setError(json.error ?? '불러오기 실패')
    setLoaded(true)
  }

  useEffect(() => { loadCases(); void loadPending() }, [])

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
          prefill={modal.mode === 'pending' ? {
            title: modal.item.source_title || modal.item.content.split('\n')[0].slice(0, 60),
            situation: `${modal.item.meeting_date} ${modal.item.meeting_title} 회의${modal.item.source_title ? ` · 안건 "${modal.item.source_title}"` : ''}에서 나온 결정사항`,
            conclusion: modal.item.content,
          } : undefined}
          onClose={() => setModal(null)}
          onSubmit={payload => modal.mode === 'edit' ? submitEdit(modal.item.id, payload) : modal.mode === 'pending' ? submitFromPending(modal.item, payload) : submitCreate(payload)}
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
        {/* 정리 필요 — 회의 결정사항 중 아직 사례로 정리하지 않은 것 */}
        <button
          onClick={() => setShowPending(v => !v)}
          className={`text-[12px] px-2.5 py-1.5 rounded-md transition-colors flex-shrink-0 mr-2 font-medium ${showPending ? 'bg-[#B45309] text-white' : 'bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]'}`}
        >
          📝 정리 필요 {pending.length}
        </button>
        <button
          onClick={() => { setShowPending(false); setFilter('전체') }}
          className={`text-[12px] px-2.5 py-1.5 rounded-md transition-colors flex-shrink-0 ${filter === '전체' ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
        >
          전체
        </button>
        {ARCHIVE_CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => { setShowPending(false); setFilter(c) }}
            className="text-[12px] px-2.5 py-1.5 rounded-md transition-colors flex-shrink-0"
            style={filter === c ? { backgroundColor: ARCHIVE_CATEGORY_COLOR[c], color: 'white' } : { color: '#7A8491' }}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-8">
        {showPending && (
          <div className="mb-5 border border-[#FDE68A] bg-[#FFFBEB] rounded-xl p-4">
            <p className="text-[13px] font-semibold text-[#92400E] mb-1">📝 정리 필요 — 회의 결정사항</p>
            <p className="text-[12px] text-[#B45309] mb-3">회의창에서 &quot;결정&quot;으로 등록한 내용이에요. 남겨둘 만한 건 사례로 정리하고, 아니면 정리 안 함으로 빼주세요.</p>
            {pending.length === 0 ? (
              <p className="text-[12.5px] text-[#B0B8C1] py-4 text-center">정리할 결정사항이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {pending.map(p => (
                  <div key={p.id} className="bg-white border border-[#F3E6C4] rounded-lg px-3.5 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] text-[#1F2933] leading-relaxed whitespace-pre-wrap break-words">{p.content}</p>
                      <p className="text-[11.5px] text-[#9AA3AE] mt-1">
                        {p.meeting_date} · {p.meeting_title}{p.source_title && <> · 안건 &quot;{p.source_title}&quot;</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => setModal({ mode: 'pending', item: p })} className="text-[12px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-md px-2.5 py-1.5">사례로 정리</button>
                      <button onClick={() => skipPending(p)} className="text-[12px] text-[#7A8491] hover:text-[#1F2933] rounded-md px-2 py-1.5 hover:bg-black/[0.04]">정리 안 함</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
