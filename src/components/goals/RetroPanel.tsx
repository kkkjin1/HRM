'use client'

import { useEffect, useState } from 'react'

type Retro = { month: number; content: string }

export default function RetroPanel({ year }: { year: number }) {
  const [retros, setRetros] = useState<Record<number, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)

  async function loadRetros() {
    setLoaded(false)
    setSelectedMonth(null)
    const res = await fetch(`/api/goal-retros?year=${year}`)
    if (res.status === 401) { window.location.href = '/login'; return }
    const json = await res.json()
    if (json.ok) {
      const map: Record<number, string> = {}
      for (const r of json.retros as Retro[]) map[r.month] = r.content
      setRetros(map)
    }
    setLoaded(true)
  }

  useEffect(() => { loadRetros() }, [year])

  async function save(month: number, content: string) {
    if (content === (retros[month] ?? '')) return
    setRetros(prev => ({ ...prev, [month]: content }))
    const res = await fetch('/api/goal-retros', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, content }),
    })
    if (res.status === 401) window.location.href = '/login'
  }

  if (!loaded) return <p className="text-[13px] text-[#7A8491]">불러오는 중...</p>

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
            {m}월{retros[m]?.trim() ? ' ·' : ''}
          </button>
        ))}
      </div>

      {selectedMonth === null ? (
        <p className="text-[12.5px] text-[#B0B8C1] py-6 text-center">월을 선택하면 회고를 작성할 수 있습니다.</p>
      ) : (
        <>
          <p className="text-[13px] font-semibold text-[#1F2933] mb-1.5">{selectedMonth}월 회고</p>
          <textarea
            key={`retro-${year}-${selectedMonth}`}
            defaultValue={retros[selectedMonth] ?? ''}
            onBlur={e => save(selectedMonth, e.target.value)}
            placeholder={`${selectedMonth}월을 돌아보며 자유롭게 기록해보세요.`}
            rows={14}
            className="w-full border border-[#E5E8EB] rounded-lg px-3.5 py-3 text-[13.5px] leading-relaxed text-[#1F2933] focus:outline-none focus:border-[#4C7FE0] resize-none"
          />
        </>
      )}
    </div>
  )
}
