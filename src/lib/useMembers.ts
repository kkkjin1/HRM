'use client'

import { useEffect, useState, useCallback, useId } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/lib/members'

// 여러 컴포넌트(룰렛/한마디/투표/낙서/멤버관리)가 이 훅을 동시에 호출한다.
// createClient()가 반환하는 supabase 클라이언트는 내부적으로 싱글턴이라, 채널 이름이
// 겹치면 "cannot add postgres_changes callbacks after subscribe()"로 크래시한다.
// useId()로 호출 인스턴스마다 고유한 채널을 만들어 그 충돌을 피한다.
export function useMembers() {
  const instanceId = useId()
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
      .channel(`members-changes-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => reload())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [reload, instanceId])

  return { members, loaded, reload }
}
