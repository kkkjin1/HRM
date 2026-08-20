import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const COLS = 'id, date, name, created_at'

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_holidays').select(COLS).order('date')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, holidays: data })
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null)
  const date = typeof body?.date === 'string' ? body.date : ''
  const name = typeof body?.name === 'string' ? body.name.slice(0, 100) : ''
  if (!date || !name) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_holidays')
    .upsert({ date, name }, { onConflict: 'date' })
    .select(COLS)
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, holiday: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_holidays').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
