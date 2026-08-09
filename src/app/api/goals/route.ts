import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'
import { isGoalLevel } from '@/lib/goalLevels'

const DEFAULT_ICON = '🎯'
const SELECT_COLUMNS = 'id, name, level, year, half, quarter, month, icon, description, sort_order, created_at'

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_goals').select(SELECT_COLUMNS).order('sort_order')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, goals: data ?? [] })
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 100) : ''
  const level = body?.level
  const year = Number(body?.year)
  if (!name || !isGoalLevel(level) || !Number.isInteger(year)) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  const icon = typeof body?.icon === 'string' && body.icon.trim() ? body.icon.trim().slice(0, 8) : DEFAULT_ICON
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 500) : ''

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

  const supabase = createServiceClient()
  let countQuery = supabase.from('team_log_goals').select('id', { count: 'exact', head: true }).eq('level', level).eq('year', year)
  if (level === 'half') countQuery = countQuery.eq('half', half)
  if (level === 'quarter') countQuery = countQuery.eq('quarter', quarter)
  if (level === 'month') countQuery = countQuery.eq('month', month)
  const { count } = await countQuery

  const { data, error } = await supabase
    .from('team_log_goals')
    .insert({ name, level, year, half, quarter, month, icon, description, sort_order: count ?? 0 })
    .select(SELECT_COLUMNS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, goal: data })
}
