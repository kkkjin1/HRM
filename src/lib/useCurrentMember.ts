'use client'

import { useMembersContext } from '@/lib/MembersProvider'
import { bestNameMatch } from '@/lib/memberMatch'
import type { Member } from '@/lib/members'

// members 테이블에는 인증 계정과의 연결 컬럼이 없어서, 기존 HRM 로그인 방식과 동일하게
// auth user_metadata.name ↔ members.name 을 매칭해 "나"를 찾는다.
// auth 이름·members 목록은 MembersProvider가 앱 전체에서 한 번만 불러온 값을 쓴다.
export function useCurrentMember(): { me: Member | null; loaded: boolean } {
  const { members, membersLoaded, authName, authLoaded } = useMembersContext()
  const me = authName ? bestNameMatch(authName, members) : null
  return { me, loaded: membersLoaded && authLoaded }
}
