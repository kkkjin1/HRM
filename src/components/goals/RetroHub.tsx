'use client'

// 업무 > 회고 — 예전엔 목표 화면 안의 보기 하나였는데, 루틴·아카이빙처럼 업무 서브탭 층위로 올렸다.
// 연도만 고르고 내용은 RetroPanel이 그대로 그린다.

import { useState } from 'react'
import RetroPanel from './RetroPanel'

export default function RetroHub() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-[17px] font-semibold text-[#1F2933]">회고</h1>
          <p className="text-[12.5px] text-[#7A8491] mt-0.5">월별 팀·개인 회고를 기록하고 함께 돌아보세요.</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">‹</button>
          <p className="text-[13px] font-medium text-[#1F2933] w-[64px] text-center">{year}년</p>
          <button onClick={() => setYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">›</button>
        </div>
      </div>
      <RetroPanel year={year} />
    </div>
  )
}
