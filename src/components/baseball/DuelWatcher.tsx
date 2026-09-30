'use client'

// ⚾ 위젯을 닫아둔 상태에서도 내 대결 신청·토너먼트 경기 시작을 놓치지 않게 — 화면 오른쪽 아래 작은 알림.
// [입장]을 누르면 위젯이 열리고, 위젯이 진행 중인 내 대결로 자동 이동한다(신청은 목록 맨 위에 뜬다).
// 대시보드에 항상 떠 있으므로 토너먼트 진행(다음 경기 배정·우승 판정)도 여기서 같이 돌린다 — 모두 위젯을 닫아도 진행되게.

import { useEffect, useMemo, useState } from 'react'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useDuels, useTournamentDirector, useTournaments } from '@/lib/useBaseball'
import { displayName } from '@/lib/members'
import { isFreshDuel } from '@/lib/baseballDuel'

export default function DuelWatcher({ widgetOpen, onOpen }: { widgetOpen: boolean; onOpen: () => void }) {
  const { me } = useCurrentMember()
  const { members } = useMembers()
  const { duels, applyDuel } = useDuels()
  const { tournaments, applyTournament } = useTournaments()
  const [clock, setClock] = useState(() => Date.now())
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  const running = useMemo(
    () => [...tournaments.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).find(t => t.status === 'running') ?? null,
    [tournaments],
  )
  useTournamentDirector(running, duels, applyTournament, applyDuel)

  const nameOf = (id: string) => displayName(members.find(m => m.id === id)) || '팀원'
  const target = useMemo(() => {
    if (!me) return null
    const mine = [...duels.values()]
      .filter(d => isFreshDuel(d, clock) && !dismissed.has(`${d.id}:${d.status}`))
      .filter(d => (d.status === 'invited' && d.opponent_id === me.id) || ((d.status === 'playing' || d.status === 'rps') && (d.challenger_id === me.id || d.opponent_id === me.id)))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return mine[0] ?? null
  }, [duels, clock, dismissed, me])

  if (widgetOpen || !target || !me) return null
  const other = target.challenger_id === me.id ? target.opponent_id : target.challenger_id
  const text = target.status === 'invited'
    ? `⚔ ${nameOf(target.challenger_id)}님이 대결을 신청했어요!`
    : target.tournament_id
      ? `🏆 토너먼트 내 경기가 시작됐어요! (vs ${nameOf(other)})`
      : `⚾ ${nameOf(other)}님과 대결 진행 중이에요`

  return (
    <div className="fixed right-4 bottom-24 z-[61] flex items-center gap-2 rounded-xl bg-[#1F2933] text-white shadow-lg px-3 py-2 text-[12.5px] animate-pulse hover:animate-none">
      <span>{text}</span>
      <button onClick={onOpen} className="text-[12px] font-semibold bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-md px-2.5 py-1">
        {target.status === 'invited' ? '보기' : '입장'}
      </button>
      <button onClick={() => setDismissed(prev => new Set(prev).add(`${target.id}:${target.status}`))} title="닫기" className="text-[12px] opacity-70 hover:opacity-100 px-1">✕</button>
    </div>
  )
}
