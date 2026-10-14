import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_members').select('id, name, sort_order, color_key, calendar_color').order('sort_order')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, members: data })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 40) : ''
  if (!name) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { count } = await supabase.from('team_log_members').select('id', { count: 'exact', head: true })
  const { data, error } = await supabase
    .from('team_log_members')
    .insert({ name, sort_order: count ?? 0, color_key: count ?? 0 })
    .select('id, name, sort_order, color_key, calendar_color')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, member: data })
}

// 팀 달력에서 팀원 색을 고른다 — 달력 전용 calendar_color(#RRGGBB, null이면 color_key 기본색).
// color_key는 루틴 달력 등 다른 화면도 쓰는 번호라 여기선 건드리지 않는다.
export async function PATCH(request: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const raw = body?.calendar_color
  const valid = raw === null || (typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw))
  if (!id || !valid) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const calendarColor = raw === null ? null : (raw as string).toUpperCase()

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_members')
    .update({ calendar_color: calendarColor })
    .eq('id', id)
    .select('id, name, sort_order, color_key, calendar_color')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, member: data })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_members').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
