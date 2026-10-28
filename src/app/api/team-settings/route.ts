import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { requireLead } from '@/lib/requireLead'

// 팀 공용 화면 설정 — 팀장이 바꾸면 모든 팀원에게 같은 값이 보인다. 아는 키만 받는다.
const KEYS = new Set(['meeting_block_order', 'report_member_order'])

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') ?? ''
  if (!KEYS.has(key)) return NextResponse.json({ ok: false, error: 'invalid key' }, { status: 400 })
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_settings').select('value').eq('key', key).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, value: data?.value ?? null })
}

// 값 바꾸기 — 팀장만.
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const key = typeof body?.key === 'string' ? body.key : ''
  if (!KEYS.has(key) || body?.value === undefined) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const denied = await requireLead()
  if (denied) return denied
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('team_log_settings')
    .upsert({ key, value: body.value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
