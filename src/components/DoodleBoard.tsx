'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayNameFull } from '@/lib/members'
import { DOODLE_PALETTE } from '@/lib/data'
import { toggleReaction, type Reactions } from '@/lib/reactions'
import { extractTaggedMembers, splitMentions } from '@/lib/mentions'
import EmojiPicker from '@/components/EmojiPicker'
import TagPicker from '@/components/TagPicker'
import ClickableAvatar from '@/components/ClickableAvatar'

type Doodle = {
  id: string
  author_id: string
  body: string
  color_key: number
  tilt: number
  reactions: Reactions
  created_at: string
}

function hashString(s: string) {
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function fmtRelative(iso: string) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return '어제'
  return `${diffDay}일 전`
}

const PAGE_SIZE = 30

// 3줄로 잘린 본문 — 실제로 잘렸는지(내용이 넘치는지) 재서 부모에게 알려준다.
function ClampedBody({ children, onOverflowChange }: { children: ReactNode; onOverflowChange: (overflow: boolean) => void }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const cbRef = useRef(onOverflowChange)
  useEffect(() => { cbRef.current = onOverflowChange })
  // 카드 폭이 바뀌면(창 크기·열 수) ResizeObserver가 다시 잰다.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => cbRef.current(el.scrollHeight > el.clientHeight + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <p ref={ref} className="text-[12.5px] leading-snug whitespace-pre-wrap break-words line-clamp-3">
      {children}
    </p>
  )
}

export default function DoodleBoard() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [doodles, setDoodles] = useState<Doodle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)
  const [openPickerId, setOpenPickerId] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const doodlesRef = useRef<Doodle[]>([])
  const hasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  // 누가 낙서를 많이 남겼는지(전체 기간) — 목록은 30개씩 나눠 불러오므로 개수는 author_id만 따로 센다.
  const [authorCounts, setAuthorCounts] = useState<Record<string, number>>({})
  // 본문이 3줄을 넘어 잘린 낙서들 / 크게 펼쳐 보는 중인 낙서
  const [overflowIds, setOverflowIds] = useState<Set<string>>(new Set())
  const [viewingId, setViewingId] = useState<string | null>(null)

  function setOverflow(id: string, overflow: boolean) {
    setOverflowIds(prev => {
      if (prev.has(id) === overflow) return prev
      const next = new Set(prev)
      if (overflow) next.add(id)
      else next.delete(id)
      return next
    })
  }

  useEffect(() => { doodlesRef.current = doodles }, [doodles])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])

  async function loadMore() {
    if (loadingMoreRef.current || !hasMoreRef.current || doodlesRef.current.length === 0) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const supabase = createClient()
    const oldest = doodlesRef.current[doodlesRef.current.length - 1].created_at
    const { data } = await supabase
      .from('doodle')
      .select('*')
      .order('created_at', { ascending: false })
      .lt('created_at', oldest)
      .limit(PAGE_SIZE)
    if (data) {
      setDoodles(prev => [...prev, ...(data as Doodle[])])
      if (data.length < PAGE_SIZE) setHasMore(false)
    }
    loadingMoreRef.current = false
    setLoadingMore(false)
  }

  useEffect(() => {
    if (!loaded) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore()
    }, { rootMargin: '300px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loaded])

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data } = await supabase.from('doodle').select('*').order('created_at', { ascending: false }).limit(PAGE_SIZE)
      if (active && data) {
        setDoodles(data as Doodle[])
        setHasMore(data.length === PAGE_SIZE)
      }
      if (active) setLoaded(true)
    })()

    const channel = supabase
      .channel('fun-doodle')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodle' }, payload => {
        const row = payload.new as Doodle
        setDoodles(prev => (prev.some(d => d.id === row.id) ? prev : [row, ...prev]))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'doodle' }, payload => {
        const row = payload.new as Doodle
        setDoodles(prev => prev.map(d => (d.id === row.id ? row : d)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'doodle' }, payload => {
        const old = payload.old as { id: string }
        setDoodles(prev => prev.filter(d => d.id !== old.id))
      })
      .subscribe()

    const timer = setInterval(() => setTick(t => t + 1), 60000)

    async function loadCounts() {
      const { data } = await supabase.from('doodle').select('author_id')
      if (!active || !data) return
      const counts: Record<string, number> = {}
      for (const r of data as { author_id: string }[]) counts[r.author_id] = (counts[r.author_id] ?? 0) + 1
      setAuthorCounts(counts)
    }
    void loadCounts()
    const countChannel = supabase
      .channel('fun-doodle-counts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'doodle' }, () => { void loadCounts() })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'doodle' }, () => { void loadCounts() })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
      supabase.removeChannel(countChannel)
      clearInterval(timer)
    }
  }, [])

  // 낙서 남기기 칸은 ESC로 닫는다.
  useEffect(() => {
    if (!composing) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setComposing(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [composing])

  // 펼쳐 보기 창도 ESC로 닫는다.
  useEffect(() => {
    if (!viewingId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewingId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewingId])

  function nameOf(id: string) {
    return displayNameFull(members.find(m => m.id === id)) || '알 수 없음'
  }

  async function addDoodle() {
    if (!draft.trim() || !me || busy) return
    setBusy(true)
    const supabase = createClient()
    const seed = me.id + Date.now().toString()
    const colorKey = hashString(seed) % 8
    const tilt = Math.round((Math.random() * 1.8 - 0.9) * 100) / 100
    const body = draft.trim()
    const { data } = await supabase
      .from('doodle')
      .insert({ author_id: me.id, body, color_key: colorKey, tilt })
      .select()
      .single()
    if (data) setDoodles(prev => [data as Doodle, ...prev])

    const tagged = extractTaggedMembers(body, members).filter(m => m.id !== me.id)
    if (tagged.length > 0) {
      await Promise.all(tagged.map(m => supabase.from('notifications').insert({
        member_id: m.id,
        kind: 'doodle_tag',
        body: `${displayNameFull(me)}님이 낙서에서 나를 태그했어요`,
        meta: { section: 'life' },
      })))
    }

    setDraft('')
    setComposing(false)
    setBusy(false)
  }

  function insertTag(name: string) {
    setDraft(prev => (prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? `${prev} @${name} ` : `${prev}@${name} `))
  }

  async function toggleEmoji(doodle: Doodle, emoji: string) {
    if (!me) return
    const wasAdded = !(doodle.reactions?.[emoji] ?? []).includes(me.id)
    const next = toggleReaction(doodle.reactions ?? {}, emoji, me.id)
    const supabase = createClient()
    await supabase.from('doodle').update({ reactions: next }).eq('id', doodle.id)
    setDoodles(prev => prev.map(d => (d.id === doodle.id ? { ...d, reactions: next } : d)))
    if (wasAdded && doodle.author_id !== me.id) {
      await supabase.from('notifications').insert({
        member_id: doodle.author_id,
        kind: 'doodle_reaction',
        body: `${displayNameFull(me)}님이 내 낙서에 ${emoji} 반응을 남겼어요`,
        meta: { section: 'life' },
      })
    }
  }

  function renderBody(body: string) {
    return splitMentions(body, members).map((part, i) =>
      part.type === 'mention'
        ? <span key={i} className="font-semibold underline">{part.content}</span>
        : <span key={i}>{part.content}</span>
    )
  }

  function renderReactions(d: Doodle) {
    return Object.keys(d.reactions ?? {})
      .filter(e => (d.reactions?.[e]?.length ?? 0) > 0)
      .map(emoji => {
        const reactedBy = d.reactions?.[emoji] ?? []
        const mine = !!me && reactedBy.includes(me.id)
        return (
          <button
            key={emoji}
            onClick={() => toggleEmoji(d, emoji)}
            disabled={!me}
            title={reactedBy.map(id => nameOf(id)).join(', ')}
            className="text-[11px] rounded-full px-1.5 py-0.5"
            style={{ background: mine ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.05)' }}
          >
            {emoji} {reactedBy.length}
          </button>
        )
      })
  }

  const ranking = Object.entries(authorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const viewing = viewingId ? doodles.find(d => d.id === viewingId) ?? null : null

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-4 min-w-0">
          <p className="text-[14px] font-semibold text-[#1F1F1D] flex-shrink-0">✏️ 낙서 보드</p>
          {ranking.length > 0 && (
            <p className="text-[11.5px] text-[#B0B0AA] truncate" title="낙서를 많이 남긴 순서(전체 기간)">
              🏆 {ranking.map(([id, n], i) => `${i + 1}. ${nameOf(id)} ${n}`).join('  ·  ')}
            </p>
          )}
        </div>
        <button
          onClick={() => setComposing(v => !v)}
          className="text-[12.5px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] rounded-lg px-3 py-1.5"
        >
          + 낙서 남기기
        </button>
      </div>

      {composing && (
        <div className="mb-4 bg-[#F7F7F5] rounded-xl p-3">
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={2}
            placeholder="아무 말이나 남겨보세요..."
            className="w-full text-[13.5px] border border-[#E8E8E4] rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#5B54C4] resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <TagPicker members={members} onPick={insertTag} />
            <div className="flex gap-2">
              <button onClick={() => setComposing(false)} className="text-[12.5px] text-[#6B6B66] px-3 py-1.5">취소</button>
              <button
                onClick={addDoodle}
                disabled={busy || !draft.trim() || !me}
                className="text-[12.5px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-40 rounded-lg px-3 py-1.5"
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}

      {!loaded || !membersLoaded ? (
        <p className="text-[13px] text-[#9C9C96]">불러오는 중...</p>
      ) : doodles.length === 0 ? (
        <p className="text-[13px] text-[#9C9C96] py-6 text-center">아직 낙서가 없습니다.</p>
      ) : (
        <>
        {/* 작은 포스트잇처럼 — 칸을 좁고 낮게(넓은 화면 6~8열) 해서 한 번에 많이 보이게 한다.
            긴 글은 3줄까지 — 잘린 카드는 점선 테두리 + 📖 표시, 본문을 누르면 창으로 전체를 본다. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 2xl:grid-cols-8 gap-[10px]">
          {doodles.map(d => {
            const palette = DOODLE_PALETTE[d.color_key % 8]
            const authorMember = members.find(x => x.id === d.author_id)
            const truncated = overflowIds.has(d.id)
            return (
              <div
                key={d.id}
                style={{
                  background: palette.bg, color: palette.fg,
                  transform: `rotate(${d.tilt}deg)`,
                  // transform이 있는 요소는 자체 stacking context가 되어 내부 팝오버의 z-index가
                  // 형제 카드 밖으로 못 뜬다 — 이 카드가 열려 있을 때만 카드 단위로 z-index를 올린다.
                  position: 'relative', zIndex: openPickerId === d.id ? 30 : undefined,
                  border: `1.5px dashed ${truncated ? `${palette.fg}55` : 'transparent'}`,
                }}
                className="rounded-xl px-3 py-2.5 min-h-[124px] flex flex-col"
              >
                {truncated && (
                  <button
                    onClick={() => setViewingId(d.id)}
                    title="내용이 길어요 — 눌러서 전체 보기"
                    className="absolute -top-2 -right-2 text-[12px] leading-none bg-white rounded-full w-6 h-6 flex items-center justify-center shadow-sm border border-[#E8E8E4] hover:scale-110 transition-transform"
                  >
                    📖
                  </button>
                )}
                <div
                  onClick={truncated ? () => setViewingId(d.id) : undefined}
                  className={truncated ? 'cursor-pointer' : undefined}
                  title={truncated ? '눌러서 전체 보기' : undefined}
                >
                  <ClampedBody onOverflowChange={overflow => setOverflow(d.id, overflow)}>
                    {renderBody(d.body)}
                  </ClampedBody>
                </div>
                <div className="flex items-center gap-1.5 mt-auto pt-2 min-w-0">
                  <ClickableAvatar member={authorMember} size={16} />
                  <span className="text-[10.5px] opacity-70 truncate">{nameOf(d.author_id)}</span>
                  <span className="text-[10.5px] opacity-50 flex-shrink-0">· {fmtRelative(d.created_at)}</span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {me && (
                    <EmojiPicker
                      onPick={emoji => toggleEmoji(d, emoji)}
                      onOpenChange={open => setOpenPickerId(open ? d.id : null)}
                    />
                  )}
                  {renderReactions(d)}
                </div>
              </div>
            )
          })}
        </div>
        <div ref={sentinelRef} className="h-1" />
        {loadingMore && <p className="text-[12px] text-[#9C9C96] text-center py-3">불러오는 중...</p>}
        {!hasMore && !loadingMore && <p className="text-[11px] text-[#B0B0AA] text-center py-3">모든 낙서를 다 봤어요</p>}
        </>
      )}

      {viewing && (() => {
        const palette = DOODLE_PALETTE[viewing.color_key % 8]
        return (
          <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-4" onClick={() => setViewingId(null)}>
            <div
              role="dialog"
              onClick={e => e.stopPropagation()}
              style={{ background: palette.bg, color: palette.fg }}
              className="relative w-full max-w-[520px] max-h-[80vh] rounded-2xl shadow-xl flex flex-col"
            >
              <div className="flex items-center gap-2 px-5 pt-4 pb-2 min-w-0">
                <ClickableAvatar member={members.find(x => x.id === viewing.author_id)} size={20} />
                <span className="text-[12.5px] font-medium opacity-80 truncate">{nameOf(viewing.author_id)}</span>
                <span className="text-[12px] opacity-50 flex-shrink-0">· {fmtRelative(viewing.created_at)}</span>
                <button
                  onClick={() => setViewingId(null)}
                  title="닫기 (Esc)"
                  className="ml-auto text-[18px] leading-none opacity-50 hover:opacity-90 px-1"
                >
                  ×
                </button>
              </div>
              <p className="px-5 py-2 text-[14.5px] leading-relaxed whitespace-pre-wrap break-words overflow-y-auto">
                {renderBody(viewing.body)}
              </p>
              <div className="flex items-center gap-1 flex-wrap px-5 pt-2 pb-4">
                {renderReactions(viewing)}
                <span className="ml-auto text-[11px] opacity-40">Esc로 닫기</span>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
