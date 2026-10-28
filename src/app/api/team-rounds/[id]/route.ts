import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentMember } from '@/lib/currentMember'
import { createServiceClient } from '@/lib/supabase/service'
import { validateAnswers } from '@/lib/team/r0'
import { toDetail, type ResponseRow, type RoundRow } from '@/lib/team/rounds'
import { RESPONSE_COLS, ROUND_COLS, closeRound } from '@/lib/team/roundsServer'

// 회차 하나 — 보기(GET) / 내 응답 제출·수정(PUT) / 팀장 마감(PATCH).
// 응답 작성자는 항상 로그인 계정으로 정한 본인(member_id를 요청에서 받지 않는다).

type Ctx = { params: Promise<{ id: string }> }

async function sessionMember() {
  const session = await getCurrentMember()
  if (!session) return { ok: false as const, res: NextResponse.json({ ok: false }, { status: 401 }) }
  if (!session.member) return { ok: false as const, res: NextResponse.json({ ok: false, error: '로그인 계정이 팀원과 연결되어 있지 않습니다' }, { status: 403 }) }
  return { ok: true as const, member: session.member }
}

async function loadRound(id: string, withItems = false) {
  const supabase = createServiceClient()
  const [{ data: round }, { data: responses, error }] = await Promise.all([
    supabase.from('team_rounds').select(withItems ? `${ROUND_COLS}, items` : ROUND_COLS).eq('id', id).in('kind', ['baseline', 'periodic']).maybeSingle(),
    supabase.from('team_responses').select(RESPONSE_COLS).eq('round_id', id),
  ])
  return { supabase, round: round as RoundRow | null, responses: (responses ?? []) as ResponseRow[], error }
}

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const s = await sessionMember()
  if (!s.ok) return s.res
  const { round, responses, error } = await loadRound(id, true)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!round) return NextResponse.json({ ok: false, error: '진단을 찾을 수 없습니다' }, { status: 404 })
  return NextResponse.json({ ok: true, round: toDetail(round, responses, s.member.id), items: round.items })
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const s = await sessionMember()
  if (!s.ok) return s.res
  const { supabase, round } = await loadRound(id)
  if (!round) return NextResponse.json({ ok: false, error: '진단을 찾을 수 없습니다' }, { status: 404 })
  if (round.closed_at) return NextResponse.json({ ok: false, error: '마감된 진단은 수정할 수 없습니다' }, { status: 409 })
  if (!round.roster.includes(s.member.id)) return NextResponse.json({ ok: false, error: '이 진단의 참여자가 아닙니다' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const checked = validateAnswers(body?.answers, { selfId: s.member.id, peerIds: round.roster.filter(m => m !== s.member.id) })
  if (!checked.ok) return NextResponse.json({ ok: false, error: checked.errors[0], errors: checked.errors }, { status: 400 })

  const { data, error } = await supabase.rpc('team_round_submit', {
    p_round: id, p_member: s.member.id, p_items_version: round.items_version, p_answers: checked.answers,
  })
  if (error) {
    const closed = /round_closed/.test(error.message)
    return NextResponse.json({ ok: false, error: closed ? '마감된 진단은 수정할 수 없습니다' : error.message }, { status: closed ? 409 : 500 })
  }
  const counts = data as { submitted_n: number; roster_n: number; first: boolean }
  // 전원 제출이면 바로 마감(합의된 규칙). 마감 실패는 응답 저장과 별개로 알려 준다.
  let closed = false
  if (counts.submitted_n >= counts.roster_n) closed = (await closeRound(supabase, id, 'all_submitted', s.member.id)) === 'closed'
  return NextResponse.json({ ok: true, submitted_n: counts.submitted_n, roster_n: counts.roster_n, first: counts.first, closed })
}

// 팀장 마감.
//   R0(baseline): 명단 전원이 제출했을 때만(보통은 마지막 제출에서 자동 마감 — 예외 절차로 명단이 줄어든 뒤 남은 전원이 이미 냈을 때 쓰인다).
//                 일부만 받고 확정할 수 없다. DB 함수도 같은 규칙으로 거부한다.
//   정기 진단(periodic): 제출한 사람 기준으로 마감할 수 있다.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const s = await sessionMember()
  if (!s.ok) return s.res
  if (s.member.role !== 'lead') return NextResponse.json({ ok: false, error: '팀장만 마감할 수 있습니다' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (body?.action !== 'close') return NextResponse.json({ ok: false, error: 'invalid action' }, { status: 400 })

  const { supabase, round, responses } = await loadRound(id)
  if (!round) return NextResponse.json({ ok: false, error: '진단을 찾을 수 없습니다' }, { status: 404 })
  if (round.closed_at) return NextResponse.json({ ok: true, status: 'already_closed' })
  if (responses.length === 0) return NextResponse.json({ ok: false, error: '응답이 하나도 없어 마감할 수 없습니다' }, { status: 409 })
  const everyone = round.roster.every(m => responses.some(r => r.member_id === m))
  if (round.kind === 'baseline' && !everyone) {
    return NextResponse.json({ ok: false, error: 'R0는 참여자 전원이 제출해야 마감됩니다' }, { status: 409 })
  }
  const status = await closeRound(supabase, id, everyone ? 'all_submitted' : 'manual', s.member.id)
  if (status === 'not_all_submitted') return NextResponse.json({ ok: false, error: 'R0는 참여자 전원이 제출해야 마감됩니다' }, { status: 409 })
  if (status !== 'closed' && status !== 'already_closed') return NextResponse.json({ ok: false, error: '마감하지 못했습니다. 다시 시도해 주세요' }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}
