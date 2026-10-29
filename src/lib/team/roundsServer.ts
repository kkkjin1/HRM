import type { SupabaseClient } from '@supabase/supabase-js'
import { computeRoundResult } from '@/lib/team/r0'
import type { ResponseRow, RoundRow } from '@/lib/team/rounds'

// 서버 전용 — service role 클라이언트로만 부른다(브라우저는 이 테이블들을 직접 읽거나 쓸 수 없다).

export const ROUND_COLS = 'id, kind, title, items_version, roster, opened_at, closes_at, closed_at, close_reason, result'
export const RESPONSE_COLS = 'member_id, answers, submitted_at, updated_at'

// 한국 시간 오늘(입사일 비교용)
export function seoulToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// 회차 참여자 = 오늘 기준 재직(퇴사 안 함·입사일 지남) 팀원. 로그인 계정이 연결 안 된 사람이 있으면 열지 않는다(응답할 수 없으므로).
export async function loadRoster(supabase: SupabaseClient, today = seoulToday()) {
  const { data, error } = await supabase.from('members').select('id, name, hired_at, left_at, auth_user_id')
  if (error || !data) return { error: error?.message ?? '팀원을 불러오지 못했습니다' } as const
  const active = data.filter(m => !m.left_at && (!m.hired_at || m.hired_at <= today))
  const unlinked = active.filter(m => !m.auth_user_id)
  if (unlinked.length) return { error: `로그인 계정이 연결되지 않은 팀원이 ${unlinked.length}명 있습니다. 팀원 관리에서 먼저 연결해 주세요.` } as const
  return { roster: active.map(m => m.id as string) } as const
}

// 마감: 응답을 읽어 팀 집계를 계산한 뒤 DB 함수로 고정한다. 그 사이 응답이 바뀌면 함수가 'stale'을 돌려주므로 다시 계산한다.
export async function closeRound(supabase: SupabaseClient, roundId: string, reason: 'all_submitted' | 'manual', actorId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ data: round }, { data: rows, error }] = await Promise.all([
      supabase.from('team_rounds').select(ROUND_COLS).eq('id', roundId).maybeSingle(),
      supabase.from('team_responses').select(RESPONSE_COLS).eq('round_id', roundId),
    ])
    if (!round) return 'not_found' as const
    if (error || !rows) return 'error' as const
    const responses = rows as ResponseRow[]
    const result = computeRoundResult(responses.map(r => ({ member_id: r.member_id, answers: r.answers })), (round as RoundRow).roster, (round as RoundRow).items_version)
    const asOf = responses.reduce((max, r) => {
      const t = r.updated_at ?? r.submitted_at
      return t > max ? t : max
    }, '1970-01-01T00:00:00Z')
    const { data: status, error: rpcError } = await supabase.rpc('team_round_close', {
      p_round: roundId, p_reason: reason, p_result: result, p_as_of: asOf, p_n: responses.length, p_actor: actorId,
    })
    if (rpcError) return 'error' as const
    if (status !== 'stale') return status as 'closed' | 'already_closed' | 'not_found' | 'not_all_submitted' | 'no_responses'
  }
  return 'stale' as const
}
