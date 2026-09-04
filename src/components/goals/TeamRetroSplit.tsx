'use client'

import RetroTextarea from './RetroTextarea'

// 팀 회고 상단 영역: "이번 달 안건"(회의 전 팀장이 작성) / "이번 달 결정사항"(회의 중 팀장이 정리)
// 두 칸으로 나눠 보여준다. 둘 다 team_log_goal_retros를 그대로 쓰되 owner_key만 다르다 —
// 'team_agenda'는 이번에 새로 쓰는 키, 'team'은 기존 "팀 회고" 데이터를 그대로 이어받는 키다.
export default function TeamRetroSplit({
  month, agenda, decision, isLead, rows = 8, heightVh, onSaveAgenda, onSaveDecision,
}: {
  month: number
  agenda: string
  decision: string
  isLead: boolean
  rows?: number
  heightVh?: number
  onSaveAgenda: (content: string) => Promise<void>
  onSaveDecision: (content: string) => Promise<void>
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-[13px] font-semibold text-[#1F2933] mb-1.5">이번 달 안건</p>
        <RetroTextarea
          key={`agenda-${month}`}
          value={agenda}
          placeholder={isLead ? `${month}월 회고에서 논의할 안건을 입력해보세요.` : '아직 등록된 안건이 없습니다.'}
          rows={rows}
          heightVh={heightVh}
          readOnly={!isLead}
          onSave={onSaveAgenda}
        />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-[#1F2933] mb-1.5">이번 달 결정사항</p>
        <RetroTextarea
          key={`decision-${month}`}
          value={decision}
          placeholder={isLead ? `${month}월 회고에서 논의된 결정사항을 입력해보세요.` : '아직 등록된 결정사항이 없습니다.'}
          rows={rows}
          heightVh={heightVh}
          readOnly={!isLead}
          onSave={onSaveDecision}
        />
      </div>
    </div>
  )
}
