import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember, sessionName } from '@/lib/currentMember'
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml'
import { rrGroupNameOf } from '@/lib/rrServer'
import { putRrImage } from '@/lib/rrImage'
import {
  RR_ATTACHMENT_BUCKET, RR_ATTACHMENT_COLS, RR_BODY_MAX, RR_ENTRY_COLS, RR_FEEDBACK_MAX, RR_TITLE_MAX,
  canWriteRrFeedback, canWriteRrKind, type RrEntry,
} from '@/lib/rrMemo'

// R&R 메모 페이지의 회차 카드. 권한은 화면이 아니라 여기서 정한다(lib/rrMemo):
// 본문은 담당자(R&R 그룹 이름 = 로그인한 팀원 이름)와 팀장, 카드 오른쪽 피드백 칸은 팀장만.
// 충돌 방지는 본문(version)과 피드백(feedback_version)을 따로 — 담당자가 본문을 고치는 동안 팀장이 피드백을 써도 서로 막지 않는다.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// 변경 이력: 자동 저장이 잦아 매번 남기지 않고, 직전 이력에서 이만큼 지났거나 남의 글을 덮어쓸 때만 남긴다
const HISTORY_GAP_MS = 10 * 60 * 1000
const HISTORY_COLS = 'id, entry_id, kind, entry_date, title, body, feedback, version, feedback_version, saved_by, saved_at, reason, created_at'

type Db = ReturnType<typeof createServiceClient>
type Reason = 'edit' | 'feedback' | 'restore' | 'delete'

// 바뀌기 전 카드 내용(본문+피드백)을 이력에 남긴다. force면 조건 없이(되돌리기·삭제 직전).
// lastBy: 지금 고치려는 칸을 마지막으로 쓴 사람 — 내가 아니면 남의 글을 덮어쓰는 것이라 남긴다.
async function snapshot(supabase: Db, cur: RrEntry, by: string, reason: Reason, lastBy: string | null, force = false) {
  if (!cur.title.trim() && !cur.body.trim() && !cur.feedback.trim()) return
  if (!force) {
    const { data: last } = await supabase.from('rr_entry_history').select('created_at, version, feedback_version').eq('entry_id', cur.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const otherAuthor = !!lastBy && lastBy !== by
    const stale = !last || Date.now() - new Date(last.created_at).getTime() > HISTORY_GAP_MS
    if (!otherAuthor && !stale) return
    if (last && last.version === cur.version && last.feedback_version === cur.feedback_version) return // 같은 상태는 두 번 남기지 않는다
  }
  const savedBy = reason === 'feedback' ? cur.feedback_by : cur.updated_by
  const savedAt = reason === 'feedback' ? cur.feedback_at : cur.updated_at
  await supabase.from('rr_entry_history').insert({
    entry_id: cur.id, target_id: cur.target_id, kind: cur.kind, entry_date: cur.entry_date,
    title: cur.title, body: cur.body, feedback: cur.feedback, version: cur.version, feedback_version: cur.feedback_version,
    saved_by: savedBy, saved_at: savedAt, reason,
  })
}

function kstToday() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

const conflict = async (supabase: Db, id: string) => {
  const { data: latest } = await supabase.from('rr_entries').select(RR_ENTRY_COLS).eq('id', id).maybeSingle()
  return NextResponse.json({ ok: false, conflict: true, current: latest }, { status: 409 })
}

// ?target_id= → 그 R&R의 카드 전체 / ?counts=1 → R&R별 카드 수(R&R 탭 배지용) / ?history=카드id → 변경 이력
export async function GET(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
  const supabase = createServiceClient()

  const historyOf = request.nextUrl.searchParams.get('history')
  if (historyOf) {
    const { data, error } = await supabase.from('rr_entry_history').select(HISTORY_COLS).eq('entry_id', historyOf).order('created_at', { ascending: false }).limit(50)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, history: data ?? [] })
  }

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
  const ids = (data ?? []).map(e => e.id)
  const { data: atts, error: attErr } = ids.length
    ? await supabase.from('rr_attachments').select(RR_ATTACHMENT_COLS).in('entry_id', ids).order('created_at')
    : { data: [], error: null }
  if (attErr) return NextResponse.json({ ok: false, error: attErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, entries: data, attachments: atts ?? [] })
}

// 개인 노트 이미지는 본인만 보는 주소라, R&R로 옮길 때 팀 공용 이미지로 복사해 주소를 바꾼다. 못 옮긴 이미지는 뺀다.
const PERSONAL_IMG_RE = /\/api\/personal-note-image\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g
async function copyPersonalImages(supabase: Db, memberId: string, html: string) {
  const ids = [...new Set([...html.matchAll(PERSONAL_IMG_RE)].map(m => m[1]))]
  let out = html
  let dropped = 0
  for (const id of ids) {
    let url: string | null = null
    const { data } = await supabase.storage.from('personal-note-images').download(`${memberId}/${id}`)
    if (data) { try { url = await putRrImage(supabase, data, data.type || 'image/png') } catch { url = null } }
    if (url) out = out.split(`/api/personal-note-image/${id}`).join(url)
    else { dropped += 1; out = out.replace(new RegExp(`<img[^>]*/api/personal-note-image/${id}[^>]*>`, 'g'), '') }
  }
  return { html: out, dropped }
}

// 다음 회차 카드 — { target_id, entry_date? }. 첫 카드는 기획(plan), 그 뒤는 개선(improve).
// 개인 노트에서 등록: { action: 'from_note', target_id, title, body } — 노트 내용을 그대로 새 회차 카드로 복사한다.
export async function POST(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null)
  const targetId = typeof body?.target_id === 'string' ? body.target_id : ''
  const entryDate = typeof body?.entry_date === 'string' && DATE_RE.test(body.entry_date) ? body.entry_date : kstToday()
  if (!targetId) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const groupName = await rrGroupNameOf(supabase, targetId)
  if (groupName === null) return NextResponse.json({ ok: false, error: 'R&R 업무를 찾을 수 없습니다.' }, { status: 404 })
  if (!canWriteRrKind(session.member, groupName, 'plan')) return NextResponse.json({ ok: false, error: '담당자와 팀장만 쓸 수 있습니다.' }, { status: 403 })

  const { count } = await supabase.from('rr_entries').select('id', { count: 'exact', head: true })
    .eq('target_type', 'rr_item').eq('target_id', targetId).in('kind', ['plan', 'improve', 'report'])
  const kind = (count ?? 0) === 0 ? 'plan' : 'improve'

  let title = ''
  let html = ''
  let dropped = 0
  if (body?.action === 'from_note') {
    title = typeof body.title === 'string' ? body.title.slice(0, RR_TITLE_MAX) : ''
    const copied = await copyPersonalImages(supabase, session.member.id, sanitizeNoteHtml(typeof body.body === 'string' ? body.body.slice(0, RR_BODY_MAX) : ''))
    html = sanitizeNoteHtml(copied.html)
    dropped = copied.dropped
    if (!title.trim() && !html.trim()) return NextResponse.json({ ok: false, error: '비어 있는 노트는 등록할 수 없습니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('rr_entries')
    .insert({ target_type: 'rr_item', target_id: targetId, kind, entry_date: entryDate, title, body: html, author_id: session.member.id, author_name: session.member.name, updated_by: sessionName(session) })
    .select(RR_ENTRY_COLS).single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entry: data, round: (count ?? 0) + 1, dropped_images: dropped })
}

// 카드 고치기
//  - 본문: { id, expected_version, title?, body?, entry_date?, restore? }
//  - 피드백: { id, expected_feedback_version, feedback, restore? } (팀장만)
// 그 사이 다른 사람이 저장했으면 409와 최신 카드를 돌려준다.
export async function PATCH(request: NextRequest) {
  const session = await getCurrentMember()
  if (!session?.member) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const me = sessionName(session)
  const restore = body.restore === true

  const supabase = createServiceClient()
  const { data: cur } = await supabase.from('rr_entries').select(RR_ENTRY_COLS).eq('id', id).maybeSingle()
  if (!cur) return NextResponse.json({ ok: false, error: '카드를 찾을 수 없습니다.' }, { status: 404 })
  const entry = cur as RrEntry

  // ── 피드백 칸 ──
  if (typeof body.feedback === 'string') {
    const expected = body.expected_feedback_version
    if (typeof expected !== 'number' || !Number.isInteger(expected)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
    if (!canWriteRrFeedback(session.member)) return NextResponse.json({ ok: false, error: '피드백은 팀장만 쓸 수 있습니다.' }, { status: 403 })
    const feedback = body.feedback.slice(0, RR_FEEDBACK_MAX)
    if (feedback === entry.feedback) return NextResponse.json({ ok: true, entry })
    if (entry.feedback_version === expected) await snapshot(supabase, entry, me, restore ? 'restore' : 'feedback', entry.feedback_by, restore)
    const { data, error } = await supabase
      .from('rr_entries')
      .update({ feedback, feedback_version: expected + 1, feedback_at: new Date().toISOString(), feedback_by: me })
      .eq('id', id).eq('feedback_version', expected)
      .select(RR_ENTRY_COLS).maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!data) return conflict(supabase, id)
    return NextResponse.json({ ok: true, entry: data })
  }

  // ── 본문 ──
  const expected = body.expected_version
  if (typeof expected !== 'number' || !Number.isInteger(expected)) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const groupName = (await rrGroupNameOf(supabase, entry.target_id)) ?? ''
  if (!canWriteRrKind(session.member, groupName, entry.kind)) return NextResponse.json({ ok: false, error: '이 카드를 고칠 권한이 없습니다.' }, { status: 403 })

  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string') update.title = body.title.slice(0, RR_TITLE_MAX)
  if (typeof body.body === 'string') update.body = sanitizeNoteHtml(body.body.slice(0, RR_BODY_MAX))
  if (body.entry_date !== undefined) {
    if (typeof body.entry_date !== 'string' || !DATE_RE.test(body.entry_date)) return NextResponse.json({ ok: false, error: 'invalid date' }, { status: 400 })
    update.entry_date = body.entry_date
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true, entry })
  // 본문·제목이 바뀌면 바뀌기 전 내용을 이력에 남긴다(되돌리기는 항상)
  const contentChanges = ('title' in update && update.title !== entry.title) || ('body' in update && update.body !== entry.body)
  if (contentChanges && entry.version === expected) await snapshot(supabase, entry, me, restore ? 'restore' : 'edit', entry.updated_by, restore)

  const { data, error } = await supabase
    .from('rr_entries')
    .update({ ...update, version: expected + 1, updated_at: new Date().toISOString(), updated_by: me })
    .eq('id', id).eq('version', expected)
    .select(RR_ENTRY_COLS).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return conflict(supabase, id)
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
  const { data: curRow } = await supabase.from('rr_entries').select(RR_ENTRY_COLS).eq('id', id).maybeSingle()
  if (!curRow) return NextResponse.json({ ok: true })
  const cur = curRow as RrEntry
  const groupName = (await rrGroupNameOf(supabase, cur.target_id)) ?? ''
  if (!canWriteRrKind(session.member, groupName, cur.kind)) return NextResponse.json({ ok: false, error: '이 카드를 지울 권한이 없습니다.' }, { status: 403 })

  await snapshot(supabase, cur, sessionName(session), 'delete', null, true)
  // 첨부 목록은 카드와 같이 지워지지만(FK cascade) 버킷의 파일은 따로 지운다
  const { data: atts } = await supabase.from('rr_attachments').select('path').eq('entry_id', id)
  const { error } = await supabase.from('rr_entries').delete().eq('id', id)
  const paths = (atts ?? []).flatMap(a => (a.path ? [a.path] : [])) // 링크 첨부는 버킷 파일이 없다
  if (!error && paths.length) await supabase.storage.from(RR_ATTACHMENT_BUCKET).remove(paths)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
