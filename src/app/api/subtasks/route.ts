import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isTeamLogRequestAuthorized } from '@/lib/team-log-auth'

const ENTRY_TYPES = ['업무기록', '보고일정'] as const

export async function POST(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const itemId = typeof body?.item_id === 'string' ? body.item_id : ''
  const author = typeof body?.author === 'string' ? body.author.trim().slice(0, 40) : ''
  const entryType = body?.entry_type
  const entryDate = typeof body?.entry_date === 'string' ? body.entry_date : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const content = typeof body?.content === 'string' ? body.content.slice(0, 5000) : ''

  if (!itemId || !author || !ENTRY_TYPES.includes(entryType) || !entryDate || !title) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { count } = await supabase
    .from('team_log_subtasks')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', itemId)
  const { data, error } = await supabase
    .from('team_log_subtasks')
    .insert({ item_id: itemId, author, entry_type: entryType, entry_date: entryDate, title, content, sort_order: count ?? 0 })
    .select('id, item_id, author, entry_type, entry_date, title, content, sort_order, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, subtask: data })
}

export async function PATCH(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const author = typeof body?.author === 'string' ? body.author.trim().slice(0, 40) : ''
  const entryType = body?.entry_type
  const entryDate = typeof body?.entry_date === 'string' ? body.entry_date : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const content = typeof body?.content === 'string' ? body.content.slice(0, 5000) : ''

  if (!author || !ENTRY_TYPES.includes(entryType) || !entryDate || !title) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_subtasks')
    .update({ author, entry_type: entryType, entry_date: entryDate, title, content })
    .eq('id', id)
    .select('id, item_id, author, entry_type, entry_date, title, content, sort_order, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, subtask: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_subtasks').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
