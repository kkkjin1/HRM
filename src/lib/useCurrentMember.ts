'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import { bestNameMatch } from '@/lib/memberMatch'
import type { Member } from '@/lib/members'

// members 테이블에는 인증 계정과의 연결 컬럼이 없어서, 기존 HRM 로그인 방식과 동일하게
// auth user_metadata.name ↔ members.name 을 매칭해 "나"를 찾는다.
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
