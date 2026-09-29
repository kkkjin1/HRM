'use client'

import { useMembersContext } from '@/lib/MembersProvider'

// 여러 컴포넌트(룰렛/한마디/투표/낙서/멤버관리)가 이 훅을 동시에 호출한다.
// 실제 조회·실시간 구독은 MembersProvider(루트 layout)에서 한 번만 하고, 여기선 그 값을 읽기만 한다.
export function useMembers() {
  const { members, membersLoaded, reload } = useMembersContext()
  return { members, loaded: membersLoaded, reload }
}
