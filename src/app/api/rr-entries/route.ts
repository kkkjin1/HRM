import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember, sessionName } from '@/lib/currentMember'
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml'
import { RR_BODY_MAX, RR_ENTRY_COLS, RR_TITLE_MAX, canWriteRrKind, isRrEntryKind, type RrEntry } from '@/lib/rrMemo'

// R&R 메모 페이지의 회차 카드. 권한은 화면이 아니라 여기서 정한다(lib/rrMemo):
// 담당자(R&R 그룹 이름 = 로그인한 팀원 이름)와 팀장만 쓰고, 피드백 카드는 팀장만. 고칠 때는 version으로 동시편집 충돌을 막는다.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// R&R 업무의 담당 그룹 이름 — 없는 업무면 null
async function groupNameOf(supabase: ReturnType<typeof createServiceClient>, itemId: string) {
  const { data } = await supabase.from('team_log_items').select('team_log_groups(name)').eq('id', itemId).maybeSingle()
  const g = (data as { team_log_groups: { name: string } | null } | null)?.team_log_groups
  return g ? g.name : null
}

function kstToday() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

// ?target_id= → 그 R&R의 카드 전체 / ?counts=1 → R&R별 카드 수(R&R 탭 배지용)
export async function GET(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
  const supabase = createServiceClient()

  if (request.nextUrl.searchParams.get('counts')) {
    const { data, error } = await supabase.from('rr_entries').select('target_id').eq('target_type', 'rr_item')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const counts: Record<string, number> = {}
    for (const r of data ?? []) counts[r.target_id] = (counts[r.target_id] ?? 0) + 1
    return NextResponse.json({ ok: true, counts })
  }

  const targetId = request.nextUrl.searchParams.get('target_id')
  if (!targetId) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const { data, error } = await supabase
    .from('rr_entries').select(RR_ENTRY_COLS)
    .eq('target_type', 'rr_item').eq('target_id', targetId)
    .order('entry_date').order('created_at')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entries: data })
}

// 새 카드 — { target_id, kind, entry_date? }
export async function POST(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null)
  const targetId = typeof body?.target_id === 'string' ? body.target_id : ''
  const kind = body?.kind
  const entryDate = typeof body?.entry_date === 'string' && DATE_RE.test(body.entry_date) ? body.entry_date : kstToday()
  if (!targetId || !isRrEntryKind(kind)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const groupName = await groupNameOf(supabase, targetId)
  if (groupName === null) return NextResponse.json({ ok: false, error: 'R&R 업무를 찾을 수 없습니다.' }, { status: 404 })
  if (!canWriteRrKind(session.member, groupName, kind)) {
    return NextResponse.json({ ok: false, error: kind === 'feedback' ? '피드백은 팀장만 쓸 수 있습니다.' : '담당자와 팀장만 쓸 수 있습니다.' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('rr_entries')
    .insert({ target_type: 'rr_item', target_id: targetId, kind, entry_date: entryDate, author_id: session.member.id, author_name: session.member.name, updated_by: sessionName(session) })
    .select(RR_ENTRY_COLS).single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entry: data })
}

// 카드 고치기 — { id, expected_version, title?, body?, kind?, entry_date? }
// 그 사이 다른 사람이 저장했으면 409와 최신 카드를 돌려준다.
export async function PATCH(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const expected = body?.expected_version
  if (!id || typeof expected !== 'number' || !Number.isInteger(expected)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: cur } = await supabase.from('rr_entries').select(RR_ENTRY_COLS).eq('id', id).maybeSingle()
  if (!cur) return NextResponse.json({ ok: false, error: '카드를 찾을 수 없습니다.' }, { status: 404 })
  const entry = cur as RrEntry
  const groupName = (await groupNameOf(supabase, entry.target_id)) ?? ''

  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string') update.title = body.title.slice(0, RR_TITLE_MAX)
  if (typeof body.body === 'string') update.body = sanitizeNoteHtml(body.body.slice(0, RR_BODY_MAX))
  if (body.entry_date !== undefined) {
    if (typeof body.entry_date !== 'string' || !DATE_RE.test(body.entry_date)) return NextResponse.json({ ok: false, error: 'invalid date' }, { status: 400 })
    update.entry_date = body.entry_date
  }
  if (body.kind !== undefined) {
    if (!isRrEntryKind(body.kind)) return NextResponse.json({ ok: false, error: 'invalid kind' }, { status: 400 })
    update.kind = body.kind
  }
  // 지금 종류와 바꿀 종류 둘 다 쓸 권한이 있어야 한다(담당자가 피드백 카드를 고치거나, 자기 카드를 피드백으로 바꾸는 것 차단)
  const nextKind = (update.kind as RrEntry['kind'] | undefined) ?? entry.kind
  if (!canWriteRrKind(session.member, groupName, entry.kind) || !canWriteRrKind(session.member, groupName, nextKind)) {
    return NextResponse.json({ ok: false, error: '이 카드를 고칠 권한이 없습니다.' }, { status: 403 })
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true, entry })

  const { data, error } = await supabase
    .from('rr_entries')
    .update({ ...update, version: expected + 1, updated_at: new Date().toISOString(), updated_by: sessionName(session) })
    .eq('id', id).eq('version', expected)
    .select(RR_ENTRY_COLS).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) {
    const { data: latest } = await supabase.from('rr_entries').select(RR_ENTRY_COLS).eq('id', id).maybeSingle()
    return NextResponse.json({ ok: false, conflict: true, current: latest }, { status: 409 })
  }
  return NextResponse.json({ ok: true, entry: data })
}

// 카드 지우기 — { id }
export async function DELETE(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: cur } = await supabase.from('rr_entries').select('target_id, kind').eq('id', id).maybeSingle()
  if (!cur) return NextResponse.json({ ok: true })
  const groupName = (await groupNameOf(supabase, cur.target_id)) ?? ''
  if (!canWriteRrKind(session.member, groupName, cur.kind)) return NextResponse.json({ ok: false, error: '이 카드를 지울 권한이 없습니다.' }, { status: 403 })

  const { error } = await supabase.from('rr_entries').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
