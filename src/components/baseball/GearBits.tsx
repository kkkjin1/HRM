'use client'

// 장비 UI 조각 — 장비함/게임 전 장비 선택(EquipPicker), 상자 연 결과(BoxReveal).
// 장비 화면(GearPanel)·개인전/대결 화면·메인 페이지 선물 모달이 같이 쓴다.

import { useState, type ReactNode } from 'react'
import { GEAR_SLOTS, backgroundTeam, equippedTeams, logoUrl, partInfo, partLabel, slotOf, teamOf, type GearPart, type GearSlot, type GiftBox, type TeamKey } from '@/lib/baseballGear'
import type { useBaseballGear } from '@/lib/useBaseballGear'

export type GearApi = ReturnType<typeof useBaseballGear>

// 슬롯별로 [기본] + 내가 가진 아이템(구단 로고 + 종류 표시) — 누르면 바로 장착(상대 화면에도 실시간 반영).
// 아직 아무 아이템도 없는 슬롯은 줄을 숨긴다(이펙트처럼 아이템이 없는 슬롯 포함).
export function EquipPicker(props: { meId: string; gear: GearApi; compact?: boolean }) {
  const { meId, gear } = props
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const owned = gear.gear.filter(g => g.member_id === meId)
  const current = gear.equipOf(meId)

  async function pick(slot: GearSlot, part: GearPart, team: TeamKey | null) {
    const now = current.slots[slot]
    if (busy || (team === null ? !now : now?.part === part && now.team === team)) return
    setBusy(true)
    setError(null)
    const err = await gear.equip(meId, part, team)
    setBusy(false)
    if (err) setError(err)
  }

  const size = props.compact ? 'w-6 h-6' : 'w-7 h-7'
  return (
    <div className="flex flex-col gap-1 text-[11px]">
      {GEAR_SLOTS.map(slot => {
        const mine = owned.filter(g => slotOf(g.part) === slot.key)
        const now = current.slots[slot.key]
        if (mine.length === 0 && !now) return null
        // 같은 슬롯에 종류가 여러 개면(모자·헬멧) 로고 옆에 종류 이모지를 붙여 구분
        const mixed = new Set(mine.map(g => g.part)).size > 1
        return (
          <div key={slot.key} className="flex items-center gap-1.5 flex-wrap">
            <span className="w-14 flex-shrink-0 text-[#7A8491]">{slot.emoji} {slot.label}</span>
            <button
              onClick={() => { const p = now?.part ?? mine[0]?.part; if (p) pick(slot.key, p, null) }}
              disabled={busy}
              className={`rounded-md px-1.5 py-0.5 border text-[10.5px] ${!now ? 'border-[#1F2933] bg-[#1F2933] text-white' : 'border-[#E5E8EB] bg-white/80 text-[#7A8491]'}`}
            >
              기본
            </button>
            {mine.map(g => {
              const t = teamOf(g.team)
              const info = partInfo(g.part)
              if (!t || !info) return null
              const on = now?.part === g.part && now.team === g.team
              return (
                <button
                  key={`${g.part}-${g.team}`}
                  title={`${t.name} ${info.label}`}
                  onClick={() => pick(slot.key, g.part, g.team)}
                  disabled={busy}
                  className={`${size} relative rounded-md border flex items-center justify-center bg-white ${on ? 'border-[#1F2933] ring-2 ring-[#1F2933]/30' : 'border-[#E5E8EB] hover:border-[#9AA5B1]'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl(t.key)} alt={t.name} className="w-[78%] h-[78%] object-contain" />
                  {mixed && <span className="absolute -bottom-1 -right-1 text-[9px] leading-none">{info.emoji}</span>}
                </button>
              )
            })}
          </div>
        )
      })}
      {owned.length === 0 && <span className="text-[10.5px] text-[#B0B8C1]">아직 가진 장비가 없어요 — 선물 상자를 받으면 여기서 입을 수 있어요</span>}
      <BackgroundPicker meId={meId} gear={gear} busy={busy} setBusy={setBusy} setError={setError} />
      {error && <p className="text-[10.5px] text-[#DC2626]">⚠ {error}</p>}
    </div>
  )
}

// 위젯 배경 로고 — 장착한 구단이 1개면 자동, 여러 구단이 섞이면 여기서 고른다
function BackgroundPicker(props: { meId: string; gear: GearApi; busy: boolean; setBusy: (b: boolean) => void; setError: (e: string | null) => void }) {
  const { meId, gear } = props
  const equip = gear.equipOf(meId)
  const teams = equippedTeams(equip)
  const bg = backgroundTeam(equip, gear.bgChoiceOf(meId))
  if (teams.length === 0) return null

  async function pick(team: TeamKey) {
    if (props.busy || team === bg) return
    props.setBusy(true)
    props.setError(null)
    const err = await gear.setBackground(meId, team)
    props.setBusy(false)
    if (err) props.setError(err)
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap pt-1 mt-0.5 border-t border-dashed border-[#E5E8EB]">
      <span className="w-14 flex-shrink-0 text-[#7A8491]">🖼 배경</span>
      {teams.length === 1 ? (
        <span className="text-[10.5px] text-[#7A8491]">{teamOf(teams[0])?.name} (자동)</span>
      ) : (
        teams.map(t => {
          const team = teamOf(t)
          if (!team) return null
          return (
            <button
              key={t}
              onClick={() => pick(t)}
              disabled={props.busy}
              title={`${team.name} 배경`}
              className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 bg-white text-[10.5px] ${bg === t ? 'border-[#1F2933] ring-2 ring-[#1F2933]/30 text-[#1F2933]' : 'border-[#E5E8EB] text-[#7A8491] hover:border-[#9AA5B1]'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl(t)} alt="" className="w-4 h-4 object-contain" />
              {team.name}
            </button>
          )
        })
      )}
    </div>
  )
}

// 상자를 연 결과 카드 — 로고가 톡 튀어나오는 연출 + 바로 장착
export function BoxReveal(props: { box: GiftBox; senderName: string; meId: string; gear: GearApi; onClose: () => void; btnPrimary: string }) {
  const { box } = props
  const team = teamOf(box.item_team)
  const [equipped, setEquipped] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function equipNow() {
    if (!box.item_part || !box.item_team) return
    const err = await props.gear.equip(props.meId, box.item_part, box.item_team)
    if (err) setError(err)
    else setEquipped(true)
  }

  return (
    <div className="flex flex-col items-center gap-1.5 bg-[#FFF8E6] border border-[#F5DFA6] rounded-xl px-4 py-4 animate-[gearpop_0.5s_ease-out]">
      <style>{`@keyframes gearpop { 0% { transform: scale(0.6); opacity: 0 } 70% { transform: scale(1.06) } 100% { transform: scale(1); opacity: 1 } }`}</style>
      {team && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl(team.key)} alt={team.name} className="w-16 h-16 object-contain" />
      )}
      <p className="text-[14px] font-bold text-[#1F2933]">{team?.name} {partLabel(box.item_part ?? '')}</p>
      <p className="text-[11px] text-[#7A4B00] text-center">
        {box.kind === 'admin' ? '🎖 관리자 선물' : `${props.senderName}님의 선물`}{box.message ? ` — "${box.message}"` : ''}
      </p>
      {box.duplicate ? (
        <p className="text-[11px] text-[#B45309]">이미 가진 장비예요</p>
      ) : equipped ? (
        <p className="text-[11px] text-[#16A34A]">장착했어요! 야구 게임에서 확인해보세요</p>
      ) : (
        <button onClick={equipNow} className={props.btnPrimary}>바로 장착</button>
      )}
      {error && <p className="text-[10.5px] text-[#DC2626]">⚠ {error}</p>}
      <button onClick={props.onClose} className="text-[10.5px] text-[#9AA5B1] hover:text-[#5B6472]">닫기</button>
    </div>
  )
}

// 개인전·대결 화면 아래 "👕 장비 바꾸기" — 펼치면 가진 장비 중에서 골라 입는다
export function EquipToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <button onClick={() => setOpen(v => !v)} className="self-start text-[10.5px] text-[#7A8491] hover:text-[#1F2933]">
        👕 장비 바꾸기 {open ? '▲' : '▼'}
      </button>
      {open && <div className="bg-white/70 border border-[#E5E8EB] rounded-lg px-2 py-1.5">{children}</div>}
    </div>
  )
}
