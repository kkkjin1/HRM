'use client'

// 업무 탭 마지막 서브탭 "캘린더" — 팀원들이 직접 입력하는 월별 루틴 업무.
// 반복 안 함(특정 날짜 1회) / 매주 O요일 / 매월 N일(또는 말일) 세 가지 패턴만 지원한다.

import { useEffect, useMemo, useState } from 'react'

type RoutineTask = {
  id: string
  title: string
  assignee: string
  repeat_enabled: boolean
  repeat_unit: 'week' | 'month' | null
  weekday: number | null
  month_day: number | null
  month_last_day: boolean
  task_date: string | null
  created_at: string
}

type Member = { id: string; name: string; sort_order: number }

type Draft = {
  id: string | null
  title: string
  assignee: string
  repeatEnabled: boolean
  repeatUnit: 'week' | 'month'
  weekday: number
  monthDay: number
  monthLastDay: boolean
  taskDate: string
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

function dateStr(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
function todayStr() {
  return dateStr(new Date())
}
function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}
function emptyDraft(taskDate: string, assignee: string): Draft {
  return { id: null, title: '', assignee, repeatEnabled: false, repeatUnit: 'week', weekday: 1, monthDay: 1, monthLastDay: false, taskDate }
}
function draftFromTask(t: RoutineTask): Draft {
  return {
    id: t.id,
    title: t.title,
    assignee: t.assignee,
    repeatEnabled: t.repeat_enabled,
    repeatUnit: t.repeat_unit ?? 'week',
    weekday: t.weekday ?? 1,
    monthDay: t.month_day ?? 1,
    monthLastDay: t.month_last_day,
    taskDate: t.task_date ?? todayStr(),
  }
}
function recurrenceLabel(t: RoutineTask) {
  if (!t.repeat_enabled) return t.task_date ?? ''
  if (t.repeat_unit === 'week') return `매주 ${WEEKDAY_KO[t.weekday ?? 0]}요일`
  return t.month_last_day ? '매월 말일' : `매월 ${t.month_day}일`
}
function occursOn(t: RoutineTask, d: Date) {
  if (!t.repeat_enabled) return t.task_date === dateStr(d)
  if (t.repeat_unit === 'week') return d.getDay() === t.weekday
  if (t.month_last_day) return d.getDate() === lastDayOfMonth(d.getFullYear(), d.getMonth() + 1)
  return d.getDate() === t.month_day
}

export default function RoutineCalendar() {
  const [tasks, setTasks] = useState<RoutineTask[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loaded, setLoaded] = useState(false)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    (async () => {
      const [tasksRes, membersRes] = await Promise.all([fetch('/api/routine-tasks'), fetch('/api/members')])
      const [tasksJson, membersJson] = await Promise.all([tasksRes.json(), membersRes.json()])
      if (tasksJson.ok) setTasks(tasksJson.tasks)
      if (membersJson.ok) setMembers(membersJson.members)
      setLoaded(true)
    })()
  }, [])

  const visibleTasks = useMemo(
    () => filterAssignee ? tasks.filter(t => t.assignee === filterAssignee) : tasks,
    [tasks, filterAssignee]
  )

  const weeks = useMemo(() => {
    const first = new Date(year, monthNum - 1, 1)
    const startOffset = first.getDay() // 0=일
    const gridStart = new Date(first)
    gridStart.setDate(first.getDate() - startOffset)
    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      days.push(d)
    }
    const result: Date[][] = []
    for (let w = 0; w < 6; w++) result.push(days.slice(w * 7, w * 7 + 7))
    return result
  }, [year, monthNum])

  function prevMonth() {
    if (monthNum === 1) { setYear(y => y - 1); setMonthNum(12) } else setMonthNum(m => m - 1)
  }
  function nextMonth() {
    if (monthNum === 12) { setYear(y => y + 1); setMonthNum(1) } else setMonthNum(m => m + 1)
  }
  function gotoToday() { setYear(now.getFullYear()); setMonthNum(now.getMonth() + 1) }

  function openNewDraft(d?: Date) {
    setDraft(emptyDraft(d ? dateStr(d) : todayStr(), filterAssignee ?? members[0]?.name ?? ''))
  }

  async function saveDraft() {
    if (!draft || !draft.title.trim() || !draft.assignee) return
    const payload = draft.repeatEnabled
      ? {
          title: draft.title.trim(), assignee: draft.assignee, repeat_enabled: true, repeat_unit: draft.repeatUnit,
          weekday: draft.repeatUnit === 'week' ? draft.weekday : null,
          month_day: draft.repeatUnit === 'month' && !draft.monthLastDay ? draft.monthDay : null,
          month_last_day: draft.repeatUnit === 'month' ? draft.monthLastDay : false,
          task_date: null,
        }
      : { title: draft.title.trim(), assignee: draft.assignee, repeat_enabled: false, repeat_unit: null, weekday: null, month_day: null, month_last_day: false, task_date: draft.taskDate }

    if (draft.id) {
      const res = await fetch('/api/routine-tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: draft.id, ...payload }) })
      const json = await res.json()
      if (json.ok) setTasks(prev => prev.map(t => t.id === draft.id ? json.task : t))
    } else {
      const res = await fetch('/api/routine-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (json.ok) setTasks(prev => [...prev, json.task])
    }
    setDraft(null)
  }

  async function deleteDraftTask() {
    if (!draft?.id) return
    if (!confirm('이 루틴 업무를 삭제할까요?')) return
    const res = await fetch('/api/routine-tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: draft.id }) })
    const json = await res.json()
    if (json.ok) { setTasks(prev => prev.filter(t => t.id !== draft.id)); setDraft(null) }
  }

  if (!loaded) return <p className="text-[12.5px] text-[#B0B8C1] px-1 py-6">불러오는 중...</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-[17px] font-semibold text-[#1F2933]">캘린더</h1>
          <p className="text-[12.5px] text-[#7A8491] mt-0.5">월별 루틴 업무를 등록하고 서로의 업무를 확인하세요.</p>
        </div>
        <button
          onClick={() => openNewDraft()}
          className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3.5 py-2 flex-shrink-0"
        >
          + 루틴 업무
        </button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">‹</button>
          <p className="text-[14px] font-medium text-[#1F2933] w-[104px] text-center">{year}년 {monthNum}월</p>
          <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center text-[#7A8491] hover:text-[#1F2933] rounded-md hover:bg-black/[0.03]">›</button>
          <button onClick={gotoToday} className="ml-1.5 text-[12px] text-[#7A8491] hover:text-[#4C7FE0] border border-[#E5E8EB] rounded-md px-2.5 py-1">오늘</button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterAssignee(null)}
            className={`text-[12px] px-2.5 py-1 rounded-md transition-colors ${filterAssignee === null ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
          >
            전체
          </button>
          {members.map(m => (
            <button
              key={m.id}
              onClick={() => setFilterAssignee(m.name)}
              className={`text-[12px] px-2.5 py-1 rounded-md transition-colors ${filterAssignee === m.name ? 'bg-[#1F2933] text-white' : 'text-[#7A8491] hover:bg-black/[0.04]'}`}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-[720px] bg-white rounded-xl border border-[#EEF0F2] [overflow:clip]">
        <div className="grid grid-cols-7">
          {WEEKDAY_KO.map(w => (
            <div key={w} className="h-9 flex items-center justify-center text-[12px] font-semibold text-[#7A8491] border-b border-[#EEF0F2] bg-[#FAFBFB]">{w}</div>
          ))}
          {weeks.map((week, wi) => week.map((d, di) => {
            const inMonth = d.getMonth() === monthNum - 1
            const isToday = dateStr(d) === todayStr()
            const dayTasks = visibleTasks.filter(t => occursOn(t, d))
            return (
              <div
                key={`${wi}-${di}`}
                onClick={() => openNewDraft(d)}
                className={`min-h-[92px] border-l border-t border-[#EEF0F2] px-1.5 py-1.5 cursor-pointer hover:bg-[#F7F8F8] ${di === 0 || di === 6 ? 'bg-[#FAFBFB]' : ''} ${!inMonth ? 'opacity-40' : ''}`}
              >
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-[11px] font-semibold ${isToday ? 'bg-[#4C7FE0] text-white' : 'text-[#3A4249]'}`}>
                  {d.getDate()}
                </span>
                <div className="mt-1 space-y-1">
                  {dayTasks.map(t => (
                    <button
                      key={t.id}
                      onClick={e => { e.stopPropagation(); setDraft(draftFromTask(t)) }}
                      className="w-full text-left text-[10.5px] font-medium text-[#4C7FE0] bg-[#4C7FE0]/10 hover:bg-[#4C7FE0]/20 rounded px-1.5 py-0.5 truncate"
                      title={`${t.title} · ${t.assignee} · ${recurrenceLabel(t)}`}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              </div>
            )
          }))}
        </div>
      </div>

      {draft && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 px-4" onClick={() => setDraft(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-lg p-5 w-full max-w-sm space-y-2.5">
            <p className="text-sm font-semibold text-gray-800">{draft.id ? '루틴 업무 수정' : '루틴 업무 추가'}</p>
            <input
              value={draft.title} onChange={e => setDraft(d => d && { ...d, title: e.target.value })}
              placeholder="업무명" autoFocus className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={draft.assignee} onChange={e => setDraft(d => d && { ...d, assignee: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm"
            >
              <option value="">담당자 선택</option>
              {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              {draft.assignee && !members.some(m => m.name === draft.assignee) && <option value={draft.assignee}>{draft.assignee} (미등록)</option>}
            </select>

            <label className="flex items-center gap-2 text-[12.5px] text-gray-600 pt-1">
              <input type="checkbox" checked={draft.repeatEnabled} onChange={e => setDraft(d => d && { ...d, repeatEnabled: e.target.checked })} />
              반복 루틴
            </label>

            {!draft.repeatEnabled ? (
              <input
                type="date" value={draft.taskDate} onChange={e => setDraft(d => d && { ...d, taskDate: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            ) : (
              <div className="space-y-2 bg-[#F9FAFB] rounded-lg p-2.5">
                <div className="flex gap-1.5">
                  <button
                    type="button" onClick={() => setDraft(d => d && { ...d, repeatUnit: 'week' })}
                    className={`flex-1 text-[12px] py-1.5 rounded-md font-medium transition-colors ${draft.repeatUnit === 'week' ? 'bg-[#4C7FE0] text-white' : 'bg-white border border-gray-200 text-gray-500'}`}
                  >
                    매주
                  </button>
                  <button
                    type="button" onClick={() => setDraft(d => d && { ...d, repeatUnit: 'month' })}
                    className={`flex-1 text-[12px] py-1.5 rounded-md font-medium transition-colors ${draft.repeatUnit === 'month' ? 'bg-[#4C7FE0] text-white' : 'bg-white border border-gray-200 text-gray-500'}`}
                  >
                    매월
                  </button>
                </div>

                {draft.repeatUnit === 'week' ? (
                  <select
                    value={draft.weekday} onChange={e => setDraft(d => d && { ...d, weekday: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12.5px] bg-white"
                  >
                    {WEEKDAY_KO.map((w, i) => <option key={w} value={i}>매주 {w}요일</option>)}
                  </select>
                ) : (
                  <select
                    value={draft.monthLastDay ? 'last' : draft.monthDay}
                    onChange={e => setDraft(d => d && (e.target.value === 'last' ? { ...d, monthLastDay: true } : { ...d, monthLastDay: false, monthDay: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12.5px] bg-white"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(n => <option key={n} value={n}>매월 {n}일</option>)}
                    <option value="last">매월 말일</option>
                  </select>
                )}
              </div>
            )}

            <div className="flex gap-1.5 pt-1">
              <button onClick={saveDraft} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5">저장</button>
              {draft.id && <button onClick={deleteDraftTask} className="text-[12.5px] font-medium text-red-500 px-3 py-1.5">삭제</button>}
              <button onClick={() => setDraft(null)} className="text-[12.5px] font-medium text-gray-500 px-3 py-1.5">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
