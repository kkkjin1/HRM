import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'
import { GOAL_LEVEL_LABEL, PARENT_LEVEL, isGoalLevel, type GoalLevel } from '@/lib/goalLevels'

const SELECT_COLUMNS = 'id, name, level, parent_id, year, half, quarter, month, icon, description, sort_order, created_at'

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

    const newLevel: GoalLevel = isGoalLevel(body.level) ? body.level : current.level
    if (newLevel !== current.level) {
      const { count } = await supabase.from('team_log_goals').select('id', { count: 'exact', head: true }).eq('parent_id', id)
      if ((count ?? 0) > 0) {
        return NextResponse.json({ ok: false, error: '하위 목표가 있어 단계를 변경할 수 없습니다.' }, { status: 400 })
      }
    }

    const requiredParentLevel = PARENT_LEVEL[newLevel]
    let parentId: string | null = null
    let year: number

    if (requiredParentLevel) {
      parentId = typeof body.parent_id === 'string' ? body.parent_id : ''
      if (!parentId) return NextResponse.json({ ok: false, error: `상위 ${GOAL_LEVEL_LABEL[requiredParentLevel]} 목표를 선택해주세요.` }, { status: 400 })
      const { data: parent, error: parentErr } = await supabase.from('team_log_goals').select('id, level, year').eq('id', parentId).single()
      if (parentErr || !parent) return NextResponse.json({ ok: false, error: '상위 목표를 찾을 수 없습니다.' }, { status: 400 })
      if (parent.level !== requiredParentLevel) {
        return NextResponse.json({ ok: false, error: `${GOAL_LEVEL_LABEL[newLevel]} 목표의 상위는 ${GOAL_LEVEL_LABEL[requiredParentLevel]} 목표여야 합니다.` }, { status: 400 })
      }
      year = parent.year
    } else {
      year = Number(body.year)
      if (!Number.isInteger(year)) return NextResponse.json({ ok: false, error: '연도를 입력해주세요.' }, { status: 400 })
    }

    let half: string | null = null
    let quarter: number | null = null
    let month: number | null = null
    if (newLevel === 'half') {
      half = body.half === 'h1' || body.half === 'h2' ? body.half : ''
      if (!half) return NextResponse.json({ ok: false, error: '상반기/하반기를 선택해주세요.' }, { status: 400 })
    } else if (newLevel === 'quarter') {
      quarter = Number(body.quarter)
      if (![1, 2, 3, 4].includes(quarter)) return NextResponse.json({ ok: false, error: '분기를 선택해주세요.' }, { status: 400 })
    } else if (newLevel === 'month') {
      month = Number(body.month)
      if (!Number.isInteger(month) || month < 1 || month > 12) return NextResponse.json({ ok: false, error: '월을 선택해주세요.' }, { status: 400 })
    }

    Object.assign(update, {
      name, level: newLevel, parent_id: parentId, year, half, quarter, month,
      icon: typeof body.icon === 'string' && body.icon.trim() ? body.icon.trim().slice(0, 8) : current.icon,
      description: typeof body.description === 'string' ? body.description.trim().slice(0, 500) : current.description,
    })
  } else {
    // Drag & Drop 전용 경량 패치 — 같은 부모 내 순서 변경 또는 다른 상위 목표로 이동만 처리한다.
    if (typeof body.parent_id === 'string' || body.parent_id === null) {
      const requiredParentLevel = PARENT_LEVEL[current.level as GoalLevel]
      if (!requiredParentLevel) {
        return NextResponse.json({ ok: false, error: '연간 목표는 다른 목표 아래로 이동할 수 없습니다.' }, { status: 400 })
      }
      const parentId = body.parent_id
      if (!parentId) return NextResponse.json({ ok: false, error: '상위 목표가 필요합니다.' }, { status: 400 })
      const { data: parent, error: parentErr } = await supabase.from('team_log_goals').select('id, level, year').eq('id', parentId).single()
      if (parentErr || !parent) return NextResponse.json({ ok: false, error: '상위 목표를 찾을 수 없습니다.' }, { status: 400 })
      if (parent.level !== requiredParentLevel) {
        return NextResponse.json({ ok: false, error: '허용되지 않는 위치입니다.' }, { status: 400 })
      }
      update.parent_id = parentId
      update.year = parent.year
    }
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
  const mode = request.nextUrl.searchParams.get('mode') === 'orphan' ? 'orphan' : 'cascade'

  const supabase = createServiceClient()
  if (mode === 'orphan') {
    const { error: detachErr } = await supabase.from('team_log_goals').update({ parent_id: null }).eq('parent_id', id)
    if (detachErr) return NextResponse.json({ ok: false, error: detachErr.message }, { status: 500 })
  }

  const { error } = await supabase.from('team_log_goals').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
