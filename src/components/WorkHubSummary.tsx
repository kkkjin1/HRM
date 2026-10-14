'use client'

// 업무 허브 첫 화면 "요약" — 오늘 팀 일정·다가오는 보고·지금 기간의 목표·최근 아카이빙을 박스로 모아 보여주고,
// 박스 제목을 누르면 해당 서브탭(팀 일정/R&R/목표·회고/아카이빙)으로 넘어간다.
// 일정·회의·보고일정은 page가 이미 들고 있는 값을 받고, 목표·아카이빙은 여기서 처음 열 때 한 번 불러온다.

import { useEffect, useState } from 'react'
import { GOAL_LEVEL_LABEL, type GoalLevel } from '@/lib/goalLevels'
import { ARCHIVE_CATEGORY_COLOR, type ArchiveCase } from '@/lib/archiveCategories'
import type { Goal } from '@/components/goals/types'

export type HubTab = 'summary' | 'tasks' | 'schedule' | 'routine' | 'goals' | 'archiving'

type TodayEvent = { id: string; title: string; assignee: string; tag: string | null }
type TodayMeeting = { id: string; title: string; meeting_time: string }
type UpcomingReport = { id: string; title: string; entry_date: string; author: string; itemTitle: string }

type Props = {
  today: string
  todayEvents: TodayEvent[]
  todayMeetings: TodayMeeting[]
  upcomingReports: UpcomingReport[]
  onGo: (tab: HubTab) => void
  onOpenMeeting: (meetingId: string) => void
}

// 오늘이 속한 기간의 목표 — 연간(올해) · 반기 · 분기 · 월. 짧은 기간(이번 달)부터 보여준다.
const LEVEL_ORDER: GoalLevel[] = ['month', 'quarter', 'half', 'yearly']
function isCurrentGoal(g: Goal, year: number, month: number) {
  if (g.year !== year) return false
  if (g.level === 'yearly') return true
  if (g.level === 'half') return g.half === (month <= 6 ? 'h1' : 'h2')
  if (g.level === 'quarter') return g.quarter === Math.ceil(month / 3)
  return g.month === month
}

function fmtMd(d: string) {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
}

function Box({ title, onTitle, children, empty }: { title: string; onTitle: () => void; children: React.ReactNode; empty: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 flex flex-col min-h-[180px]">
      <button type="button" onClick={onTitle} className="flex items-center justify-between gap-2 mb-2.5 text-left group">
        <span className="text-[13px] font-semibold text-[#1F2933]">{title}</span>
        <span className="text-[11.5px] text-[#9AA3AE] group-hover:text-[#4C7FE0]">전체 보기 →</span>
      </button>
      {empty ? <p className="text-[12.5px] text-[#B0B8C1] py-4">없습니다.</p> : children}
    </div>
  )
}

export default function WorkHubSummary({ today, todayEvents, todayMeetings, upcomingReports, onGo, onOpenMeeting }: Props) {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [cases, setCases] = useState<ArchiveCase[] | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/goals').then(r => r.json()).then(j => { if (active) setGoals(j.ok ? j.goals : []) }).catch(() => { if (active) setGoals([]) })
    fetch('/api/archive-cases').then(r => r.json()).then(j => { if (active) setCases(j.ok ? j.cases : []) }).catch(() => { if (active) setCases([]) })
    return () => { active = false }
  }, [])

  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const currentGoals = (goals ?? [])
    .filter(g => isCurrentGoal(g, year, month))
    .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || a.sort_order - b.sort_order)
    .slice(0, 6)
  const recentCases = (cases ?? []).slice(0, 5)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
      <Box title={`오늘 팀 일정 · ${fmtMd(today)}`} onTitle={() => onGo('schedule')} empty={todayEvents.length === 0 && todayMeetings.length === 0}>
        <ul className="space-y-1.5">
          {todayMeetings.map(m => (
            <li key={m.id}>
              <button type="button" onClick={() => onOpenMeeting(m.id)} className="w-full flex items-center gap-2 text-left text-[13px] hover:bg-[#F7F8F8] rounded-md px-1 py-0.5">
                <span className="text-[10.5px] font-medium text-[#5C8A38] bg-[#E5F3D3] rounded-full px-2 py-0.5 flex-shrink-0">회의{m.meeting_time ? ` ${m.meeting_time}` : ''}</span>
                <span className="text-[#1F2933] truncate">{m.title}</span>
              </button>
            </li>
          ))}
          {todayEvents.map(ev => (
            <li key={ev.id} className="flex items-center gap-2 text-[13px] px-1 py-0.5">
              {ev.tag && <span className="text-[10.5px] font-medium text-[#4C7FE0] bg-[#4C7FE0]/10 rounded-full px-2 py-0.5 flex-shrink-0">{ev.tag}</span>}
              <span className="text-[#1F2933] truncate flex-1">{ev.title}</span>
              <span className="text-[11.5px] text-[#9AA3AE] flex-shrink-0">{ev.assignee}</span>
            </li>
          ))}
        </ul>
      </Box>

      <Box title="다가오는 보고일정" onTitle={() => onGo('tasks')} empty={upcomingReports.length === 0}>
        <ul className="space-y-1.5">
          {upcomingReports.map(s => (
            <li key={s.id} className="flex items-center gap-2 text-[13px] px-1 py-0.5">
              <span className="text-[10.5px] font-medium text-[#4C7FE0] bg-[#4C7FE0]/10 rounded-full px-2 py-0.5 flex-shrink-0">{fmtMd(s.entry_date)}</span>
              <span className="text-[#1F2933] truncate flex-1">{s.title}</span>
              <span className="text-[11.5px] text-[#9AA3AE] flex-shrink-0 truncate max-w-[45%]">{s.author} · {s.itemTitle}</span>
            </li>
          ))}
        </ul>
      </Box>

      <Box title="지금 기간의 목표" onTitle={() => onGo('goals')} empty={goals !== null && currentGoals.length === 0}>
        {goals === null ? <p className="text-[12.5px] text-[#B0B8C1] py-4">불러오는 중…</p> : (
          <ul className="space-y-1.5">
            {currentGoals.map(g => (
              <li key={g.id} className="flex items-center gap-2 text-[13px] px-1 py-0.5">
                <span className="w-5 text-center flex-shrink-0">{g.icon}</span>
                <span className="text-[#1F2933] truncate flex-1">{g.name}</span>
                <span className="text-[11px] text-[#9AA3AE] flex-shrink-0">{GOAL_LEVEL_LABEL[g.level]}</span>
              </li>
            ))}
          </ul>
        )}
      </Box>

      <Box title="최근 아카이빙" onTitle={() => onGo('archiving')} empty={cases !== null && recentCases.length === 0}>
        {cases === null ? <p className="text-[12.5px] text-[#B0B8C1] py-4">불러오는 중…</p> : (
          <ul className="space-y-1.5">
            {recentCases.map(c => (
              <li key={c.id} className="flex items-center gap-2 text-[13px] px-1 py-0.5">
                <span className="text-[10.5px] font-medium rounded-full px-2 py-0.5 flex-shrink-0" style={{ color: ARCHIVE_CATEGORY_COLOR[c.category], backgroundColor: `${ARCHIVE_CATEGORY_COLOR[c.category]}1A` }}>{c.category}</span>
                <span className="text-[#1F2933] truncate flex-1">{c.title}</span>
                <span className="text-[11px] text-[#9AA3AE] flex-shrink-0">{fmtMd(c.created_at.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        )}
      </Box>
    </div>
  )
}
