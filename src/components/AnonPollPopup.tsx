'use client'

// 익명 투표 팝업 — SOS 팝업과 같은 방식. 누군가 익명채팅에 투표를 올리면 모든 팀원에게 뜬다.
// - 페이지에 들어올 때마다 오늘 투표 중 "아직 안 찍은 것"을 띄운다(찍은 건 DB 기준이라 다른 기기에서도 다시 안 뜸).
//   켜 둔 채로 있을 때 새로 올라온 투표도 바로 띄운다. 내가 올린 투표는 자동으로 띄우지 않는다.
// - 팝업에서는 선택지를 몇 번이든 바꿔 누를 수 있고 다른 사람 결과는 안 보인다. "확인"을 눌러야 저장되고 그 뒤로는 못 바꾼다.
// - "나중에"는 없다 — 투표해야 닫힌다(투표가 여러 개면 하나씩 차례로). 익명채팅의 "투표하기"로도 열 수 있다.
// - 투표 후 익명채팅창에서는 결과 보기만 된다.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { usePollVotes, pollOptionsOf, myVoteOf } from '@/lib/anonPoll'
import AnonPollCard from '@/components/AnonPollCard'

type PollRow = { id: string; chat_date: string; author_id: string; body: string; created_at: string; poll_options?: string[] | null }

// 익명채팅의 "투표하기" 버튼이 이 이벤트로 팝업을 연다.
export const OPEN_POLL_EVENT = 'hrm:open-anon-poll'
export function openAnonPoll(row: PollRow) {
  window.dispatchEvent(new CustomEvent<PollRow>(OPEN_POLL_EVENT, { detail: row }))
}

export default function AnonPollPopup() {
  const { me, loaded } = useCurrentMember()
  const [queue, setQueue] = useState<PollRow[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const { votes, vote } = usePollVotes(queue.map(q => q.id), 'anon-poll-popup-votes')
  // 팝업이 떠 있는 동안 다른 창에서 이미 찍은 투표는 건너뛴다.
  const pending = queue.filter(q => myVoteOf(votes, q.id, me?.id) === null)
  const current = pending[0] ?? null

  useEffect(() => {
    if (!loaded || !me) return
    let active = true
    const myId = me.id
    const supabase = createClient()
    const add = (rows: PollRow[], front = false) => {
      const fresh = rows.filter(r => pollOptionsOf(r))
      if (fresh.length === 0) return
      setQueue(prev => {
        if (front) return [...fresh, ...prev.filter(p => !fresh.some(r => r.id === p.id))]
        return [...prev, ...fresh.filter(r => !prev.some(p => p.id === r.id))]
      })
    }

    ;(async () => {
      const { data: today } = await supabase.rpc('today_date')
      if (!active || !today) return
      const { data } = await supabase
        .from('anon_chat')
        .select('*')
        .eq('chat_date', today as string)
        .not('poll_options', 'is', null)
        .order('created_at', { ascending: true })
      const rows = ((data ?? []) as PollRow[]).filter(r => r.author_id !== myId)
      if (rows.length === 0) return
      const { data: mine } = await supabase
        .from('anon_poll_votes')
        .select('message_id')
        .eq('voter_id', myId)
        .in('message_id', rows.map(r => r.id))
      const voted = new Set(((mine ?? []) as { message_id: string }[]).map(v => v.message_id))
      if (active) add(rows.filter(r => !voted.has(r.id)))
    })()

    const channel = supabase
      .channel(`anon-poll-popup-${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anon_chat' }, payload => {
        const row = payload.new as PollRow
        if (row.author_id !== myId) add([row])
      })
      .subscribe()
    const onOpen = (e: Event) => add([(e as CustomEvent<PollRow>).detail], true)
    window.addEventListener(OPEN_POLL_EVENT, onOpen)
    return () => { active = false; supabase.removeChannel(channel); window.removeEventListener(OPEN_POLL_EVENT, onOpen) }
  }, [loaded, me])

  if (!current) return null
  const opts = pollOptionsOf(current)
  if (!opts) return null
  const cur = current

  function done() {
    setQueue(prev => prev.filter(p => p.id !== cur.id))
    setPicked(null)
  }

  async function confirmVote() {
    if (!me || picked === null || busy) return
    setBusy(true)
    const ok = await vote(cur.id, me.id, picked)
    setBusy(false)
    if (!ok) { alert('투표하지 못했습니다. 잠시 후 다시 시도해주세요.'); return }
    done()
  }

  return (
    <AnonPollDialog
      question={cur.body} options={opts} picked={picked} onPick={setPicked}
      queueLen={pending.length} onConfirm={() => { void confirmVote() }} busy={busy || !me}
    />
  )
}

// 팝업 화면 자체 — 실제 팝업과 익명채팅의 "미리보기"가 같은 화면을 쓴다.
// onClose는 미리보기에서만 넘긴다(실제 팝업은 투표해야만 닫힘).
export function AnonPollDialog({ question, options, picked, onPick, queueLen = 1, onConfirm, onClose, busy, preview }: {
  question: string; options: string[]; picked: number | null; onPick: (idx: number) => void
  queueLen?: number; onConfirm: () => void; onClose?: () => void; busy?: boolean; preview?: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-[79] flex items-center justify-center px-4">
      <div role="alertdialog" aria-labelledby="poll-title" className="bg-white rounded-2xl border-2 border-[#B7D0EA] shadow-2xl w-full max-w-[420px] p-5">
        {preview && <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mb-3">미리보기 — 팀원들에게 이렇게 보여요. 여기서 누른 건 저장되지 않아요.</p>}
        <div className="flex items-center justify-between mb-1">
          <p id="poll-title" className="text-[16px] font-bold text-[#2F6FB0]">📊 익명 투표</p>
          {queueLen > 1 && <span className="text-[11.5px] text-[#9C9C96]">남은 투표 {queueLen}개</span>}
        </div>
        <p className="text-[12.5px] text-[#7A8491] mb-4">익명채팅에 투표가 올라왔어요. 누가 무엇을 골랐는지는 아무에게도 보이지 않아요.</p>
        <div className="max-h-[55vh] overflow-y-auto mb-4">
          <AnonPollCard size="lg" mode="select" question={question} options={options} picked={picked} onPick={onPick} disabled={busy} />
        </div>
        <div className="flex justify-end gap-2">
          {onClose && <button onClick={onClose} className="text-[13px] text-[#6B6B66] border border-[#E8E8E4] hover:bg-[#F7F7F5] rounded-lg px-4 py-2">닫기</button>}
          <button
            onClick={onConfirm}
            disabled={busy || picked === null}
            className="text-[13px] font-medium text-white bg-[#2F6FB0] hover:bg-[#255A91] disabled:opacity-40 rounded-lg px-4 py-2"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
