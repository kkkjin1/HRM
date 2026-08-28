import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const SELECT_COLS = 'id, year, month, title, created_at'

export async function GET(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const year = Number(request.nextUrl.searchParams.get('year'))
  if (!Number.isInteger(year)) return NextResponse.json({ ok: false, error: 'invalid year' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_yearly_tasks')
    .select(SELECT_COLS)
    .eq('year', year)
    .order('month')
    .order('created_at')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tasks: data })
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const b = body as Record<string, unknown> | null
  const year = typeof b?.year === 'number' ? b.year : NaN
  const month = typeof b?.month === 'number' ? b.month : NaN
  const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 200) : ''
  if (!Number.isInteger(year) || month < 1 || month > 12 || !title) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_yearly_tasks')
    .insert({ year, month, title })
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, task: data })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const b = body as Record<string, unknown> | null
  const id = typeof b?.id === 'string' ? b.id : ''
  const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 200) : ''
  if (!id || !title) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_yearly_tasks')
    .update({ title })
    .eq('id', id)
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, task: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof (body as Record<string, unknown> | null)?.id === 'string' ? (body as Record<string, string>).id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_yearly_tasks').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
