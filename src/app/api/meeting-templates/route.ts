import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const SELECT_COLS = 'id, name, title_prefix, content_template, default_attendees, created_at'

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_meeting_templates').select(SELECT_COLS).order('created_at')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, templates: data })
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : ''
  const titlePrefix = typeof body?.title_prefix === 'string' ? body.title_prefix.trim().slice(0, 200) : ''
  const contentTemplate = typeof body?.content_template === 'string' ? body.content_template.slice(0, 5000) : ''
  const defaultAttendees = typeof body?.default_attendees === 'string' ? body.default_attendees.trim().slice(0, 200) : ''

  if (!name) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meeting_templates')
    .insert({ name, title_prefix: titlePrefix, content_template: contentTemplate, default_attendees: defaultAttendees })
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, template: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_meeting_templates').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
