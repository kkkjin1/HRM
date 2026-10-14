'use client'

// 일상(홈) 탭의 연혁 박스 — 연혁 메뉴를 숨긴 대신 여기서 기록을 하나씩 넘겨 본다.
// 왼쪽은 정사각형 사진, 오른쪽은 팀원들이 남긴 댓글 포스트잇(연혁 화면과 같은 색·기울기).
// ‹ 는 더 예전 기록, › 는 더 최근 기록. 기록 추가·수정·댓글 쓰기는 "전체 보기"(연혁 화면)에서 한다.

import { useEffect, useId, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { displayNameFull } from '@/lib/members'
import { DOODLE_PALETTE } from '@/lib/data'

type HistoryEvent = {
  id: string
  event_date: string
  category: '입사' | '퇴사' | '회식' | '기타'
  title: string
  photo_url: string | null
}
type HistoryMemo = { id: string; event_id: string; author_id: string; content: string; created_at: string }

const CATEGORY_STYLE: Record<HistoryEvent['category'], { emoji: string; color: string }> = {
  입사: { emoji: '🎉', color: '#059669' },
  퇴사: { emoji: '👋', color: '#9C9C96' },
  회식: { emoji: '🍻', color: '#D97706' },
  기타: { emoji: '✨', color: '#7C3AED' },
}

// 연혁 화면(HistoryTimeline)과 같은 해시 — 같은 댓글은 어디서 봐도 같은 색·기울기.
function hashString(s: string) {
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return Math.abs(hash)
}

export default function HistoryCard({ onOpenAll }: { onOpenAll: () => void }) {
  const instanceId = useId()
  const { members } = useMembers()
  const [events, setEvents] = useState<HistoryEvent[] | null>(null)
  const [memos, setMemos] = useState<HistoryMemo[]>([])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    async function load() {
      const [ev, mm] = await Promise.all([
        supabase.from('history_events').select('id, event_date, category, title, photo_url').order('event_date', { ascending: false }),
        supabase.from('history_memos').select('id, event_id, author_id, content, created_at').order('created_at', { ascending: true }),
      ])
      if (!active) return
      setEvents((ev.data ?? []) as HistoryEvent[])
      setMemos((mm.data ?? []) as HistoryMemo[])
    }
    void load()
    // 연혁 화면에서 기록·댓글을 바꾸면 여기도 바로 맞춘다(일상 탭은 숨겨도 계속 살아 있어서).
    const channel = supabase
      .channel(`history-card-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'history_events' }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'history_memos' }, () => { void load() })
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [instanceId])

  const list = events ?? []
  const i = Math.min(index, Math.max(0, list.length - 1))
  const ev = list[i]
  const style = ev ? CATEGORY_STYLE[ev.category] ?? CATEGORY_STYLE['기타'] : null
  const eventMemos = ev ? memos.filter(m => m.event_id === ev.id) : []
  const nameOf = (id: string) => {
    const m = members.find(mm => mm.id === id)
    return m ? displayNameFull(m) : '팀원'
  }

  return (
    // @container — 홈 2행 1/4 칸처럼 좁으면 사진을 위에 가로로, 넓으면 왼쪽 정사각형 + 오른쪽 댓글로 바꾼다.
    <div className="@container bg-white border border-[#E8E8E4] rounded-2xl p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <p className="text-[14px] font-semibold text-[#1F1F1D]">📖 연혁</p>
        <button type="button" onClick={onOpenAll} className="text-[11.5px] text-[#9C9C96] hover:text-[#B45309]">전체 보기 →</button>
      </div>

      {events === null ? (
        <p className="text-[13px] text-[#9C9C96]">불러오는 중...</p>
      ) : !ev || !style ? (
        <p className="text-[13px] text-[#B0B0AA] py-6 text-center">아직 연혁이 없습니다.</p>
      ) : (
        // 왼쪽 정사각형 사진(박스 폭의 2/5 — 이 크기가 줄 높이를 정한다), 오른쪽에 제목과 댓글 포스트잇.
        <div className="grid grid-cols-1 @[420px]:grid-cols-[2fr_3fr] gap-3 @[420px]:gap-4 flex-1 min-h-0">
          <div className="aspect-video @[420px]:aspect-square w-full rounded-xl overflow-hidden bg-[#F4F4F2] flex items-center justify-center self-start">
            {ev.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL을 그대로 쓴다(연혁 화면과 동일)
              <img src={ev.photo_url} alt={ev.title} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[48px] opacity-60" aria-hidden>{style.emoji}</span>
            )}
          </div>
          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[11px] font-medium rounded-full px-2 py-0.5" style={{ color: style.color, backgroundColor: `${style.color}1A` }}>
                {style.emoji} {ev.category}
              </span>
              <span className="text-[12px] text-[#9C9C96]">{format(parseISO(ev.event_date), 'yyyy. M. d (E)', { locale: ko })}</span>
            </div>
            <p className="text-[14.5px] font-semibold text-[#2A2A26] truncate" title={ev.title}>{ev.title}</p>

            <div className="flex-1 min-h-0 overflow-y-auto mt-2.5 -mx-1 px-1 py-1">
              {eventMemos.length === 0 ? (
                <p className="text-[12px] text-[#C4C4BC]">아직 남긴 댓글이 없어요 — 전체 보기에서 남길 수 있어요.</p>
              ) : (
                <div className="flex flex-wrap gap-2 items-start">
                  {eventMemos.map(m => {
                    const palette = DOODLE_PALETTE[hashString(m.id) % DOODLE_PALETTE.length]
                    const tilt = Math.round(((hashString(m.id) % 100) / 100 - 0.5) * 16 * 10) / 10
                    return (
                      <div
                        key={m.id}
                        className="w-[96px] h-[78px] rounded-md px-2 py-1.5 shadow-sm flex flex-col overflow-hidden"
                        style={{ background: palette.bg, color: palette.fg, transform: `rotate(${tilt}deg)` }}
                        title={`${m.content}\n— ${nameOf(m.author_id)}`}
                      >
                        <p className="flex-1 text-[11px] leading-snug whitespace-pre-wrap break-words overflow-hidden">{m.content}</p>
                        <p className="text-[9px] opacity-60 flex-shrink-0 truncate">{nameOf(m.author_id)}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIndex(Math.min(list.length - 1, i + 1))}
                disabled={i >= list.length - 1}
                aria-label="이전 기록"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-[#E8E8E4] text-[#5A5A55] hover:bg-[#F4F4F2] disabled:opacity-30 disabled:cursor-not-allowed"
              >‹</button>
              <span className="text-[11.5px] text-[#9C9C96]">{list.length - i} / {list.length}</span>
              <button
                type="button"
                onClick={() => setIndex(Math.max(0, i - 1))}
                disabled={i <= 0}
                aria-label="다음 기록"
                className="w-8 h-8 flex items-center justify-center rounded-full border border-[#E8E8E4] text-[#5A5A55] hover:bg-[#F4F4F2] disabled:opacity-30 disabled:cursor-not-allowed"
              >›</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
