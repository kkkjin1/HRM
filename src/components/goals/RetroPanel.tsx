'use client'

import { useEffect, useState } from 'react'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import { displayName, displayNameFull } from '@/lib/members'
import RetroTextarea from './RetroTextarea'
import RetroTemplateModal from './RetroTemplateModal'
import RetroFullscreenView from './RetroFullscreenView'
import TeamRetroSplit from './TeamRetroSplit'
import RetroQABlock from './RetroQABlock'

type RetroEntry = { month: number; owner_key: string; content: string }
type RetroQAEntry = { month: number; asker_id: string; target_id: string; question: string; answer: string }
type QAMap = Record<string, Record<string, { question: string; answer: string }>> // asker_id -> target_id -> {question, answer}

const TEAM_KEY = 'team'
const TEAM_AGENDA_KEY = 'team_agenda'

export default function RetroPanel({ year }: { year: number }) {
  const { members, loaded: membersLoaded } = useMembers()
  const { me, loaded: meLoaded } = useCurrentMember()
  const [retros, setRetros] = useState<Record<number, Record<string, string>>>({})
  const [qas, setQAs] = useState<Record<number, QAMap>>({})
  const [loaded, setLoaded] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)

  async function loadRetros() {
    setLoaded(false)
    setSelectedMonth(null)
    const [retroRes, qaRes] = await Promise.all([
      fetch(`/api/goal-retros?year=${year}`),
      fetch(`/api/goal-retro-qa?year=${year}`),
    ])
    if (retroRes.status === 401 || qaRes.status === 401) { window.location.href = '/login'; return }
    const retroJson = await retroRes.json()
    if (retroJson.ok) {
      const map: Record<number, Record<string, string>> = {}
      for (const r of retroJson.retros as RetroEntry[]) {
        if (!map[r.month]) map[r.month] = {}
        map[r.month][r.owner_key] = r.content
      }
      setRetros(map)
    }
    const qaJson = await qaRes.json()
    if (qaJson.ok) {
      const map: Record<number, QAMap> = {}
      for (const q of qaJson.qas as RetroQAEntry[]) {
        if (!map[q.month]) map[q.month] = {}
        if (!map[q.month][q.asker_id]) map[q.month][q.asker_id] = {}
        map[q.month][q.asker_id][q.target_id] = { question: q.question, answer: q.answer }
      }
      setQAs(map)
    }
    setLoaded(true)
  }

  useEffect(() => { loadRetros() }, [year])

  async function save(month: number, ownerKey: string, content: string) {
    const res = await fetch('/api/goal-retros', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, owner_key: ownerKey, content }),
    })
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json().catch(() => ({ ok: false }))
    if (!json.ok) throw new Error(json.error ?? '저장 실패')
    setRetros(prev => ({ ...prev, [month]: { ...prev[month], [ownerKey]: content } }))
  }

  async function saveQA(month: number, askerId: string, targetId: string, field: 'question' | 'answer', content: string) {
    const res = await fetch('/api/goal-retro-qa', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, asker_id: askerId, target_id: targetId, field, content }),
    })
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json().catch(() => ({ ok: false }))
    if (!json.ok) throw new Error(json.error ?? '저장 실패')
    setQAs(prev => {
      const monthMap = prev[month] ?? {}
      const askerMap = monthMap[askerId] ?? {}
      const current = askerMap[targetId] ?? { question: '', answer: '' }
      return {
        ...prev,
        [month]: { ...monthMap, [askerId]: { ...askerMap, [targetId]: { ...current, [field]: content } } },
      }
    })
  }

  // 개인 회고 칸 순서: 강은정/김다슬 두 명의 위치를 서로 바꿔 달라는 요청에 따른 수동 배치.
  const orderedMembers = (() => {
    const a = members.findIndex(m => m.name === '강은정')
    const b = members.findIndex(m => m.name === '김다슬')
    if (a === -1 || b === -1) return members
    const next = [...members]
    ;[next[a], next[b]] = [next[b], next[a]]
    return next
  })()

  function hasAnyContent(month: number) {
    const entries = retros[month]
    return !!entries && Object.values(entries).some(v => v.trim())
  }

  if (!loaded || !membersLoaded || !meLoaded) return <p className="text-[13px] text-[#7A8491]">불러오는 중...</p>
  const isLead = me?.role === 'lead'

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setSelectedMonth(m)}
            className={`text-[12px] px-2.5 py-1 rounded-md transition-colors border ${
              selectedMonth === m ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]' : 'bg-white text-[#7A8491] border-gray-200 hover:bg-black/[0.04]'
            }`}
          >
            {m}월{hasAnyContent(m) ? ' ·' : ''}
          </button>
        ))}
      </div>

      {selectedMonth === null ? (
        <p className="text-[12.5px] text-[#B0B8C1] py-6 text-center">월을 선택하면 회고를 작성할 수 있습니다.</p>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setFullscreenOpen(true)}
              className="text-[11.5px] font-medium text-[#4C7FE0] hover:text-[#3A6CC8] px-2 py-1 rounded-md hover:bg-black/[0.04]"
            >
              전체 화면으로 보기
            </button>
          </div>

          <section>
            <p className="text-[13px] font-semibold text-[#1F2933] mb-1.5">팀 회고</p>
            <TeamRetroSplit
              month={selectedMonth}
              agenda={retros[selectedMonth]?.[TEAM_AGENDA_KEY] ?? ''}
              decision={retros[selectedMonth]?.[TEAM_KEY] ?? ''}
              isLead={isLead}
              heightVh={27}
              onSaveAgenda={content => save(selectedMonth, TEAM_AGENDA_KEY, content)}
              onSaveDecision={content => save(selectedMonth, TEAM_KEY, content)}
            />
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] font-semibold text-[#1F2933]">개인 회고</p>
              <button
                type="button"
                onClick={() => setTemplateOpen(true)}
                className="text-[11.5px] font-medium text-[#4C7FE0] hover:text-[#3A6CC8] px-2 py-1 rounded-md hover:bg-black/[0.04]"
              >
                이번 달 회고 양식 확인하기
              </button>
            </div>
            {members.length === 0 ? (
              <p className="text-[12.5px] text-[#B0B8C1]">등록된 멤버가 없습니다.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {orderedMembers.map(member => (
                  <div key={member.id} className="border border-[#E5E8EB] rounded-xl p-3.5 bg-white">
                    <p className="text-[12.5px] font-medium text-[#1F2933] mb-1.5">{displayNameFull(member)}</p>
                    <RetroTextarea
                      key={`member-${member.id}-${year}-${selectedMonth}`}
                      value={retros[selectedMonth]?.[member.id] ?? ''}
                      placeholder={`${displayName(member)}님의 ${selectedMonth}월을 돌아보며 자유롭게 기록해보세요.`}
                      rows={6}
                      heightVh={27}
                      fixedHeight
                      toolbar={false}
                      onSave={content => save(selectedMonth, member.id, content)}
                    />
                    {orderedMembers.filter(asker => asker.id !== member.id).map(asker => (
                      <RetroQABlock
                        key={`qa-${member.id}-${asker.id}-${selectedMonth}`}
                        month={selectedMonth}
                        asker={asker}
                        target={member}
                        meId={me?.id ?? null}
                        question={qas[selectedMonth]?.[asker.id]?.[member.id]?.question ?? ''}
                        answer={qas[selectedMonth]?.[asker.id]?.[member.id]?.answer ?? ''}
                        onSaveQuestion={content => saveQA(selectedMonth, asker.id, member.id, 'question', content)}
                        onSaveAnswer={content => saveQA(selectedMonth, asker.id, member.id, 'answer', content)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {templateOpen && <RetroTemplateModal onClose={() => setTemplateOpen(false)} />}
      {fullscreenOpen && selectedMonth !== null && (
        <RetroFullscreenView
          year={year}
          month={selectedMonth}
          members={orderedMembers}
          entries={retros[selectedMonth] ?? {}}
          qas={qas[selectedMonth] ?? {}}
          meId={me?.id ?? null}
          isLead={isLead}
          onSave={(ownerKey, content) => save(selectedMonth, ownerKey, content)}
          onSaveQA={(askerId, targetId, field, content) => saveQA(selectedMonth, askerId, targetId, field, content)}
          onClose={() => setFullscreenOpen(false)}
        />
      )}
    </div>
  )
}
