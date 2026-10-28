'use client'

import { useMembersContext } from '@/lib/MembersProvider'
import type { Member } from '@/lib/members'

// "나" = 로그인 계정에 연결된 members 행(members.auth_user_id ↔ auth.uid(), DB 함수 current_member_id).
// 계정 이름(user_metadata.name)은 사용자가 바꿀 수 있어서 쓰지 않는다 — 연결이 없으면 "나 없음".
// 화면 판별일 뿐이고, 실제 권한은 DB 정책(RLS)과 서버 API가 다시 확인한다.
// auth 정보·members 목록은 MembersProvider가 앱 전체에서 한 번만 불러온 값을 쓴다.
export function useCurrentMember(): { me: Member | null; loaded: boolean } {
  const { members, membersLoaded, myMemberId, authLoaded } = useMembersContext()
  const me = myMemberId ? members.find(m => m.id === myMemberId) ?? null : null
  return { me, loaded: membersLoaded && authLoaded }
}
