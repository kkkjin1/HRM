import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'
import { isGoalLevel, type GoalLevel } from '@/lib/goalLevels'

const SELECT_COLUMNS = 'id, name, level, year, half, quarter, month, icon, description, sort_order, created_at'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })
  const { id } = await params

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: current, error: curErr } = await supabase.from('team_log_goals').select(SELECT_COLUMNS).eq('id', id).single()
  if (curErr || !current) return NextResponse.json({ ok: false, error: '목표를 찾을 수 없습니다.' }, { status: 404 })

  const update: Record<string, unknown> = {}
  const isFullEdit = typeof body.name === 'string' || isGoalLevel(body.level)

  if (isFullEdit) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : ''
    if (!name) return NextResponse.json({ ok: false, error: '목표명을 입력해주세요.' }, { status: 400 })

    const level: GoalLevel = isGoalLevel(body.level) ? body.level : current.level
    const year = Number(body.year ?? current.year)
    if (!Number.isInteger(year)) return NextResponse.json({ ok: false, error: '연도를 입력해주세요.' }, { status: 400 })

    let half: string | null = null
    let quarter: number | null = null
    let month: number | null = null
    if (level === 'half') {
      half = body.half === 'h1' || body.half === 'h2' ? body.half : ''
      if (!half) return NextResponse.json({ ok: false, error: '상반기/하반기를 선택해주세요.' }, { status: 400 })
    } else if (level === 'quarter') {
      quarter = Number(body.quarter)
      if (![1, 2, 3, 4].includes(quarter)) return NextResponse.json({ ok: false, error: '분기를 선택해주세요.' }, { status: 400 })
    } else if (level === 'month') {
      month = Number(body.month)
      if (!Number.isInteger(month) || month < 1 || month > 12) return NextResponse.json({ ok: false, error: '월을 선택해주세요.' }, { status: 400 })
    }

    Object.assign(update, {
      name, level, year, half, quarter, month,
      icon: typeof body.icon === 'string' && body.icon.trim() ? body.icon.trim().slice(0, 8) : current.icon,
      description: typeof body.description === 'string' ? body.description.trim().slice(0, 500) : current.description,
    })
  } else {
    // Drag & Drop 전용 경량 패치 — 같은 기간 단위(level) 안에서 순서 변경 또는 다른 그룹(반기/분기/월)으로 이동만 처리한다.
    if (current.level === 'half' && (body.half === 'h1' || body.half === 'h2')) update.half = body.half
    if (current.level === 'quarter' && [1, 2, 3, 4].includes(Number(body.quarter))) update.quarter = Number(body.quarter)
    if (current.level === 'month' && Number.isInteger(Number(body.month)) && Number(body.month) >= 1 && Number(body.month) <= 12) update.month = Number(body.month)
    if (typeof body.sort_order === 'number') update.sort_order = body.sort_order
    if (Object.keys(update).length === 0) return NextResponse.json({ ok: false, error: 'no fields' }, { status: 400 })
  }

  const { data, error } = await supabase.from('team_log_goals').update(update).eq('id', id).select(SELECT_COLUMNS).single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, goal: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })
  const { id } = await params

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_goals').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
