import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'
import { pickPrevious, REPORT_TITLE_MAX } from '@/lib/workReport'

const ITEM_COLS = 'id, member_id, title, start_date, closed_on, sort_order, created_at'
const UPDATE_COLS = 'id, item_id, meeting_id, update_text, update_version, feedback, feedback_version, updated_at, updated_by'

type Supabase = ReturnType<typeof createServiceClient>

async function meetingDate(supabase: Supabase, meetingId: string) {
  const { data } = await supabase.from('team_log_meetings').select('meeting_date').eq('id', meetingId).maybeSingle()
  return (data?.meeting_date as string | undefined) ?? null
}

// 한 회의를 열 때 필요한 업무보고 전부 — 그 날짜 기준으로 보이는 모든 팀원의 업무 행, 이 회의의
// 업데이트/피드백 칸, 행마다 직전 회차 기록. 행은 회의마다 복사하지 않고 날짜로 걸러낸다(lib/workReport).
export async function GET(request: NextRequest) {
  const meetingId = request.nextUrl.searchParams.get('meeting_id')
  if (!meetingId) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const date = await meetingDate(supabase, meetingId)
  if (!date) return NextResponse.json({ ok: false, error: '회의를 찾을 수 없습니다.' }, { status: 404 })

  const { data: items, error } = await supabase
    .from('team_log_report_items')
    .select(ITEM_COLS)
    .lte('start_date', date)
    .or(`closed_on.is.null,closed_on.gte.${date}`)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const ids = (items ?? []).map(i => i.id as string)
  if (ids.length === 0) return NextResponse.json({ ok: true, date, items: [], updates: [], previous: {}, open_actions: [] })

  const [cur, past, actions] = await Promise.all([
    supabase.from('team_log_report_updates').select(UPDATE_COLS).eq('meeting_id', meetingId).in('item_id', ids),
    supabase
      .from('team_log_report_updates')
      .select('item_id, update_text, feedback, team_log_meetings!inner(meeting_date)')
      .in('item_id', ids)
      .lt('team_log_meetings.meeting_date', date),
    // 지난 회의에서 이 업무 행으로 등록했는데 아직 안 끝난 액션아이템 — 표의 연동 칸에 "이전" 할 일로 보여준다.
    // (이번 회의 것은 화면이 이미 회의 결정사항/액션 목록을 들고 있어 거기서 걸러 쓴다.)
    supabase
      .from('team_log_meeting_items')
      .select('id, report_item_id, content, owner, due_date, team_log_meetings!inner(meeting_date)')
      .in('report_item_id', ids)
      .eq('kind', 'action')
      .eq('done', false)
      .lt('team_log_meetings.meeting_date', date),
  ])
  if (cur.error) return NextResponse.json({ ok: false, error: cur.error.message }, { status: 500 })
  if (past.error) return NextResponse.json({ ok: false, error: past.error.message }, { status: 500 })
  if (actions.error) return NextResponse.json({ ok: false, error: actions.error.message }, { status: 500 })

  const meetingDateOf = (m: unknown) => {
    const v = m as { meeting_date: string } | { meeting_date: string }[] | null
    return Array.isArray(v) ? v[0]?.meeting_date ?? '' : v?.meeting_date ?? ''
  }
  const openActions = (actions.data ?? []).map(a => ({
    id: a.id as string, report_item_id: a.report_item_id as string, content: a.content as string,
    owner: a.owner as string, due_date: a.due_date as string | null, meeting_date: meetingDateOf(a.team_log_meetings),
  }))

  const pastRows = (past.data ?? []).map(r => ({
    item_id: r.item_id as string,
    update_text: r.update_text as string,
    feedback: r.feedback as string,
    meeting_date: meetingDateOf(r.team_log_meetings),
  }))

  return NextResponse.json({ ok: true, date, items, updates: cur.data ?? [], previous: pickPrevious(pastRows, date), open_actions: openActions })
}

// 새 업무 행 — 지금 열린 회의 날짜부터 보인다. 팀원 행 목록의 맨 아래에 붙는다.
// 화면이 회의 날짜(start_date)와 순서(sort_order)를 같이 보내면 DB는 insert 1번만 한다(예전엔 회의 날짜 조회·
// 마지막 순서 조회·insert 3번이 해외 리전 DB와 연달아 오가 행 추가에 1초 넘게 걸렸다). 안 보내면 예전처럼 조회한다.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const meetingId = typeof body?.meeting_id === 'string' ? body.meeting_id : ''
  const memberId = typeof body?.member_id === 'string' ? body.member_id : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, REPORT_TITLE_MAX) : ''
  if (!meetingId || !memberId) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const sentDate = typeof body?.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date) ? body.start_date as string : null
  const sentOrder = Number.isInteger(body?.sort_order) && body.sort_order >= 0 ? body.sort_order as number : null

  const date = sentDate ?? await meetingDate(supabase, meetingId)
  if (!date) return NextResponse.json({ ok: false, error: '회의를 찾을 수 없습니다.' }, { status: 404 })

  let sortOrder = sentOrder
  if (sortOrder === null) {
    const { data: last } = await supabase
      .from('team_log_report_items')
      .select('sort_order')
      .eq('member_id', memberId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    sortOrder = ((last?.sort_order as number | undefined) ?? -1) + 1
  }

  const { data, error } = await supabase
    .from('team_log_report_items')
    .insert({ member_id: memberId, title, start_date: date, sort_order: sortOrder })
    .select(ITEM_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

// 업무명/순서 수정, 완료·완료 취소. 완료는 "이 회의에서 끝냄"이라 close_meeting_id로 받아 그 회의 날짜를
// closed_on에 넣는다(그 회의엔 남고 다음 회의부터 사라짐). close_meeting_id: null이면 완료 취소.
// 행 단위의 짧은 값이라 OCC 없이 마지막 저장이 이긴다(결정사항/액션아이템과 같은 기준).
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const patch: Record<string, unknown> = {}
  if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, REPORT_TITLE_MAX)
  if (Number.isInteger(body.sort_order)) patch.sort_order = body.sort_order
  if ('close_meeting_id' in body) {
    if (body.close_meeting_id === null) patch.closed_on = null
    else if (typeof body.close_meeting_id === 'string') {
      const date = await meetingDate(supabase, body.close_meeting_id)
      if (!date) return NextResponse.json({ ok: false, error: '회의를 찾을 수 없습니다.' }, { status: 404 })
      patch.closed_on = date
    } else return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const { data, error } = await supabase.from('team_log_report_items').update(patch).eq('id', id).select(ITEM_COLS).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: '업무 행을 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ ok: true, item: data })
}

// 잘못 만든 행 삭제 — 모든 회차의 업데이트/피드백이 함께 지워지고, 연결된 결정사항/액션아이템은 남되 연결만 풀린다.
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_report_items').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
