'use client'

import { useEffect } from 'react'
import { displayName, displayNameFull } from '@/lib/members'
import type { Member } from '@/lib/members'
import RetroTextarea from './RetroTextarea'
import TeamRetroSplit from './TeamRetroSplit'
import RetroQABlock from './RetroQABlock'

const TEAM_KEY = 'team'
const TEAM_AGENDA_KEY = 'team_agenda'

type QAMap = Record<string, Record<string, { question: string; answer: string }>>

// 선택한 월의 팀 회고 + 개인 회고를 한 화면에 모아 보여준다. 회의 중 화면 공유로 다 같이 보면서
// 그 자리에서 이어 쓸 수 있도록, 읽기 전용이 아니라 RetroPanel과 같은 RetroTextarea를 그대로 재사용한다.
export default function RetroFullscreenView({
  year, month, members, entries, qas, meId, isLead, onSave, onSaveQA, onClose,
}: {
  year: number
  month: number
  members: Member[]
  entries: Record<string, string>
  qas: QAMap
  meId: string | null
  isLead: boolean
  onSave: (ownerKey: string, content: string) => Promise<void>
  onSaveQA: (askerId: string, targetId: string, field: 'question' | 'answer', content: string) => Promise<void>
  onClose: () => void
}) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-lg w-full max-w-5xl max-h-[92vh] overflow-y-auto p-7">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[18px] font-semibold text-[#1F2933]">{year}년 {month}월 회고</h2>
          <button type="button" onClick={onClose} className="text-[13px] text-[#7A8491] hover:text-[#1F2933] px-3 py-1.5 rounded-md hover:bg-black/[0.04]">닫기 ✕</button>
        </div>

        <section className="mb-8">
          <p className="text-[14px] font-semibold text-[#1F2933] mb-2">팀 회고</p>
          <TeamRetroSplit
            month={month}
            agenda={entries[TEAM_AGENDA_KEY] ?? ''}
            decision={entries[TEAM_KEY] ?? ''}
            isLead={isLead}
            rows={10}
            onSaveAgenda={content => onSave(TEAM_AGENDA_KEY, content)}
            onSaveDecision={content => onSave(TEAM_KEY, content)}
          />
        </section>

        <section>
          <p className="text-[14px] font-semibold text-[#1F2933] mb-3">개인 회고</p>
          {members.length === 0 ? (
            <p className="text-[12.5px] text-[#B0B8C1]">등록된 멤버가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 gap-5">
              {members.map(member => (
                <div key={member.id} className="border border-[#E5E8EB] rounded-xl p-4 bg-white">
                  <p className="text-[13px] font-medium text-[#1F2933] mb-2">{displayNameFull(member)}</p>
                  <RetroTextarea
                    key={`fs-member-${member.id}-${year}-${month}`}
                    value={entries[member.id] ?? ''}
                    placeholder={`${displayName(member)}님의 ${month}월을 돌아보며 자유롭게 기록해보세요.`}
                    rows={8}
                    toolbar={false}
                    onSave={content => onSave(member.id, content)}
                  />
                  {members.filter(asker => asker.id !== member.id).map(asker => (
                    <RetroQABlock
                      key={`fs-qa-${member.id}-${asker.id}-${month}`}
                      month={month}
                      asker={asker}
                      target={member}
                      meId={meId}
                      question={qas[asker.id]?.[member.id]?.question ?? ''}
                      answer={qas[asker.id]?.[member.id]?.answer ?? ''}
                      onSaveQuestion={content => onSaveQA(asker.id, member.id, 'question', content)}
                      onSaveAnswer={content => onSaveQA(asker.id, member.id, 'answer', content)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
