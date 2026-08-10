'use client'

// 새로 온 사람이 팀 탭에서 가장 먼저 읽는 요약 카드.
// 아래 각 진단 도구(팀의 약속/Belbin/건강도)가 이미 계산한 결과를 한 문단으로 압축해서 보여준다 —
// 원본 데이터를 다시 나열하지 않고, "이 팀은 이런 팀이다"로 문장화하는 것이 이 카드의 역할이다.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { ROLE_LABEL } from '@/lib/data'
import { teamCoverage, type BelbinScores } from '@/lib/belbin'
import { layerScores, firstBrokenLayer, currentPeriod, type HealthAnswers } from '@/lib/teamHealth'

type Principle = { content: string; sort_order: number }
type BelbinRow = { member_id: string; scores: BelbinScores }
type HealthRow = { period: string; member_id: string; answers: HealthAnswers }

export default function TeamSummary() {
  const { members, loaded: membersLoaded } = useMembers()
  const [principles, setPrinciples] = useState<Principle[]>([])
  const [belbinRows, setBelbinRows] = useState<BelbinRow[]>([])
  const [healthRows, setHealthRows] = useState<HealthRow[]>([])
  const [period, setPeriod] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const [{ data: p }, { data: b }, { data: h }, { data: today }] = await Promise.all([
        supabase.from('team_principles').select('content, sort_order').order('sort_order'),
        supabase.from('belbin_responses').select('member_id, scores'),
        supabase.from('team_health_responses').select('period, member_id, answers'),
        supabase.rpc('today_date'),
      ])
      if (!active) return
      if (p) setPrinciples(p as Principle[])
      if (b) setBelbinRows(b as BelbinRow[])
      if (h) setHealthRows(h as HealthRow[])
      setPeriod(currentPeriod(today ? new Date(today as string) : new Date()))
      setLoaded(true)
    })()
    return () => { active = false }
  }, [])

  if (!loaded || !membersLoaded) return null

  const coverage = teamCoverage(belbinRows.map(r => ({ memberId: r.member_id, scores: r.scores })))
  const strongRoles = [...coverage].filter(c => c.level === 'strong').sort((a, b) => b.best - a.best).slice(0, 2)
  const gapRoles = coverage.filter(c => c.level === 'gap')

  const thisRound = healthRows.filter(r => r.period === period)
  const hScores = layerScores(thisRound.map(r => r.answers))
  const broken = firstBrokenLayer(hScores)
  const healthAnswered = thisRound.length > 0

  const roster = members.map(m => `${m.name}(${m.position || ROLE_LABEL[m.role]})`).join(', ')

  return (
    <div className="bg-[#F4F6FB] rounded-xl border border-[#E1E7F5] p-5">
      <p className="text-[11.5px] font-semibold text-[#4C7FE0] mb-2">새로 온 사람을 위한 요약</p>
      <ul className="space-y-1.5 text-[13.5px] text-[#2B333B] leading-relaxed">
        <li>• 이 팀은 <b>{members.length}명</b>입니다 — {roster}.</li>

        {principles.length > 0 ? (
          <li>• 가장 먼저 지키는 약속은 <b>“{principles[0].content}”</b>입니다{principles.length > 1 ? ` (외 ${principles.length - 1}개)` : ''}.</li>
        ) : (
          <li>• 아직 팀의 약속이 정리되지 않았습니다.</li>
        )}

        {coverage.length > 0 ? (
          <li>
            • <b>{strongRoles.map(c => c.role.name).join(', ') || '아직 뚜렷한 강점 역할 없음'}</b> 역할이 두텁고,{' '}
            {gapRoles.length > 0 ? (
              <>
                <b>{gapRoles.map(c => c.role.name).join(', ')}</b> 역할은 아직 아무도 강하게 잡고 있지 않습니다.
              </>
            ) : (
              '9개 역할 모두 최소 한 명 이상이 받치고 있습니다.'
            )}
          </li>
        ) : (
          <li>• 아직 팀 역할(Belbin) 진단 전입니다.</li>
        )}

        {healthAnswered ? (
          broken ? (
            <li>• 지금 팀이 가장 먼저 챙겨야 할 지점은 <b>{broken.layer.name}</b>입니다 — {broken.layer.symptom}</li>
          ) : (
            <li>• 팀 건강도 5개 층 모두 기준선 이상으로, 구조적으로 무너진 부분은 없습니다.</li>
          )
        ) : (
          <li>• 아직 팀 건강도 진단 전입니다.</li>
        )}
      </ul>
      <p className="text-[11px] text-[#8C9AB5] mt-3">아래에서 각 항목을 자세히 볼 수 있습니다.</p>
    </div>
  )
}
