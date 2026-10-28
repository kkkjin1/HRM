import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentMember } from '@/lib/currentMember'
import { sanitizeNoteHtml } from '@/lib/sanitizeNoteHtml'

const NOTE_MAX = 200000
const TITLE_MAX = 120
const SELECT_COLS = 'id, title, content, sort_order, created_at, updated_at'

// 로그인 계정 id로 연결된 팀원 이름으로 본인 team_log_personal_notes 행만 찾는다 — 요청 바디의 id·member_name을 믿지 않는다(본인 것만 보고 쓰게).
// 계정 이름(user_metadata.name)은 사용자가 바꿀 수 있어 남의 노트를 여는 데 쓰일 수 있으므로 쓰지 않는다. 연결이 없으면 거부.
async function resolveOwnerName() {
  const session = await getCurrentMember()
  return session?.member?.name ?? null
}

export async function GET() {
  const ownerName = await resolveOwnerName()
  if (!ownerName) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_personal_notes')
    .select(SELECT_COLS)
    .eq('member_name', ownerName)
    .order('sort_order')
    .order('created_at')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, notes: data })
}

// 새 카드 — 맨 뒤(가장 큰 sort_order + 1)에 빈 내용으로 만든다.
export async function POST() {
  const ownerName = await resolveOwnerName()
  if (!ownerName) return NextResponse.json({ ok: false }, { status: 401 })

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('team_log_personal_notes')
    .select('sort_order')
    .eq('member_name', ownerName)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('team_log_personal_notes')
    .insert({ member_name: ownerName, title: '', content: '', sort_order: nextOrder })
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, note: data })
}

// 카드 내용 저장 — id는 본인 소유일 때만 먹는다(.eq('member_name', ownerName)로 교차 접근 차단).
export async function PUT(request: NextRequest) {
  const ownerName = await resolveOwnerName()
  if (!ownerName) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const title = typeof body?.title === 'string' ? body.title.slice(0, TITLE_MAX) : null
  const content = typeof body?.content === 'string' ? sanitizeNoteHtml(body.content.slice(0, NOTE_MAX)) : null
  if (!id || title === null || content === null) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_log_personal_notes')
    .update({ title, content, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('member_name', ownerName)
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, note: data })
}

// 카드 순서 바꾸기 — 끌어서 옮긴 뒤 전체 순서(id 배열)를 한 번에 받아 sort_order를 다시 매긴다.
export async function PATCH(request: NextRequest) {
  const ownerName = await resolveOwnerName()
  if (!ownerName) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const order: string[] | null = Array.isArray(body?.order) ? body.order.filter((v: unknown): v is string => typeof v === 'string') : null
  if (!order || order.length === 0) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const results = await Promise.all(
    order.map((id, index) =>
      supabase.from('team_log_personal_notes').update({ sort_order: index }).eq('id', id).eq('member_name', ownerName),
    ),
  )
  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ ok: false, error: failed.error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const ownerName = await resolveOwnerName()
  if (!ownerName) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('team_log_personal_notes').delete().eq('id', id).eq('member_name', ownerName)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
