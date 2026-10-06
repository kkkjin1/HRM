import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'
import { REPORT_TEXT_MAX } from '@/lib/workReport'

const pick = (r?: Record<string, unknown>) => r && {
  id: r.id, item_id: r.item_id, meeting_id: r.meeting_id,
  update_text: r.update_text, update_version: r.update_version,
  feedback: r.feedback, feedback_version: r.feedback_version,
  updated_at: r.updated_at, updated_by: r.updated_by,
}

// 업무보고 한 칸(업무 행 × 회의)의 "업데이트" 또는 "피드백" 하나를 저장한다. 두 필드는 version이 따로라
// 팀원이 업데이트를 쓰는 동안 다른 사람이 피드백을 써도 서로 충돌하지 않는다. expected_version은
// 편집을 시작할 때 본 그 필드의 version(한 번도 저장 안 됐으면 0). DB 함수 save_report_update가
// "WHERE 필드version = 기대값"으로 원자적으로 처리하고, 그 사이 같은 필드를 누가 저장했으면 409와 최신 칸을 돌려준다.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const itemId = typeof body?.item_id === 'string' ? body.item_id : ''
  const meetingId = typeof body?.meeting_id === 'string' ? body.meeting_id : ''
  const field = body?.field === 'update' || body?.field === 'feedback' ? body.field : ''
  const content = typeof body?.content === 'string' ? body.content.slice(0, REPORT_TEXT_MAX) : ''
  if (!itemId || !meetingId || !field) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const expected = body?.expected_version
  if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 0) {
    return NextResponse.json({ ok: false, error: '화면이 오래된 버전입니다. 새로고침 후 다시 저장해주세요.', code: 'version_required' }, { status: 428 })
  }

  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const updatedBy = (user.user_metadata?.name as string | undefined) ?? (user.email as string | undefined) ?? ''

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('save_report_update', {
    p_item_id: itemId, p_meeting_id: meetingId, p_field: field, p_content: content, p_expected_version: expected, p_updated_by: updatedBy,
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const result = data as { status: string; row?: Record<string, unknown> }
  if (result.status === 'ok') return NextResponse.json({ ok: true, update: pick(result.row) })
  if (result.status === 'conflict') return NextResponse.json({ ok: false, conflict: true, current: pick(result.row) }, { status: 409 })
  return NextResponse.json({ ok: false, error: '업무 행이나 회의를 찾을 수 없습니다.' }, { status: 404 })
}
