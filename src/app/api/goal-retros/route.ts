import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const year = Number(request.nextUrl.searchParams.get('year'))
  if (!Number.isInteger(year)) return NextResponse.json({ ok: false, error: 'invalid year' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_goal_retros').select('month, owner_key, content').eq('year', year)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, retros: data ?? [] })
}

// 월별 회고 한 편을 저장(없으면 생성, 있으면 갱신)한다 — 자동 저장(디바운스) 및 수동 저장 버튼 양쪽에서 호출된다.
// owner_key: 'team'이면 팀 회고, 그 외에는 개인 회고 작성자(members.id)를 가리킨다.
export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const year = Number(body?.year)
  const month = Number(body?.month)
  const ownerKey = typeof body?.owner_key === 'string' && body.owner_key.trim() ? body.owner_key.trim() : 'team'
  const content = typeof body?.content === 'string' ? body.content.slice(0, 5000) : ''
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('team_log_goal_retros')
    .upsert({ year, month, owner_key: ownerKey, content, updated_at: new Date().toISOString() }, { onConflict: 'year,month,owner_key' })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
