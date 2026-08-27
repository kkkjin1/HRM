'use client'

// 연상퀴즈 진행상황을 참여 여부와 무관하게 일상 탭에서 항상 볼 수 있게 하는 카드.
// TeamFate(오늘의 팀 운명) 옆 여백에 배치 — 같은 흰 카드 스타일을 맞춰서 이질감 없게.
// 위 60%는 상태와 무관하게 고정된 그림(🎨), 아래 40%는 몇 단계·누가 그리는 중인지 같은
// 실시간 상태 텍스트.
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useQuizGameStatus } from '@/lib/useQuizGameStatus'

export default function QuizStatusCard({ onGoToQuiz }: { onGoToQuiz: () => void }) {
  const { me } = useCurrentMember()
  const row = useQuizGameStatus()

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
        sub: current === me?.name ? '당신이 그리는 중이에요!' : `${current}님이 그리는 중`,
      }
    }
    if (row.status === 'guessing') {
      return {
        main: '정답 맞추기',
        sub: row.guesser === me?.name ? '당신이 맞히는 중이에요!' : `${row.guesser ?? ''}님이 맞히는 중`,
      }
    }
    return { main: '라운드 종료!', sub: '결과를 확인해보세요' }
  }

  const { main, sub } = body()

  return (
    <button
      onClick={onGoToQuiz}
      className="bg-white border border-[#E8E8E4] rounded-2xl p-5 h-full flex flex-col text-left hover:border-[#7C3AED]/40 transition-colors w-full"
    >
      <p className="text-[12px] text-[#9C9C96] mb-3 flex-shrink-0">🎨 연상퀴즈</p>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-[6] min-h-0 rounded-xl overflow-hidden">
          <img src="/images/quiz-doodle-v2.svg" alt="연상퀴즈" className="w-full h-full object-cover" />
        </div>
        <div className="flex-[4] flex flex-col items-center justify-center text-center gap-1 px-2 pt-2 min-h-0">
          <p className="text-[15px] font-bold text-[#1F1F1D] leading-snug truncate w-full">{main}</p>
          <p className="text-[12px] text-[#9C9C96] truncate w-full">{sub}</p>
        </div>
      </div>
    </button>
  )
}
