'use client'

// 업무 탭 캘린더 서브탭의 "연간" 화면 — 연도별 1~12월 중요 업무 리스트(담당자 없이 텍스트만).

import { useEffect, useState } from 'react'

type YearlyTask = { id: string; year: number; month: number; title: string; created_at: string }

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function YearlyCalendar() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [tasks, setTasks] = useState<YearlyTask[]>([])
  const [loaded, setLoaded] = useState(false)
  const [addingMonth, setAddingMonth] = useState<number | null>(null)
  const [addDraft, setAddDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const res = await fetch(`/api/yearly-tasks?year=${year}`)
      const json = await res.json()
      if (active && json.ok) setTasks(json.tasks)
      if (active) setLoaded(true)
    })()
    return () => { active = false }
  }, [year])

  function startAdd(month: number) {
    setAddingMonth(month)
    setAddDraft('')
  }

  async function commitAdd(month: number) {
    const title = addDraft.trim()
    setAddingMonth(null)
    if (!title) return
    const res = await fetch('/api/yearly-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, title }),
    })
    const json = await res.json()
    if (json.ok) setTasks(prev => [...prev, json.task])
  }

  function startEdit(t: YearlyTask) {
    setEditingId(t.id)
    setEditDraft(t.title)
  }

  async function commitEdit(id: string) {
    const title = editDraft.trim()
    setEditingId(null)
    if (!title) return
    const res = await fetch('/api/yearly-tasks', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title }),
    })
    const json = await res.json()
    if (json.ok) setTasks(prev => prev.map(t => t.id === id ? json.task : t))
  }

  async function deleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    await fetch('/api/yearly-tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
  }

  if (!loaded) return <p className="text-[12.5px] text-[#B0B8C1] px-1 py-6">불러오는 중...</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <button onClick={() => setYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">‹</button>
        <p className="text-[14px] font-medium text-[#1F2933] w-[72px] text-center">{year}년</p>
        <button onClick={() => setYear(y => y + 1)} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">›</button>
        <button onClick={() => setYear(new Date().getFullYear())} className="ml-1.5 text-[12px] text-[#7A8491] hover:text-[#4C7FE0] border border-[#E5E8EB] rounded-md px-2.5 py-1">올해</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {MONTHS.map(month => {
          const monthTasks = tasks.filter(t => t.month === month)
          return (
            <div key={month} className="bg-white rounded-xl border border-[#EEF0F2] p-3 flex flex-col min-h-[168px]">
              <p className="text-[13px] font-semibold text-[#1F2933] mb-2 flex-shrink-0">{month}월</p>
              <ul className="space-y-1 flex-1 min-h-0 overflow-y-auto">
                {monthTasks.map(t => (
                  <li key={t.id} className="group flex items-start gap-1.5 text-[12px] text-[#3A4249]">
                    <span className="mt-[7px] w-1 h-1 rounded-full bg-[#9CA3AF] flex-shrink-0" />
                    {editingId === t.id ? (
                      <input
                        autoFocus value={editDraft} onChange={e => setEditDraft(e.target.value)}
                        onBlur={() => commitEdit(t.id)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(t.id); if (e.key === 'Escape') setEditingId(null) }}
                        className="flex-1 min-w-0 border border-gray-200 rounded px-1 py-0.5 text-[12px]"
                      />
                    ) : (
                      <span className="flex-1 min-w-0 break-words cursor-pointer py-0.5" onClick={() => startEdit(t)}>{t.title}</span>
                    )}
                    <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 text-[#C7CDD4] hover:text-red-500 flex-shrink-0 text-[11px] mt-0.5">✕</button>
                  </li>
                ))}
              </ul>
              {addingMonth === month ? (
                <input
                  autoFocus value={addDraft} onChange={e => setAddDraft(e.target.value)}
                  onBlur={() => commitAdd(month)}
                  onKeyDown={e => { if (e.key === 'Enter') commitAdd(month); if (e.key === 'Escape') setAddingMonth(null) }}
                  placeholder="업무명" className="mt-1.5 w-full border border-gray-200 rounded px-1.5 py-1 text-[12px] flex-shrink-0"
                />
              ) : (
                <button onClick={() => startAdd(month)} className="mt-1.5 text-left text-[11.5px] text-[#7A8491] hover:text-[#4C7FE0] flex-shrink-0">+ 추가</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
