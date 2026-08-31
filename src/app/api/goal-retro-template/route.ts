import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

// 개인 회고 팝업에 뜨는 공통 질문 양식. 행 하나짜리 싱글턴(id=1)이다.
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_log_goal_retro_template').select('content').eq('id', 1).single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, content: data?.content ?? '' })
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const content = typeof body?.content === 'string' ? body.content.slice(0, 5000) : ''

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('team_log_goal_retro_template')
    .upsert({ id: 1, content, updated_at: new Date().toISOString() }, { onConflict: 'id' })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
