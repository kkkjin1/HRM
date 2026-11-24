'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayNameFull } from '@/lib/members'
import { MESSAGE_PRESETS, fillPreset } from '@/lib/data'
import { shuffleArray } from '@/lib/shuffleBag'
import { toggleReaction, type Reactions } from '@/lib/reactions'
import { extractTaggedMembers, splitMentions } from '@/lib/mentions'
import EmojiPicker from '@/components/EmojiPicker'
import TagPicker from '@/components/TagPicker'
import ClickableAvatar from '@/components/ClickableAvatar'

type DayMessageRow = {
  date: string
  sender_id: string | null
  receiver_id: string | null
  message: string | null
  msg_status: 'pending' | 'written' | 'passed' | 'hidden'
  message_reactions: Reactions
  absent_ids: string[]
}

type CommentRow = {
  date: string
  author_id: string
  content: string
  created_at: string
  reactions: Reactions
}

const ALL_PRESETS = Object.values(MESSAGE_PRESETS).flat()

export default function DailyMessage() {
  const { members, loaded: membersLoaded } = useMembers()
  const { me, loaded: meLoaded } = useCurrentMember()
  const [row, setRow] = useState<DayMessageRow | null>(null)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'idle' | 'editing'>('idle')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  // 30개(칭찬형·장난형·뜬금형 각 10개)를 셔플백으로 소진 — "랜덤 추천"을 연달아 눌러도
  // 전부 한 번씩 나오기 전엔 같은 문구가 다시 나오지 않는다.
  const presetQueueRef = useRef<string[]>([])

  // 지금 화면이 보여 주는 날짜(서버 기준). 실시간 신호를 이 날짜로 거른다.
  const rowDateRef = useRef<string | null>(null)
  useEffect(() => { rowDateRef.current = row?.date ?? null }, [row?.date])

  useEffect(() => {
    let active = true
    let loadSeq = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let lastLoadAt = 0
    const supabase = createClient()

    // 오늘 행을 서버에서 다시 맞춘다(ensure_day = 오늘 행 만들기 + 발신/수신 배정, 이미 있으면 그대로 돌려줌).
    // 예전엔 첫 조회가 한 번 실패하면(네트워크·토큰 갱신 순간 등) 조용히 null → 박스가 새로고침 전까지 사라졌다.
    // 이제 실패하면 기존 화면은 그대로 두고 잠시 뒤 다시 시도한다.
    async function load(attempt = 0) {
      const seq = ++loadSeq
      lastLoadAt = Date.now()
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      const { data, error } = await supabase.rpc('ensure_day')
      if (!active || seq !== loadSeq) return
      const ensured = (Array.isArray(data) ? data[0] : data) as DayMessageRow | null
      if (error || !ensured?.date) {
        setLoaded(true)
        if (attempt < 5) retryTimer = setTimeout(() => { void load(attempt + 1) }, Math.min(2000 * 2 ** attempt, 30000))
        return
      }
      const [{ data: full, error: e1 }, { data: cmts, error: e2 }] = await Promise.all([
        supabase
          .from('day_state')
          .select('date, sender_id, receiver_id, message, msg_status, message_reactions, absent_ids')
          .eq('date', ensured.date)
          .maybeSingle(),
        supabase
          .from('message_comments')
          .select('*')
          .eq('date', ensured.date)
          .order('created_at', { ascending: true }),
      ])
      if (!active || seq !== loadSeq) return
      setRow((full as DayMessageRow) ?? { ...ensured, message_reactions: {}, absent_ids: [] })
      if (!e2) setComments((cmts as CommentRow[]) ?? [])
      setLoaded(true)
      if ((e1 || e2) && attempt < 5) retryTimer = setTimeout(() => { void load(attempt + 1) }, Math.min(2000 * 2 ** attempt, 30000))
    }

    void load()

    // 탭으로 돌아오면(자정 넘겨 켜둔 탭, 절전 후 실시간 끊김 등) 오늘 행을 다시 맞춘다. 1분에 한 번까지만.
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastLoadAt < 60_000) return
      void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    const channel = supabase
      .channel('day_state-message')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_state' }, payload => {
        // DELETE면 payload.new가 빈 객체({})라 예전엔 그대로 setRow → 발신자 없음 → 박스 사라짐.
        if (payload.eventType === 'DELETE') return
        const next = payload.new as Partial<DayMessageRow> | undefined
        if (!next?.date) return
        const cur = rowDateRef.current
        if (cur && next.date === cur) {
          // 같은 날 행: 받은 값만 덮어쓴다(빠진 칸이 있어도 기존 값 유지)
          setRow(prev => (prev ? { ...prev, ...next } as DayMessageRow : prev))
          return
        }
        // 다른 날짜 행(어제 행이 갱신됨 등)은 무시. 더 새 날짜면 하루가 바뀐 것 → ensure_day로 배정까지 맞춘다.
        // 예전엔 날짜 확인 없이 교체해서, 자정 넘긴 탭에 '발신자 배정 전' 새 날 행이 들어오면 박스가 사라졌다.
        if (!cur || next.date > cur) void load()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_comments' }, payload => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as Partial<CommentRow>
          setComments(prev => prev.filter(c => c.author_id !== old.author_id))
          return
        }
        const next = payload.new as CommentRow
        if (next.date !== rowDateRef.current) return // 다른 날짜 댓글은 섞지 않는다
        setComments(prev => [...prev.filter(c => c.author_id !== next.author_id), next])
      })
      .subscribe()

    return () => {
      active = false
      if (retryTimer) clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      supabase.removeChannel(channel)
    }
  }, [])

  // 날짜가 바뀌면(자정 넘겨 켜둔 탭 등) 댓글 입력창도 새 날짜 기준으로 비워둔다.
  useEffect(() => {
    setCommentDraft('')
  }, [row?.date])

  function nameOf(id: string | null) {
    return displayNameFull(members.find(m => m.id === id))
  }

  async function updateRow(patch: Partial<DayMessageRow>) {
    if (!row || busy) return
    setBusy(true)
    const supabase = createClient()
    await supabase.from('day_state').update(patch).eq('date', row.date)
    setRow(prev => (prev ? { ...prev, ...patch } : prev))
    setBusy(false)
  }

  function pickRandomPreset() {
    if (presetQueueRef.current.length === 0) {
      presetQueueRef.current = shuffleArray(ALL_PRESETS)
    }
    const template = presetQueueRef.current.pop()!
    setDraft(fillPreset(template, nameOf(row?.receiver_id ?? null)))
    setMode('editing')
  }

  function startWrite() {
    setDraft('')
    setMode('editing')
  }

  async function sendMessage() {
    if (!draft.trim()) return
    const body = draft.trim()
    await updateRow({ message: body, msg_status: 'written' })
    setMode('idle')

    if (me) {
      const tagged = extractTaggedMembers(body, members).filter(m => m.id !== me.id)
      if (tagged.length > 0) {
        const supabase = createClient()
        await Promise.all(tagged.map(m => supabase.from('notifications').insert({
          member_id: m.id,
          kind: 'message_tag',
          body: `${displayNameFull(me)}님이 오늘의 한마디에서 나를 태그했어요`,
          meta: { section: 'life' },
        })))
      }
    }
  }

  function insertTag(name: string) {
    setDraft(prev => (prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? `${prev} @${name} ` : `${prev}@${name} `))
  }

  async function passToday() {
    await updateRow({ msg_status: 'passed' })
  }

  async function hideCard() {
    await updateRow({ msg_status: 'hidden' })
  }

  async function toggleEmoji(emoji: string) {
    if (!row || !me) return
    const wasAdded = !(row.message_reactions?.[emoji] ?? []).includes(me.id)
    const next = toggleReaction(row.message_reactions ?? {}, emoji, me.id)
    await updateRow({ message_reactions: next })
    if (wasAdded && row.sender_id && row.sender_id !== me.id) {
      const supabase = createClient()
      await supabase.from('notifications').insert({
        member_id: row.sender_id,
        kind: 'message_reaction',
        body: `${displayNameFull(me)}님이 내가 쓴 오늘의 한마디에 ${emoji} 반응을 남겼어요`,
        meta: { section: 'life' },
      })
    }
  }

  async function submitComment(content: string) {
    if (!row || !me || !content.trim() || busy) return
    setBusy(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('message_comments')
      .upsert({ date: row.date, author_id: me.id, content: content.trim() })
      .select()
      .single()
    if (data) {
      const c = data as CommentRow
      setComments(prev => [...prev.filter(x => x.author_id !== c.author_id), c])
      setCommentDraft('') // 저장 후엔 방금 쓴 내용을 그대로 남겨두지 않고 비운다
    }
    setBusy(false)
  }

  async function deleteComment(c: CommentRow) {
    setComments(prev => prev.filter(x => x.author_id !== c.author_id))
    const supabase = createClient()
    await supabase.from('message_comments').delete().eq('date', c.date).eq('author_id', c.author_id)
  }

  async function toggleCommentReaction(c: CommentRow, emoji: string) {
    if (!me) return
    const next = toggleReaction(c.reactions ?? {}, emoji, me.id)
    setComments(prev => prev.map(x => (x.author_id === c.author_id ? { ...x, reactions: next } : x)))
    const supabase = createClient()
    await supabase.from('message_comments').update({ reactions: next }).eq('date', c.date).eq('author_id', c.author_id)
  }

  if (!loaded || !membersLoaded || !meLoaded) return null
  if (!row || !row.sender_id || !row.receiver_id) return null // 멤버 2명 미만
  if (row.msg_status === 'passed' || row.msg_status === 'hidden') return null
  // 발신자가 오늘 연차면 카드를 표시하지 않음
  if ((row.absent_ids ?? []).includes(row.sender_id)) return null

  const isSender = me?.id === row.sender_id
  const isReceiver = me?.id === row.receiver_id
  const senderName = nameOf(row.sender_id)
  const receiverName = nameOf(row.receiver_id)
  const senderMember = members.find(m => m.id === row.sender_id)
  const receiverComment = comments.find(c => c.author_id === row.receiver_id)
  const otherComments = comments.filter(c => c.author_id !== row.receiver_id)
  const myComment = me ? comments.find(c => c.author_id === me.id) : undefined
  const activeEmojis = Object.keys(row.message_reactions ?? {}).filter(e => (row.message_reactions?.[e]?.length ?? 0) > 0)

  function commentReactionRow(c: CommentRow) {
    const active = Object.keys(c.reactions ?? {}).filter(e => (c.reactions?.[e]?.length ?? 0) > 0)
    return (
      <div className="flex items-center gap-1 mt-1 flex-wrap">
        {me && <EmojiPicker onPick={emoji => toggleCommentReaction(c, emoji)} />}
        {active.map(emoji => {
          const reactedBy = c.reactions?.[emoji] ?? []
          const mine = !!me && reactedBy.includes(me.id)
          return (
            <button
              key={emoji}
              onClick={() => toggleCommentReaction(c, emoji)}
              disabled={!me}
              title={reactedBy.map(id => nameOf(id)).join(', ')}
              className={`text-[10.5px] rounded-full px-1.5 py-0.5 border transition-colors ${
                mine ? 'bg-[#EEEDFE] border-[#5B54C4] text-[#5B54C4]' : 'border-[#E8E8E4] text-[#9C9C96] hover:bg-[#F7F7F5]'
              }`}
            >
              {emoji} {reactedBy.length}
            </button>
          )
        })}
      </div>
    )
  }

  const receiverMember = members.find(m => m.id === row.receiver_id)
  const written = row.msg_status === 'written'

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 w-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[14px] font-semibold text-[#1F1F1D]">💬 오늘의 한마디</p>
        {written && isReceiver && (
          <button onClick={hideCard} className="text-[11.5px] text-[#9C9C96] hover:text-red-500">내리기</button>
        )}
      </div>

      {/* 남길 사람 → 받을 사람 — 상태와 무관하게 항상 맨 위에 */}
      <div className="flex items-center justify-center gap-3 mb-3">
        <div className="flex flex-col items-center gap-1 min-w-0">
          <ClickableAvatar member={senderMember} size={40} />
          <span className="text-[12px] font-medium text-[#1F1F1D] truncate max-w-[110px]">{senderName}</span>
        </div>
        <span className="text-[20px] text-[#C4C1F5] pb-4" aria-hidden>→</span>
        <div className="flex flex-col items-center gap-1 min-w-0">
          <ClickableAvatar member={receiverMember} size={40} />
          <span className="text-[12px] font-medium text-[#1F1F1D] truncate max-w-[110px]">{receiverName}</span>
        </div>
      </div>

      {/* 한마디 칸 — 아직 안 남겼으면 점선으로 자리만 보여준다 */}
      <div className={`rounded-xl px-3.5 py-3 mb-3 ${written ? 'bg-[#F7F6FE]' : 'border border-dashed border-[#E0DEF7] bg-[#FAFAFE]'}`}>
        {row.msg_status === 'pending' && isSender && mode === 'idle' && (
          <div>
            <p className="text-[13px] text-[#1F1F1D] mb-2.5">{receiverName}님에게 한마디를 남겨보세요.</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={pickRandomPreset} className="text-[12.5px] text-[#5B54C4] bg-[#EEEDFE] hover:bg-[#E4E2FB] rounded-lg px-2.5 py-1.5">랜덤 추천</button>
              <button onClick={startWrite} className="text-[12.5px] text-[#1F1F1D] bg-white border border-[#E8E8E4] hover:bg-[#F7F7F5] rounded-lg px-2.5 py-1.5">직접 쓰기</button>
              <button onClick={passToday} disabled={busy} className="text-[12.5px] text-[#9C9C96] hover:text-[#6B6B66] rounded-lg px-2 py-1.5">오늘은 패스</button>
            </div>
          </div>
        )}

        {row.msg_status === 'pending' && isSender && mode === 'editing' && (
          <div>
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={3}
              placeholder={`${receiverName}님에게 남길 한마디...`}
              className="w-full text-[13.5px] border border-[#E8E8E4] rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-[#5B54C4] resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <TagPicker members={members} onPick={insertTag} />
              <div className="flex gap-2">
                <button onClick={() => setMode('idle')} className="text-[13px] text-[#6B6B66] px-3 py-1.5">취소</button>
                <button
                  onClick={sendMessage}
                  disabled={busy || !draft.trim()}
                  className="text-[13px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-40 rounded-lg px-3.5 py-1.5"
                >
                  보내기
                </button>
              </div>
            </div>
          </div>
        )}

        {row.msg_status === 'pending' && !isSender && (
          <p className="text-[13px] text-[#B0AEC9] text-center py-2">{senderName}님의 한마디를 기다리는 중이에요</p>
        )}

        {written && (
          <div>
            <p className="text-[14.5px] text-[#1F1F1D] leading-relaxed whitespace-pre-wrap break-words">
              {splitMentions(row.message ?? '', members).map((part, i) =>
                part.type === 'mention'
                  ? <span key={i} className="font-semibold text-[#5B54C4]">{part.content}</span>
                  : <span key={i}>{part.content}</span>
              )}
            </p>
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              {me && <EmojiPicker onPick={toggleEmoji} />}
              {activeEmojis.map(emoji => {
                const reactedBy = row.message_reactions?.[emoji] ?? []
                const mine = !!me && reactedBy.includes(me.id)
                return (
                  <button
                    key={emoji}
                    onClick={() => toggleEmoji(emoji)}
                    disabled={!me}
                    title={reactedBy.map(id => nameOf(id)).join(', ')}
                    className={`text-[12px] rounded-full px-2 py-1 border transition-colors ${
                      mine ? 'bg-[#EEEDFE] border-[#5B54C4] text-[#5B54C4]' : 'bg-white border-[#E8E8E4] text-[#6B6B66] hover:bg-[#F7F7F5]'
                    }`}
                  >
                    {emoji} {reactedBy.length}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 댓글 칸 — 한마디가 올라오기 전엔 흐리게 미리 보여만 준다 */}
      <div className={`space-y-2 ${written ? '' : 'opacity-40 pointer-events-none select-none'}`} aria-disabled={!written}>
        {written && receiverComment && (
          <div className="flex items-start gap-2 bg-[#F7F6FE] rounded-lg px-3 py-2">
            <span className="text-[10px] font-semibold text-[#5B54C4] bg-white rounded-full px-1.5 py-0.5 flex-shrink-0 mt-0.5">받은 사람</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[#1F1F1D] leading-relaxed whitespace-pre-wrap break-words">{receiverComment.content}</p>
              {commentReactionRow(receiverComment)}
            </div>
            {me?.id === receiverComment.author_id && (
              <button onClick={() => deleteComment(receiverComment)} className="text-[11px] text-[#C4C4BC] hover:text-red-500 flex-shrink-0">✕</button>
            )}
          </div>
        )}

        {written && otherComments.map(c => (
          <div key={c.author_id} className="flex items-start gap-2 text-[12.5px]">
            <span className="text-[11px] text-[#9C9C96] flex-shrink-0 mt-0.5 w-[42px] truncate">{nameOf(c.author_id)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[#3A3A36] leading-relaxed whitespace-pre-wrap break-words">{c.content}</p>
              {commentReactionRow(c)}
            </div>
            {me?.id === c.author_id && (
              <button onClick={() => deleteComment(c)} className="text-[11px] text-[#C4C4BC] hover:text-red-500 flex-shrink-0">✕</button>
            )}
          </div>
        ))}

        {me && (
          <form
            onSubmit={e => {
              e.preventDefault()
              if (written) submitComment(commentDraft)
            }}
            className="flex gap-1.5"
          >
            <input
              value={commentDraft}
              onChange={e => setCommentDraft(e.target.value)}
              disabled={!written}
              tabIndex={written ? undefined : -1}
              placeholder={!written ? '한마디가 올라오면 댓글을 남길 수 있어요' : isReceiver ? '이 한마디에 댓글 남기기' : '나도 한마디 보태기'}
              className="flex-1 min-w-0 text-[12.5px] border border-[#E8E8E4] rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-[#5B54C4]"
            />
            <button type="submit" disabled={!written || busy || !commentDraft.trim()} className="text-[12.5px] font-medium text-[#5B54C4] disabled:opacity-40 px-2 flex-shrink-0">
              {myComment ? '수정' : '남기기'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
