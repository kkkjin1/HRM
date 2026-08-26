'use client'

// 연상퀴즈(그림 전달, public/drawing-game.html)는 iframe으로만 열리는 별도 페이지라
// 다른 탭(예: 일상)에 있으면 내 차례가 와도 알 방법이 없었다. 대시보드 쪽에서 quiz_game
// 테이블을 직접 구독해 "지금 내가 그릴/맞힐 차례인지"만 가볍게 판별한다.
// 이름 매칭은 iframe이 쓰는 것과 동일한 identity(useCurrentMember().me.name)를 기준으로 한다.

import { useEffect, useId, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentMember } from '@/lib/useCurrentMember'

type QuizGameRow = { status: string; drawers: string[] | null; guesser: string | null; round: number }
export type QuizTurnRole = 'draw' | 'guess' | null

function roleOf(row: QuizGameRow | null, myName: string): QuizTurnRole {
  if (!row) return null
  if (row.status === 'drawing' && (row.drawers ?? [])[row.round] === myName) return 'draw'
  if (row.status === 'guessing' && row.guesser === myName) return 'guess'
  return null
}

export function useQuizMyTurn(): QuizTurnRole {
  const { me, loaded } = useCurrentMember()
  const [role, setRole] = useState<QuizTurnRole>(null)
  const instanceId = useId()

  useEffect(() => {
    if (!loaded || !me) return
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data } = await supabase.from('quiz_game').select('status, drawers, guesser, round').eq('id', 'main').maybeSingle()
      if (active && me) setRole(roleOf(data as QuizGameRow | null, me.name))
    })()

    const channel = supabase
      .channel(`quiz-turn-banner-${instanceId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quiz_game', filter: 'id=eq.main' }, payload => {
        if (active && me) setRole(roleOf(payload.new as QuizGameRow, me.name))
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [loaded, me, instanceId])

  return role
}
