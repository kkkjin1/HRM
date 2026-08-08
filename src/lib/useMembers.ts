'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/lib/members'

// 여러 컴포넌트(룰렛/한마디/투표/낙서/멤버관리)가 공유하는 멤버 목록.
// members 테이블 변경을 실시간 구독해서, 한 곳에서 멤버를 추가/삭제/역할변경하면
// 다른 탭의 확률·닉네임 표시가 새로고침 없이 즉시 갱신된다.
export function useMembers() {
  const [members, setMembers] = useState<Member[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('members').select('id, name, role, color_key').order('created_at')
    if (data) setMembers(data as Member[])
    setLoaded(true)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    reload()

    const channel = supabase
      .channel('members-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => reload())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [reload])

  return { members, loaded, reload }
}
