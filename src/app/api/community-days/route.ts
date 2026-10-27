import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireLead } from '@/lib/requireLead'

// 커뮤니티데이 — 기본은 매월 마지막 주 목요일(lib/communityDay가 계산). 여기엔 날짜를 옮긴 달만 남는다.
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_community_days').select('month, date')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, moved: Object.fromEntries((data ?? []).map(r => [r.month as string, r.date as string])) })
}

// 날짜 옮기기 — 팀장만(달력에서 끌어 놓기).
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const month = typeof body?.month === 'string' && /^\d{4}-\d{2}$/.test(body.month) ? body.month as string : ''
  const date = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date as string : ''
  if (!month || !date) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const denied = await requireLead()
  if (denied) return denied
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('team_log_community_days')
    .upsert({ month, date, updated_at: new Date().toISOString() }, { onConflict: 'month' })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// 옮긴 날짜 되돌리기(그달 마지막 주 목요일로) — 팀장만.
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const month = typeof body?.month === 'string' && /^\d{4}-\d{2}$/.test(body.month) ? body.month as string : ''
  if (!month) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const denied = await requireLead()
  if (denied) return denied
  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_community_days').delete().eq('month', month)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
