import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentMember } from '@/lib/currentMember'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizeMonth, cleanPlanText, type PlanCategory } from '@/lib/team/devPlan'
import { RETRO_ANSWER_MAX, normalizeRetroQuestions, type PlanRetroAnswer, type PlanRetroQuestion } from '@/lib/team/planRetro'

// 팀빌딩 회고 질문·답변 — 그달 팀빌딩 액션에 붙은 질문을 개인 회고에서 답한다. 브라우저는 테이블을 직접 못 읽는다.
//   GET ?month=YYYY-MM  연결된 재직 팀원 전원: 그달 질문 + 팀원 전체 답변(팀 전체 공개)
//   PUT { action_id, question_key, answer }  본인 답만. 질문이 그 액션에 실제로 있어야 한다.

async function session() {
  const s = await getCurrentMember()
  if (!s) return { ok: false as const, res: NextResponse.json({ ok: false }, { status: 401 }) }
  if (!s.member) return { ok: false as const, res: NextResponse.json({ ok: false, error: '로그인 계정이 팀원과 연결되어 있지 않습니다' }, { status: 403 }) }
  return { ok: true as const, member: s.member }
}
const failed = () => NextResponse.json({ ok: false, error: '저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })

export async function GET(request: NextRequest) {
  const s = await session()
  if (!s.ok) return s.res
  const month = normalizeMonth(request.nextUrl.searchParams.get('month'))
  if (!month) return NextResponse.json({ ok: false, error: 'invalid month' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: pm, error: pmError } = await supabase.from('team_plan_months').select('id').eq('month', month).maybeSingle()
  if (pmError) return failed()
  if (!pm) return NextResponse.json({ ok: true, questions: [], answers: [] })

  const { data: actions, error: actError } = await supabase.from('team_plan_actions')
    .select('id, category, focus, retro_questions, sort_order').eq('month_id', pm.id)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  if (actError) return failed()

  const order: PlanCategory[] = ['strengthen', 'complement', 'explore']
  const questions: PlanRetroQuestion[] = [...(actions ?? [])]
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
    .flatMap(a => normalizeRetroQuestions(a.retro_questions).map(q => ({ ...q, action_id: a.id, category: a.category, focus: a.focus ?? '' })))
  const actionIds = [...new Set(questions.map(q => q.action_id))]
  if (!actionIds.length) return NextResponse.json({ ok: true, questions, answers: [] })

  const { data: answers, error: ansError } = await supabase.from('team_plan_retro_answers')
    .select('action_id, member_id, question_key, answer').in('action_id', actionIds)
  if (ansError) return failed()
  return NextResponse.json({ ok: true, questions, answers: (answers ?? []) as PlanRetroAnswer[] })
}

export async function PUT(request: NextRequest) {
  const s = await session()
  if (!s.ok) return s.res
  const body = await request.json().catch(() => null)
  const actionId = typeof body?.action_id === 'string' ? body.action_id : ''
  const key = typeof body?.question_key === 'string' ? body.question_key : ''
  const answer = cleanPlanText(body?.answer)
  if (!actionId || !key || answer === null) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: action, error: actError } = await supabase.from('team_plan_actions').select('id, retro_questions').eq('id', actionId).maybeSingle()
  if (actError) return failed()
  if (!action || !normalizeRetroQuestions(action.retro_questions).some(q => q.key === key)) {
    return NextResponse.json({ ok: false, error: '질문을 찾을 수 없습니다. 새로고침해 주세요.' }, { status: 404 })
  }

  // member_id는 로그인한 본인으로만 쓴다(본문 값을 믿지 않음)
  const { error } = await supabase.from('team_plan_retro_answers').upsert({
    action_id: actionId, member_id: s.member.id, question_key: key,
    answer: answer.slice(0, RETRO_ANSWER_MAX), updated_at: new Date().toISOString(),
  }, { onConflict: 'action_id,member_id,question_key' })
  if (error) return failed()
  return NextResponse.json({ ok: true })
}
