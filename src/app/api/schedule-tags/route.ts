import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// 일정 태그 목록(팀 공용) — 일정 추가 창의 태그 드롭다운과 그 옆 "편집"에서 쓴다.
const COLS = 'id, name, sort_order'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_schedule_tags').select(COLS).order('sort_order').order('created_at')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tags: data })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 40) : ''
  if (!name) return NextResponse.json({ ok: false, error: '태그 이름을 입력해주세요.' }, { status: 400 })
  const supabase = createServiceClient()
  const { data: last } = await supabase.from('team_log_schedule_tags').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  const { data, error } = await supabase
    .from('team_log_schedule_tags')
    .insert({ name, sort_order: (last?.[0]?.sort_order ?? -1) + 1 })
    .select(COLS)
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.code === '23505' ? '이미 있는 태그입니다.' : error.message }, { status: error.code === '23505' ? 409 : 500 })
  return NextResponse.json({ ok: true, tag: data })
}

// 목록에서만 뺀다 — 이미 이 태그가 붙은 일정은 그대로 둔다.
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_schedule_tags').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
