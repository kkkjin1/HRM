import { requireUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import type { MemberRole } from '@/lib/data'

type Claims = NonNullable<Awaited<ReturnType<typeof requireUser>>>

export type CurrentMember = { id: string; name: string; role: MemberRole; canManageMembers: boolean }

export type Session = {
  claims: Claims
  member: CurrentMember | null // null = 로그인했지만 연결된 재직 팀원 없음 → 팀원 권한이 필요한 일은 모두 거부
}

// 지금 로그인한 사람의 members 행 — 로그인 계정 id(검증된 JWT의 sub = auth.uid(), 사용자가 바꿀 수 없음)와
// members.auth_user_id가 같은 재직자(left_at 없음)만 인정한다.
// 이름(user_metadata.name)·이메일로는 찾지 않는다: user_metadata는 사용자가 auth.updateUser({ data })로 바꿀 수 있어서
// 예전 이름 매칭에선 이름을 팀장 이름으로 바꾸면 팀장 권한과 남의 개인 노트를 얻을 수 있었다.
// 컬럼이 없거나(add_auth_identity.sql 적용 전) 조회가 실패하면 member = null — 권한은 거부 쪽으로 실패한다.
export async function getCurrentMember(): Promise<Session | null> {
  const claims = await requireUser()
  if (!claims) return null
  const sub = typeof claims.sub === 'string' ? claims.sub : ''
  if (!sub) return { claims, member: null }

  const { data, error } = await createServiceClient()
    .from('members')
    .select('id, name, role, can_manage_members')
    .eq('auth_user_id', sub)
    .is('left_at', null)
    .maybeSingle()
  if (error || !data) return { claims, member: null }
  return { claims, member: { id: data.id, name: data.name, role: data.role, canManageMembers: data.can_manage_members === true } }
}

// 저장 기록(updated_by 등)에 남기는 표시용 이름 — 연결된 팀원 이름, 없으면 로그인 이메일.
// 권한 판별에는 쓰지 않는다. 사용자가 바꿀 수 있는 user_metadata.name은 표시용으로도 쓰지 않는다.
export function sessionName(session: Session) {
  return session.member?.name ?? (typeof session.claims.email === 'string' ? session.claims.email : '')
}
