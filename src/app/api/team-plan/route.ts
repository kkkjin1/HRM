import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentMember } from '@/lib/currentMember'
import { createServiceClient } from '@/lib/supabase/service'
import {
  ACTION_FIELDS, MONTH_FIELDS, PLAN_CATEGORIES, canEditPlan, cleanPlanText, isPlanCategory, isPlanStatus, normalizeMonth,
  type BaselineMeta, type PlanAction, type PlanMonth,
} from '@/lib/team/devPlan'

// 팀 발전계획 — 월별 계획·액션·실행 기록(team_plan_months / team_plan_actions). 브라우저는 테이블을 직접 못 읽는다.
//   GET   연결된 재직 팀원 전원: 전체 월 + 액션 + 기준 회차 요약(집계만 — 응답 원문·응답자 없음)
//   POST  팀장: { op: 'add_month', month: 'YYYY-MM', theme?, core_question? } — 새 월 + 영역별 빈 액션 3개
//               { op: 'add_action', month_id, category } — 같은 영역에 액션 하나 더
//   PATCH 팀장: { target: 'month' | 'action', id, version, fields } — version이 같을 때만 고치고 1 올린다(다르면 409)
// 지우는 기능은 없다(DB 트리거도 삭제를 막는다). 멈춘 액션은 진행상태 '보류'로 둔다.

const MONTH_COLS = 'id, month, theme, core_question, next_question, learned_new, changed_view, still_unknown, baseline_round_id, version, updated_at'
const ACTION_COLS = 'id, month_id, category, focus, purpose, action_plan, evidence, status, result, learned, follow_up, sort_order, version, updated_at'

async function session() {
  const s = await getCurrentMember()
  if (!s) return { ok: false as const, res: NextResponse.json({ ok: false }, { status: 401 }) }
  if (!s.member) return { ok: false as const, res: NextResponse.json({ ok: false, error: '로그인 계정이 팀원과 연결되어 있지 않습니다' }, { status: 403 }) }
  return { ok: true as const, member: s.member }
}
const forbidden = () => NextResponse.json({ ok: false, error: '팀 발전계획은 팀장만 수정할 수 있습니다' }, { status: 403 })
const failed = () => NextResponse.json({ ok: false, error: '저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })

export async function GET() {
  const s = await session()
  if (!s.ok) return s.res
  const supabase = createServiceClient()
  const [months, actions] = await Promise.all([
    supabase.from('team_plan_months').select(MONTH_COLS).order('month', { ascending: true }),
    supabase.from('team_plan_actions').select(ACTION_COLS).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
  ])
  if (months.error || actions.error) return failed()

  const byMonth = new Map<string, PlanAction[]>()
  for (const a of (actions.data ?? []) as PlanAction[]) byMonth.set(a.month_id, [...(byMonth.get(a.month_id) ?? []), a])
  const list: PlanMonth[] = ((months.data ?? []) as Omit<PlanMonth, 'actions'>[]).map(m => ({ ...m, actions: byMonth.get(m.id) ?? [] }))

  // 기준 회차 요약 — 마감된 회차의 제목·문항 버전·마감일·명단 수·제출 수만
  const baselineIds = [...new Set(list.map(m => m.baseline_round_id).filter((v): v is string => !!v))]
  let baselines: BaselineMeta[] = []
  if (baselineIds.length) {
    const [{ data: rounds }, { data: resp }] = await Promise.all([
      supabase.from('team_rounds').select('id, title, items_version, closed_at, roster').in('id', baselineIds),
      supabase.from('team_responses').select('round_id').in('round_id', baselineIds),
    ])
    baselines = (rounds ?? []).map(r => ({
      id: r.id, title: r.title, items_version: r.items_version, closed_at: r.closed_at,
      roster_n: (r.roster ?? []).length, submitted_n: (resp ?? []).filter(x => x.round_id === r.id).length,
    }))
  }
  return NextResponse.json({ ok: true, months: list, baselines, can_edit: canEditPlan(s.member) })
}

export async function POST(request: NextRequest) {
  const s = await session()
  if (!s.ok) return s.res
  if (!canEditPlan(s.member)) return forbidden()
  const body = await request.json().catch(() => null)
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  if (body?.op === 'add_month') {
    const month = normalizeMonth(body.month)
    if (!month) return NextResponse.json({ ok: false, error: '추가할 월을 YYYY-MM 형식으로 골라 주세요' }, { status: 400 })
    const { data: exists } = await supabase.from('team_plan_months').select('id').eq('month', month).maybeSingle()
    if (exists) return NextResponse.json({ ok: false, error: '이미 있는 월입니다', id: exists.id }, { status: 409 })
    // 새 월도 직전 월과 같은 기준 회차를 잇는다(없으면 마감된 R0)
    const { data: prev } = await supabase.from('team_plan_months').select('baseline_round_id').not('baseline_round_id', 'is', null).order('month', { ascending: false }).limit(1).maybeSingle()
    let baselineId: string | null = prev?.baseline_round_id ?? null
    if (!baselineId) {
      const { data: r0 } = await supabase.from('team_rounds').select('id').eq('kind', 'baseline').not('closed_at', 'is', null).maybeSingle()
      baselineId = r0?.id ?? null
    }
    const { data: created, error } = await supabase.from('team_plan_months').insert({
      month, theme: cleanPlanText(body.theme) ?? '', core_question: cleanPlanText(body.core_question) ?? '',
      baseline_round_id: baselineId, created_by: s.member.id, updated_by: s.member.id, updated_at: now,
    }).select(MONTH_COLS).single()
    if (error || !created) return /duplicate|unique/i.test(error?.message ?? '') ? NextResponse.json({ ok: false, error: '이미 있는 월입니다' }, { status: 409 }) : failed()
    const { data: acts, error: actError } = await supabase.from('team_plan_actions')
      .insert(PLAN_CATEGORIES.map(category => ({ month_id: created.id, category, created_by: s.member.id, updated_by: s.member.id, updated_at: now })))
      .select(ACTION_COLS)
    // 월은 만들어졌으니 액션만 실패하면 알리고 월은 그대로 둔다(화면에서 액션 추가로 채울 수 있음)
    if (actError) return NextResponse.json({ ok: true, month: { ...created, actions: [] }, warning: '월은 추가했지만 기본 액션을 만들지 못했습니다. 영역별 "액션 추가"로 다시 만들어 주세요.' })
    return NextResponse.json({ ok: true, month: { ...created, actions: acts ?? [] } })
  }

  if (body?.op === 'add_action') {
    const monthId = typeof body.month_id === 'string' ? body.month_id : ''
    if (!monthId || !isPlanCategory(body.category)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
    const { data: month } = await supabase.from('team_plan_months').select('id').eq('id', monthId).maybeSingle()
    if (!month) return NextResponse.json({ ok: false, error: '월을 찾을 수 없습니다' }, { status: 404 })
    const { data: last } = await supabase.from('team_plan_actions').select('sort_order').eq('month_id', monthId).eq('category', body.category).order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const { data: created, error } = await supabase.from('team_plan_actions').insert({
      month_id: monthId, category: body.category, sort_order: (last?.sort_order ?? -1) + 1,
      created_by: s.member.id, updated_by: s.member.id, updated_at: now,
    }).select(ACTION_COLS).single()
    if (error || !created) return failed()
    return NextResponse.json({ ok: true, action: created })
  }

  return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
}

export async function PATCH(request: NextRequest) {
  const s = await session()
  if (!s.ok) return s.res
  if (!canEditPlan(s.member)) return forbidden()
  const body = await request.json().catch(() => null)
  const target = body?.target === 'month' || body?.target === 'action' ? body.target : null
  const id = typeof body?.id === 'string' ? body.id : ''
  const version = Number.isInteger(body?.version) ? body.version as number : null
  const fields = body?.fields && typeof body.fields === 'object' ? body.fields as Record<string, unknown> : null
  if (!target || !id || version === null || !fields) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  // 허용된 칸만, 정리한 값으로
  const patch: Record<string, string> = {}
  for (const key of (target === 'month' ? MONTH_FIELDS : ACTION_FIELDS) as readonly string[]) {
    if (!(key in fields)) continue
    if (key === 'status') {
      if (!isPlanStatus(fields.status)) return NextResponse.json({ ok: false, error: '진행상태는 예정·진행 중·완료·보류 중 하나입니다' }, { status: 400 })
      patch.status = fields.status
      continue
    }
    const v = cleanPlanText(fields[key])
    if (v === null) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
    patch[key] = v
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: '바꿀 내용이 없습니다' }, { status: 400 })

  const table: string = target === 'month' ? 'team_plan_months' : 'team_plan_actions'
  const cols: string = target === 'month' ? MONTH_COLS : ACTION_COLS
  const supabase = createServiceClient()
  const { data, error } = await supabase.from(table)
    .update({ ...patch, version: version + 1, updated_by: s.member.id, updated_at: new Date().toISOString() })
    .eq('id', id).eq('version', version)
    .select(cols)
    .maybeSingle()
  if (error) return failed()
  if (!data) {
    const { data: exists } = await supabase.from(table).select('id').eq('id', id).maybeSingle()
    return exists
      ? NextResponse.json({ ok: false, error: '그사이 다른 곳에서 먼저 수정했습니다. 새로고침해 최신 내용을 확인한 뒤 다시 저장해 주세요.', conflict: true }, { status: 409 })
      : NextResponse.json({ ok: false, error: '항목을 찾을 수 없습니다' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, [target]: data })
}
