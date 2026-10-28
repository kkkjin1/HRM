import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentMember } from '@/lib/currentMember'
import { createServiceClient } from '@/lib/supabase/service'
import type { MemberRole } from '@/lib/data'

// 팀원 관리(/fun/settings/members) 전용. 예전엔 브라우저가 members를 직접 추가·삭제·역할 변경했고,
// 권한은 화면에서 관리자 이메일 목록으로만 걸렀다 → 서버가 권한을 확인하고 service role로 쓴다.
// 권한 = 로그인 계정 id로 연결된 재직 팀원의 can_manage_members(기존 관리자 2명 = 팀장·파트장, SQL로만 바뀜).
// 역할·계정 연결·관리 권한·퇴사는 DB 트리거(members_guard)가 브라우저에서 바꾸는 것을 막는다.
// 삭제는 하지 않는다: 지우면 CASCADE로 그 사람의 기록이 함께 사라져서, 퇴사일(left_at)만 남긴다.

const ROLES: MemberRole[] = ['lead', 'part_lead', 'member']
const TEXT_FIELDS = new Set(['name', 'nickname', 'position'])
const DATE_FIELDS = new Set(['hired_at', 'birthday'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// 통과하면 관리자 본인의 members.id, 아니면 돌려줄 응답(401/403).
async function requireMemberAdmin(): Promise<{ adminId: string } | NextResponse> {
  const session = await getCurrentMember()
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  if (!session.member?.canManageMembers) return NextResponse.json({ ok: false, error: '팀원 관리 권한이 없습니다' }, { status: 403 })
  return { adminId: session.member.id }
}

// 계정 연결 화면용 — 로그인 계정 목록과 지금 연결 상태.
export async function GET() {
  const admin = await requireMemberAdmin()
  if (admin instanceof NextResponse) return admin
  const supabase = createServiceClient()
  const { data: users, error } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const accounts = users.users.map(u => ({ id: u.id, name: (u.user_metadata?.name as string | undefined) ?? '', email: u.email ?? '' }))

  const { data: links, error: linkError } = await supabase.from('members').select('id, auth_user_id')
  if (linkError) return NextResponse.json({ ok: false, error: linkError.message }, { status: 500 })
  return NextResponse.json({ ok: true, accounts, links: Object.fromEntries(links.map(l => [l.id, l.auth_user_id])) })
}

// 팀원 추가
export async function POST(request: NextRequest) {
  const admin = await requireMemberAdmin()
  if (admin instanceof NextResponse) return admin
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 40) : ''
  const role = ROLES.includes(body?.role) ? body.role as MemberRole : 'member'
  if (!name) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  const position = typeof body?.position === 'string' && body.position.trim() ? body.position.trim().slice(0, 40) : null
  const hiredAt = typeof body?.hired_at === 'string' && DATE_RE.test(body.hired_at) ? body.hired_at : null
  const birthday = typeof body?.birthday === 'string' && DATE_RE.test(body.birthday) ? body.birthday : null

  const supabase = createServiceClient()
  const { error } = await supabase.from('members').insert({
    name, role, color_key: Math.floor(Math.random() * 8), position, hired_at: hiredAt, birthday,
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// 한 사람의 역할 / 기본 정보 한 칸 / 계정 연결 / 퇴사 처리 중 하나를 바꾼다.
export async function PATCH(request: NextRequest) {
  const admin = await requireMemberAdmin()
  if (admin instanceof NextResponse) return admin
  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) return NextResponse.json({ ok: false, error: 'invalid role' }, { status: 400 })
    patch.role = body.role
  } else if (typeof body.field === 'string') {
    const value = body.value === null ? null : typeof body.value === 'string' ? body.value.trim() : undefined
    if (value === undefined) return NextResponse.json({ ok: false, error: 'invalid value' }, { status: 400 })
    if (TEXT_FIELDS.has(body.field)) {
      if (body.field === 'name' && !value) return NextResponse.json({ ok: false, error: '이름은 비울 수 없습니다' }, { status: 400 })
      patch[body.field] = value ? value.slice(0, 40) : null
    } else if (DATE_FIELDS.has(body.field)) {
      if (value && !DATE_RE.test(value)) return NextResponse.json({ ok: false, error: 'invalid date' }, { status: 400 })
      patch[body.field] = value || null
    } else {
      return NextResponse.json({ ok: false, error: 'invalid field' }, { status: 400 })
    }
  } else if ((body.auth_user_id !== undefined || body.leave === true) && id === admin.adminId) {
    // 자기 계정 연결을 끊거나 자기를 퇴사 처리하면 그 즉시 관리 권한을 잃는다 — 다른 관리자가 하도록 막는다.
    return NextResponse.json({ ok: false, error: '본인의 계정 연결·퇴사는 다른 관리자가 처리해야 합니다' }, { status: 400 })
  } else if (body.auth_user_id !== undefined) {
    // 계정 연결 — 다른 팀원에 이미 연결된 계정이면 DB 유일 인덱스가 거부한다.
    if (body.auth_user_id !== null && typeof body.auth_user_id !== 'string') return NextResponse.json({ ok: false, error: 'invalid account' }, { status: 400 })
    patch.auth_user_id = body.auth_user_id
  } else if (body.leave === true) {
    patch.left_at = typeof body.left_at === 'string' && DATE_RE.test(body.left_at) ? body.left_at : new Date().toISOString().slice(0, 10)
  } else {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('members').update(patch).eq('id', id)
  if (error) {
    const duplicate = error.code === '23505'
    return NextResponse.json({ ok: false, error: duplicate ? '이미 다른 팀원에 연결된 계정입니다' : error.message }, { status: duplicate ? 409 : 500 })
  }
  return NextResponse.json({ ok: true })
}
