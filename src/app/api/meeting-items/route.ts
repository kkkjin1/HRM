import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const SELECT_COLS = 'id, meeting_id, kind, content, owner, due_date, done, sort_order, created_at, image_url, image_width, image_height, report_item_id'

export async function GET(request: NextRequest) {
  const meetingId = request.nextUrl.searchParams.get('meeting_id')
  if (!meetingId) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meeting_items')
    .select(SELECT_COLS)
    .eq('meeting_id', meetingId)
    .order('sort_order')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, items: data })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const meetingId = typeof body?.meeting_id === 'string' ? body.meeting_id : ''
  const kind = body?.kind === 'decision' ? 'decision' : body?.kind === 'memo' ? 'memo' : body?.kind === 'contract_leave' ? 'contract_leave' : 'action'
  const content = typeof body?.content === 'string' ? body.content.trim().slice(0, 500) : ''
  // 담당자 복수 지정 지원 — team_log_meetings.attendees와 같은 방식으로 쉼표로 구분해 한 컬럼에 저장한다.
  const owner = typeof body?.owner === 'string' ? body.owner.trim().slice(0, 200) : ''
  const dueDate = typeof body?.due_date === 'string' && body.due_date ? body.due_date : null
  // 메모는 캡처화면만 붙여넣고 텍스트가 없을 수 있어 content 대신 image_url로도 유효성을 인정한다.
  const imageUrl = typeof body?.image_url === 'string' && body.image_url ? body.image_url : null
  const imageWidth = Number.isFinite(body?.image_width) ? Math.round(body.image_width) : null
  const imageHeight = Number.isFinite(body?.image_height) ? Math.round(body.image_height) : null
  // 업무보고 행에서 등록한 결정사항/액션아이템이면 그 행 id — 업무보고 표에 연동 배지로 다시 보여준다.
  const reportItemId = typeof body?.report_item_id === 'string' && body.report_item_id ? body.report_item_id : null

  if (!meetingId || (!content && !imageUrl)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { count } = await supabase.from('team_log_meeting_items').select('id', { count: 'exact', head: true }).eq('meeting_id', meetingId)
  const { data, error } = await supabase
    .from('team_log_meeting_items')
    .insert({ meeting_id: meetingId, kind, content, owner, due_date: dueDate, sort_order: count ?? 0, image_url: imageUrl, image_width: imageWidth, image_height: imageHeight, report_item_id: reportItemId })
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.content === 'string') patch.content = body.content.trim().slice(0, 500)
  if (typeof body.owner === 'string') patch.owner = body.owner.trim().slice(0, 200)
  if ('due_date' in body) patch.due_date = typeof body.due_date === 'string' && body.due_date ? body.due_date : null
  if (typeof body.done === 'boolean') patch.done = body.done
  // 메모 이미지 모서리 드래그로 크기를 바꿀 때 여기로 폭/높이만 갱신하러 온다.
  if (Number.isFinite(body.image_width)) patch.image_width = Math.round(body.image_width)
  if (Number.isFinite(body.image_height)) patch.image_height = Math.round(body.image_height)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meeting_items')
    .update(patch)
    .eq('id', id)
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: item } = await supabase.from('team_log_meeting_items').select('kind, meeting_id, content, owner').eq('id', id).maybeSingle()
  const { error } = await supabase.from('team_log_meeting_items').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // 액션아이템은 등록할 때 담당자 일정에 자동으로 올라간다(같은 회의·같은 제목). 액션을 지우면 그 일정도 같이 지운다 —
  // 안 지우면 없어진 할 일이 캘린더에 계속 남는다. 일정 쪽에 액션 id가 없어서 회의·제목·담당자로 찾는다.
  let removedEventIds: string[] = []
  if (item?.kind === 'action') {
    const owners = (item.owner as string).split(',').map(x => x.trim()).filter(Boolean)
    let q = supabase
      .from('team_log_schedule')
      .delete()
      .eq('source_type', 'meeting')
      .eq('source_id', item.meeting_id)
      .eq('title', (item.content as string).trim().slice(0, 200))
    if (owners.length > 0) q = q.in('assignee', owners)
    const { data: removed } = await q.select('id')
    removedEventIds = (removed ?? []).map(r => r.id as string)
  }
  return NextResponse.json({ ok: true, removed_event_ids: removedEventIds })
}
