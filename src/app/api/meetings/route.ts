import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const SELECT_COLS = 'id, title, meeting_date, meeting_time, attendees, content, created_at'

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meetings')
    .select(SELECT_COLS)
    .order('meeting_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meetings: data })
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const meetingDate = typeof body?.meeting_date === 'string' ? body.meeting_date : ''
  const meetingTime = typeof body?.meeting_time === 'string' ? body.meeting_time.slice(0, 10) : ''
  const attendees = typeof body?.attendees === 'string' ? body.attendees.trim().slice(0, 200) : ''
  const content = typeof body?.content === 'string' ? body.content.slice(0, 5000) : ''

  if (!title || !meetingDate) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meetings')
    .insert({ title, meeting_date: meetingDate, meeting_time: meetingTime, attendees, content })
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meeting: data })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const meetingDate = typeof body?.meeting_date === 'string' ? body.meeting_date : ''
  const meetingTime = typeof body?.meeting_time === 'string' ? body.meeting_time.slice(0, 10) : ''
  const attendees = typeof body?.attendees === 'string' ? body.attendees.trim().slice(0, 200) : ''
  const content = typeof body?.content === 'string' ? body.content.slice(0, 5000) : ''

  if (!id || !title || !meetingDate) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meetings')
    .update({ title, meeting_date: meetingDate, meeting_time: meetingTime, attendees, content })
    .eq('id', id)
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meeting: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_meetings').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
