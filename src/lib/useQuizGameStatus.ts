'use client'

// 연상퀴즈(그림 전달) 진행상황을 대시보드(iframe 바깥)에서도 알 수 있도록 quiz_game
// 테이블(id='main')을 직접 조회 + realtime 구독한다. useQuizMyTurn(내 차례 여부)과
// QuizStatusCard(전체 진행상황 카드)가 이 원시 상태를 공유한다.

import { useEffect, useState } from 'react'
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

// 이 훅은 홈에서 3곳(QuizStatusCard·useQuizMyTurn·useQuizAutomation)이 같이 쓴다.
// 예전엔 쓰는 곳마다 조회 1번 + 실시간 채널 1개씩 따로 열었다 — 이제 조회·채널을 하나로 묶어 나눠 쓴다(2026-11-23).
// 마지막 사용처가 사라지면 채널을 닫고, 다시 쓰기 시작하면 새로 조회한다.
const SELECT_COLS = 'status, round, drawers, guesser, present_members, word, guess, correct, drawings, phase_deadline, turn_since, started_at, skipped'
let sharedRow: QuizGameStatus | null = null
const listeners = new Set<(row: QuizGameStatus | null) => void>()
let stopShared: (() => void) | null = null

function emit(row: QuizGameStatus | null) {
  sharedRow = row
  for (const fn of listeners) fn(row)
}

function startShared() {
  let active = true
  const supabase = createClient()
  ;(async () => {
    const { data } = await supabase.from('quiz_game').select(SELECT_COLS).eq('id', 'main').maybeSingle()
    if (active) emit(data as QuizGameStatus | null)
  })()
  const channel = supabase
    .channel('quiz-game-status-shared')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quiz_game', filter: 'id=eq.main' }, payload => {
      if (active) emit(payload.new as QuizGameStatus)
    })
    .subscribe()
  return () => {
    active = false
    void supabase.removeChannel(channel)
  }
}

export function useQuizGameStatus(): QuizGameStatus | null {
  const [row, setRow] = useState<QuizGameStatus | null>(sharedRow)

  useEffect(() => {
    listeners.add(setRow)
    // 이미 받아 둔 값은 useState 초기값(sharedRow)으로 들어온다
    if (!stopShared) stopShared = startShared()
    return () => {
      listeners.delete(setRow)
      if (listeners.size === 0 && stopShared) {
        stopShared()
        stopShared = null
        sharedRow = null
      }
    }
  }, [])

  return row
}
