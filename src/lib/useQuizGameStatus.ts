'use client'

// 연상퀴즈(그림 전달) 진행상황을 대시보드(iframe 바깥)에서도 알 수 있도록 quiz_game
// 테이블(id='main')을 직접 조회 + realtime 구독한다. useQuizMyTurn(내 차례 여부)과
// QuizStatusCard(전체 진행상황 카드)가 이 원시 상태를 공유한다.

import { useEffect, useId, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type QuizGameStatus = {
  status: 'setup' | 'drawing' | 'guessing' | 'reveal'
  round: number
  drawers: string[]
  guesser: string | null
  present_members: string[]
  word: string | null
  guess: string | null
  correct: boolean | null
  drawings: string[]
  phase_deadline: string | null
  turn_since: string | null // 지금 차례가 시작된 서버 시각(add_quiz_history.sql 트리거)
  started_at: string | null // 이번 판 시작 서버 시각
  skipped: string[] // 이번 판에서 시간 초과로 건너뛴 사람
}

export function useQuizGameStatus(): QuizGameStatus | null {
  const [row, setRow] = useState<QuizGameStatus | null>(null)
  const instanceId = useId()

  useEffect(() => {
    let active = true
    const supabase = createClient()

    ;(async () => {
      const { data } = await supabase
        .from('quiz_game')
        .select('status, round, drawers, guesser, present_members, word, guess, correct, drawings, phase_deadline, turn_since, started_at, skipped')
        .eq('id', 'main')
        .maybeSingle()
      if (active) setRow(data as QuizGameStatus | null)
    })()

    const channel = supabase
      .channel(`quiz-game-status-${instanceId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quiz_game', filter: 'id=eq.main' }, payload => {
        if (active) setRow(payload.new as QuizGameStatus)
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [instanceId])

  return row
}
