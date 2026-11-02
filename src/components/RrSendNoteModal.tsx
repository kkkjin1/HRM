'use client'

// 개인 노트 → R&R 메모 등록. 내가 쓸 수 있는 R&R(담당 R&R, 팀장은 전체)을 고르면 노트 내용(제목·본문·이미지)을
// 그 R&R 메모 페이지의 다음 회차 카드("n차 기획/개선")로 복사한다. 노트는 그대로 남는다(복사).

import { useEffect, useState } from 'react'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { canWriteRrKind } from '@/lib/rrMemo'

type TreeItem = { id: string; title: string; status: 'active' | 'hold' | 'done'; pinned?: boolean }
type TreeGroup = { id: string; name: string; items: TreeItem[] }

const STATUS_DOT = { active: 'bg-[#4C7FE0]', hold: 'bg-amber-400', done: 'bg-gray-300' } as const

export default function RrSendNoteModal({ getNote, onClose }: {
  getNote: () => { title: string; body: string } | null
  onClose: () => void
}) {
  const { me } = useCurrentMember()
  const [groups, setGroups] = useState<TreeGroup[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      fetch('/api/tree').then(r => r.json()).catch(() => null),
      fetch('/api/rr-entries?counts=1').then(r => r.json()).catch(() => null),
    ]).then(([tree, c]) => {
      if (!active) return
      if (!tree?.ok) { setError('R&R 목록을 불러오지 못했습니다.'); return }
      setGroups(tree.groups as TreeGroup[])
      if (c?.ok) setCounts(c.counts)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // 내가 쓸 수 있는 R&R만(담당자 = 그룹 이름이 내 이름, 팀장은 전체)
  const mine = (groups ?? []).filter(g => canWriteRrKind(me, g.name, 'plan') && g.items.length > 0)

  async function send(g: TreeGroup, it: TreeItem) {
    const note = getNote()
    if (!note || (!note.title.trim() && !note.body.replace(/<[^>]*>/g, '').trim() && !/<img/i.test(note.body))) { setError('비어 있는 노트는 등록할 수 없습니다.'); return }
    setSendingId(it.id)
    setError('')
    const res = await fetch('/api/rr-entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'from_note', target_id: it.id, title: note.title, body: note.body }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    setSendingId(null)
    if (!json?.ok) { setError(json?.error ?? '등록하지 못했습니다.'); return }
    const round = json.round as number
    const dropped = json.dropped_images as number
    setDone(`${g.name} · ${it.title}에 "${round}차 ${round === 1 ? '기획' : '개선'}"으로 등록했습니다.${dropped ? ` (이미지 ${dropped}개는 옮기지 못했습니다)` : ''} 업무 → R&R에서 업무명을 누르면 볼 수 있습니다.`)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-[460px] max-h-[80vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center px-5 py-3 border-b border-[#ECEEF1]">
          <h2 className="text-[15px] font-bold text-[#1F2933]">R&R 메모로 등록</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="ml-auto w-8 h-8 flex items-center justify-center rounded-md text-[#7A8491] hover:bg-black/[0.05] text-[18px]">×</button>
        </div>
        {done ? (
          <div className="px-5 py-6 space-y-4">
            <p className="text-[13.5px] text-[#1F2933] leading-relaxed">✅ {done}</p>
            <button type="button" onClick={onClose} className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-4 py-1.5">닫기</button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
            <p className="text-[12.5px] text-[#7A8491] mb-3">이 노트를 고른 R&R의 다음 회차 카드로 복사합니다. 노트는 그대로 남습니다.</p>
            {error && <p className="text-[12.5px] text-[#C53030] bg-[#FDECEC] border border-[#F5C2C2] rounded-lg px-3 py-2 mb-3">{error}</p>}
            {!groups && !error && <p className="text-[13px] text-[#9AA3AE] py-6 text-center">불러오는 중…</p>}
            {groups && mine.length === 0 && <p className="text-[13px] text-[#9AA3AE] py-6 text-center">등록할 수 있는 R&R이 없습니다. (내 이름의 R&R 담당 업무에만 등록할 수 있어요)</p>}
            {mine.map(g => (
              <div key={g.id} className="mb-3">
                <p className="text-[12px] font-semibold text-[#5B6570] mb-1">{g.name}</p>
                <ul className="border border-[#ECEEF1] rounded-lg divide-y divide-[#F2F3F5] overflow-hidden">
                  {[...g.items].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)).map(it => {
                    const n = (counts[it.id] ?? 0) + 1
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          disabled={!!sendingId}
                          onClick={() => void send(g, it)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#F3F7FE] disabled:opacity-60 ${it.pinned ? 'bg-[#FFFBEB]' : ''}`}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[it.status]}`} />
                          <span className="flex-1 min-w-0 text-[13px] text-[#1F2933] break-words">{it.pinned ? '📌 ' : ''}{it.title}</span>
                          <span className="text-[11px] text-[#9AA3AE] flex-shrink-0 whitespace-nowrap">
                            {sendingId === it.id ? '등록 중…' : `→ ${n}차 ${n === 1 ? '기획' : '개선'}`}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
