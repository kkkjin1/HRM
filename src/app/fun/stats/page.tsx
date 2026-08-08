'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'

type Row = {
  date: string
  meal_payer: string | null
  meal_spun: boolean
  coffee_payer: string | null
  coffee_spun: boolean
  snack_payer: string | null
  snack_spun: boolean
  final_menu: string | null
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

export default function StatsPage() {
  const { members, loaded: membersLoaded } = useMembers()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoaded(false)
      const supabase = createClient()
      const start = `${year}-${pad(month)}-01`
      const end = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`
      const { data } = await supabase
        .from('day_state')
        .select('date, meal_payer, meal_spun, coffee_payer, coffee_spun, snack_payer, snack_spun, final_menu')
        .gte('date', start)
        .lte('date', end)
      if (active) {
        setRows((data as Row[]) ?? [])
        setLoaded(true)
      }
    })()
    return () => { active = false }
  }, [year, month])

  function prevMonth() { setMonth(m => { if (m === 1) { setYear(y => y - 1); return 12 } return m - 1 }) }
  function nextMonth() { setMonth(m => { if (m === 12) { setYear(y => y + 1); return 1 } return m + 1 }) }
  function gotoToday() { setYear(now.getFullYear()); setMonth(now.getMonth() + 1) }

  const stats = useMemo(() => {
    const paymentCounts = new Map<string, number>()
    const menuCounts = new Map<string, number>()
    let corpCount = 0

    for (const r of rows) {
      for (const payer of [r.meal_payer, r.coffee_payer, r.snack_payer]) {
        if (payer) paymentCounts.set(payer, (paymentCounts.get(payer) ?? 0) + 1)
      }
      if (r.meal_spun && !r.meal_payer) corpCount++
      if (r.coffee_spun && !r.coffee_payer) corpCount++
      if (r.snack_spun && !r.snack_payer) corpCount++
      if (r.final_menu) menuCounts.set(r.final_menu, (menuCounts.get(r.final_menu) ?? 0) + 1)
    }

    const topPayer = [...paymentCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    const topMenu = [...menuCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    const untouched = members.filter(m => !paymentCounts.has(m.id))

    return { paymentCounts, topPayer, topMenu, corpCount, untouched }
  }, [rows, members])

  function nameOf(id: string) {
    return members.find(m => m.id === id)?.name ?? '알 수 없음'
  }

  return (
    <div className="max-w-[720px] space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-[#1F1F1D]">기록</h1>
        <p className="text-[13px] text-[#6B6B66] mt-1">이번 달 룰렛과 메뉴 투표를 돌아봅니다.</p>
      </div>

      <div className="flex items-center gap-1.5">
        <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center text-[#6B6B66] hover:text-[#1F1F1D] rounded-md hover:bg-black/[0.03]">‹</button>
        <p className="text-[14px] font-medium text-[#1F1F1D] w-[92px] text-center">{year}년 {month}월</p>
        <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center text-[#6B6B66] hover:text-[#1F1F1D] rounded-md hover:bg-black/[0.03]">›</button>
        <button onClick={gotoToday} className="ml-1 text-[12px] text-[#6B6B66] hover:text-[#5B54C4] border border-[#E8E8E4] rounded-md px-2.5 py-1">이번달</button>
      </div>

      {!loaded || !membersLoaded ? (
        <p className="text-[13px] text-[#9C9C96]">불러오는 중...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-[#E8E8E4] rounded-2xl p-4">
            <p className="text-[12px] text-[#9C9C96] mb-2">최다 결제자</p>
            <p className="text-[18px] font-semibold text-[#1F1F1D]">
              {stats.topPayer ? `${nameOf(stats.topPayer[0])} (${stats.topPayer[1]}회)` : '-'}
            </p>
          </div>
          <div className="bg-white border border-[#E8E8E4] rounded-2xl p-4">
            <p className="text-[12px] text-[#9C9C96] mb-2">법인카드 당첨 횟수</p>
            <p className="text-[18px] font-semibold text-[#1F1F1D]">{stats.corpCount}회</p>
          </div>
          <div className="bg-white border border-[#E8E8E4] rounded-2xl p-4">
            <p className="text-[12px] text-[#9C9C96] mb-2">최다 메뉴</p>
            <p className="text-[18px] font-semibold text-[#1F1F1D]">
              {stats.topMenu ? `${stats.topMenu[0]} (${stats.topMenu[1]}회)` : '-'}
            </p>
          </div>
          <div className="bg-white border border-[#E8E8E4] rounded-2xl p-4">
            <p className="text-[12px] text-[#9C9C96] mb-2">아직 안 걸린 사람</p>
            <p className="text-[15px] font-medium text-[#1F1F1D]">
              {stats.untouched.length === 0 ? '없음 (모두 한 번씩 걸렸어요)' : stats.untouched.map(m => m.name).join(', ')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
