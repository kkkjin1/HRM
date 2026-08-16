'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import LadderPopup, { type LadderCandidate } from '@/components/LadderPopup'
import type { Member } from '@/lib/members'

const CUISINES: LadderCandidate[] = [
  { name: '한식', icon: '🍚', score: 1 },
  { name: '중식', icon: '🥢', score: 1 },
  { name: '일식', icon: '🍱', score: 1 },
  { name: '동남아', icon: '🍜', score: 1 },
  { name: '양식', icon: '🍝', score: 1 },
]

function getTodayPicker(members: Member[], dateStr: string): Member | null {
  if (members.length === 0) return null
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id))
  const n = dateStr.replace(/-/g, '').split('').reduce((s, c) => s + Number(c), 0)
  return sorted[n % sorted.length]
}

export default function LunchLadder() {
  const { members, loaded } = useMembers()
  const { me } = useCurrentMember()
  const [today, setToday] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [ladder, setLadder] = useState<{ candidates: LadderCandidate[]; winner: string } | null>(null)
  const [spinning, setSpinning] = useState(false)
  const todayRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data: dateData } = await supabase.rpc('today_date')
      const dateStr = dateData as string | null
      if (!dateStr) return
      todayRef.current = dateStr

      const { data } = await supabase
        .from('day_state')
        .select('lunch_menu')
        .eq('date', dateStr)
        .maybeSingle()

      if (!active) return
      setToday(dateStr)
      const row = data as Record<string, unknown> | null
      setResult((row?.lunch_menu as string) ?? null)
    })()

    const channel = supabase
      .channel('lunch-ladder')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_state' }, payload => {
        const row = payload.new as Record<string, unknown> | undefined
        if (!row || row.date !== todayRef.current) return
        if (row.lunch_menu) setResult(row.lunch_menu as string)
      })
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [])

  async function handleSpin() {
    if (!today || !me || spinning) return
    setSpinning(true)

    const winner = CUISINES[Math.floor(Math.random() * CUISINES.length)].name
    const supabase = createClient()
    await supabase.from('day_state').upsert({ date: today, lunch_menu: winner })

    setLadder({ candidates: CUISINES, winner })
    setSpinning(false)
  }

  const picker = loaded && today ? getTodayPicker(members, today) : null
  const isMyTurn = !!(me && picker && me.id === picker.id)
  const cuisine = CUISINES.find(c => c.name === result)

  if (!loaded) return null

  return (
    <div className="bg-white border border-[#E8E8E4] rounded-2xl p-5 flex flex-col gap-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-[#1F1F1D]">🍽️ 오늘의 메뉴</span>
        {picker && (
          <div className="flex items-center gap-1.5 bg-[#EEEDFE] rounded-full px-3 py-1">
            <span className="text-[11px] text-[#9C9C96]">오늘의 주인공</span>
            <span className="text-[12px] font-semibold text-[#5B54C4]">{picker.name}</span>
          </div>
        )}
      </div>

      {/* 음식 카테고리 5개 */}
      <div className="flex gap-2 flex-wrap">
        {CUISINES.map(c => (
          <div
            key={c.name}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
              result === c.name
                ? 'bg-[#5B54C4] text-white'
                : 'bg-[#F7F7F5] text-[#4B4B46]'
            }`}
          >
            <span className="text-[15px]">{c.icon}</span>
            <span className="text-[12px] font-medium">{c.name}</span>
          </div>
        ))}
      </div>

      {/* 결과 or 버튼 */}
      {result ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#9C9C96] mb-0.5">오늘의 점심</p>
            <p className="text-[18px] font-bold text-[#1F1F1D]">
              {cuisine?.icon} {result}
            </p>
          </div>
          <p className="text-[11px] text-[#9C9C96]">{picker?.name}님이 뽑았어요 🎉</p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          {isMyTurn ? (
            <button
              onClick={handleSpin}
              disabled={spinning}
              className="text-[13px] font-medium text-white bg-[#5B54C4] hover:bg-[#4A44A8] disabled:opacity-50 rounded-lg px-5 py-2"
            >
              {spinning ? '결정 중...' : '사다리 돌리기 🎲'}
            </button>
          ) : (
            <p className="text-[13px] text-[#9C9C96]">
              {picker ? `${picker.name}님이 사다리를 선택하는 중...` : '잠시 기다려주세요'}
            </p>
          )}
          <span className="text-[11px] text-[#C0C0BB]">오늘 아직 미결정</span>
        </div>
      )}

      {ladder && (
        <LadderPopup
          candidates={ladder.candidates}
          winner={ladder.winner}
          onClose={() => setLadder(null)}
        />
      )}
    </div>
  )
}
