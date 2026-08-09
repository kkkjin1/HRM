import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const TYPES = ['memo', 'action', 'idea', 'link', 'free'] as const
const SELECT_COLUMNS = 'id, goal_id, type, title, content, url, created_at'

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_goal_related_items').select(SELECT_COLUMNS).order('created_at')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, items: data ?? [] })
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const goalId = typeof body?.goal_id === 'string' ? body.goal_id : ''
  const type = TYPES.includes(body?.type) ? body.type : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 100) : ''
  if (!goalId || !type || !title) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const content = typeof body?.content === 'string' ? body.content.trim().slice(0, 500) : ''
  const url = type === 'link' && typeof body?.url === 'string' ? body.url.trim().slice(0, 500) : ''

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_goal_related_items')
    .insert({ goal_id: goalId, type, title, content, url })
    .select(SELECT_COLUMNS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}
