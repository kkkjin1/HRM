import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'
import { bestNameMatch } from '@/lib/memberMatch'

export async function GET(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const year = Number(request.nextUrl.searchParams.get('year'))
  if (!Number.isInteger(year)) return NextResponse.json({ ok: false, error: 'invalid year' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_goal_retro_qa')
    .select('month, asker_id, target_id, question, answer')
    .eq('year', year)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, qas: data ?? [] })
}

// 질문/답변 한 칸을 저장한다. field='question'이면 질문자(asker_id) 본인만, field='answer'이면
// 회고 작성자(target_id) 본인만 쓸 수 있다 — 나머지 필드는 기존 값을 그대로 유지해 upsert한다.
export async function POST(request: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const year = Number(body?.year)
  const month = Number(body?.month)
  const askerId = typeof body?.asker_id === 'string' ? body.asker_id.trim() : ''
  const targetId = typeof body?.target_id === 'string' ? body.target_id.trim() : ''
  const field = body?.field === 'question' || body?.field === 'answer' ? body.field : null
  const content = typeof body?.content === 'string' ? body.content.slice(0, 2000) : ''

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || !askerId || !targetId || !field || askerId === targetId) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const authName = (user.user_metadata?.name as string | undefined) ?? user.email ?? ''
  const { data: profileMembers } = await supabase.from('members').select('id, name')
  const me = profileMembers ? bestNameMatch(authName, profileMembers) : null

  const requiredId = field === 'question' ? askerId : targetId
  if (me?.id !== requiredId) {
    return NextResponse.json({ ok: false, error: field === 'question' ? '질문자만 작성할 수 있습니다' : '회고 작성자만 답변할 수 있습니다' }, { status: 403 })
  }

  const { data: existing } = await supabase
    .from('team_log_goal_retro_qa')
    .select('question, answer')
    .eq('year', year).eq('month', month).eq('asker_id', askerId).eq('target_id', targetId)
    .maybeSingle()

  const { error } = await supabase
    .from('team_log_goal_retro_qa')
    .upsert({
      year, month, asker_id: askerId, target_id: targetId,
      question: field === 'question' ? content : (existing?.question ?? ''),
      answer: field === 'answer' ? content : (existing?.answer ?? ''),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'year,month,asker_id,target_id' })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
