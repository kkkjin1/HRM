import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'
import { GOAL_LEVEL_LABEL, PARENT_LEVEL, isGoalLevel } from '@/lib/goalLevels'

const DEFAULT_ICON = '🎯'

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_goals')
    .select('id, name, level, parent_id, year, half, quarter, month, icon, description, sort_order, created_at')
    .order('sort_order')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, goals: data ?? [] })
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 100) : ''
  const level = body?.level
  if (!name || !isGoalLevel(level)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const icon = typeof body?.icon === 'string' && body.icon.trim() ? body.icon.trim().slice(0, 8) : DEFAULT_ICON
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 500) : ''

  const supabase = createServiceClient()
  const requiredParentLevel = PARENT_LEVEL[level]
  let parentId: string | null = null
  let year: number

  if (requiredParentLevel) {
    parentId = typeof body?.parent_id === 'string' ? body.parent_id : ''
    if (!parentId) return NextResponse.json({ ok: false, error: `상위 ${GOAL_LEVEL_LABEL[requiredParentLevel]} 목표를 선택해주세요.` }, { status: 400 })

    const { data: parent, error: parentErr } = await supabase
      .from('team_log_goals').select('id, level, year').eq('id', parentId).single()
    if (parentErr || !parent) return NextResponse.json({ ok: false, error: '상위 목표를 찾을 수 없습니다.' }, { status: 400 })
    if (parent.level !== requiredParentLevel) {
      return NextResponse.json({ ok: false, error: `${GOAL_LEVEL_LABEL[level]} 목표의 상위는 ${GOAL_LEVEL_LABEL[requiredParentLevel]} 목표여야 합니다.` }, { status: 400 })
    }
    year = parent.year
  } else {
    year = Number(body?.year)
    if (!Number.isInteger(year)) return NextResponse.json({ ok: false, error: '연도를 입력해주세요.' }, { status: 400 })
  }

  let half: string | null = null
  let quarter: number | null = null
  let month: number | null = null
  if (level === 'half') {
    half = body?.half === 'h1' || body?.half === 'h2' ? body.half : ''
    if (!half) return NextResponse.json({ ok: false, error: '상반기/하반기를 선택해주세요.' }, { status: 400 })
  } else if (level === 'quarter') {
    quarter = Number(body?.quarter)
    if (![1, 2, 3, 4].includes(quarter)) return NextResponse.json({ ok: false, error: '분기를 선택해주세요.' }, { status: 400 })
  } else if (level === 'month') {
    month = Number(body?.month)
    if (!Number.isInteger(month) || month < 1 || month > 12) return NextResponse.json({ ok: false, error: '월을 선택해주세요.' }, { status: 400 })
  }

  let countQuery = supabase.from('team_log_goals').select('id', { count: 'exact', head: true })
  countQuery = parentId ? countQuery.eq('parent_id', parentId) : countQuery.is('parent_id', null).eq('year', year)
  const { count } = await countQuery

  const { data, error } = await supabase
    .from('team_log_goals')
    .insert({ name, level, parent_id: parentId, year, half, quarter, month, icon, description, sort_order: count ?? 0 })
    .select('id, name, level, parent_id, year, half, quarter, month, icon, description, sort_order, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, goal: data })
}
