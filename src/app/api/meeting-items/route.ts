import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const SELECT_COLS = 'id, meeting_id, kind, content, owner, due_date, done, sort_order, created_at, image_url, image_width, image_height'

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
  const kind = body?.kind === 'decision' ? 'decision' : body?.kind === 'memo' ? 'memo' : 'action'
  const content = typeof body?.content === 'string' ? body.content.trim().slice(0, 500) : ''
  // 담당자 복수 지정 지원 — team_log_meetings.attendees와 같은 방식으로 쉼표로 구분해 한 컬럼에 저장한다.
  const owner = typeof body?.owner === 'string' ? body.owner.trim().slice(0, 200) : ''
  const dueDate = typeof body?.due_date === 'string' && body.due_date ? body.due_date : null
  // 메모는 캡처화면만 붙여넣고 텍스트가 없을 수 있어 content 대신 image_url로도 유효성을 인정한다.
  const imageUrl = typeof body?.image_url === 'string' && body.image_url ? body.image_url : null
  const imageWidth = Number.isFinite(body?.image_width) ? Math.round(body.image_width) : null
  const imageHeight = Number.isFinite(body?.image_height) ? Math.round(body.image_height) : null

  if (!meetingId || (!content && !imageUrl)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { count } = await supabase.from('team_log_meeting_items').select('id', { count: 'exact', head: true }).eq('meeting_id', meetingId)
  const { data, error } = await supabase
    .from('team_log_meeting_items')
    .insert({ meeting_id: meetingId, kind, content, owner, due_date: dueDate, sort_order: count ?? 0, image_url: imageUrl, image_width: imageWidth, image_height: imageHeight })
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
  const { error } = await supabase.from('team_log_meeting_items').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
