import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'
import { pickPrevious, REPORT_TITLE_MAX } from '@/lib/workReport'

const ITEM_COLS = 'id, kind, member_id, title, start_date, closed_on, sort_order, created_at, pinned, note, assigned_on, co_member_ids'
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
  // 화면이 회의 날짜(date)를 같이 보내면 회의 조회를 건너뛴다(해외 리전 DB 왕복 1번 절약).
  const sentDate = request.nextUrl.searchParams.get('date')
  const date = sentDate && /^\d{4}-\d{2}-\d{2}$/.test(sentDate) ? sentDate : await meetingDate(supabase, meetingId)
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

// 새 업무 행(또는 안건 행, kind: 'agenda') — 지금 열린 회의 날짜부터 보인다. 팀원 행/안건 목록의 맨 아래에 붙는다.
// 안건은 담당자(member_id)가 없어도 된다.
// 화면이 회의 날짜(start_date)와 순서(sort_order)를 같이 보내면 DB는 insert 1번만 한다(예전엔 회의 날짜 조회·
// 마지막 순서 조회·insert 3번이 해외 리전 DB와 연달아 오가 행 추가에 1초 넘게 걸렸다). 안 보내면 예전처럼 조회한다.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const meetingId = typeof body?.meeting_id === 'string' ? body.meeting_id : ''
  const kind = body?.kind === 'agenda' ? 'agenda' : 'report'
  const memberId = typeof body?.member_id === 'string' && body.member_id ? body.member_id as string : null
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, REPORT_TITLE_MAX) : ''
  // 고정 안건 — 안건 행에만 붙는다(완료 대신 "고정 해제", 같은 closed_on 규칙).
  const pinned = kind === 'agenda' && body?.pinned === true
  if (!meetingId || (kind === 'report' && !memberId)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const sentDate = typeof body?.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date) ? body.start_date as string : null
  const sentOrder = Number.isInteger(body?.sort_order) && body.sort_order >= 0 ? body.sort_order as number : null

  const date = sentDate ?? await meetingDate(supabase, meetingId)
  if (!date) return NextResponse.json({ ok: false, error: '회의를 찾을 수 없습니다.' }, { status: 404 })

  let sortOrder = sentOrder
  if (sortOrder === null) {
    let q = supabase.from('team_log_report_items').select('sort_order').eq('kind', kind)
    q = kind === 'report' ? q.eq('member_id', memberId as string) : q
    const { data: last } = await q
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    sortOrder = ((last?.sort_order as number | undefined) ?? -1) + 1
  }

  const { data, error } = await supabase
    .from('team_log_report_items')
    .insert({ kind, member_id: memberId, title, start_date: date, sort_order: sortOrder, pinned })
    .select(ITEM_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

// 업무명/순서 수정, 안건 담당자 변경(member_ids — 빈 목록 = 담당자 없음), 완료·완료 취소. 완료는 "이 회의에서 끝냄"이라 close_meeting_id로 받아 그 회의 날짜를
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
  // 고정 안건 "방식" — 회의와 무관하게 그 행에 계속 붙는 자유 텍스트
  if (typeof body.note === 'string') patch.note = body.note.slice(0, 2000)
  if (Number.isInteger(body.sort_order)) patch.sort_order = body.sort_order
  // 안건 담당자 — member_ids(여러 명, 첫 번째가 대표 담당자) 또는 예전 방식 member_id(한 명). 빈 목록·null = 담당자 없음.
  if ('member_ids' in body || 'member_id' in body) {
    let ids: string[]
    if ('member_ids' in body) {
      if (!Array.isArray(body.member_ids) || body.member_ids.length > 20 || body.member_ids.some((v: unknown) => typeof v !== 'string' || !v)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
      ids = [...new Set(body.member_ids as string[])]
    } else {
      if (body.member_id !== null && typeof body.member_id !== 'string') return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
      ids = body.member_id ? [body.member_id as string] : []
    }
    patch.member_id = ids[0] ?? null
    patch.co_member_ids = ids.slice(1)
    // 담당자를 정한 회의 날짜(assign_date) — 그다음 회의부터 오늘 안건에서 빠진다. 담당자 없음이면 지운다.
    const assignDate = typeof body.assign_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.assign_date) ? body.assign_date as string : null
    patch.assigned_on = patch.member_id ? assignDate : null
  }
  if ('close_meeting_id' in body) {
    if (body.close_meeting_id === null) patch.closed_on = null
    else if (typeof body.close_meeting_id === 'string') {
      // 화면이 회의 날짜(close_date)를 같이 보내면 회의 조회를 건너뛴다(해외 리전 DB 왕복 1번 절약).
      const sent = typeof body.close_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.close_date) ? body.close_date as string : null
      const date = sent ?? await meetingDate(supabase, body.close_meeting_id)
      if (!date) return NextResponse.json({ ok: false, error: '회의를 찾을 수 없습니다.' }, { status: 404 })
      patch.closed_on = date
    } else return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  // 담당자를 바꿀 땐 바꾸기 전 담당자를 알아야 이미 등록한 액션을 같이 옮길 수 있다.
  const ownerChanging = 'member_id' in patch
  const before = ownerChanging
    ? (await supabase.from('team_log_report_items').select('member_id, co_member_ids').eq('id', id).maybeSingle()).data
    : null

  const { data, error } = await supabase.from('team_log_report_items').update(patch).eq('id', id).select(ITEM_COLS).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: '업무 행을 찾을 수 없습니다.' }, { status: 404 })

  // 액션 옮기기는 한 명 → 다른 한 명으로 바꿀 때만 — 여러 명이 걸리면 누구에게 넘길지 정할 수 없어서 그대로 둔다.
  const oldMemberId = (before?.member_id as string | null | undefined) ?? null
  const oldSingle = oldMemberId && ((before?.co_member_ids as string[] | null | undefined) ?? []).length === 0
  const newSingle = patch.member_id && (patch.co_member_ids as string[]).length === 0
  const movedActions = ownerChanging && oldSingle && newSingle && oldMemberId !== patch.member_id
    ? await moveOpenActions(supabase, id, oldMemberId, patch.member_id as string)
    : 0
  return NextResponse.json({ ok: true, item: data, moved_actions: movedActions })
}

// 안건 담당자가 A → B로 바뀌면, 이 행에서 등록해 아직 안 끝난 액션 중 담당자가 A 한 명인 것을
// B로 옮기고 그 액션이 만든 일정(같은 회의·같은 제목·담당 A)도 B로 옮긴다. 여러 명이 같이 맡은 액션이나
// 이미 다른 사람으로 바꿔 둔 액션은 일부러 건드리지 않는다(누가 맡을지 회의에서 따로 정한 것이라서).
// 담당자를 "없음"으로 바꿀 땐 옮길 사람이 없으니 그대로 둔다.
async function moveOpenActions(supabase: Supabase, itemId: string, oldMemberId: string, newMemberId: string) {
  const { data: names } = await supabase.from('team_log_members').select('id, name').in('id', [oldMemberId, newMemberId])
  const oldName = (names ?? []).find(m => m.id === oldMemberId)?.name as string | undefined
  const newName = (names ?? []).find(m => m.id === newMemberId)?.name as string | undefined
  if (!oldName || !newName) return 0

  const { data: actions } = await supabase
    .from('team_log_meeting_items')
    .select('id, meeting_id, content, owner')
    .eq('report_item_id', itemId)
    .eq('kind', 'action')
    .eq('done', false)
  const targets = (actions ?? []).filter(a => (a.owner as string).trim() === oldName)
  for (const a of targets) {
    await supabase.from('team_log_meeting_items').update({ owner: newName }).eq('id', a.id)
    await supabase
      .from('team_log_schedule')
      .update({ assignee: newName })
      .eq('source_type', 'meeting')
      .eq('source_id', a.meeting_id)
      .eq('title', (a.content as string).trim().slice(0, 200))
      .eq('assignee', oldName)
  }
  return targets.length
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
