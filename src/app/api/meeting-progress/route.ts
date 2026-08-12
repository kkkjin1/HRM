import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const SELECT_COLS = 'id, meeting_id, member_id, content, updated_at'

export async function GET(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const meetingId = request.nextUrl.searchParams.get('meeting_id')
  if (!meetingId) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_meeting_progress').select(SELECT_COLS).eq('meeting_id', meetingId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, progress: data ?? [] })
}

// 팀원 한 명의 진행사항을 저장(없으면 생성, 있으면 갱신)한다 — textarea가 blur될 때마다 호출된다.
export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const meetingId = typeof body?.meeting_id === 'string' ? body.meeting_id : ''
  const memberId = typeof body?.member_id === 'string' ? body.member_id : ''
  const content = typeof body?.content === 'string' ? body.content.slice(0, 5000) : ''
  if (!meetingId || !memberId) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meeting_progress')
    .upsert({ meeting_id: meetingId, member_id: memberId, content, updated_at: new Date().toISOString() }, { onConflict: 'meeting_id,member_id' })
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, progress: data })
}
