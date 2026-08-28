'use client'

// 연상퀴즈(그림 전달, public/drawing-game.html)는 iframe으로만 열리는 별도 페이지라
// 다른 탭(예: 일상)에 있으면 내 차례가 와도 알 방법이 없었다. useQuizGameStatus로 받은
// 상태에서 "지금 내가 그릴/맞힐 차례인지"만 가볍게 판별한다.
// 이름 매칭은 iframe이 쓰는 것과 동일한 identity(useCurrentMember().me.name)를 기준으로 한다.

import { useCurrentMember } from '@/lib/useCurrentMember'
import { useQuizGameStatus } from '@/lib/useQuizGameStatus'

export type QuizTurnRole = 'draw' | 'guess' | null

export function useQuizMyTurn(): QuizTurnRole {
  const { me } = useCurrentMember()
  const row = useQuizGameStatus()
  if (!row || !me) return null
  if (row.status === 'drawing' && (row.drawers ?? [])[row.round] === me.name) return 'draw'
  if (row.status === 'guessing' && row.guesser === me.name) return 'guess'
  return null
}
