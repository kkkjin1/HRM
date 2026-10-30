'use client'

import RetroTextarea from './RetroTextarea'

// 팀 회고 상단 영역: "이번 달 완료/성과"(회의 전 팀장이 작성) / "다음 달 중점과업"(회의 중 팀장이 정리)
// 두 칸을 한 카드 안에 화살표로 이어, 이번 달 결과가 다음 달 과업으로 넘어가는 흐름으로 보여준다.
// 각 칸의 제목 줄은 본문과 분리된 색 띠(완료=초록, 중점과업=파랑)로 구분한다.
// 둘 다 team_log_goal_retros를 그대로 쓰되 owner_key만 다르다 —
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
  const nextMonth = month % 12 + 1
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] items-stretch">
      <div className="flex flex-col bg-white border border-[#E5E8EB] rounded-[22px] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-[#E8F5EE] border-b border-[#CDE8D9]">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#1E6B45] text-white">{month}월</span>
          <p className="text-[14px] font-bold text-[#1E6B45]">이번 달 완료/성과</p>
        </div>
        <div className="p-4">
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
      </div>
      <div className="flex items-center justify-center" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7A8491" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </div>
      <div className="flex flex-col bg-white border border-[#E5E8EB] rounded-[22px] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-[#E6EEFC] border-b border-[#C9D9F5]">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#2F5FBF] text-white">{nextMonth}월</span>
          <p className="text-[14px] font-bold text-[#2F5FBF]">다음 달 중점과업</p>
        </div>
        <div className="p-4">
          <RetroTextarea
            key={`decision-${month}`}
            value={decision}
            placeholder={isLead ? `${nextMonth}월에 집중할 과업을 입력해보세요.` : '아직 등록된 중점과업이 없습니다.'}
            rows={rows}
            heightVh={heightVh}
            readOnly={!isLead}
            onSave={onSaveDecision}
          />
        </div>
      </div>
    </div>
  )
}
