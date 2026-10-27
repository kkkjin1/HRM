import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireLead } from '@/lib/requireLead'

const COLS = 'id, date, note, created_at'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_family_days').select(COLS).order('date')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, days: data })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const date = typeof body?.date === 'string' ? body.date : ''
  const note = typeof body?.note === 'string' ? body.note.slice(0, 200) : ''
  if (!date) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_family_days')
    .upsert({ date, note }, { onConflict: 'date' })
    .select(COLS)
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, day: data })
}

// 날짜 옮기기 — 팀장만(달력에서 끌어 놓기). 옮길 날에 이미 패밀리데이가 있으면 겹치므로 막는다(date 유일).
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const date = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date as string : ''
  if (!id || !date) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const denied = await requireLead()
  if (denied) return denied
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_family_days').update({ date }).eq('id', id).select(COLS).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.code === '23505' ? '그 날짜엔 이미 패밀리데이가 있습니다.' : error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: '패밀리데이를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ ok: true, day: data })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_family_days').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
