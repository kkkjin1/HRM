import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentMember } from '@/lib/currentMember'
import { createServiceClient } from '@/lib/supabase/service'
import { ITEMS_VERSION, itemsSnapshot } from '@/lib/team/r0'
import { ROUND_TITLE, toView, type RoundKind, type RoundRow } from '@/lib/team/rounds'
import { ROUND_COLS, loadRoster } from '@/lib/team/roundsServer'

// 팀 진단 회차 목록·열기. 브라우저는 team_rounds·team_responses를 직접 읽을 수 없어서 모두 여기를 거친다.
// 마감 전 회차는 제출 인원 수와 "내가 냈는지"만, 마감 후에는 팀 집계까지 내려 준다(규칙: lib/team/rounds.ts).

export async function GET() {
  const session = await getCurrentMember()
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  if (!session.member) return NextResponse.json({ ok: false, error: '로그인 계정이 팀원과 연결되어 있지 않습니다' }, { status: 403 })
  const me = session.member

  const supabase = createServiceClient()
  const [{ data: rounds, error }, { data: submitted, error: subError }] = await Promise.all([
    supabase.from('team_rounds').select(ROUND_COLS).in('kind', ['baseline', 'periodic']).order('opened_at'),
    supabase.from('team_responses').select('round_id, member_id'),
  ])
  if (error || subError) return NextResponse.json({ ok: false, error: (error ?? subError)!.message }, { status: 500 })

  const views = (rounds as RoundRow[]).map(r => toView(r, (submitted ?? []).filter(s => s.round_id === r.id), me.id))
  return NextResponse.json({ ok: true, me: { id: me.id, role: me.role }, rounds: views })
}

// 회차 열기 — 팀장만. R0(baseline)는 한 번, 진단은 동시에 하나만(DB가 강제).
export async function POST(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  if (session.member?.role !== 'lead') return NextResponse.json({ ok: false, error: '팀장만 진단을 시작할 수 있습니다' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const kind: RoundKind | null = body?.kind === 'baseline' || body?.kind === 'periodic' ? body.kind : null
  if (!kind) return NextResponse.json({ ok: false, error: 'invalid kind' }, { status: 400 })

  const supabase = createServiceClient()
  const roster = await loadRoster(supabase)
  if ('error' in roster) return NextResponse.json({ ok: false, error: roster.error }, { status: 409 })

  const { data, error } = await supabase.rpc('team_round_open', {
    p_kind: kind, p_title: ROUND_TITLE[kind], p_items: itemsSnapshot(), p_items_version: ITEMS_VERSION,
    p_roster: roster.roster, p_closes_at: null, p_actor: session.member.id,
  })
  if (error) {
    const duplicate = error.code === '23505'
    return NextResponse.json({ ok: false, error: duplicate ? (kind === 'baseline' ? 'R0는 이미 시작했습니다' : '이미 진행 중인 진단이 있습니다') : error.message }, { status: duplicate ? 409 : 500 })
  }
  return NextResponse.json({ ok: true, id: data })
}
