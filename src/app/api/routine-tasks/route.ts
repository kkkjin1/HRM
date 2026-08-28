import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const SELECT_COLS = 'id, title, assignees, repeat_enabled, repeat_unit, weekday, month_day, month_last_day, task_date, created_at'

type Payload = {
  title: string
  assignees: string[]
  repeat_enabled: boolean
  repeat_unit: 'week' | 'month' | null
  weekday: number | null
  month_day: number | null
  month_last_day: boolean
  task_date: string | null
}

function parseAssignees(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const names = v.filter((x): x is string => typeof x === 'string').map(x => x.trim().slice(0, 40)).filter(Boolean)
  return Array.from(new Set(names)).slice(0, 2)
}

function parsePayload(body: unknown): Payload | null {
  const b = body as Record<string, unknown> | null
  const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 200) : ''
  const assignees = parseAssignees(b?.assignees)
  const repeatEnabled = b?.repeat_enabled === true
  if (!title || assignees.length === 0) return null

  if (!repeatEnabled) {
    const taskDate = typeof b?.task_date === 'string' ? b.task_date : ''
    if (!taskDate) return null
    return { title, assignees, repeat_enabled: false, repeat_unit: null, weekday: null, month_day: null, month_last_day: false, task_date: taskDate }
  }

  const repeatUnit = b?.repeat_unit === 'week' || b?.repeat_unit === 'month' ? b.repeat_unit : null
  if (repeatUnit === 'week') {
    const weekday = typeof b?.weekday === 'number' && b.weekday >= 0 && b.weekday <= 6 ? b.weekday : null
    if (weekday === null) return null
    return { title, assignees, repeat_enabled: true, repeat_unit: 'week', weekday, month_day: null, month_last_day: false, task_date: null }
  }
  if (repeatUnit === 'month') {
    const monthLastDay = b?.month_last_day === true
    const monthDay = typeof b?.month_day === 'number' && b.month_day >= 1 && b.month_day <= 31 ? b.month_day : null
    if (!monthLastDay && monthDay === null) return null
    return { title, assignees, repeat_enabled: true, repeat_unit: 'month', weekday: null, month_day: monthLastDay ? null : monthDay, month_last_day: monthLastDay, task_date: null }
  }
  return null
}

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_routine_tasks').select(SELECT_COLS).order('created_at')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tasks: data })
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const payload = parsePayload(body)
  if (!payload) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_routine_tasks').insert(payload).select(SELECT_COLS).single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, task: data })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof (body as Record<string, unknown> | null)?.id === 'string' ? (body as Record<string, string>).id : ''
  const payload = parsePayload(body)
  if (!id || !payload) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_routine_tasks').update(payload).eq('id', id).select(SELECT_COLS).single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, task: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_routine_tasks').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
