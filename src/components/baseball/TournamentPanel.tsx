'use client'

// 토너먼트 패널(위젯 목록 화면 위쪽) — 개최(팀원 누구나) · 참가/나가기 · 시작/취소(개설자 또는 관리자) ·
// 대진표와 현재 경기 관전 · 제외된 1명의 우승자 베팅 · 우승 결과.
// 경기 진행(다음 경기 배정·우승 판정)은 위젯 쪽 useTournamentDirector가 한다 — 이 패널은 보여주고 버튼만 처리.

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'
import type { MemberLite } from '@/components/baseball/scene'
import { duelScore, type Duel } from '@/lib/baseballDuel'
import { betOpen, currentMatch, roundName, seedBracket, totalRounds, type Tournament } from '@/lib/baseballTournament'

type Props = {
  tournament: Tournament | null // 모집 중·진행 중, 없으면 최근에 끝난 것(2시간 이내)
  meId: string | null
  isAdmin: boolean
  nameOf: (id: string) => string
  memberMap: Map<string, MemberLite>
  duels: Map<string, Duel>
  applyTournament: (t: Tournament) => void
  onOpenDuel: (id: string) => void
  btnPrimary: string
  btnGhost: string
}

export default function TournamentPanel({ tournament: t, meId, isAdmin, nameOf, memberMap, duels, applyTournament, onOpenDuel, btnPrimary, btnGhost }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // updated_at을 낙관적 잠금으로 — 동시에 여러 명이 눌러도 한 명 것만 반영, 나머지는 최신 값으로 다시 계산
  async function patch(calc: (cur: Tournament) => Partial<Tournament> | null) {
    if (!t) return
    setBusy(true)
    setError(null)
    const supabase = createClient()
    for (let i = 0; i < 4; i++) {
      const { data: cur } = await supabase.from('baseball_tournaments').select('*').eq('id', t.id).single()
      if (!cur) break
      const p = calc(cur as Tournament)
      if (!p) break
      const { data, error } = await supabase.from('baseball_tournaments')
        .update({ ...p, updated_at: new Date().toISOString() })
        .eq('id', t.id).eq('updated_at', (cur as Tournament).updated_at).select()
      if (error) { setError(error.message); break }
      if (data?.length) { applyTournament(data[0] as Tournament); break }
    }
    setBusy(false)
  }

  async function open() {
    if (!meId) return
    setBusy(true)
    setError(null)
    const { data, error } = await createClient().from('baseball_tournaments').insert({ created_by: meId, entrants: [meId] }).select().single()
    setBusy(false)
    if (error || !data) setError(`개최 실패: ${error?.message ?? ''}`)
    else applyTournament(data as Tournament)
  }

  if (!t || t.status === 'canceled') {
    return meId ? (
      <button onClick={open} disabled={busy} className={`self-start ${btnGhost}`}>🏆 토너먼트 개최</button>
    ) : null
  }

  const joined = !!meId && t.entrants.includes(meId)
  const canManage = !!meId && (meId === t.created_by || isAdmin)
  const chips = (ids: string[]) => (
    <span className="flex flex-wrap gap-1">
      {ids.map(id => (
        <span key={id} className="inline-flex items-center gap-1 bg-white/80 border border-[#EEF0F2] rounded-full pl-0.5 pr-2 py-0.5 text-[11px]">
          <Avatar member={memberMap.get(id)} size={16} />{nameOf(id)}
        </span>
      ))}
    </span>
  )

  if (t.status === 'recruiting') {
    return (
      <div className="flex flex-col gap-1.5 bg-[#FFF8E6]/90 border border-[#F5DFA6] rounded-lg px-2.5 py-2 text-[11.5px]">
        <p className="font-semibold text-[#7A4B00]">🏆 토너먼트 참가자 모집 중 <span className="font-normal text-[#A0835A]">· 개최 {t.created_by ? nameOf(t.created_by) : '-'}</span></p>
        {t.entrants.length > 0 ? chips(t.entrants) : <p className="text-[#A0835A]">아직 참가자가 없어요</p>}
        <p className="text-[10.5px] text-[#A0835A]">참가자가 홀수면 1명은 랜덤으로 빠지고 우승자 베팅만 할 수 있어요 · 한 경기씩 순서대로</p>
        <div className="flex flex-wrap gap-1.5">
          {meId && !joined && <button onClick={() => patch(c => (c.status === 'recruiting' && !c.entrants.includes(meId) ? { entrants: [...c.entrants, meId] } : null))} disabled={busy} className={btnPrimary}>🙋 참가</button>}
          {joined && <button onClick={() => patch(c => (c.status === 'recruiting' ? { entrants: c.entrants.filter(x => x !== meId) } : null))} disabled={busy} className={btnGhost}>나가기</button>}
          {canManage && (
            <button
              onClick={() => patch(c => {
                if (c.status !== 'recruiting' || c.entrants.length < 2) return null
                const s = seedBracket(c.entrants)
                return { status: 'running', players: s.players, excluded_id: s.excluded_id, bracket: s.bracket, bet_pick: null }
              })}
              disabled={busy || t.entrants.length < 2}
              className="text-[12px] font-semibold text-white bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-40 rounded-lg px-3 py-1.5"
            >
              {t.entrants.length < 2 ? '2명부터 시작' : '📣 대진 추첨 · 시작'}
            </button>
          )}
          {canManage && <button onClick={() => patch(c => (c.status === 'recruiting' ? { status: 'canceled' } : null))} disabled={busy} className="text-[10.5px] text-[#B0B8C1] hover:text-[#DC2626] ml-auto">개최 취소</button>}
        </div>
        {error && <p className="text-[11px] text-[#DC2626]">⚠ {error}</p>}
      </div>
    )
  }

  // 진행 중 · 끝남
  const total = totalRounds(t.players.length)
  const cm = currentMatch(t)
  const excluded = t.excluded_id
  const canBet = !!meId && meId === excluded && betOpen(t)
  const done = t.status === 'done'

  return (
    <div className="flex flex-col gap-1.5 bg-[#FFF8E6]/90 border border-[#F5DFA6] rounded-lg px-2.5 py-2 text-[11.5px]">
      <p className="font-semibold text-[#7A4B00]">
        {done ? `🏆 토너먼트 우승: ${t.champion_id ? nameOf(t.champion_id) : '-'}!` : '🏆 토너먼트 진행 중'}
      </p>

      {/* 대진표 */}
      <div className="flex flex-col gap-1">
        {t.bracket.map((round, r) => (
          <div key={r} className="flex items-start gap-1.5">
            <span className="w-11 flex-shrink-0 text-[10.5px] font-semibold text-[#A0835A] pt-0.5">{roundName(r, total)}</span>
            <span className="flex flex-col gap-0.5 flex-1">
              {round.map((m, i) => {
                const d = m.duel_id ? duels.get(m.duel_id) : undefined
                const live = !!m.duel_id && !m.winner
                const sc = d ? duelScore(d.halves) : null
                const mine = !!meId && (m.a === meId || m.b === meId)
                return (
                  <span key={i} className={`flex items-center gap-1.5 tabular-nums ${live ? 'font-semibold text-[#1F2933]' : 'text-[#5B6472]'}`}>
                    {live && <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] animate-pulse" />}
                    <span className={m.winner === m.a ? 'text-[#15803D] font-semibold' : m.winner ? 'line-through opacity-60' : ''}>{nameOf(m.a)}</span>
                    {m.b === null ? <span className="text-[10px] text-[#A0835A]">부전승</span> : (
                      <>
                        <span className="text-[10px] opacity-60">{sc ? `${sc.challenger}:${sc.opponent}` : 'vs'}</span>
                        <span className={m.winner === m.b ? 'text-[#15803D] font-semibold' : m.winner ? 'line-through opacity-60' : ''}>{nameOf(m.b)}</span>
                      </>
                    )}
                    {live && m.duel_id && (
                      <button onClick={() => onOpenDuel(m.duel_id!)} className={`ml-auto ${mine ? btnPrimary : btnGhost}`}>{mine ? '입장' : '👀 관전'}</button>
                    )}
                  </span>
                )
              })}
            </span>
          </div>
        ))}
        {!done && t.bracket.length < total && (
          <span className="flex items-center gap-1.5 text-[10.5px] text-[#A0835A]"><span className="w-11 font-semibold">{roundName(total - 1, total)}</span>대기</span>
        )}
      </div>

      {/* 베팅 (제외된 1명) */}
      {excluded && (
        <div className="flex flex-wrap items-center gap-1 text-[11px] border-t border-[#F5DFA6] pt-1.5">
          <span className="text-[#7A4B00]">🎯 {nameOf(excluded)}의 우승자 예측:</span>
          {canBet ? (
            t.players.map(id => (
              <button key={id} onClick={() => patch(c => (c.excluded_id === meId && betOpen(c) ? { bet_pick: id } : null))} disabled={busy}
                className={`text-[10.5px] rounded-md px-1.5 py-0.5 border ${t.bet_pick === id ? 'bg-[#1F2933] text-white border-[#1F2933]' : 'bg-white/80 border-[#E5E8EB]'}`}>
                {nameOf(id)}
              </button>
            ))
          ) : (
            <span className="font-semibold">
              {t.bet_pick ? nameOf(t.bet_pick) : '예측 안 함'}
              {done && t.bet_pick && (t.bet_pick === t.champion_id ? ' → 🎯 적중!' : ' → 빗나감')}
              {!done && !betOpen(t) && <span className="font-normal text-[#A0835A]"> (베팅 마감)</span>}
            </span>
          )}
          {canBet && <span className="text-[10px] text-[#A0835A] w-full">첫 경기가 끝나기 전까지 바꿀 수 있어요</span>}
        </div>
      )}

      {!done && !cm && <p className="text-[10.5px] text-[#A0835A]">다음 경기 준비 중…</p>}
      {!done && canManage && (
        <button onClick={() => patch(c => (c.status === 'running' ? { status: 'canceled' } : null))} disabled={busy} className="self-end text-[10.5px] text-[#B0B8C1] hover:text-[#DC2626]">토너먼트 중단</button>
      )}
      {done && meId && <button onClick={open} disabled={busy} className={`self-start ${btnGhost}`}>🏆 새 토너먼트 개최</button>}
      {error && <p className="text-[11px] text-[#DC2626]">⚠ {error}</p>}
    </div>
  )
}
