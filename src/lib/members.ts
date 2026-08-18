import type { MemberRole } from '@/lib/data'

export type Member = {
  id: string
  name: string
  nickname: string | null
  role: MemberRole
  color_key: number
  position: string | null
  hired_at: string | null
  birthday: string | null
  gives: string | null
  needs: string | null
  avatar_url: string | null
}

// 화면에 이름을 보여줄 땐 항상 이걸로 — 닉네임이 있으면 닉네임, 없으면 실명.
// 실명 자체가 필요한 곳(로그인 매칭, 관리자 화면, 프로필 카드의 실명 표시)은 member.name을 직접 쓴다.
export function displayName(member: Pick<Member, 'name' | 'nickname'> | null | undefined) {
  return member?.nickname?.trim() || member?.name || ''
}
