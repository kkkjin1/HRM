import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const SELECT_COLS = 'id, meeting_id, member_id, content, updated_at, version, updated_by'

export async function GET(request: NextRequest) {
  const meetingId = request.nextUrl.searchParams.get('meeting_id')
  if (!meetingId) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_meeting_progress').select(SELECT_COLS).eq('meeting_id', meetingId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, progress: data ?? [] })
}

// 팀원 한 명의 진행사항을 저장한다 — (meeting_id, member_id) 행마다 자기 version을 가진 optimistic
// concurrency control. expected_version은 클라이언트가 편집을 시작할 때 본 version이며, 행이 아직 없었으면 0이다.
// DB 함수 save_meeting_progress가 "WHERE version = 기대값"(없던 행이면 ON CONFLICT DO NOTHING)으로 원자적으로
// 처리하고, 그 사이 같은 카드를 다른 사람이 저장했으면 409와 최신 행을 돌려준다. 다른 팀원 카드와는 무관하다.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const meetingId = typeof body?.meeting_id === 'string' ? body.meeting_id : ''
  const memberId = typeof body?.member_id === 'string' ? body.member_id : ''
  const content = typeof body?.content === 'string' ? body.content.slice(0, 5000) : ''
  if (!meetingId || !memberId) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const expected = body?.expected_version
  if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 0) {
    return NextResponse.json({ ok: false, error: '화면이 오래된 버전입니다. 새로고침 후 다시 저장해주세요.', code: 'version_required' }, { status: 428 })
  }

  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const updatedBy = (user.user_metadata?.name as string | undefined) ?? (user.email as string | undefined) ?? ''

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('save_meeting_progress', {
    p_meeting_id: meetingId, p_member_id: memberId, p_content: content, p_expected_version: expected, p_updated_by: updatedBy,
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const result = data as { status: string; row?: Record<string, unknown> }
  const pick = (r?: Record<string, unknown>) => r && {
    id: r.id, meeting_id: r.meeting_id, member_id: r.member_id, content: r.content, updated_at: r.updated_at, version: r.version, updated_by: r.updated_by,
  }
  if (result.status === 'ok') return NextResponse.json({ ok: true, progress: pick(result.row) })
  if (result.status === 'conflict') return NextResponse.json({ ok: false, conflict: true, current: pick(result.row) }, { status: 409 })
  return NextResponse.json({ ok: false, error: '회의를 찾을 수 없습니다.' }, { status: 404 })
}
