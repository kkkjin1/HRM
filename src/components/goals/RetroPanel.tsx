'use client'

import { useEffect, useRef, useState } from 'react'
import { useMembers } from '@/lib/useMembers'
import { displayName, displayNameFull } from '@/lib/members'

type RetroEntry = { month: number; owner_key: string; content: string }

const TEAM_KEY = 'team'
const AUTOSAVE_DELAY_MS = 1200

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved'

// 팀/개인 회고 박스 하나. 타이핑을 멈추면 자동 저장되고, "저장" 버튼으로 즉시 저장할 수도 있다.
function RetroTextarea({ value, placeholder, rows, onSave }: {
  value: string
  placeholder: string
  rows: number
  onSave: (content: string) => Promise<void>
}) {
  // 부모가 year/month/작성자별로 다른 key를 줘서 대상이 바뀌면 이 컴포넌트 자체가 새로 마운트된다 —
  // 그래서 value 변화를 되쫓는 동기화 effect 없이 useState 초기값만으로 충분하다.
  const [text, setText] = useState(value)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const savedRef = useRef(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  async function commit(next: string) {
    if (next === savedRef.current) { setStatus('idle'); return }
    setStatus('saving')
    await onSave(next)
    savedRef.current = next
    setStatus('saved')
    setTimeout(() => setStatus(prev => (prev === 'saved' ? 'idle' : prev)), 1500)
  }

  function handleChange(next: string) {
    setText(next)
    setStatus('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => commit(next), AUTOSAVE_DELAY_MS)
  }

  function handleSaveClick() {
    if (timerRef.current) clearTimeout(timerRef.current)
    commit(text)
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full border border-[#E5E8EB] rounded-lg px-3.5 py-3 text-[13.5px] leading-relaxed text-[#1F2933] focus:outline-none focus:border-[#4C7FE0] resize-none"
      />
      <div className="flex items-center justify-end gap-2 mt-1.5">
        <span className="text-[11px] text-[#B0B8C1]">
          {status === 'saving' ? '저장 중...' : status === 'saved' ? '저장됨' : status === 'pending' ? '자동 저장 대기 중' : ''}
        </span>
        <button
          type="button"
          onClick={handleSaveClick}
          className="text-[11.5px] font-medium text-[#4C7FE0] hover:text-[#3A6CC8] px-2 py-1 rounded-md hover:bg-black/[0.04]"
        >
          저장
        </button>
      </div>
    </div>
  )
}

export default function RetroPanel({ year }: { year: number }) {
  const { members, loaded: membersLoaded } = useMembers()
  const [retros, setRetros] = useState<Record<number, Record<string, string>>>({})
  const [loaded, setLoaded] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)

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
    setRetros(prev => ({ ...prev, [month]: { ...prev[month], [ownerKey]: content } }))
    const res = await fetch('/api/goal-retros', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, owner_key: ownerKey, content }),
    })
    if (res.status === 401) window.location.href = '/login'
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
            <p className="text-[13px] font-semibold text-[#1F2933] mb-2">개인 회고</p>
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
    </div>
  )
}
