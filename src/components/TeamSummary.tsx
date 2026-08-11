'use client'

// 새로 온 사람이 팀 탭에서 가장 먼저 읽는 요약 카드.
// 팀원 수 / 팀의 약속 수 / 팀 건강도 / 최근 회의 — 이미 다른 곳에서 쓰고 있는 실제 데이터를
// label + value 목록으로만 압축해서 보여준다. 없는 지표를 새로 만들어내지 않는다.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { layerScores, overallScore, currentPeriod, type HealthAnswers } from '@/lib/teamHealth'

type Principle = { id: string }
type HealthRow = { period: string; answers: HealthAnswers }

function dateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export default function TeamSummary() {
  const { members, loaded: membersLoaded } = useMembers()
  const [principles, setPrinciples] = useState<Principle[]>([])
  const [healthRows, setHealthRows] = useState<HealthRow[]>([])
  const [period, setPeriod] = useState<string | null>(null)
  const [recentMeetingCount, setRecentMeetingCount] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const now = dateStr(new Date())
      const thirtyDaysAgo = dateStr(new Date(Date.now() - 30 * 86400000))
      const [{ data: p }, { data: h }, { data: today }, meetingsRes] = await Promise.all([
        supabase.from('team_principles').select('id'),
        supabase.from('team_health_responses').select('period, answers'),
        supabase.rpc('today_date'),
        // "최근 회의" = 지난 30일 동안 실제 열린(오늘까지) 회의 — 앞으로 예정된 고정회의는 세지 않는다.
        supabase.from('team_log_meetings').select('id', { count: 'exact', head: true }).gte('meeting_date', thirtyDaysAgo).lte('meeting_date', now),
      ])
      if (!active) return
      if (p) setPrinciples(p as Principle[])
      if (h) setHealthRows(h as HealthRow[])
      setPeriod(currentPeriod(today ? new Date(today as string) : new Date()))
      setRecentMeetingCount(meetingsRes.count ?? null)
      setLoaded(true)
    })()
    return () => { active = false }
  }, [])

  if (!loaded || !membersLoaded) return null

  const thisRound = healthRows.filter(r => r.period === period)
  const hScores = layerScores(thisRound.map(r => r.answers))
  const healthAnswered = thisRound.length > 0
  const healthLabel = healthAnswered ? `${overallScore(hScores).toFixed(1)} / 5` : '진단 전'

  const rows: { icon: string; label: string; value: string }[] = [
    { icon: '👥', label: '팀원 수', value: `${members.length}명` },
    { icon: '❤️', label: '팀 건강도', value: healthLabel },
    { icon: '🤝', label: '팀의 약속', value: `${principles.length}개` },
    { icon: '📝', label: '최근 회의', value: recentMeetingCount === null ? '—' : `${recentMeetingCount}건` },
  ]

  return (
    <div className="bg-[#F4F6FB] rounded-2xl border border-[#E1E7F5] p-5">
      <p className="text-[13px] font-semibold text-[#2B333B]">👋 새로운 사람을 위한 요약</p>
      <p className="text-[11.5px] text-[#7A8AAE] mt-0.5 mb-4">이 팀의 핵심 정보를 한눈에 확인해보세요.</p>

      <ul className="space-y-2.5">
        {rows.map(r => (
          <li key={r.label} className="flex items-center justify-between text-[13px]">
            <span className="flex items-center gap-2 text-[#5B6472]">
              <span aria-hidden className="text-[13px] opacity-80">{r.icon}</span>
              {r.label}
            </span>
            <span className="font-semibold text-[#1F2933]">{r.value}</span>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-[#8C9AB5] mt-4 pt-3 border-t border-[#E1E7F5]">아래에서 각 항목을 자세히 볼 수 있습니다.</p>
    </div>
  )
}
