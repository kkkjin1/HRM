'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import type { Member } from '@/lib/members'

// members 테이블에는 인증 계정과의 연결 컬럼이 없어서, 기존 HRM 로그인 방식과 동일하게
// auth user_metadata.name ↔ members.name 을 매칭해 "나"를 찾는다.
// 계정에는 성을 포함한 전체 이름("김진일")이, members에는 시드로 넣은 이름("진일")이 들어있는
// 경우처럼 완전히 같은 문자열이 아닐 수 있어서, 포함관계까지 확인하고 그중 가장 길게
// 겹치는 이름을 고른다.
function bestNameMatch(authName: string, members: Member[]): Member | null {
  const exact = members.find(m => m.name === authName)
  if (exact) return exact

  const candidates = members.filter(m => authName.includes(m.name) || m.name.includes(authName))
  if (candidates.length === 0) return null
  return candidates.reduce((best, m) => (m.name.length > best.name.length ? m : best))
}

export function useCurrentMember(): { me: Member | null; loaded: boolean } {
  const { members, loaded: membersLoaded } = useMembers()
  const [authName, setAuthName] = useState<string | null>(null)
  const [authLoaded, setAuthLoaded] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setAuthName(data.user?.user_metadata?.name ?? data.user?.email ?? null)
      setAuthLoaded(true)
    })
  }, [])

  const me = authName ? bestNameMatch(authName, members) : null

  return { me, loaded: membersLoaded && authLoaded }
}
