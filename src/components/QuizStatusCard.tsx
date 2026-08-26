'use client'

// 연상퀴즈 진행상황을 참여 여부와 무관하게 일상 탭에서 항상 볼 수 있게 하는 카드.
// TeamFate(오늘의 팀 운명) 옆 여백에 배치 — 같은 흰 카드 스타일을 맞춰서 이질감 없게.
import { useCurrentMember } from '@/lib/useCurrentMember'
import { useQuizGameStatus } from '@/lib/useQuizGameStatus'

const STATUS_ICON: Record<'setup' | 'drawing' | 'guessing' | 'reveal', string> = {
  setup: '🎲', drawing: '🎨', guessing: '🔍', reveal: '🎉',
}

export default function QuizStatusCard({ onGoToQuiz }: { onGoToQuiz: () => void }) {
  const { me } = useCurrentMember()
  const row = useQuizGameStatus()
  const status = row?.status ?? 'setup'

  function body(): { title: string; main: string; sub: string } {
    if (!row || row.status === 'setup') {
      if (row?.word) {
        return {
          title: '연상퀴즈 · 지난 판',
          main: `"${row.word}" ${row.correct ? '· 정답 성공 ✅' : '· 실패 ❌'}`,
          sub: '새 게임을 시작해보세요',
        }
      }
      return { title: '연상퀴즈', main: '아직 진행된 판이 없어요', sub: '팀원들과 그림 전달 한 판 어때요?' }
    }
    if (row.status === 'drawing') {
      const drawers = row.drawers || []
      const current = drawers[row.round] ?? ''
      return {
        title: '연상퀴즈 진행 중',
        main: `${row.round + 1} / ${drawers.length} 단계`,
        sub: current === me?.name ? '당신이 그리는 중이에요!' : `${current}님이 그리는 중`,
      }
    }
    if (row.status === 'guessing') {
      return {
        title: '연상퀴즈 진행 중',
        main: '정답 맞추기',
        sub: row.guesser === me?.name ? '당신이 맞히는 중이에요!' : `${row.guesser ?? ''}님이 맞히는 중`,
      }
    }
    return { title: '연상퀴즈', main: '라운드 종료!', sub: '결과를 확인해보세요' }
  }

  const { title, main, sub } = body()

  return (
    <button
      onClick={onGoToQuiz}
      className="bg-white border border-[#E8E8E4] rounded-2xl p-5 h-full flex flex-col text-left hover:border-[#7C3AED]/40 transition-colors w-full"
    >
      <p className="text-[12px] text-[#9C9C96] mb-3 flex-shrink-0">{STATUS_ICON[status]} {title}</p>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5">
        <p className="text-[16px] font-bold text-[#1F1F1D] leading-snug">{main}</p>
        <p className="text-[12px] text-[#9C9C96]">{sub}</p>
      </div>
    </button>
  )
}
