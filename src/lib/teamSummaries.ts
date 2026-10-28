import { createClient } from '@/lib/supabase/client'
import type { HealthPeriodSummary } from '@/lib/teamHealth'
import type { JohariSummary } from '@/lib/johari'

// 팀 건강도·조하리는 "익명"으로 안내하고 모은 응답이라, 브라우저는 원본(작성자 포함)을 읽지 않고 DB 집계 함수만 쓴다
// (add_auth_identity.sql의 team_health_summary·johari_summary — 작성자와 응답을 잇는 값을 돌려주지 않는다).
// 함수 호출이 실패해도 원본 조회로 대신하지 않는다. null = 불러오지 못함(화면은 "불러오지 못했습니다").

export async function fetchHealthSummaries(): Promise<HealthPeriodSummary[] | null> {
  const { data, error } = await createClient().rpc('team_health_summary')
  return !error && Array.isArray(data) ? (data as HealthPeriodSummary[]) : null
}

export async function fetchJohariSummaries(): Promise<JohariSummary[] | null> {
  const { data, error } = await createClient().rpc('johari_summary')
  return !error && Array.isArray(data) ? (data as JohariSummary[]) : null
}
