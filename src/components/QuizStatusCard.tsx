'use client'

// 연상퀴즈 진행상황을 참여 여부와 무관하게 일상 탭에서 항상 볼 수 있게 하는 카드.
// TeamFate(오늘의 팀 운명) 옆 여백에 배치 — 같은 흰 카드 스타일을 맞춰서 이질감 없게.
// 위 60%는 상태와 무관하게 고정된 그림(🎨), 아래 40%는 몇 단계·누가 그리는 중인지 같은
// 실시간 상태 텍스트.
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useQuizGameStatus } from '@/lib/useQuizGameStatus'
import { useQuizMyTurn } from '@/lib/useQuizMyTurn'
import { TURN_WAIT_MIN, minutesSince } from '@/lib/useQuizAutomation'
import { useEffect, useState } from 'react'

export default function QuizStatusCard({ onGoToQuiz }: { onGoToQuiz: () => void }) {
  const { me } = useCurrentMember()
  const row = useQuizGameStatus()
  const myTurn = useQuizMyTurn()
  // 남은 대기 시간 표시를 1분마다 새로 그린다
  const [, setTick] = useState(0)
  useEffect(() => { const t = setInterval(() => setTick(v => v + 1), 60_000); return () => clearInterval(t) }, [])
  // 차례가 왔는데 아직 시작 안 했으면 "N분 뒤 자동으로 넘어가요"
  const waitLeft = row && (row.status === 'drawing' || row.status === 'guessing') && !row.phase_deadline
    ? Math.max(1, Math.ceil(TURN_WAIT_MIN - minutesSince(row.turn_since))) : null
  const waitNote = waitLeft != null ? ` · ${waitLeft}분 뒤 자동 넘김` : ''

  function body(): { main: string; sub: string } {
    if (!row || row.status === 'setup') {
      if (row?.word) {
        return { main: `지난 판: "${row.word}"`, sub: row.correct ? '정답 성공 ✅' : '실패 ❌' }
      }
      return { main: '아직 진행된 판이 없어요', sub: '팀원들과 그림 전달 한 판 어때요?' }
    }
    if (row.status === 'drawing') {
      const drawers = row.drawers || []
      const current = drawers[row.round] ?? ''
      return {
        main: `${row.round + 1} / ${drawers.length} 단계`,
        sub: current === me?.name ? '내가 그릴 차례예요!' + waitNote : (row.phase_deadline ? `${current}님이 그리는 중` : `${current}님 차례${waitNote}`),
      }
    }
    if (row.status === 'guessing') {
      return {
        main: '정답 맞추기',
        sub: row.guesser === me?.name ? '내가 맞힐 차례예요!' + waitNote : (row.phase_deadline ? `${row.guesser ?? ''}님이 맞히는 중` : `${row.guesser ?? ''}님 차례${waitNote}`),
      }
    }
    return { main: '라운드 종료!', sub: '결과를 확인해보세요' }
  }

  const { main, sub } = body()

  return (
    <button
      onClick={onGoToQuiz}
      className={`bg-white border rounded-2xl p-5 h-full flex flex-col text-left transition-colors w-full ${myTurn ? 'border-[#4C7FE0]/45 shadow-[0_4px_16px_rgba(76,127,224,0.10)]' : 'border-[#E8E8E4] hover:border-[#4C7FE0]/40'}`}
    >
      <p className="text-[14px] font-semibold text-[#1F1F1D] mb-3 flex-shrink-0">🎨 연상퀴즈</p>
      <div className="flex-1 flex flex-col min-h-0">
        {/* 내 차례면 그림은 그대로 두고 옅은 막 + 하단 알약 버튼만 얹는다(통째로 파란 판은 투박했음) */}
        <div className="flex-[6] min-h-0 rounded-xl overflow-hidden relative">
          <img src="/images/quiz-doodle-v2.svg" alt="연상퀴즈" className="w-full h-full object-cover" />
          {myTurn && (
            <div className="absolute inset-0 bg-gradient-to-t from-[#1F2A44]/45 via-[#1F2A44]/5 to-transparent flex items-end justify-center pb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-1.5 text-[12.5px] font-semibold text-[#2F5FC4] shadow-[0_2px_10px_rgba(31,42,68,0.18)] backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#4C7FE0] opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4C7FE0]" />
                </span>
                {myTurn === 'draw' ? '지금 그리기' : '지금 맞히기'}
                <span aria-hidden className="text-[#4C7FE0]/70">→</span>
              </span>
            </div>
          )}
        </div>
        <div className="flex-[4] flex flex-col items-center justify-center text-center gap-1 px-2 pt-2 min-h-0">
          <p className="text-[15px] font-bold text-[#1F1F1D] leading-snug truncate w-full">{main}</p>
          <p className="text-[12px] text-[#9C9C96] line-clamp-2 w-full">{sub}</p>
        </div>
      </div>
    </button>
  )
}
