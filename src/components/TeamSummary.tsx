'use client'

// 새로 온 사람이 팀 탭에서 가장 먼저 읽는 요약 카드.
// 팀원 수 / 팀의 약속 수 / 팀 건강도 / 최근 회의 — 이미 다른 곳에서 쓰고 있는 실제 데이터를
// label + value 목록으로만 압축해서 보여준다. 없는 지표를 새로 만들어내지 않는다.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAllMembers } from '@/lib/useMembers'
import { layerScoresFromSummary, overallScore, type HealthPeriodSummary } from '@/lib/teamHealth'
import { fetchHealthSummaries } from '@/lib/teamSummaries'
import type { RoundView } from '@/lib/team/rounds'
import { isV3Result } from '@/lib/team/r0'

type Principle = { id: string }

function dateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export default function TeamSummary() {
  const { members, loaded: membersLoaded } = useAllMembers()
  const [principles, setPrinciples] = useState<Principle[]>([])
  const [healthSummaries, setHealthSummaries] = useState<HealthPeriodSummary[]>([])
  const [diagnosis, setDiagnosis] = useState<RoundView | null>(null)
  const [recentMeetingCount, setRecentMeetingCount] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const now = dateStr(new Date())
      const thirtyDaysAgo = dateStr(new Date(Date.now() - 30 * 86400000))
      const [{ data: p }, h, rounds, meetingsRes] = await Promise.all([
        supabase.from('team_principles').select('id'),
        fetchHealthSummaries(),
        fetch('/api/team-rounds').then(r => r.json()).catch(() => null),
        // "최근 회의" = 지난 30일 동안 실제 열린(오늘까지) 회의 — 앞으로 예정된 고정회의는 세지 않는다.
        supabase.from('team_log_meetings').select('id', { count: 'exact', head: true }).gte('meeting_date', thirtyDaysAgo).lte('meeting_date', now),
      ])
      if (!active) return
      if (p) setPrinciples(p as Principle[])
      setHealthSummaries(h ?? [])
      // 실명 팀 진단이 마감됐으면 가장 최근 진단의 건강도를, 아니면 이전 익명 응답의 마지막 기간을 보여 준다.
      const closed = ((rounds?.rounds ?? []) as RoundView[]).filter(r => r.status === 'closed')
      setDiagnosis(closed[closed.length - 1] ?? null)
      setRecentMeetingCount(meetingsRes.count ?? null)
      setLoaded(true)
    })()
    return () => { active = false }
  }, [])

  const ready = loaded && membersLoaded

  // r0-v3 진단은 5층 건강도와 다른 문항(협업 행동 6영역)이라 한 점수로 합치거나 이전 건강도와 잇지 않는다 — 완료 사실만 보여 준다.
  const legacy = [...healthSummaries].sort((a, b) => a.period.localeCompare(b.period)).at(-1)
  const v3Done = isV3Result(diagnosis?.result)
  const legacyDiagnosis = diagnosis?.result && !isV3Result(diagnosis.result) ? diagnosis.result : null
  const items = legacyDiagnosis?.health ?? (diagnosis ? null : legacy?.items ?? null)
  const healthLabel = v3Done
    ? `협업 진단 완료 · ${new Date(diagnosis!.closed_at!).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}`
    : items
      ? `${overallScore(layerScoresFromSummary(items)).toFixed(1)} / 5${legacyDiagnosis ? '' : ' (이전 익명)'}`
      : '진단 전'

  const rows: { icon: string; label: string; value: string }[] = [
    { icon: '👥', label: '팀원 수', value: `${members.length}명` },
    { icon: '❤️', label: v3Done ? '팀 진단' : '팀 건강도', value: healthLabel },
    { icon: '🤝', label: '팀의 약속', value: `${principles.length}개` },
    { icon: '📝', label: '최근 30일 회의', value: recentMeetingCount === null ? '—' : `${recentMeetingCount}건` },
  ]

  return (
    <section aria-label="새로운 사람을 위한 요약">
      <p className="text-[12px] font-medium text-[#7A8491] mb-2">👋 새로운 사람을 위한 요약 <span className="font-normal text-[#B0B8C1]">· 이 팀의 핵심 정보</span></p>
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {rows.map(r => (
          <li key={r.label} className="bg-white rounded-2xl border border-[#EEF0F2] px-4 py-3.5 flex items-center gap-3 min-w-0">
            <span aria-hidden className="w-9 h-9 rounded-xl bg-[#F4F6FB] flex items-center justify-center text-[16px] flex-shrink-0">{r.icon}</span>
            <span className="min-w-0">
              <span className="block text-[11.5px] text-[#7A8491]">{r.label}</span>
              <span className="block text-[15px] font-semibold text-[#1F2933] truncate">{ready ? r.value : "…"}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
