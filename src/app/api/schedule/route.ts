import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isTeamLogRequestAuthorized } from '@/lib/team-log-auth'

const SOURCE_TYPES = ['item', 'subtask', 'meeting'] as const
const SELECT_COLS = 'id, title, event_date, note, assignee, tag, source_type, source_id, created_at'

export async function GET() {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_schedule').select(SELECT_COLS).order('event_date')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, events: data })
}

export async function POST(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const eventDate = typeof body?.event_date === 'string' ? body.event_date : ''
  const note = typeof body?.note === 'string' ? body.note.slice(0, 2000) : ''
  const assignee = typeof body?.assignee === 'string' ? body.assignee.trim().slice(0, 40) : ''
  const tag = typeof body?.tag === 'string' && body.tag.trim() ? body.tag.trim().slice(0, 40) : null
  const sourceType = SOURCE_TYPES.includes(body?.source_type) ? body.source_type : null
  const sourceId = typeof body?.source_id === 'string' ? body.source_id : null

  if (!title || !eventDate) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_schedule')
    .insert({ title, event_date: eventDate, note, assignee, tag, source_type: sourceType, source_id: sourceId })
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, event: data })
}

export async function PATCH(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const eventDate = typeof body?.event_date === 'string' ? body.event_date : ''
  const note = typeof body?.note === 'string' ? body.note.slice(0, 2000) : ''
  const assignee = typeof body?.assignee === 'string' ? body.assignee.trim().slice(0, 40) : ''
  const tag = typeof body?.tag === 'string' && body.tag.trim() ? body.tag.trim().slice(0, 40) : null
  if (!id || !title || !eventDate || !assignee) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_schedule')
    .update({ title, event_date: eventDate, note, assignee, tag })
    .eq('id', id)
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, event: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_schedule').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
