'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayName } from '@/lib/members'
import { MESSAGE_PRESETS, fillPreset } from '@/lib/data'
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

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data } = await supabase.rpc('ensure_day')
      const ensured = Array.isArray(data) ? data[0] : data
      if (!ensured) { if (active) setLoaded(true); return }
      const [{ data: full }, { data: cmts }] = await Promise.all([
        supabase
          .from('day_state')
          .select('date, sender_id, receiver_id, message, msg_status, message_reactions')
          .eq('date', ensured.date)
          .maybeSingle(),
        supabase
          .from('message_comments')
          .select('*')
          .eq('date', ensured.date)
          .order('created_at', { ascending: true }),
      ])
      if (active) {
        setRow((full as DayMessageRow) ?? { ...ensured, message_reactions: {} })
        setComments((cmts as CommentRow[]) ?? [])
        setLoaded(true)
      }
    })()

    const channel = supabase
      .channel('day_state-message')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_state' }, payload => {
        const next = payload.new as DayMessageRow | undefined
        if (next) setRow(next)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_comments' }, payload => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as Partial<CommentRow>
          setComments(prev => prev.filter(c => c.author_id !== old.author_id))
          return
        }
        const next = payload.new as CommentRow
        setComments(prev => [...prev.filter(c => c.author_id !== next.author_id), next])
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  function nameOf(id: string | null) {
    return displayName(members.find(m => m.id === id))
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
    const template = ALL_PRESETS[Math.floor(Math.random() * ALL_PRESETS.length)]
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
          body: `${displayName(me)}님이 오늘의 한마디에서 나를 태그했어요`,
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
        body: `${displayName(me)}님이 내가 쓴 오늘의 한마디에 ${emoji} 반응을 남겼어요`,
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

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 w-full">
      <p className="text-[12px] text-[#9C9C96] mb-3">오늘의 한마디</p>

      {row.msg_status === 'pending' && isSender && mode === 'idle' && (
        <div>
          <p className="text-[14px] text-[#1F1F1D] mb-3">{receiverName}님에게 한마디를 남겨보세요.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={pickRandomPreset} className="text-[13px] text-[#5B54C4] bg-[#EEEDFE] hover:bg-[#E4E2FB] rounded-lg px-3 py-2">랜덤 추천</button>
            <button onClick={startWrite} className="text-[13px] text-[#1F1F1D] border border-[#E8E8E4] hover:bg-[#F7F7F5] rounded-lg px-3 py-2">직접 쓰기</button>
            <button onClick={passToday} disabled={busy} className="text-[13px] text-[#9C9C96] hover:text-[#6B6B66] rounded-lg px-3 py-2">오늘은 패스</button>
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
            className="w-full text-[13.5px] border border-[#E8E8E4] rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#5B54C4] resize-none"
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
        <p className="text-[14px] text-[#6B6B66]">
          <span className="text-[#1F1F1D] font-medium">{senderName}</span>님이{' '}
          <span className="text-[#1F1F1D] font-medium">{receiverName}</span>님에게 한마디를 남길 예정이에요.
        </p>
      )}

      {row.msg_status === 'written' && (
        <div>
          <div className="flex items-start gap-3">
            <ClickableAvatar member={senderMember} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[#9C9C96] mb-1">{senderName} → {receiverName}</p>
              <p className="text-[14.5px] text-[#1F1F1D] leading-relaxed whitespace-pre-wrap">
                {splitMentions(row.message ?? '', members).map((part, i) =>
                  part.type === 'mention'
                    ? <span key={i} className="font-semibold text-[#5B54C4]">{part.content}</span>
                    : <span key={i}>{part.content}</span>
                )}
              </p>
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
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
                        mine ? 'bg-[#EEEDFE] border-[#5B54C4] text-[#5B54C4]' : 'border-[#E8E8E4] text-[#6B6B66] hover:bg-[#F7F7F5]'
                      }`}
                    >
                      {emoji} {reactedBy.length}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3.5 pt-3 border-t border-[#F0F0EC] space-y-2">
                {receiverComment && (
                  <div className="flex items-start gap-2 bg-[#F7F6FE] rounded-lg px-3 py-2">
                    <span className="text-[10px] font-semibold text-[#5B54C4] bg-white rounded-full px-1.5 py-0.5 flex-shrink-0 mt-0.5">받은 사람</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#1F1F1D] leading-relaxed whitespace-pre-wrap">{receiverComment.content}</p>
                      {commentReactionRow(receiverComment)}
                    </div>
                    {me?.id === receiverComment.author_id && (
                      <button onClick={() => deleteComment(receiverComment)} className="text-[11px] text-[#C4C4BC] hover:text-red-500 flex-shrink-0">✕</button>
                    )}
                  </div>
                )}

                {otherComments.map(c => (
                  <div key={c.author_id} className="flex items-start gap-2 text-[12.5px]">
                    <span className="text-[11px] text-[#9C9C96] flex-shrink-0 mt-0.5 w-[42px] truncate">{nameOf(c.author_id)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#3A3A36] leading-relaxed whitespace-pre-wrap">{c.content}</p>
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
                      const input = e.currentTarget.elements.namedItem('comment') as HTMLInputElement
                      submitComment(input.value)
                    }}
                    className="flex gap-1.5 pt-0.5"
                  >
                    <input
                      name="comment"
                      key={`comment-${row.date}-${myComment?.content ?? ''}`}
                      defaultValue={myComment?.content ?? ''}
                      placeholder={isReceiver ? '이 한마디에 댓글 남기기' : '나도 한마디 보태기'}
                      className="flex-1 text-[12.5px] border border-[#E8E8E4] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#5B54C4]"
                    />
                    <button type="submit" disabled={busy} className="text-[12.5px] font-medium text-[#5B54C4] disabled:opacity-40 px-2 flex-shrink-0">
                      {myComment ? '수정' : '남기기'}
                    </button>
                  </form>
                )}
              </div>
            </div>
            {isReceiver && (
              <button onClick={hideCard} className="text-[11.5px] text-[#9C9C96] hover:text-red-500 flex-shrink-0">내리기</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
