'use client'

import { useEffect, useRef, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayNameFull } from '@/lib/members'
import ClickableAvatar from '@/components/ClickableAvatar'

type HelpRequest = {
  id: string
  request_date: string
  member_id: string
  message: string
  status: 'open' | 'resolved'
  resolved_at: string | null
  created_at: string
}

type HelperRow = { id: string; request_id: string; member_id: string; created_at: string }
type CommentRow = { id: string; request_id: string; author_id: string; content: string; created_at: string }

function fmtDateLabel(dateStr: string, todayStr: string) {
  if (dateStr === todayStr) return '오늘'
  return format(parseISO(dateStr), 'M.d (E)', { locale: ko })
}

export default function HelpRequestPanel() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me } = useCurrentMember()
  const [today, setToday] = useState<string | null>(null)
  const [viewDate, setViewDate] = useState<string | null>(null)
  const [requests, setRequests] = useState<HelpRequest[]>([])
  const [helpers, setHelpers] = useState<HelperRow[]>([])
  const [comments, setComments] = useState<CommentRow[]>([])
  const [openComments, setOpenComments] = useState<Set<string>>(new Set())
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const viewDateRef = useRef<string | null>(null)
  const requestIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => { viewDateRef.current = viewDate }, [viewDate])
  useEffect(() => { requestIdsRef.current = new Set(requests.map(r => r.id)) }, [requests])

  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase.rpc('today_date').then(({ data }) => {
      if (!active) return
      const d = data as string
      setToday(d)
      setViewDate(d)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!viewDate) return
    let active = true
    const supabase = createClient()

    ;(async () => {
      setLoaded(false)
      const { data: reqs } = await supabase
        .from('help_requests')
        .select('*')
        .eq('request_date', viewDate)
        .order('created_at', { ascending: true })
      const list = (reqs as HelpRequest[]) ?? []
      if (!active) return
      setRequests(list)

      const ids = list.map(r => r.id)
      if (ids.length === 0) {
        setHelpers([])
        setComments([])
        setLoaded(true)
        return
      }
      const [{ data: h }, { data: c }] = await Promise.all([
        supabase.from('help_helpers').select('*').in('request_id', ids),
        supabase.from('help_comments').select('*').in('request_id', ids).order('created_at', { ascending: true }),
      ])
      if (active) {
        setHelpers((h as HelperRow[]) ?? [])
        setComments((c as CommentRow[]) ?? [])
        setLoaded(true)
      }
    })()

    return () => { active = false }
  }, [viewDate])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('fun-help-requests')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'help_requests' }, payload => {
        const row = payload.new as HelpRequest
        if (row.request_date !== viewDateRef.current) return
        setRequests(prev => (prev.some(r => r.id === row.id) ? prev : [...prev, row]))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'help_requests' }, payload => {
        const row = payload.new as HelpRequest
        setRequests(prev => prev.map(r => (r.id === row.id ? row : r)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'help_requests' }, payload => {
        const old = payload.old as { id: string }
        setRequests(prev => prev.filter(r => r.id !== old.id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'help_helpers' }, payload => {
        const row = payload.new as HelperRow
        if (!requestIdsRef.current.has(row.request_id)) return
        setHelpers(prev => (prev.some(h => h.id === row.id) ? prev : [...prev, row]))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'help_helpers' }, payload => {
        const old = payload.old as { id: string }
        setHelpers(prev => prev.filter(h => h.id !== old.id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'help_comments' }, payload => {
        const row = payload.new as CommentRow
        if (!requestIdsRef.current.has(row.request_id)) return
        setComments(prev => (prev.some(c => c.id === row.id) ? prev : [...prev, row]))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'help_comments' }, payload => {
        const old = payload.old as { id: string }
        setComments(prev => prev.filter(c => c.id !== old.id))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function nameOf(id: string | null) {
    return displayNameFull(members.find(m => m.id === id)) || '알 수 없음'
  }

  function shiftDay(delta: number) {
    if (!viewDate) return
    setViewDate(format(addDays(parseISO(viewDate), delta), 'yyyy-MM-dd'))
  }

  function toggleComments(id: string) {
    setOpenComments(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submitRequest() {
    if (!draft.trim() || !me || busy || viewDate !== today) return
    setBusy(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('help_requests')
      .insert({ request_date: viewDate, member_id: me.id, message: draft.trim() })
      .select()
      .single()
    if (data) setRequests(prev => [...prev, data as HelpRequest])
    setDraft('')
    setComposing(false)
    setBusy(false)
  }

  async function joinHelp(r: HelpRequest) {
    if (!me || r.member_id === me.id) return
    if (helpers.some(h => h.request_id === r.id && h.member_id === me.id)) return
    const supabase = createClient()
    const { data } = await supabase.from('help_helpers').insert({ request_id: r.id, member_id: me.id }).select().single()
    if (data) setHelpers(prev => [...prev, data as HelperRow])
    await supabase.from('notifications').insert({
      member_id: r.member_id,
      kind: 'help_joined',
      body: `${displayNameFull(me)}님이 도와주러 왔어요`,
      meta: { section: 'work' },
    })
  }

  async function leaveHelp(r: HelpRequest) {
    if (!me) return
    const mine = helpers.find(h => h.request_id === r.id && h.member_id === me.id)
    if (!mine) return
    setHelpers(prev => prev.filter(h => h.id !== mine.id))
    const supabase = createClient()
    await supabase.from('help_helpers').delete().eq('id', mine.id)
  }

  async function resolve(r: HelpRequest) {
    if (!me || me.id !== r.member_id) return
    const supabase = createClient()
    const resolvedAt = new Date().toISOString()
    await supabase.from('help_requests').update({ status: 'resolved', resolved_at: resolvedAt }).eq('id', r.id)
    setRequests(prev => prev.map(x => (x.id === r.id ? { ...x, status: 'resolved', resolved_at: resolvedAt } : x)))
  }

  async function cancel(r: HelpRequest) {
    if (!me || me.id !== r.member_id || r.status === 'resolved') return
    setRequests(prev => prev.filter(x => x.id !== r.id))
    const supabase = createClient()
    await supabase.from('help_requests').delete().eq('id', r.id)
  }

  async function submitComment(r: HelpRequest) {
    const content = (commentDrafts[r.id] ?? '').trim()
    if (!content || !me) return
    const supabase = createClient()
    const { data } = await supabase.from('help_comments').insert({ request_id: r.id, author_id: me.id, content }).select().single()
    if (data) setComments(prev => [...prev, data as CommentRow])
    setCommentDrafts(prev => ({ ...prev, [r.id]: '' }))
    if (r.member_id !== me.id) {
      await supabase.from('notifications').insert({
        member_id: r.member_id,
        kind: 'help_comment',
        body: `${displayNameFull(me)}님이 구조요청에 댓글을 남겼어요`,
        meta: { section: 'work' },
      })
    }
  }

  async function deleteComment(c: CommentRow) {
    setComments(prev => prev.filter(x => x.id !== c.id))
    const supabase = createClient()
    await supabase.from('help_comments').delete().eq('id', c.id)
  }

  const isToday = viewDate === today

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-[#9C9C96]">🆘 구조요청</p>
        <div className="flex items-center gap-1.5">
          <button onClick={() => shiftDay(-1)} className="text-[12px] text-[#9C9C96] hover:text-[#5B54C4] px-1.5 py-0.5">◀</button>
          <span className="text-[12.5px] font-medium text-[#1F1F1D] w-[86px] text-center">
            {viewDate && today ? fmtDateLabel(viewDate, today) : '...'}
          </span>
          <button onClick={() => shiftDay(1)} disabled={isToday} className="text-[12px] text-[#9C9C96] hover:text-[#5B54C4] disabled:opacity-30 px-1.5 py-0.5">▶</button>
        </div>
      </div>

      {isToday && !composing && (
        <button
          onClick={() => setComposing(true)}
          className="text-[12.5px] font-medium text-white bg-[#E0524B] hover:bg-[#C7413B] rounded-lg px-3 py-2 mb-3 self-start"
        >
          🆘 살려주세요
        </button>
      )}

      {isToday && composing && (
        <div className="mb-3 bg-[#F7F7F5] rounded-xl p-3">
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={2}
            placeholder="어떤 게 막혔는지 짧게 남겨보세요..."
            className="w-full text-[13px] border border-[#E8E8E4] rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#5B54C4] resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setComposing(false); setDraft('') }} className="text-[12px] text-[#6B6B66] px-3 py-1.5">취소</button>
            <button
              onClick={submitRequest}
              disabled={busy || !draft.trim() || !me}
              className="text-[12px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-40 rounded-lg px-3 py-1.5"
            >
              요청하기
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto">
        {!loaded || !membersLoaded ? (
          <p className="text-[12.5px] text-[#9C9C96]">불러오는 중...</p>
        ) : requests.length === 0 ? (
          <p className="text-[12.5px] text-[#9C9C96] py-4 text-center">이 날은 구조요청이 없었어요.</p>
        ) : (
          requests.map(r => {
            const requester = members.find(m => m.id === r.member_id)
            const reqHelpers = helpers.filter(h => h.request_id === r.id)
            const reqComments = comments.filter(c => c.request_id === r.id)
            const iAmHelper = !!me && reqHelpers.some(h => h.member_id === me.id)
            const canResolve = !!me && r.status === 'open' && me.id === r.member_id
            const commentsOpen = openComments.has(r.id)
            return (
              <div key={r.id} className="bg-[#F9FAFB] rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <ClickableAvatar member={requester} size={22} />
                  <span className="text-[11.5px] text-[#6B6B66]">{nameOf(r.member_id)}</span>
                  <span className={`text-[10.5px] font-medium rounded-full px-2 py-0.5 ml-auto flex-shrink-0 ${
                    r.status === 'resolved' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {r.status === 'resolved' ? '✅ 해결됨' : '🆘 도움 필요'}
                  </span>
                </div>
                <p className="text-[13px] text-[#1F1F1D] leading-relaxed whitespace-pre-wrap mt-1.5">{r.message}</p>

                {reqHelpers.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[11px] text-[#9C9C96] mr-0.5">도와주는 사람</span>
                    {reqHelpers.map(h => {
                      const m = members.find(x => x.id === h.member_id)
                      return <ClickableAvatar key={h.id} member={m} size={18} />
                    })}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {r.status === 'open' && me && me.id !== r.member_id && !iAmHelper && (
                    <button onClick={() => joinHelp(r)} className="text-[11.5px] font-medium text-[#5B54C4] hover:underline">나도 도와줄게</button>
                  )}
                  {r.status === 'open' && iAmHelper && (
                    <button onClick={() => leaveHelp(r)} className="text-[11.5px] text-[#9C9C96] hover:text-red-500">도움 취소</button>
                  )}
                  {r.status === 'open' && me && me.id === r.member_id && (
                    <button onClick={() => cancel(r)} className="text-[11.5px] text-[#9C9C96] hover:text-red-500">요청 취소</button>
                  )}
                  {canResolve && (
                    <button onClick={() => resolve(r)} className="text-[11.5px] font-medium text-emerald-600 hover:underline">해결완료 ✅</button>
                  )}
                  <button onClick={() => toggleComments(r.id)} className="text-[11.5px] text-[#9C9C96] hover:text-[#5B54C4] ml-auto">
                    💬 {reqComments.length > 0 ? reqComments.length : '댓글'}
                  </button>
                </div>

                {commentsOpen && (
                  <div className="mt-2 pt-2 border-t border-[#E8E8E4] space-y-1.5">
                    {reqComments.map(c => (
                      <div key={c.id} className="flex items-start gap-1.5 text-[12px] group">
                        <span className="text-[10.5px] text-[#9C9C96] flex-shrink-0 mt-0.5 w-[42px] truncate">{nameOf(c.author_id)}</span>
                        <p className="flex-1 text-[#3A3A36] leading-relaxed whitespace-pre-wrap">{c.content}</p>
                        {me?.id === c.author_id && (
                          <button onClick={() => deleteComment(c)} className="text-[10.5px] text-[#C4C4BC] hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
                        )}
                      </div>
                    ))}
                    {me && (
                      <form onSubmit={e => { e.preventDefault(); submitComment(r) }} className="flex gap-1.5 pt-0.5">
                        <input
                          value={commentDrafts[r.id] ?? ''}
                          onChange={e => setCommentDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="댓글 남기기"
                          className="flex-1 text-[11.5px] border border-[#E8E8E4] rounded-md px-2 py-1 focus:outline-none focus:border-[#5B54C4]"
                        />
                        <button type="submit" disabled={!(commentDrafts[r.id] ?? '').trim()} className="text-[11.5px] font-medium text-[#5B54C4] disabled:opacity-40 px-1.5 flex-shrink-0">등록</button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
