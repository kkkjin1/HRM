'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/lib/members'

// 팀원 목록 + 로그인 사용자 이름을 앱 전체에서 딱 한 번만 불러와 공유한다.
// 예전엔 useMembers/useCurrentMember를 부르는 컴포넌트마다 members 조회·실시간 채널·auth.getUser()를
// 각자 따로 했다(일상 탭 하나에 getUser 약 15회, members 조회 20회+, 채널 20개+). getUser()는 auth
// 잠금을 잡은 채 네트워크 요청을 하고, 일반 DB 조회도 토큰을 꺼낼 때 같은 잠금을 기다려서 — 탭을
// 누를 때마다 이 요청들이 한 줄로 줄을 서며 화면이 수 초씩 버벅였다. 여기서 1회 조회·1채널로 모은다.
type MembersContextValue = {
  members: Member[]
  membersLoaded: boolean
  reload: () => Promise<void>
  authName: string | null
  authLoaded: boolean
}

const MembersContext = createContext<MembersContextValue | null>(null)

export function MembersProvider({ children }: { children: React.ReactNode }) {
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [authName, setAuthName] = useState<string | null>(null)
  const [authLoaded, setAuthLoaded] = useState(false)

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('members').select('id, name, nickname, role, color_key, position, hired_at, birthday, gives, needs, avatar_url').order('created_at')
    if (data) setMembers(data as Member[])
    setMembersLoaded(true)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    reload()
    supabase.auth.getUser().then(({ data }) => {
      setAuthName(data.user?.user_metadata?.name ?? data.user?.email ?? null)
      setAuthLoaded(true)
    })

    // 로그인/로그아웃/이름 변경 시에만 갱신. 콜백 안에서 supabase 호출을 바로 await하면 auth 잠금과
    // 교착될 수 있어(supabase-js 알려진 이슈) members 재조회는 setTimeout으로 콜백 밖에서 돌린다.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'USER_UPDATED') return
      setAuthName(session?.user?.user_metadata?.name ?? session?.user?.email ?? null)
      setAuthLoaded(true)
      if (event === 'SIGNED_IN') setTimeout(() => { reload() }, 0)
    })

    const channel = supabase
      .channel('members-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => reload())
      .subscribe()

    return () => {
      sub.subscription.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [reload])

  return (
    <MembersContext.Provider value={{ members, membersLoaded, reload, authName, authLoaded }}>
      {children}
    </MembersContext.Provider>
  )
}

export function useMembersContext() {
  const ctx = useContext(MembersContext)
  if (!ctx) throw new Error('MembersProvider 바깥에서 useMembers/useCurrentMember를 호출했습니다.')
  return ctx
}
