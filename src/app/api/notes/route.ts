import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isTeamLogRequestAuthorized } from '@/lib/team-log-auth'

export async function GET() {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_notes')
    .select('id, author, content, sort_order, created_at')
    .order('sort_order')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, notes: data })
}

export async function POST(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const author = typeof body?.author === 'string' ? body.author.trim().slice(0, 40) : ''
  const content = typeof body?.content === 'string' ? body.content.slice(0, 2000) : ''

  const supabase = createServiceClient()
  const { count } = await supabase.from('team_log_notes').select('id', { count: 'exact', head: true })
  const { data, error } = await supabase
    .from('team_log_notes')
    .insert({ author, content, sort_order: count ?? 0 })
    .select('id, author, content, sort_order, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, note: data })
}

export async function PATCH(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const update: Record<string, string> = {}
  if (typeof body.author === 'string') update.author = body.author.trim().slice(0, 40)
  if (typeof body.content === 'string') update.content = body.content.slice(0, 2000)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_notes')
    .update(update)
    .eq('id', id)
    .select('id, author, content, sort_order, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, note: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await isTeamLogRequestAuthorized())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_notes').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
