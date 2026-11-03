'use client'

// 익명채팅 투표 공통 — 투표 메시지 = anon_chat 행 중 poll_options가 있는 것(body = 질문).
// 표는 anon_poll_votes(message_id, voter_id) 1인 1표, 한 번 찍으면 바꿀 수 없다(DB도 INSERT만 허용). 누가 찍었는지는 화면에 절대 안 보인다.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type PollVote = { message_id: string; voter_id: string; option_idx: number }

export const POLL_MAX_OPTIONS = 6

export function pollOptionsOf(row: { poll_options?: unknown }): string[] | null {
  const o = row.poll_options
  return Array.isArray(o) && o.length >= 2 ? (o as unknown[]).map(String) : null
}

// 메시지별 표 목록. ids가 바뀌면 다시 받고, 실시간으로 새 표·바뀐 표를 반영한다.
export function usePollVotes(ids: string[], channelName: string) {
  const [votes, setVotes] = useState<PollVote[]>([])
  const key = [...ids].sort().join(',')

  useEffect(() => {
    // 비어 있으면 받을 게 없다(남은 표는 tally가 message_id로 걸러서 화면에 영향 없음).
    if (!key) return
    let active = true
    const supabase = createClient()
    const list = key.split(',')
    const idSet = new Set(list)
    ;(async () => {
      const { data } = await supabase
        .from('anon_poll_votes')
        .select('message_id, voter_id, option_idx')
        .in('message_id', list)
      if (active && data) setVotes(data as PollVote[])
    })()
    const upsert = (v: PollVote) => {
      if (!idSet.has(v.message_id)) return
      setVotes(prev => [...prev.filter(p => !(p.message_id === v.message_id && p.voter_id === v.voter_id)), v])
    }
    const channel = supabase
      .channel(`${channelName}-${key.length}-${list[0]}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anon_poll_votes' }, p => upsert(p.new as PollVote))
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [key, channelName])

  // 내 표는 서버 응답을 기다리지 않고 먼저 화면에 반영한다(실패하면 되돌림). 이미 찍었으면 아무것도 안 한다.
  // 다른 창에서 먼저 찍어 DB에 이미 있으면(중복 키 23505) 서버 값을 다시 받아 맞춘다.
  async function vote(messageId: string, voterId: string, optionIdx: number): Promise<boolean> {
    if (votes.some(v => v.message_id === messageId && v.voter_id === voterId)) return true
    setVotes(prev => [...prev, { message_id: messageId, voter_id: voterId, option_idx: optionIdx }])
    const supabase = createClient()
    const { error } = await supabase
      .from('anon_poll_votes')
      .insert({ message_id: messageId, voter_id: voterId, option_idx: optionIdx })
    if (!error) return true
    const { data } = await supabase
      .from('anon_poll_votes')
      .select('message_id, voter_id, option_idx')
      .eq('message_id', messageId)
    setVotes(prev => [...prev.filter(p => p.message_id !== messageId), ...((data ?? []) as PollVote[])])
    return error.code === '23505'
  }

  return { votes, vote }
}

export function tally(votes: PollVote[], messageId: string, optionCount: number) {
  const counts = Array.from({ length: optionCount }, () => 0)
  let total = 0
  for (const v of votes) {
    if (v.message_id !== messageId || v.option_idx < 0 || v.option_idx >= optionCount) continue
    counts[v.option_idx]++
    total++
  }
  return { counts, total }
}

export function myVoteOf(votes: PollVote[], messageId: string, myId: string | undefined) {
  if (!myId) return null
  return votes.find(v => v.message_id === messageId && v.voter_id === myId)?.option_idx ?? null
}
