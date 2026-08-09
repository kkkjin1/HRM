import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const TYPES = ['memo', 'action', 'idea', 'link', 'free'] as const
const SELECT_COLUMNS = 'id, goal_id, type, title, content, url, created_at'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })
  const { id } = await params

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 100) : ''
  const type = TYPES.includes(body?.type) ? body.type : ''
  if (!title || !type) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const content = typeof body?.content === 'string' ? body.content.trim().slice(0, 500) : ''
  const url = type === 'link' && typeof body?.url === 'string' ? body.url.trim().slice(0, 500) : ''

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_goal_related_items')
    .update({ title, type, content, url })
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })
  const { id } = await params

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_goal_related_items').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
