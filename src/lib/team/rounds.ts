// 진단 회차 — 열람 규칙과 화면에 내려 줄 모양. 서버(/api/team-rounds)와 화면이 같은 타입을 쓴다.
// 열람 규칙(팀장 포함 모두 같다):
//   마감 전 — 내 응답 + 제출 인원 수만. 누가 냈는지, 다른 사람이 뭐라고 답했는지는 내려 주지 않는다.
//   마감 후 — 팀 집계(result)와 개인별 응답 전체(실명).

import type { AnyAnswers, AnyRoundResult } from '@/lib/team/r0'

export type RoundKind = 'baseline' | 'periodic'

export type RoundRow = {
  id: string; kind: RoundKind; title: string; items_version: string; roster: string[]
  opened_at: string; closes_at: string | null; closed_at: string | null; close_reason: string | null
  result: AnyRoundResult | null; items?: unknown
}
export type ResponseRow = { member_id: string; answers: AnyAnswers; submitted_at: string; updated_at: string | null }

export type RoundView = {
  id: string; kind: RoundKind; title: string; items_version: string; roster: string[]
  opened_at: string; closed_at: string | null; close_reason: string | null
  status: 'open' | 'closed'
  roster_n: number; submitted_n: number; my_submitted: boolean; in_roster: boolean
  result: AnyRoundResult | null
}
export type RoundDetail = RoundView & {
  my_response: ResponseRow | null
  responses: ResponseRow[] | null            // 마감 후에만
}

export function toView(round: RoundRow, responses: Pick<ResponseRow, 'member_id'>[], viewerId: string): RoundView {
  const closed = !!round.closed_at
  return {
    id: round.id, kind: round.kind, title: round.title, items_version: round.items_version, roster: round.roster,
    opened_at: round.opened_at, closed_at: round.closed_at, close_reason: round.close_reason,
    status: closed ? 'closed' : 'open',
    roster_n: round.roster.length,
    submitted_n: responses.length,
    my_submitted: responses.some(r => r.member_id === viewerId),
    in_roster: round.roster.includes(viewerId),
    result: closed ? round.result : null,
  }
}

export function toDetail(round: RoundRow, responses: ResponseRow[], viewerId: string): RoundDetail {
  const closed = !!round.closed_at
  return {
    ...toView(round, responses, viewerId),
    my_response: responses.find(r => r.member_id === viewerId) ?? null,
    responses: closed ? responses : null,
  }
}

export const ROUND_TITLE: Record<RoundKind, string> = {
  baseline: 'R0 최초 팀 진단',
  periodic: '정기 팀 진단',
}
