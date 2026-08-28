'use client'

// 일상 탭에 있는 동안 연상퀴즈 차례가 와도 몰랐던 문제 — 작은 배너로 알려주고
// 클릭하면 바로 연상퀴즈 탭으로 이동시킨다.
import { useQuizMyTurn } from '@/lib/useQuizMyTurn'

const ROLE_LABEL = { draw: '그림을 그릴', guess: '정답을 맞힐' } as const

export default function QuizTurnBanner({ onGoToQuiz }: { onGoToQuiz: () => void }) {
  const role = useQuizMyTurn()
  if (!role) return null

  return (
    <button
      onClick={onGoToQuiz}
      className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 bg-[#7C3AED]/10 border border-[#7C3AED]/25 text-left hover:bg-[#7C3AED]/15 transition-colors"
    >
      <span className="text-[13px] font-medium text-[#7C3AED]">🎨 연상퀴즈에서 당신이 {ROLE_LABEL[role]} 차례예요!</span>
      <span className="text-[12px] font-semibold text-[#7C3AED] flex-shrink-0">바로가기 →</span>
    </button>
  )
}
