'use client'

import { useState } from 'react'
import RetroTextarea from './RetroTextarea'
import { LEARNING_FIELDS, LEARNING_LABEL_MAX, type LearningField, type LearningLabels } from '@/lib/team/devPlan'

// 팀 회고 상단 영역: "이번 달 완료/성과"(회의 전 팀장이 작성) / "다음 달 중점과업"(회의 중 팀장이 정리)
// 두 칸을 한 카드 안에 화살표로 이어, 이번 달 결과가 다음 달 과업으로 넘어가는 흐름으로 보여준다.
// 각 칸의 제목 줄은 본문과 분리된 색 띠(완료=초록, 중점과업=파랑)로 구분한다.
// 둘 다 team_log_goal_retros를 그대로 쓰되 owner_key만 다르다 —
// 'team_agenda'는 이번에 새로 쓰는 키, 'team'은 기존 "팀 회고" 데이터를 그대로 이어받는 키다.
// learning이 있으면 두 칸 사이에 "월말 학습"(새롭게 확인한 것 / 기존 해석이 달라진 것 / 여전히 모르는 것)을 넣어
// 성과 → 배운 것 → 다음 과업 흐름으로 보여 준다. 이 칸은 팀빌딩 기록(team_plan_months)을 그대로 읽고 쓴다 — 그달 팀빌딩 계획이 없으면 넘기지 않는다.
export type RetroLearningField = LearningField
export type RetroLearning = {
  value: Record<RetroLearningField, string>
  labels: LearningLabels                      // 칸 이름 — 팀장이 ✎로 바꾼다(팀 공용, 모든 달에 같이 적용)
  canEdit: boolean
  onSave: (field: RetroLearningField, content: string) => Promise<void>
  onSaveLabel?: (field: RetroLearningField, label: string) => Promise<boolean>
}

// 칸 이름 한 줄 — 팀장은 ✎를 눌러 그 자리에서 고친다(Enter 저장, Esc 취소)
function LearningLabel({ label, canEdit, onSave }: { label: string; canEdit: boolean; onSave?: (label: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const [busy, setBusy] = useState(false)
  async function commit() {
    const v = draft.trim()
    if (!v || v === label || !onSave) { setEditing(false); return }
    setBusy(true)
    const ok = await onSave(v)
    setBusy(false)
    if (ok) setEditing(false)
  }
  if (editing) return (
    <input value={draft} autoFocus disabled={busy} maxLength={LEARNING_LABEL_MAX} aria-label="칸 이름"
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') { e.preventDefault(); void commit() }
        if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
      }}
      onBlur={() => void commit()}
      className="w-full text-[11.5px] font-semibold text-[#1F2933] border border-[#C7D6F5] rounded px-1.5 py-0.5 mb-1 focus:outline-none" />
  )
  return (
    <div className="flex items-center gap-1 mb-1 group/label">
      <p className="text-[11.5px] font-semibold text-[#7A8491]">{label}</p>
      {canEdit && onSave && (
        <button type="button" onClick={() => { setDraft(label); setEditing(true) }} title="칸 이름 바꾸기" aria-label={`${label} 칸 이름 바꾸기`}
          className="text-[11px] text-[#B0B8C1] hover:text-[#4C7FE0] opacity-0 group-hover/label:opacity-100 focus:opacity-100">✎</button>
      )}
    </div>
  )
}

const Arrow = () => (
  <div className="flex items-center justify-center" aria-hidden="true">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7A8491" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  </div>
)

export default function TeamRetroSplit({
  month, agenda, decision, isLead, rows = 8, heightVh, onSaveAgenda, onSaveDecision, learning,
}: {
  month: number
  agenda: string
  decision: string
  isLead: boolean
  rows?: number
  heightVh?: number
  onSaveAgenda: (content: string) => Promise<void>
  onSaveDecision: (content: string) => Promise<void>
  learning?: RetroLearning | null
}) {
  const nextMonth = month % 12 + 1
  return (
    <div className={`grid items-stretch ${learning
      ? 'grid-cols-1 gap-3 lg:gap-0 lg:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)_36px_minmax(0,1fr)]'
      : 'grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)]'}`}>
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
            toolbar={false}
            stableBox
            onSave={onSaveAgenda}
          />
        </div>
      </div>
      <div className={learning ? 'hidden lg:flex' : 'contents'}><Arrow /></div>
      {learning && (
        <>
          <div className="flex flex-col bg-white border border-[#E5E8EB] rounded-[22px] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-[#FFF3DF] border-b border-[#F1DDB8]">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#9A5B12] text-white">{month}월</span>
              <p className="text-[14px] font-bold text-[#9A5B12]">월말 학습</p>
            </div>
            <div className="p-4 flex flex-col gap-2.5">
              {LEARNING_FIELDS.map(field => (
                <div key={field}>
                  <LearningLabel label={learning.labels[field]} canEdit={learning.canEdit}
                    onSave={learning.onSaveLabel ? label => learning.onSaveLabel!(field, label) : undefined} />
                  <RetroTextarea
                    key={`learning-${month}-${field}`}
                    value={learning.value[field]}
                    placeholder={learning.canEdit ? '여기에 적어 주세요.' : '아직 기록이 없습니다.'}
                    rows={2}
                    heightVh={heightVh ? Math.max(5, Math.round(heightVh / 3) - 2) : undefined}
                    readOnly={!learning.canEdit}
                    toolbar={false}
                    stableBox
                    onSave={content => learning.onSave(field, content)}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:flex"><Arrow /></div>
        </>
      )}
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
            toolbar={false}
            stableBox
            onSave={onSaveDecision}
          />
        </div>
      </div>
    </div>
  )
}
