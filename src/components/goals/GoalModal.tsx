'use client'

import { useMemo, useState } from 'react'
import { GOAL_LEVELS, GOAL_LEVEL_LABEL, PARENT_LEVEL, type GoalLevel } from '@/lib/goalLevels'
import { GOAL_ICON_OPTIONS, DEFAULT_GOAL_ICON } from './goalIcons'
import { periodLabel } from './goalUtils'
import type { Goal } from './types'

const SELECT_CLASS = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] bg-white'
const INPUT_CLASS = 'w-full border border-[#E5E8EB] rounded-md px-3 py-2 text-[14px] focus:outline-none focus:border-[#4C7FE0]'
const LABEL_CLASS = 'block text-[12px] text-[#7A8491] mb-1.5'

export default function GoalModal({
  goals, initial, defaultLevel, onClose, onSubmit,
}: {
  goals: Goal[]
  initial?: Goal
  defaultLevel?: GoalLevel
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
}) {
  const nowYear = new Date().getFullYear()
  const [name, setName] = useState(initial?.name ?? '')
  const [level, setLevel] = useState<GoalLevel>(initial?.level ?? defaultLevel ?? 'yearly')
  const [parentId, setParentId] = useState<string>(initial?.parent_id ?? '')
  const [year, setYear] = useState<number>(initial?.year ?? nowYear)
  const [half, setHalf] = useState<'h1' | 'h2'>(initial?.half ?? 'h1')
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(initial?.quarter ?? 1)
  const [month, setMonth] = useState<number>(initial?.month ?? 1)
  const [icon, setIcon] = useState(initial?.icon ?? DEFAULT_GOAL_ICON)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const hasChildren = useMemo(() => !!initial && goals.some(g => g.parent_id === initial.id), [goals, initial])
  const requiredParentLevel = PARENT_LEVEL[level]
  const parentOptions = useMemo(
    () => requiredParentLevel ? goals.filter(g => g.level === requiredParentLevel) : [],
    [goals, requiredParentLevel]
  )
  const selectedParent = parentOptions.find(g => g.id === parentId)
  const effectiveYear = requiredParentLevel ? (selectedParent?.year ?? null) : year

  function changeLevel(next: GoalLevel) {
    setLevel(next)
    setParentId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErrorMsg('목표명을 입력해주세요.'); return }
    if (requiredParentLevel && !parentId) { setErrorMsg(`상위 ${GOAL_LEVEL_LABEL[requiredParentLevel]} 목표를 선택해주세요.`); return }

    setSubmitting(true)
    setErrorMsg('')
    const payload: Record<string, unknown> = {
      name: name.trim(), level, parent_id: requiredParentLevel ? parentId : null, icon, description,
    }
    if (!requiredParentLevel) payload.year = year
    if (level === 'half') payload.half = half
    if (level === 'quarter') payload.quarter = quarter
    if (level === 'month') payload.month = month

    const res = await onSubmit(payload)
    setSubmitting(false)
    if (!res.ok) { setErrorMsg(res.error ?? '저장에 실패했습니다.'); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-5 w-full max-w-sm space-y-3.5">
        <h2 className="text-[15px] font-semibold text-[#1F2933]">{initial ? '목표 수정' : '새 목표'}</h2>

        <div>
          <label className={LABEL_CLASS}>목표명</label>
          <input className={INPUT_CLASS} value={name} onChange={e => setName(e.target.value)} maxLength={100} autoFocus />
        </div>

        <div>
          <label className={LABEL_CLASS}>목표 단계</label>
          <select
            className={`${SELECT_CLASS} w-full`}
            value={level}
            disabled={hasChildren}
            onChange={e => changeLevel(e.target.value as GoalLevel)}
          >
            {GOAL_LEVELS.map(l => <option key={l} value={l}>{GOAL_LEVEL_LABEL[l]}</option>)}
          </select>
          {hasChildren && <p className="text-[11px] text-[#B0B8C1] mt-1">하위 목표가 있어 단계를 변경할 수 없습니다.</p>}
        </div>

        {requiredParentLevel && (
          <div>
            <label className={LABEL_CLASS}>상위 목표 ({GOAL_LEVEL_LABEL[requiredParentLevel]})</label>
            <select className={`${SELECT_CLASS} w-full`} value={parentId} onChange={e => setParentId(e.target.value)}>
              <option value="">선택해주세요</option>
              {parentOptions.map(g => (
                <option key={g.id} value={g.id}>{g.icon} {periodLabel(g)} · {g.name}</option>
              ))}
            </select>
            {parentOptions.length === 0 && (
              <p className="text-[11px] text-[#B0B8C1] mt-1">먼저 {GOAL_LEVEL_LABEL[requiredParentLevel]} 목표를 생성해주세요.</p>
            )}
          </div>
        )}

        <div>
          <label className={LABEL_CLASS}>기간</label>
          <div className="flex items-center gap-2">
            {requiredParentLevel ? (
              <span className="text-[13px] text-[#7A8491]">{effectiveYear ?? '—'}</span>
            ) : (
              <input type="number" className={`${INPUT_CLASS} w-24`} value={year} onChange={e => setYear(Number(e.target.value))} />
            )}
            {level === 'half' && (
              <select className={SELECT_CLASS} value={half} onChange={e => setHalf(e.target.value as 'h1' | 'h2')}>
                <option value="h1">상반기</option>
                <option value="h2">하반기</option>
              </select>
            )}
            {level === 'quarter' && (
              <select className={SELECT_CLASS} value={quarter} onChange={e => setQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}>
                {[1, 2, 3, 4].map(q => <option key={q} value={q}>{q}분기</option>)}
              </select>
            )}
            {level === 'month' && (
              <select className={SELECT_CLASS} value={month} onChange={e => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
              </select>
            )}
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>아이콘</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIconPickerOpen(p => !p)}
              className="w-10 h-10 flex items-center justify-center text-lg border border-[#E5E8EB] rounded-lg hover:bg-[#F7F8F8]"
            >
              {icon}
            </button>
            {iconPickerOpen && (
              <div className="absolute left-0 top-12 bg-white border border-[#EEF0F2] rounded-lg shadow-sm p-2 grid grid-cols-8 gap-1 z-10 w-64">
                {GOAL_ICON_OPTIONS.map(opt => (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => { setIcon(opt); setIconPickerOpen(false) }}
                    className={`w-6 h-6 flex items-center justify-center rounded text-[15px] hover:bg-[#F7F8F8] ${opt === icon ? 'bg-[#4C7FE0]/10 ring-1 ring-[#4C7FE0]' : ''}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>설명</label>
          <textarea
            className={`${INPUT_CLASS} resize-none`} rows={3} maxLength={500}
            value={description} onChange={e => setDescription(e.target.value)}
          />
        </div>

        {errorMsg && <p className="text-[12px] text-red-500">{errorMsg}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button type="submit" disabled={submitting} className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] rounded-lg px-3 py-1.5 disabled:opacity-50">
            저장
          </button>
          <button type="button" onClick={onClose} className="text-[12.5px] font-medium text-[#7A8491] px-3 py-1.5">취소</button>
        </div>
      </form>
    </div>
  )
}
