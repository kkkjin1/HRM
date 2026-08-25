import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'
import { bestNameMatch } from '@/lib/memberMatch'

const SOURCE_TYPES = ['item', 'subtask', 'meeting'] as const
const EVENT_STATUSES = ['done', 'delayed', 'cancelled'] as const
const SELECT_COLS = 'id, title, event_date, note, assignee, tag, source_type, source_id, status, created_at'

function parseStatus(v: unknown) {
  return EVENT_STATUSES.includes(v as typeof EVENT_STATUSES[number]) ? (v as typeof EVENT_STATUSES[number]) : null
}

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_schedule').select(SELECT_COLS).order('event_date')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, events: data })
}

export async function POST(request: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const eventDate = typeof body?.event_date === 'string' ? body.event_date : ''
  const note = typeof body?.note === 'string' ? body.note.slice(0, 2000) : ''
  const assignee = typeof body?.assignee === 'string' ? body.assignee.trim().slice(0, 40) : ''
  const tag = typeof body?.tag === 'string' && body.tag.trim() ? body.tag.trim().slice(0, 40) : null
  const sourceType = SOURCE_TYPES.includes(body?.source_type) ? body.source_type : null
  const sourceId = typeof body?.source_id === 'string' ? body.source_id : null
  const status = parseStatus(body?.status)

  if (!title || !eventDate) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_schedule')
    .insert({ title, event_date: eventDate, note, assignee, tag, source_type: sourceType, source_id: sourceId, status })
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  if (assignee) {
    const authName = (user.user_metadata?.name as string | undefined) ?? user.email ?? ''
    const { data: profileMembers } = await supabase.from('members').select('id, name')
    const target = profileMembers ? bestNameMatch(assignee, profileMembers) : null
    const creator = profileMembers ? bestNameMatch(authName, profileMembers) : null
    if (target && target.id !== creator?.id) {
      await supabase.from('notifications').insert({
        member_id: target.id,
        kind: 'schedule_assigned',
        body: `${authName || '누군가'}님이 ${eventDate} 일정에 "${title}"을 등록했어요`,
        meta: { section: 'schedule', date: eventDate },
      })
    }
  }

  return NextResponse.json({ ok: true, event: data })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const eventDate = typeof body?.event_date === 'string' ? body.event_date : ''
  const note = typeof body?.note === 'string' ? body.note.slice(0, 2000) : ''
  const assignee = typeof body?.assignee === 'string' ? body.assignee.trim().slice(0, 40) : ''
  const tag = typeof body?.tag === 'string' && body.tag.trim() ? body.tag.trim().slice(0, 40) : null
  const status = parseStatus(body?.status)
  if (!id || !title || !eventDate || !assignee) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_schedule')
    .update({ title, event_date: eventDate, note, assignee, tag, status })
    .eq('id', id)
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, event: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_schedule').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
