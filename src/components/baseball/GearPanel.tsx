'use client'

// 야구 위젯 "🎁 장비" 화면 — 크레딧(이번 달 물주기) · 받은 상자 열기 · 팀원에게 상자 선물 · 내 장비함(장착).

import { useState } from 'react'
import Avatar from '@/components/Avatar'
import { GearPreview } from '@/components/baseball/gear'
import { BoxReveal, EquipPicker, type GearApi } from '@/components/baseball/GearBits'
import type { MemberLite } from '@/components/baseball/scene'
import { BOX_COST, GEAR_PARTS, KBO_TEAMS, logoUrl, partLabel, teamOf, type GiftBox } from '@/lib/baseballGear'

export default function GearPanel(props: {
  meId: string | null
  members: string[]
  memberMap: Map<string, MemberLite>
  nameOf: (id: string) => string
  gear: GearApi
  btnPrimary: string
  btnGhost: string
}) {
  const { meId, gear, nameOf } = props
  const [to, setTo] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<GiftBox | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!meId) return <p className="px-3 pb-3 text-[11.5px] text-[#9AA5B1]">로그인 정보를 불러오는 중…</p>
  if (!gear.loaded) return <p className="px-3 pb-3 text-[11.5px] text-[#9AA5B1]">장비를 불러오는 중…</p>

  const watered = gear.waterCountOf(meId)
  const sent = gear.sentThisMonthOf(meId)
  const balance = gear.balanceOf(meId)
  const tickets = gear.ticketsOf(meId)
  const unopened = gear.boxes.filter(b => b.recipient_id === meId && !b.opened_at)
  const owned = gear.gear.filter(g => g.member_id === meId)
  const others = props.members.filter(id => id !== meId)
  const history = gear.boxes.filter(b => b.opened_at).slice(0, 6)
  const monthLabel = `${Number(gear.month.slice(5, 7))}월`

  async function send(useTicket = false) {
    if (!to || !meId || busy) return
    setBusy(true)
    setError(null)
    const err = useTicket ? await gear.sendTicketBox(meId, to, message) : await gear.sendBox(meId, to, message)
    setBusy(false)
    if (err) { setError(err); return }
    setNotice(useTicket ? `🎟 선물권으로 ${nameOf(to)}님에게 유니폼 상자를 보냈어요!` : `${nameOf(to)}님에게 상자를 보냈어요!`)
    setTo(null)
    setMessage('')
  }

  async function open(box: GiftBox) {
    if (!meId || busy) return
    setBusy(true)
    setError(null)
    const res = await gear.openBox(box.id, meId)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setRevealed(res.box)
  }

  return (
    <div className="px-3 pb-3 flex flex-col gap-3 max-h-[460px] overflow-y-auto text-[11.5px] text-[#2B333B]">
      {/* 내 캐릭터 + 크레딧 */}
      <div className="flex items-center gap-3 bg-white/70 border border-[#E5E8EB] rounded-xl px-3 py-2">
        <GearPreview equip={gear.equipOf(meId)} size={56} />
        <div className="flex-1 min-w-0">
          <p className="text-[18px] font-bold tabular-nums text-[#1F2933] leading-tight">
            {balance}<span className="text-[11px] font-medium text-[#7A8491] ml-1">/ {BOX_COST} 크레딧</span>
          </p>
          <div className="h-1.5 rounded-full bg-[#E5E8EB] overflow-hidden my-1">
            <div className="h-full bg-[#4C7FE0]" style={{ width: `${Math.min(100, (Math.max(0, balance) / BOX_COST) * 100)}%` }} />
          </div>
          <p className="text-[10.5px] text-[#7A8491] leading-snug">{monthLabel} 물주기 {watered}회{sent > 0 ? ` − 보낸 상자 ${sent}개 × ${BOX_COST}` : ''} · 물주기 1회 = 1크레딧 · 매달 1일 초기화</p>
        </div>
      </div>

      {tickets > 0 && (
        <div className="flex items-center gap-2 bg-[#FFF8E6] border border-[#F5DFA6] rounded-xl px-3 py-2">
          <span className="text-[20px]">🎟</span>
          <p className="flex-1 text-[11px] text-[#7A4B00] leading-snug">
            <b>랜덤 유니폼 선물권 {tickets}장</b> — 아래에서 받을 사람을 고르고 [선물권으로 보내기]를 누르세요.
            <span className="block text-[10px] text-[#A0835A]">나에게는 못 써요 · 구단 랜덤 유니폼이 들어 있어요</span>
          </p>
        </div>
      )}

      {revealed && (
        <BoxReveal box={revealed} senderName={nameOf(revealed.sender_id)} meId={meId} gear={gear} onClose={() => setRevealed(null)} btnPrimary={props.btnPrimary} />
      )}

      {/* 받은 상자 */}
      {unopened.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold text-[#5B6472]">🎁 받은 상자 {unopened.length}개</p>
          {unopened.map(b => (
            <div key={b.id} className="flex items-center gap-2 bg-white/80 border border-[#F5DFA6] rounded-lg px-2.5 py-1.5">
              <span className="text-[18px]">🎁</span>
              <span className="flex-1 min-w-0 truncate">
                {b.kind === 'admin' ? <b>🎖 관리자 선물</b> : <><b>{nameOf(b.sender_id)}</b>님이 보낸 상자</>}
                {b.message ? <span className="text-[#7A8491]"> · {b.message}</span> : null}
              </span>
              <button onClick={() => open(b)} disabled={busy} className={props.btnPrimary}>열기</button>
            </div>
          ))}
        </div>
      )}

      {/* 선물하기 */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold text-[#5B6472]">💝 상자 선물하기 <span className="font-normal text-[#9AA5B1]">({BOX_COST}크레딧 · 구단·부위 완전 랜덤 · 나에게는 못 보내요)</span></p>
        <div className="flex flex-wrap gap-1.5">
          {others.map(id => (
            <button
              key={id}
              onClick={() => setTo(id === to ? null : id)}
              className={`flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 border ${to === id ? 'bg-[#1F2933] text-white border-[#1F2933]' : 'bg-white/80 border-[#E5E8EB] hover:bg-white'}`}
            >
              <Avatar member={props.memberMap.get(id)} size={18} />
              {nameOf(id)}
            </button>
          ))}
        </div>
        {to && (
          <div className="flex gap-1.5">
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={40}
              placeholder="한마디 (선택)"
              className="flex-1 min-w-0 border border-[#E5E8EB] rounded-lg px-2 py-1 bg-white"
            />
            {tickets > 0 && <button onClick={() => send(true)} disabled={busy} className={`${props.btnPrimary} !bg-[#D97706] hover:!bg-[#B45309]`}>🎟 선물권으로 보내기</button>}
            <button onClick={() => send()} disabled={busy || balance < BOX_COST} className={props.btnPrimary}>보내기</button>
          </div>
        )}
        {to && balance < BOX_COST && tickets === 0 && <p className="text-[10.5px] text-[#B45309]">크레딧이 {BOX_COST - balance} 모자라요 — 팀 나무에 물을 주면 하루 1씩 쌓여요</p>}
        {notice && <p className="text-[10.5px] text-[#16A34A]">{notice}</p>}
      </div>

      {/* 내 장비함 */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold text-[#5B6472]">🧳 내 장비함 <span className="font-normal text-[#9AA5B1]">({owned.length}/{KBO_TEAMS.length * GEAR_PARTS.length}) · 눌러서 장착</span></p>
        <EquipPicker meId={meId} gear={gear} />
      </div>

      {/* 최근 선물 */}
      {history.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold text-[#5B6472]">📜 최근 선물</p>
          {history.map(b => {
            const t = teamOf(b.item_team)
            return (
              <p key={b.id} className="flex items-center gap-1.5 text-[10.5px] text-[#5B6472]">
                {t && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl(t.key)} alt="" className="w-4 h-4 object-contain" />
                )}
                <span className="truncate">
                  {b.kind === 'admin' ? '🎖 관리자' : nameOf(b.sender_id)} → {nameOf(b.recipient_id)} · {t?.name} {partLabel(b.item_part ?? '')}{b.duplicate ? ' (중복)' : ''}
                </span>
              </p>
            )
          })}
        </div>
      )}

      {error && <p className="text-[11px] text-[#DC2626]">⚠ {error}</p>}
    </div>
  )
}
