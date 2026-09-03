'use client'

import { useEffect, useState } from 'react'
import { useMembers } from '@/lib/useMembers'
import { displayName, displayNameFull } from '@/lib/members'
import RetroTextarea from './RetroTextarea'
import RetroTemplateModal from './RetroTemplateModal'
import RetroFullscreenView from './RetroFullscreenView'

type RetroEntry = { month: number; owner_key: string; content: string }

const TEAM_KEY = 'team'

export default function RetroPanel({ year }: { year: number }) {
  const { members, loaded: membersLoaded } = useMembers()
  const [retros, setRetros] = useState<Record<number, Record<string, string>>>({})
  const [loaded, setLoaded] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)

  async function loadRetros() {
    setLoaded(false)
    setSelectedMonth(null)
    const res = await fetch(`/api/goal-retros?year=${year}`)
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json()
    if (json.ok) {
      const map: Record<number, Record<string, string>> = {}
      for (const r of json.retros as RetroEntry[]) {
        if (!map[r.month]) map[r.month] = {}
        map[r.month][r.owner_key] = r.content
      }
      setRetros(map)
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

  function hasAnyContent(month: number) {
    const entries = retros[month]
    return !!entries && Object.values(entries).some(v => v.trim())
  }

  if (!loaded || !membersLoaded) return <p className="text-[13px] text-[#7A8491]">불러오는 중...</p>

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
            <RetroTextarea
              key={`team-${year}-${selectedMonth}`}
              value={retros[selectedMonth]?.[TEAM_KEY] ?? ''}
              placeholder={`${selectedMonth}월 팀 전체를 돌아보며 자유롭게 기록해보세요.`}
              rows={8}
              onSave={content => save(selectedMonth, TEAM_KEY, content)}
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
                {members.map(member => (
                  <div key={member.id} className="border border-[#E5E8EB] rounded-xl p-3.5 bg-white">
                    <p className="text-[12.5px] font-medium text-[#1F2933] mb-1.5">{displayNameFull(member)}</p>
                    <RetroTextarea
                      key={`member-${member.id}-${year}-${selectedMonth}`}
                      value={retros[selectedMonth]?.[member.id] ?? ''}
                      placeholder={`${displayName(member)}님의 ${selectedMonth}월을 돌아보며 자유롭게 기록해보세요.`}
                      rows={6}
                      onSave={content => save(selectedMonth, member.id, content)}
                    />
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
          members={members}
          entries={retros[selectedMonth] ?? {}}
          onSave={(ownerKey, content) => save(selectedMonth, ownerKey, content)}
          onClose={() => setFullscreenOpen(false)}
        />
      )}
    </div>
  )
}
