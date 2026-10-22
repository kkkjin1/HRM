'use client'

// 야구 위젯 🎁 장비 화면의 "🏆 기록 보상" — 상자에서 안 나오는 아이템을 기록 달성으로 받는다.
// 진행도·지급은 서버 함수(baseball_reward_progress / claim_baseball_reward)가 계산·검사한다. 구단은 받을 때 고른다.

import { useEffect, useState } from 'react'
import type { GearApi } from '@/components/baseball/GearBits'
import { KBO_TEAMS, REWARDS, equippedTeams, logoUrl, partLabel, teamOf, type RewardProgress, type TeamKey } from '@/lib/baseballGear'

export default function RewardPanel({ meId, gear, btnPrimary }: { meId: string; gear: GearApi; btnPrimary: string }) {
  const [progress, setProgress] = useState<RewardProgress | null>(null)
  const [failed, setFailed] = useState(false)
  const [team, setTeam] = useState<TeamKey | null>(() => equippedTeams(gear.equipOf(meId))[0] ?? null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const { rewardProgress } = gear

  useEffect(() => {
    let active = true
    rewardProgress(meId).then(p => {
      if (!active) return
      if (p) setProgress(p)
      else setFailed(true)
    })
    return () => { active = false }
  }, [meId, rewardProgress])

  async function claim(part: (typeof REWARDS)[number]['part']) {
    if (!team || busy) return
    setBusy(true)
    setMsg(null)
    const err = await gear.claimReward(meId, part, team)
    setBusy(false)
    setMsg(err ? { ok: false, text: err } : { ok: true, text: `${teamOf(team)?.name} ${partLabel(part)}를 받았어요! 장비함에서 입어보세요` })
  }

  const owned = (part: string) => gear.gear.find(g => g.member_id === meId && g.part === part)
  const claimable = progress ? REWARDS.some(r => r.progress(progress).done && !owned(r.part)) : false

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold text-[#5B6472]">🏆 기록 보상 <span className="font-normal text-[#9AA5B1]">· 상자에서 안 나오는 아이템</span></p>
      {failed && <p className="text-[10.5px] text-[#9AA5B1]">기록을 불러오지 못했어요</p>}
      {!progress && !failed && <p className="text-[10.5px] text-[#9AA5B1]">기록을 불러오는 중…</p>}
      {progress && (
        <div className="grid grid-cols-2 gap-1.5">
          {REWARDS.map(r => {
            const p = r.progress(progress)
            const mine = owned(r.part)
            const pct = Math.min(100, (p.cur / p.goal) * 100)
            return (
              <div key={r.part} className={`rounded-lg border px-2 py-1.5 ${mine ? 'border-[#D4A017]/50 bg-[#FFF8E6]' : 'border-[#EEF0F2] bg-white/60'}`}>
                <p className="font-semibold text-[#1F2933]">{r.title}</p>
                <p className="text-[10px] text-[#7A8491] leading-snug">
                  {r.how}{r.part === 'goldglove' ? ` (${Number(progress.last_month.slice(5))}월 ${progress.last_month_hr}개 · 1위 ${progress.last_month_top}개)` : ''}
                </p>
                {mine ? (
                  <p className="mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-[#B45309]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl(mine.team)} alt="" className="w-3.5 h-3.5 object-contain" /> 받음
                  </p>
                ) : p.done ? (
                  <button onClick={() => claim(r.part)} disabled={busy || !team} className={`${btnPrimary} mt-1 !py-0.5 !px-2 !text-[11px]`}>
                    {team ? '받기' : '구단 먼저 고르기'}
                  </button>
                ) : (
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 rounded-full bg-[#E5E8EB] overflow-hidden"><div className="h-full bg-[#4C7FE0]" style={{ width: `${pct}%` }} /></div>
                    {r.part !== 'goldglove' && <span className="text-[10px] tabular-nums text-[#7A8491]">{p.cur}/{p.goal}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {claimable && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10.5px] text-[#7A8491] mr-0.5">받을 구단</span>
          {KBO_TEAMS.map(t => (
            <button key={t.key} title={t.name} onClick={() => setTeam(t.key)}
              className={`w-5 h-5 rounded border flex items-center justify-center bg-white ${team === t.key ? 'border-[#1F2933] ring-2 ring-[#1F2933]/30' : 'border-[#E5E8EB]'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl(t.key)} alt={t.name} className="w-[80%] h-[80%] object-contain" />
            </button>
          ))}
        </div>
      )}
      {msg && <p className={`text-[10.5px] ${msg.ok ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>{msg.ok ? '✅' : '⚠'} {msg.text}</p>}
    </div>
  )
}
