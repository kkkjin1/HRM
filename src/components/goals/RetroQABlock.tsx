'use client'

import { displayName } from '@/lib/members'
import type { Member } from '@/lib/members'
import RetroTextarea from './RetroTextarea'

// 개인회고 카드 하단에 붙는 질문/답변 한 쌍. asker(질문자) → target(회고 작성자=답변자) 관계가
// 이름만 보고도 명확하도록 "OOO의 질문" / "OOO의 답변"으로 라벨링한다.
// 질문은 asker만, 답변은 target만 쓸 수 있다 — 나머지는 읽기 전용.
export default function RetroQABlock({
  month, asker, target, meId, question, answer, onSaveQuestion, onSaveAnswer,
}: {
  month: number
  asker: Member
  target: Member
  meId: string | null
  question: string
  answer: string
  onSaveQuestion: (content: string) => Promise<void>
  onSaveAnswer: (content: string) => Promise<void>
}) {
  const canAsk = meId === asker.id
  const canAnswer = meId === target.id

  return (
    <div className="border-t border-[#EEF0F2] pt-2 mt-2">
      <p className="text-[11px] font-medium text-[#7A8491] mb-0.5">{displayName(asker)}의 질문</p>
      <RetroTextarea
        key={`q-${month}-${asker.id}-${target.id}`}
        value={question}
        placeholder={canAsk ? `${displayName(target)}님에게 궁금한 점을 질문해보세요.` : '아직 질문이 없습니다.'}
        rows={1}
        compact
        readOnly={!canAsk}
        onSave={onSaveQuestion}
      />
      <p className="text-[11px] font-medium text-[#7A8491] mb-0.5 mt-1">{displayName(target)}의 답변</p>
      <RetroTextarea
        key={`a-${month}-${asker.id}-${target.id}`}
        value={answer}
        placeholder={canAnswer ? '답변을 입력해보세요.' : '아직 답변이 없습니다.'}
        rows={1}
        compact
        readOnly={!canAnswer}
        onSave={onSaveAnswer}
      />
    </div>
  )
}
