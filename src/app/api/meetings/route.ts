import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireUser } from '@/lib/auth'

const SELECT_COLS = 'id, title, meeting_date, meeting_time, attendees, content, created_at'

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
    .insert(missing.map(w => ({ title: w.title, meeting_date: w.date, meeting_time: w.time, attendees: '', content: '' })))
}

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
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
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const meetingDate = typeof body?.meeting_date === 'string' ? body.meeting_date : ''
  const meetingTime = typeof body?.meeting_time === 'string' ? body.meeting_time.slice(0, 10) : ''
  const attendees = typeof body?.attendees === 'string' ? body.attendees.trim().slice(0, 200) : ''
  const content = typeof body?.content === 'string' ? body.content.slice(0, 5000) : ''

  if (!title || !meetingDate) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meetings')
    .insert({ title, meeting_date: meetingDate, meeting_time: meetingTime, attendees, content })
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meeting: data })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const meetingDate = typeof body?.meeting_date === 'string' ? body.meeting_date : ''
  const meetingTime = typeof body?.meeting_time === 'string' ? body.meeting_time.slice(0, 10) : ''
  const attendees = typeof body?.attendees === 'string' ? body.attendees.trim().slice(0, 200) : ''
  const content = typeof body?.content === 'string' ? body.content.slice(0, 5000) : ''

  if (!id || !title || !meetingDate) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_meetings')
    .update({ title, meeting_date: meetingDate, meeting_time: meetingTime, attendees, content })
    .eq('id', id)
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, meeting: data })
}

export async function DELETE(request: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_meetings').delete().eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
