import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const SELECT_COLS = 'id, title, meeting_date, meeting_time, attendees, agenda, created_at, agenda_version, agenda_updated_at, agenda_updated_by'

// 고정회의(요일 반복) 규칙. weekday는 Date.getDay() 기준 (0=일 ... 6=토).
// 새로 추가할 고정회의가 있으면 이 배열에 항목을 더하면 된다.
const RECURRING_MEETINGS = [
  { title: '인사관리팀 위클리미팅', weekday: 1, time: '11:30' }, // 월요일
  { title: '인사관리팀 위클리미팅', weekday: 3, time: '10:00' }, // 수요일
]
const RECURRING_WEEKS_AHEAD = 8
// 과거분도 이만큼 되돌아가 채운다 — 며칠 앱을 안 열면(휴가 등) 그 사이 지나간 고정회의 날짜는
// "오늘 이후"만 보는 정방향 로직으로는 영원히 채워지지 않아, 회의록의 "직전 회의" 연동이 끊긴다.
const RECURRING_WEEKS_BACK = 8

function kstDateStr(msOffsetDays: number) {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000 + msOffsetDays * 86400000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function kstWeekday(msOffsetDays: number) {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 + msOffsetDays * 86400000).getUTCDay()
}

// RECURRING_WEEKS_BACK주 전부터 RECURRING_WEEKS_AHEAD주 뒤까지 필요한 고정회의 날짜를 채워 넣는다. 이미 있으면 건드리지 않는다.
async function ensureRecurringMeetings(supabase: ReturnType<typeof createServiceClient>) {
  if (RECURRING_MEETINGS.length === 0) return

  const startOffset = -RECURRING_WEEKS_BACK * 7
  const wanted: { title: string; date: string; time: string }[] = []
  for (let i = startOffset; i < RECURRING_WEEKS_AHEAD * 7; i++) {
    const weekday = kstWeekday(i)
    for (const rule of RECURRING_MEETINGS) {
      if (rule.weekday === weekday) wanted.push({ title: rule.title, date: kstDateStr(i), time: rule.time })
    }
  }
  if (wanted.length === 0) return

  const titles = Array.from(new Set(wanted.map(w => w.title)))
  const { data: existing } = await supabase
    .from('team_log_meetings')
    .select('title, meeting_date')
    .in('title', titles)
    .gte('meeting_date', kstDateStr(startOffset))

  const existingSet = new Set((existing ?? []).map(m => `${m.title}__${m.meeting_date}`))
  const missing = wanted.filter(w => !existingSet.has(`${w.title}__${w.date}`))
  if (missing.length === 0) return

  await supabase
    .from('team_log_meetings')
    .insert(missing.map(w => ({ title: w.title, meeting_date: w.date, meeting_time: w.time, attendees: '', agenda: '' })))
}

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()

  // ?id= 하나만 넘어오면 그 회의 하나만 조회한다 — 안건 저장 직전에 "그 사이 서버 값이
  // 바뀌었는지"만 가볍게 확인할 때 쓴다 (전체 목록을 다시 받을 필요 없음).
  const id = request.nextUrl.searchParams.get('id')
  if (id) {
    const { data, error } = await supabase.from('team_log_meetings').select(SELECT_COLS).eq('id', id).maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, meeting: data })
  }

  await ensureRecurringMeetings(supabase)
  const { data, error } = await supabase
    .from('team_log_meetings')
    .select(SELECT_COLS)
    .order('meeting_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meetings: data })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const meetingDate = typeof body?.meeting_date === 'string' ? body.meeting_date : ''
  const meetingTime = typeof body?.meeting_time === 'string' ? body.meeting_time.slice(0, 10) : ''
  const attendees = typeof body?.attendees === 'string' ? body.attendees.trim().slice(0, 200) : ''
  const agenda = typeof body?.agenda === 'string' ? body.agenda.slice(0, 5000) : ''

  if (!title || !meetingDate) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meetings')
    .insert({ title, meeting_date: meetingDate, meeting_time: meetingTime, attendees, agenda })
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meeting: data })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  // 안건은 optimistic concurrency control(agenda_version)로만 저장한다 — 다른 필드와 섞어 보내거나
  // 기대 version 없이 보내면(구버전 탭 등) 거절한다. 그래야 어떤 경로로도 version 검사를 우회해 덮어쓸 수 없다.
  if ('agenda' in (body ?? {})) return saveAgenda(id, body)

  // 필드 단위 부분 업데이트 — 요청에 실제로 들어온 필드만 반영한다. 안건만 저장할 때
  // title/attendees 등 이 요청과 무관한 필드를 (호출한 쪽이 들고 있던 오래된 값으로) 같이
  // 덮어써버리는 걸 막기 위함이다 (동시에 다른 사람이 다른 필드를 고쳤을 수 있음).
  const updates: Record<string, string> = {}
  if (typeof body?.title === 'string') updates.title = body.title.trim().slice(0, 200)
  if (typeof body?.meeting_date === 'string') updates.meeting_date = body.meeting_date
  if (typeof body?.meeting_time === 'string') updates.meeting_time = body.meeting_time.slice(0, 10)
  if (typeof body?.attendees === 'string') updates.attendees = body.attendees.trim().slice(0, 200)

  if ('title' in updates && !updates.title) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  if ('meeting_date' in updates && !updates.meeting_date) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: false, error: 'no fields to update' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meetings')
    .update(updates)
    .eq('id', id)
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meeting: data })
}

// 안건 저장: DB 함수 save_meeting_agenda가 "WHERE agenda_version = 기대값" 조건으로 원자적으로 갱신한다.
// 영향받은 행이 없으면(그 사이 누가 저장함) 409와 함께 그 순간의 최신 안건/version/변경자/시각을 돌려준다.
async function saveAgenda(id: string, body: Record<string, unknown>) {
  const otherFields = ['title', 'meeting_date', 'meeting_time', 'attendees'].filter(k => k in body)
  if (otherFields.length > 0) return NextResponse.json({ ok: false, error: 'agenda must be saved alone' }, { status: 400 })
  if (typeof body.agenda !== 'string') return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const expected = body.expected_agenda_version
  if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 1) {
    return NextResponse.json({ ok: false, error: '화면이 오래된 버전입니다. 새로고침 후 다시 저장해주세요.', code: 'version_required' }, { status: 428 })
  }

  // 변경자는 브라우저가 보낸 값이 아니라 검증된 세션에서 정한다(다른 API와 같은 user_metadata.name → email 순).
  const user = await requireUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const updatedBy = (user.user_metadata?.name as string | undefined) ?? (user.email as string | undefined) ?? ''

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('save_meeting_agenda', {
    p_meeting_id: id, p_agenda: body.agenda.slice(0, 5000), p_expected_version: expected, p_updated_by: updatedBy,
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const result = data as { status: string; agenda?: string; agenda_version?: number; agenda_updated_at?: string | null; agenda_updated_by?: string | null }
  const agenda = { agenda: result.agenda, agenda_version: result.agenda_version, agenda_updated_at: result.agenda_updated_at ?? null, agenda_updated_by: result.agenda_updated_by ?? null }
  if (result.status === 'ok') return NextResponse.json({ ok: true, agenda })
  if (result.status === 'conflict') return NextResponse.json({ ok: false, conflict: true, current: agenda }, { status: 409 })
  return NextResponse.json({ ok: false, error: '회의를 찾을 수 없습니다.' }, { status: 404 })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_meetings').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
