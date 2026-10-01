'use client'

// 메인 페이지에 항상 마운트 — 나에게 안 연 야구 장비 상자가 오면(실시간) 모달로 알려준다.
// [나중에]는 이번 세션 동안만 숨김(상자는 야구 위젯 🎁 장비에 그대로 남아 있음).

import { useState } from 'react'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useBaseballGear } from '@/lib/useBaseballGear'
import { displayName } from '@/lib/members'
import { BoxReveal } from '@/components/baseball/GearBits'
import type { GiftBox } from '@/lib/baseballGear'

const DISMISS_KEY = 'hrm_gift_box_dismissed'

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export default function GiftBoxModal() {
  const { members } = useMembers()
  const { me } = useCurrentMember()
  const gear = useBaseballGear()
  const [dismissed, setDismissed] = useState<Set<string>>(() => (typeof window === 'undefined' ? new Set() : loadDismissed()))
  const [revealed, setRevealed] = useState<GiftBox | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameOf = (id: string) => displayName(members.find(m => m.id === id)) || '팀원'
  const pending = me ? gear.boxes.filter(b => b.recipient_id === me.id && !b.opened_at && !dismissed.has(b.id)) : []
  const box = pending[pending.length - 1] ?? null // 가장 오래된 것부터

  if (!me || (!box && !revealed)) return null

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
            <p className="text-[11.5px] text-[#7A8491]">⚾ 야구 장비(KBO 구단 모자·유니폼·방망이 중 하나)가 들어 있어요</p>
            {pending.length > 1 && <p className="text-[11px] text-[#9AA5B1]">받은 상자 {pending.length}개</p>}
            <div className="flex gap-2 mt-1">
              <button onClick={() => dismiss(box.id)} className="text-[12.5px] text-[#7A8491] px-3 py-1.5">나중에</button>
              <button onClick={open} disabled={busy} className={btnPrimary}>{busy ? '여는 중…' : '열어보기'}</button>
            </div>
            {error && <p className="text-[11px] text-[#DC2626]">⚠ {error}</p>}
          </div>
        ) : null}
      </div>
    </div>
  )
}
