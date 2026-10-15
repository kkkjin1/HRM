'use client'

import { useMembersContext } from '@/lib/MembersProvider'

// 여러 컴포넌트(룰렛/한마디/투표/낙서/멤버관리)가 이 훅을 동시에 호출한다.
// 실제 조회·실시간 구독은 MembersProvider(루트 layout)에서 한 번만 하고, 여기선 그 값을 읽기만 한다.
//
// 기본 명단(members)은 "오늘 기준 이미 입사한 사람"만이다 — 입사 예정자는 퀴즈·운세·룰렛·투표 등
// 팀 참여형 기능 어디에도 자동으로 나오지 않는다. 새 기능도 이 훅을 쓰면 따로 거를 필요 없다.
// 입사 예정자까지 필요한 곳(팀원 관리, 프로필, 이름 찾기)은 allMembers 또는 useAllMembers()를 쓴다.
export function useMembers() {
  const { activeMembers, members, membersLoaded, reload } = useMembersContext()
  return { members: activeMembers, allMembers: members, loaded: membersLoaded, reload }
}

// 입사 예정자 포함 전체 명단 — 팀원 관리·프로필·작성자 이름 찾기 전용
export function useAllMembers() {
  const { members, membersLoaded, reload } = useMembersContext()
  return { members, loaded: membersLoaded, reload }
}
