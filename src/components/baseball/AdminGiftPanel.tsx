'use client'

// 설정 > 멤버 관리 페이지의 "⚾ 야구 장비 선물" — 관리자(김진일)만. 크레딧 없이 받는 사람·구단·부위를 직접 골라 보낸다.
// 받는 사람 화면에는 일반 상자처럼 메인 페이지 모달로 뜨고, 열면 고른 장비가 나온다. 서버 함수가 이메일을 다시 확인한다.

import { useState } from 'react'
import Avatar from '@/components/Avatar'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useBaseballGear } from '@/lib/useBaseballGear'
import { displayName } from '@/lib/members'
import { GEAR_PARTS, KBO_TEAMS, logoUrl, partLabel, teamOf, type GearPart, type TeamKey } from '@/lib/baseballGear'

export default function AdminGiftPanel() {
  const { members } = useMembers()
  const { me } = useCurrentMember()
  const gear = useBaseballGear()
  const [to, setTo] = useState<string | null>(null)
  const [team, setTeam] = useState<TeamKey | null>(null)
  const [part, setPart] = useState<GearPart | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const nameOf = (id: string) => displayName(members.find(m => m.id === id)) || '(알 수 없음)'
  const owns = to && team && part ? gear.gear.some(g => g.member_id === to && g.team === team && g.part === part) : false
  const recentAdmin = gear.boxes.filter(b => b.kind === 'admin').slice(0, 5)

  async function send() {
    if (!me || !to || !team || !part || busy) return
    setBusy(true)
    setResult(null)
    const err = await gear.adminSendBox(me.id, to, team, part, message)
    setBusy(false)
    if (err) { setResult({ ok: false, text: err }); return }
    setResult({ ok: true, text: `${nameOf(to)}님에게 ${teamOf(team)?.name} ${partLabel(part)}를 보냈어요` })
    setMessage('')
  }

  const chip = (active: boolean) =>
    `text-[12.5px] rounded-full px-3 py-1.5 border ${active ? 'bg-[#1F1F1D] text-white border-[#1F1F1D]' : 'bg-white border-[#E8E8E4] text-[#4A4A45] hover:bg-[#F2F2EF]'}`

  return (
    <section className="bg-white rounded-2xl border border-[#E8E8E4] p-5 space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-[#1F1F1D]">⚾ 야구 장비 선물 (관리자)</h2>
        <p className="text-[12.5px] text-[#6B6B66] mt-1">크레딧 없이 구단·부위를 골라 보냅니다. 받는 사람에게는 선물 상자 모달로 떠요.</p>
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
        <div className="flex gap-1.5">
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

      {recentAdmin.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-[#F0F0EC]">
          <p className="text-[12px] font-medium text-[#6B6B66]">최근 관리자 선물</p>
          {recentAdmin.map(b => (
            <p key={b.id} className="text-[12px] text-[#6B6B66]">
              {nameOf(b.recipient_id)} · {teamOf(b.preset_team)?.name} {partLabel(b.preset_part ?? '')} · {b.opened_at ? '열어봄' : '아직 안 열어봄'}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
