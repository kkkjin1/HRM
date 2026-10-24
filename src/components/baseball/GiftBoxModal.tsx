'use client'

// 메인 페이지에 항상 마운트 — 나에게 안 연 야구 장비 상자가 오면(실시간) 모달로 알려준다.
// [나중에]는 이번 세션 동안만 숨김(상자는 야구 위젯 🎁 장비에 그대로 남아 있음).
// 관리자에게 받은 🎟 선물권도 여기서 한 번 알려준다 — 선물권은 내가 여는 게 아니라 다른 팀원에게 보내는 쿠폰이라,
// [확인]하면 그 선물권은 다시 안 띄운다(localStorage). [지금 보내기]는 야구 위젯 🎁 장비 화면을 연다.

import { useState } from 'react'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useBaseballGear } from '@/lib/useBaseballGear'
import { displayName } from '@/lib/members'
import { BoxReveal } from '@/components/baseball/GearBits'
import { partLabel, teamOf, type GiftBox } from '@/lib/baseballGear'

const DISMISS_KEY = 'hrm_gift_box_dismissed'
const TICKET_SEEN_KEY = 'hrm_gift_ticket_seen'
const TRIAL_SEEN_KEY = 'hrm_gear_trial_seen'

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function loadSeenTickets(key = TICKET_SEEN_KEY): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export default function GiftBoxModal({ onOpenGear }: { onOpenGear?: () => void }) {
  const { members } = useMembers()
  const { me } = useCurrentMember()
  const gear = useBaseballGear()
  const [dismissed, setDismissed] = useState<Set<string>>(() => (typeof window === 'undefined' ? new Set() : loadDismissed()))
  const [seenTickets, setSeenTickets] = useState<Set<string>>(() => (typeof window === 'undefined' ? new Set() : loadSeenTickets()))
  const [seenTrials, setSeenTrials] = useState<Set<string>>(() => (typeof window === 'undefined' ? new Set() : loadSeenTickets(TRIAL_SEEN_KEY)))
  const [revealed, setRevealed] = useState<GiftBox | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameOf = (id: string) => displayName(members.find(m => m.id === id)) || '팀원'
  const pending = me ? gear.boxes.filter(b => b.recipient_id === me.id && !b.opened_at && !dismissed.has(b.id)) : []
  const box = pending[pending.length - 1] ?? null // 가장 오래된 것부터

  const newTickets = me ? gear.tickets.filter(t => t.owner_id === me.id && !t.used_at && !seenTickets.has(t.id)) : []
  // 상자가 먼저, 선물권 알림은 상자를 다 처리한 뒤에
  const showTicket = !box && !revealed && newTickets.length > 0
  // 일일권(관리자가 오늘 하루 입혀 준 아이템) 알림 — 상자·선물권 다음에 한 번
  const newTrials = me ? gear.activeTrialsOf(me.id).filter(t => !seenTrials.has(t.id)) : []
  const showTrial = !box && !revealed && !showTicket && newTrials.length > 0

  if (!me || (!box && !revealed && !showTicket && !showTrial)) return null

  function markTrialsSeen() {
    setSeenTrials(prev => {
      const next = new Set(prev)
      newTrials.forEach(t => next.add(t.id))
      try { localStorage.setItem(TRIAL_SEEN_KEY, JSON.stringify([...next])) } catch { /* 다음에 한 번 더 뜰 뿐 */ }
      return next
    })
  }

  function markTicketsSeen() {
    setSeenTickets(prev => {
      const next = new Set(prev)
      newTickets.forEach(t => next.add(t.id))
      try { localStorage.setItem(TICKET_SEEN_KEY, JSON.stringify([...next])) } catch { /* 기억 못 하면 다음에 한 번 더 뜰 뿐 */ }
      return next
    })
  }

  function dismiss(id: string) {
    setDismissed(prev => {
      const next = new Set(prev).add(id)
      try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next])) } catch { /* 숨김 기억 못 해도 동작엔 지장 없음 */ }
      return next
    })
  }

  async function open() {
    if (!box || !me || busy) return
    setBusy(true)
    setError(null)
    const res = await gear.openBox(box.id, me.id)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setRevealed(res.box)
  }

  const btnPrimary = 'text-[12.5px] font-semibold text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-lg px-4 py-1.5'

  return (
    <div className="fixed inset-0 z-[70] bg-black/25 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-[#F1E4CF] w-[320px] max-w-full p-5">
        {revealed ? (
          <BoxReveal
            box={revealed}
            senderName={nameOf(revealed.sender_id)}
            meId={me.id}
            gear={gear}
            onClose={() => setRevealed(null)}
            btnPrimary={btnPrimary}
          />
        ) : box ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-[44px] leading-none animate-bounce">🎁</span>
            <p className="text-[15px] font-bold text-[#1F2933]">
              {box.kind === 'admin' ? '관리자 선물이 도착했어요!' : `${nameOf(box.sender_id)}님이 선물 상자를 보냈어요!`}
            </p>
            {box.message && <p className="text-[12.5px] text-[#7A4B00] bg-[#FFF8E6] rounded-lg px-3 py-1.5">&ldquo;{box.message}&rdquo;</p>}
            <p className="text-[11.5px] text-[#7A8491]">⚾ KBO 구단 코스튬(모자·헬멧·유니폼·방망이·응원봉·선글라스 등) 하나가 들어 있어요</p>
            {pending.length > 1 && <p className="text-[11px] text-[#9AA5B1]">받은 상자 {pending.length}개</p>}
            <div className="flex gap-2 mt-1">
              <button onClick={() => dismiss(box.id)} className="text-[12.5px] text-[#7A8491] px-3 py-1.5">나중에</button>
              <button onClick={open} disabled={busy} className={btnPrimary}>{busy ? '여는 중…' : '열어보기'}</button>
            </div>
            {error && <p className="text-[11px] text-[#DC2626]">⚠ {error}</p>}
          </div>
        ) : showTicket ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-[44px] leading-none animate-bounce">🎟</span>
            <p className="text-[15px] font-bold text-[#1F2933]">관리자에게 선물권{newTickets.length > 1 ? ` ${newTickets.length}장` : ''}을 받았어요!</p>
            <p className="text-[12px] text-[#7A4B00] bg-[#FFF8E6] rounded-lg px-3 py-1.5">팀원에게 유니폼 상자(구단 랜덤)를 보낼 수 있어요 · 나에게는 못 써요</p>
            <p className="text-[11.5px] text-[#7A8491]">남은 선물권 {gear.ticketsOf(me.id)}장 · ⚾ 야구 → 🎁 장비에서 보낼 수 있어요</p>
            <div className="flex gap-2 mt-1">
              <button onClick={markTicketsSeen} className="text-[12.5px] text-[#7A8491] px-3 py-1.5">확인</button>
              {onOpenGear && (
                <button onClick={() => { markTicketsSeen(); onOpenGear() }} className={`${btnPrimary} !bg-[#D97706] hover:!bg-[#B45309]`}>지금 보내기</button>
              )}
            </div>
          </div>
        ) : showTrial ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-[44px] leading-none animate-bounce">🎫</span>
            <p className="text-[15px] font-bold text-[#1F2933]">관리자에게 일일권을 받았어요!</p>
            <p className="text-[12.5px] text-[#7A4B00] bg-[#FFF8E6] rounded-lg px-3 py-1.5">
              {newTrials.map(t => `${teamOf(t.team)?.name} ${partLabel(t.part)}`).join(', ')} — 지금 입혀져 있어요
            </p>
            <p className="text-[11.5px] text-[#7A8491]">오늘 자정까지만 맛보기 · 지나면 원래 장비로 돌아가요</p>
            <div className="flex gap-2 mt-1">
              <button onClick={markTrialsSeen} className="text-[12.5px] text-[#7A8491] px-3 py-1.5">확인</button>
              {onOpenGear && (
                <button onClick={() => { markTrialsSeen(); onOpenGear() }} className={`${btnPrimary} !bg-[#D97706] hover:!bg-[#B45309]`}>입은 모습 보기</button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
