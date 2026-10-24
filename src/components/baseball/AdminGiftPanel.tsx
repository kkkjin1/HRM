'use client'

// 설정 > 멤버 관리 페이지의 "⚾ 야구 장비 선물" — 관리자(김진일)만. 크레딧 없이 받는 사람·구단·부위를 직접 골라 보낸다.
// 구단·부위는 각각 "🎲 랜덤"도 고를 수 있다 — null로 보내 상자를 열 때 서버가 뽑는다.
// 받는 사람 화면에는 일반 상자처럼 메인 페이지 모달로 뜨고, 열면 고른 장비가 나온다. 서버 함수가 이메일을 다시 확인한다.

import { useState } from 'react'
import Avatar from '@/components/Avatar'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useBaseballGear } from '@/lib/useBaseballGear'
import { displayName } from '@/lib/members'
import { GEAR_PARTS, KBO_TEAMS, logoUrl, partLabel, teamOf, type GearPart, type TeamKey } from '@/lib/baseballGear'

const RANDOM = 'random' as const

export default function AdminGiftPanel() {
  const { members } = useMembers()
  const { me } = useCurrentMember()
  const gear = useBaseballGear()
  const [to, setTo] = useState<string | null>(null)
  const [team, setTeam] = useState<TeamKey | typeof RANDOM | null>(null)
  const [part, setPart] = useState<GearPart | typeof RANDOM | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  // 선물권 증정
  const [ticketTo, setTicketTo] = useState<string | null>(null)
  const [ticketResult, setTicketResult] = useState<{ ok: boolean; text: string } | null>(null)
  // 일일권(오늘 자정까지 맛보기)
  const [trialTo, setTrialTo] = useState<string | null>(null)
  const [trialTeam, setTrialTeam] = useState<TeamKey | typeof RANDOM>(RANDOM)
  const [trialPart, setTrialPart] = useState<GearPart | typeof RANDOM>(RANDOM)
  const [trialResult, setTrialResult] = useState<{ ok: boolean; text: string } | null>(null)

  const nameOf = (id: string) => displayName(members.find(m => m.id === id)) || '(알 수 없음)'
  const owns = to && team && part && team !== RANDOM && part !== RANDOM ? gear.gear.some(g => g.member_id === to && g.team === team && g.part === part) : false
  const recentAdmin = gear.boxes.filter(b => b.kind === 'admin').slice(0, 5)

  async function send() {
    if (!me || !to || !team || !part || busy) return
    setBusy(true)
    setResult(null)
    const err = await gear.adminSendBox(me.id, to, team === RANDOM ? null : team, part === RANDOM ? null : part, message)
    setBusy(false)
    if (err) { setResult({ ok: false, text: err }); return }
    setResult({ ok: true, text: `${nameOf(to)}님에게 ${team === RANDOM ? '랜덤 구단' : teamOf(team)?.name} ${part === RANDOM ? '랜덤 장비' : partLabel(part)}를 보냈어요` })
    setMessage('')
  }

  async function grantTicket() {
    if (!me || !ticketTo || busy) return
    setBusy(true)
    setTicketResult(null)
    const err = await gear.adminGrantTicket(me.id, ticketTo)
    setBusy(false)
    if (err) { setTicketResult({ ok: false, text: err }); return }
    setTicketResult({ ok: true, text: `${nameOf(ticketTo)}님에게 선물권 1장을 줬어요 (남은 선물권 ${gear.ticketsOf(ticketTo) + 1}장)` })
  }
  async function grantTrial() {
    if (!me || !trialTo || busy) return
    setBusy(true)
    setTrialResult(null)
    const res = await gear.adminGrantTrial(me.id, trialTo, trialTeam === RANDOM ? null : trialTeam, trialPart === RANDOM ? null : trialPart)
    setBusy(false)
    if (typeof res === 'string') { setTrialResult({ ok: false, text: res }); return }
    setTrialResult({ ok: true, text: `${nameOf(trialTo)}님에게 ${teamOf(res.team)?.name} ${partLabel(res.part)} 일일권을 줬어요 — 바로 입혀지고 오늘 자정에 원래 장비로 돌아가요` })
  }
  const recentTrials = [...gear.trials].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)

  const recentTickets = [...gear.tickets].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)

  const chip = (active: boolean) =>
    `text-[12.5px] rounded-full px-3 py-1.5 border ${active ? 'bg-[#1F1F1D] text-white border-[#1F1F1D]' : 'bg-white border-[#E8E8E4] text-[#4A4A45] hover:bg-[#F2F2EF]'}`

  return (
    <section className="bg-white rounded-2xl border border-[#E8E8E4] p-5 space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-[#1F1F1D]">⚾ 야구 장비 선물 (관리자)</h2>
        <p className="text-[12.5px] text-[#6B6B66] mt-1">크레딧 없이 구단·부위를 골라 보냅니다. 🎲 랜덤을 고르면 상자를 열 때 정해져요. 받는 사람에게는 선물 상자 모달로 떠요.</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[12px] font-medium text-[#6B6B66]">받는 사람</p>
        <div className="flex flex-wrap gap-1.5">
          {members.map(m => (
            <button key={m.id} onClick={() => setTo(m.id)} className={`${chip(to === m.id)} flex items-center gap-1.5 pl-1`}>
              <Avatar member={m} size={20} />
              {displayName(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[12px] font-medium text-[#6B6B66]">구단</p>
        <button onClick={() => setTeam(RANDOM)} className={chip(team === RANDOM)}>🎲 랜덤 구단</button>
        <div className="grid grid-cols-5 gap-1.5">
          {KBO_TEAMS.map(t => (
            <button
              key={t.key}
              onClick={() => setTeam(t.key)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 ${team === t.key ? 'border-[#1F1F1D] ring-2 ring-[#1F1F1D]/20' : 'border-[#E8E8E4] hover:bg-[#F7F7F5]'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl(t.key)} alt="" className="w-8 h-8 object-contain" />
              <span className="text-[11px] text-[#4A4A45]">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[12px] font-medium text-[#6B6B66]">부위</p>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setPart(RANDOM)} className={chip(part === RANDOM)}>🎲 랜덤</button>
          {GEAR_PARTS.map(p => (
            <button key={p.key} onClick={() => setPart(p.key)} className={chip(part === p.key)}>{p.emoji} {p.label}</button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={40}
          placeholder="한마디 (선택)"
          className="flex-1 min-w-0 border border-[#E8E8E4] rounded-lg px-3 py-2 text-[13px]"
        />
        <button
          onClick={send}
          disabled={busy || !me || !to || !team || !part}
          className="text-[13px] font-medium text-white bg-[#1F1F1D] hover:bg-black disabled:opacity-40 rounded-lg px-4 py-2"
        >
          {busy ? '보내는 중…' : '선물 보내기'}
        </button>
      </div>
      {owns && <p className="text-[12px] text-[#B45309]">이미 이 장비를 가지고 있어요 (보내면 중복으로 표시돼요)</p>}
      {result && <p className={`text-[12.5px] ${result.ok ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>{result.ok ? '✅' : '⚠'} {result.text}</p>}

      {/* 랜덤 유니폼 선물권 — 받은 팀원은 다른 사람에게만 상자를 보낼 수 있다 */}
      <div className="space-y-2 pt-3 border-t border-[#F0F0EC]">
        <div>
          <h3 className="text-[14px] font-semibold text-[#1F1F1D]">🎟 랜덤 유니폼 선물권 주기</h3>
          <p className="text-[12px] text-[#6B6B66] mt-0.5">팀원에게 1장 주면, 그 팀원이 원하는 사람에게 유니폼 상자(구단 랜덤)를 보낼 수 있어요. 본인에게는 못 써요.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {members.map(m => {
            const n = gear.ticketsOf(m.id)
            return (
              <button key={m.id} onClick={() => setTicketTo(m.id)} className={`${chip(ticketTo === m.id)} flex items-center gap-1.5 pl-1`}>
                <Avatar member={m} size={20} />
                {displayName(m)}
                {n > 0 && <span className="text-[11px] opacity-70">🎟{n}</span>}
              </button>
            )
          })}
        </div>
        <button
          onClick={grantTicket}
          disabled={busy || !me || !ticketTo}
          className="text-[13px] font-medium text-white bg-[#D97706] hover:bg-[#B45309] disabled:opacity-40 rounded-lg px-4 py-2"
        >
          {ticketTo ? `${nameOf(ticketTo)}님에게 선물권 1장 주기` : '받을 팀원을 고르세요'}
        </button>
        {ticketResult && <p className={`text-[12.5px] ${ticketResult.ok ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>{ticketResult.ok ? '✅' : '⚠'} {ticketResult.text}</p>}
        {recentTickets.length > 0 && (
          <div className="space-y-0.5">
            {recentTickets.map(t => {
              const box = t.box_id ? gear.boxes.find(b => b.id === t.box_id) : null
              return (
                <p key={t.id} className="text-[12px] text-[#6B6B66]">
                  {nameOf(t.owner_id)} · {t.used_at ? `사용함 → ${box ? nameOf(box.recipient_id) : '?'}${box?.opened_at ? ` (${teamOf(box.item_team)?.name} 유니폼)` : ''}` : '아직 안 씀'}
                </p>
              )
            })}
          </div>
        )}
      </div>

      {/* 일일권 — 아이템 종류는 그대로, 오늘 하루만 입어 보기 */}
      <div className="space-y-2 pt-3 border-t border-[#F0F0EC]">
        <div>
          <h3 className="text-[14px] font-semibold text-[#1F1F1D]">🎫 일일권 주기 (맛보기)</h3>
          <p className="text-[12px] text-[#6B6B66] mt-0.5">어떤 아이템이든(전설·기록 보상 포함) 오늘 자정까지만 입혀 줘요. 주는 즉시 장착되고, 자정이 지나면 원래 입던 장비로 돌아가요. 장비함에 남지 않아요.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {members.map(m => (
            <button key={m.id} onClick={() => setTrialTo(m.id)} className={`${chip(trialTo === m.id)} flex items-center gap-1.5 pl-1`}>
              <Avatar member={m} size={20} />
              {displayName(m)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setTrialTeam(RANDOM)} className={chip(trialTeam === RANDOM)}>🎲 랜덤 구단</button>
          {KBO_TEAMS.map(t => (
            <button key={t.key} onClick={() => setTrialTeam(t.key)} className={`${chip(trialTeam === t.key)} flex items-center gap-1 pl-1.5`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl(t.key)} alt="" className="w-4 h-4 object-contain" />
              {t.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setTrialPart(RANDOM)} className={chip(trialPart === RANDOM)}>🎲 랜덤 아이템</button>
          {GEAR_PARTS.map(p => (
            <button key={p.key} onClick={() => setTrialPart(p.key)} className={chip(trialPart === p.key)}>{p.emoji} {p.label}</button>
          ))}
        </div>
        <button
          onClick={grantTrial}
          disabled={busy || !me || !trialTo}
          className="text-[13px] font-medium text-white bg-[#D97706] hover:bg-[#B45309] disabled:opacity-40 rounded-lg px-4 py-2"
        >
          {trialTo ? `${nameOf(trialTo)}님에게 일일권 주기` : '받을 팀원을 고르세요'}
        </button>
        {trialResult && <p className={`text-[12.5px] ${trialResult.ok ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>{trialResult.ok ? '✅' : '⚠'} {trialResult.text}</p>}
        {recentTrials.length > 0 && (
          <div className="space-y-0.5">
            {recentTrials.map(t => (
              <p key={t.id} className="text-[12px] text-[#6B6B66]">
                {nameOf(t.member_id)} · {teamOf(t.team)?.name} {partLabel(t.part)} · {gear.activeTrialsOf(t.member_id).some(x => x.id === t.id) ? '오늘 착용 중' : '끝남'}
              </p>
            ))}
          </div>
        )}
      </div>

      {recentAdmin.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-[#F0F0EC]">
          <p className="text-[12px] font-medium text-[#6B6B66]">최근 관리자 선물</p>
          {recentAdmin.map(b => (
            <p key={b.id} className="text-[12px] text-[#6B6B66]">
              {nameOf(b.recipient_id)} · {b.preset_team ? teamOf(b.preset_team)?.name : '랜덤 구단'} {b.preset_part ? partLabel(b.preset_part) : '랜덤 장비'}
              {b.opened_at ? ` · 열어봄${!b.preset_team || !b.preset_part ? ` → ${teamOf(b.item_team)?.name} ${partLabel(b.item_part ?? '')}` : ''}` : ' · 아직 안 열어봄'}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
