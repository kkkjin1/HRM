'use client'

// 오늘의 운세 — 예전엔 팀 운세(TeamLottery) 카드 오른쪽 칸이었는데, 홈 1행의 한 칸으로 따로 뺐다.
// 기분 투표와 무관하게 서버 날짜(일진)만으로 정해져서 블러 없이 바로 보인다.
// 1행 높이는 옆 칸(팀 운명·연상퀴즈)이 정해서 꽤 높다 — 위(제목) · 가운데(총운, 크게) · 아래(행운의 색/아이템 타일 + 한마디)로
// 높이 전체를 나눠 쓴다.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ganzhiIndexOf, ganzhiNameOf, GANZHI_FORTUNES, colorHexOf, itemEmojiOf } from '@/lib/ganzhi'

export default function DailyFortuneCard() {
  const [today, setToday] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    createClient().rpc('today_date').then(({ data }) => { if (active && data) setToday(data as string) })
    return () => { active = false }
  }, [])

  const idx = useMemo(() => (today ? ganzhiIndexOf(today) : 0), [today])
  const fortune = GANZHI_FORTUNES[idx]

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E8E8E4] bg-white p-5 h-full flex flex-col">
      <span aria-hidden className="pointer-events-none select-none absolute -right-6 -top-6 text-[120px] opacity-[0.07]">🔮</span>
      {!today ? (
        <p className="text-[13px] text-[#9C7A1E]">불러오는 중...</p>
      ) : (
        <div className="relative z-10 flex-1 flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-shrink-0">
            <p className="text-[14px] font-semibold text-[#1F1F1D]">🔮 오늘의 운세</p>
            <span className="text-[11px] font-medium text-[#9C7A1E] bg-[#FFF4DB] rounded-full px-2 py-0.5">{ganzhiNameOf(idx)}일</span>
          </div>

          <div className="flex-1 flex items-center justify-center text-center px-1">
            <p className="text-[20px] leading-snug font-black text-[#7A4A00] break-keep">{fortune.general}</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 flex-shrink-0">
            <div className="bg-[#FFF8E8] rounded-xl px-3 py-4 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full ring-1 ring-black/10 shadow-sm flex-shrink-0" style={{ background: colorHexOf(fortune.color) }} />
              <div className="leading-tight min-w-0">
                <p className="text-[10.5px] text-[#9C7A1E]">행운의 색</p>
                <p className="text-[13.5px] font-semibold text-[#1F1F1D] truncate">{fortune.color}</p>
              </div>
            </div>
            <div className="bg-[#FFF8E8] rounded-xl px-3 py-4 flex items-center gap-2.5">
              <span className="text-[26px] leading-none flex-shrink-0">{itemEmojiOf(fortune.item)}</span>
              <div className="leading-tight min-w-0">
                <p className="text-[10.5px] text-[#9C7A1E]">행운의 아이템</p>
                <p className="text-[13.5px] font-semibold text-[#1F1F1D] truncate">{fortune.item}</p>
              </div>
            </div>
          </div>

          <p className="text-[12.5px] text-[#7A4A00] bg-[#FFE29A]/50 rounded-lg px-3 py-3.5 leading-relaxed flex-shrink-0">💡 {fortune.advice}</p>
        </div>
      )}
    </div>
  )
}
