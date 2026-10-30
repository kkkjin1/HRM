'use client'

import RetroTextarea from './RetroTextarea'

// 팀 회고 상단 영역: "이번 달 완료/성과"(회의 전 팀장이 작성) / "다음 달 중점과업"(회의 중 팀장이 정리)
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
        <p className="text-[13px] font-semibold text-[#1F2933] mb-1.5">이번 달 완료/성과</p>
        <RetroTextarea
          key={`agenda-${month}`}
          value={agenda}
          placeholder={isLead ? `${month}월에 완료한 일과 성과를 입력해보세요.` : '아직 등록된 완료/성과가 없습니다.'}
          rows={rows}
          heightVh={heightVh}
          readOnly={!isLead}
          onSave={onSaveAgenda}
        />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-[#1F2933] mb-1.5">다음 달 중점과업</p>
        <RetroTextarea
          key={`decision-${month}`}
          value={decision}
          placeholder={isLead ? `${month % 12 + 1}월에 집중할 과업을 입력해보세요.` : '아직 등록된 중점과업이 없습니다.'}
          rows={rows}
          heightVh={heightVh}
          readOnly={!isLead}
          onSave={onSaveDecision}
        />
      </div>
    </div>
  )
}
