'use client'

// 업무 > 연간계획 (2026-11-09) — 루틴 안에 있던 "연간" 화면을 따로 빼고, 예전 "목표" 탭을 흡수했다.
// [📅 연간 업무] = YearlyCalendar(카드·범주표·월 미정 보관함) · [🎯 목표] = GoalsPanel(연간·반기·분기·월 목표, 목표 맵)
// 예전 목표 탭 주소(section 'goals')가 그대로 이 화면이라, 다른 곳에서 목표로 넘어오는 링크도 여기로 온다.

import { useEffect, useState } from 'react'
import YearlyCalendar from '@/components/YearlyCalendar'
import GoalsPanel from '@/components/goals/GoalsPanel'

type PlanView = 'tasks' | 'goals'
const VIEW_KEY = 'hrm_year_plan_view'

export default function YearPlanPanel() {
  const [view, setView] = useState<PlanView>('tasks')
  // 마지막에 보던 쪽 — 서버 렌더와 어긋나지 않게 마운트 뒤에 읽는다
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장값은 마운트 뒤에만 읽을 수 있다
      if (window.localStorage.getItem(VIEW_KEY) === 'goals') setView('goals')
    } catch {}
  }, [])
  function pick(v: PlanView) {
    setView(v)
    try { window.localStorage.setItem(VIEW_KEY, v) } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-[17px] font-semibold text-[#1F2933]">연간계획</h1>
          <p className="text-[12.5px] text-[#7A8491] mt-0.5">
            {view === 'tasks' ? '연간 중요 업무를 월별·범주별로 정리해보세요.' : '연간 · 반기 · 분기 · 월 목표를 관리하세요.'}
          </p>
        </div>
        <div className="flex items-center gap-0.5 bg-[#F1F3F5] rounded-lg p-0.5 flex-shrink-0">
          {([['tasks', '📅 연간 업무'], ['goals', '🎯 목표']] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => pick(v)}
              className={`text-[12.5px] font-medium px-3 py-1.5 rounded-md transition-colors ${view === v ? 'bg-white text-[#1F2933] shadow-sm' : 'text-[#7A8491] hover:text-[#1F2933]'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'tasks' ? <YearlyCalendar /> : <GoalsPanel hideTitle />}
    </div>
  )
}
