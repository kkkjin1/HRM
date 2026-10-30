'use client'

// 팀 탭 "팀 발전계획"의 데이터 담당 — /api/team-plan으로만 읽고 쓴다(브라우저는 계획 테이블을 직접 못 읽는다).
// 저장은 서버가 version을 비교해 받아 준 뒤에만 화면에 반영한다(낙관적 반영 없음 — 실패하면 편집 중인 내용이 그대로 남는다).

import { useCallback, useEffect, useState } from 'react'
import DevPlanBoard, { type SaveResult } from '@/components/team/DevPlanBoard'
import { normalizeLearningLabels, type ActionField, type BaselineMeta, type LearningLabels, type MonthField, type PlanAction, type PlanCategory, type PlanMonth } from '@/lib/team/devPlan'

type Api<T> = { ok: boolean; error?: string; warning?: string } & Partial<T>
async function api<T>(url: string, init?: RequestInit): Promise<Api<T>> {
  try {
    const res = await fetch(url, init ? { ...init, headers: { 'Content-Type': 'application/json' } } : undefined)
    return await res.json().catch(() => ({ ok: false, error: '응답을 읽지 못했습니다' }))
  } catch {
    return { ok: false, error: '네트워크 오류로 저장하지 못했습니다. 연결을 확인해 주세요.' } as Api<T>
  }
}

export default function DevPlanSection() {
  const [months, setMonths] = useState<PlanMonth[] | null>(null)
  const [baselines, setBaselines] = useState<BaselineMeta[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [labels, setLabels] = useState<LearningLabels>(() => normalizeLearningLabels(null))

  useEffect(() => {
    let alive = true
    api<{ months: PlanMonth[]; baselines: BaselineMeta[]; can_edit: boolean }>('/api/team-plan').then(r => {
      if (!alive) return
      if (r.ok && r.months) { setMonths(r.months); setBaselines(r.baselines ?? []); setCanEdit(r.can_edit === true); setLoadError(null) }
      else setLoadError('팀 발전계획을 불러오지 못했습니다. 저장소가 아직 준비되지 않았거나 연결에 문제가 있습니다.')
    })
    // 월말 학습 칸 이름(회고 화면에서 팀장이 바꿈) — LLM용 복사에 쓴다. 못 받으면 기본 이름
    api<{ value: unknown }>('/api/team-settings?key=retro_learning_labels').then(r => { if (alive && r.ok) setLabels(normalizeLearningLabels(r.value)) })
    return () => { alive = false }
  }, [reloadKey])

  const saveMonth = useCallback(async (m: PlanMonth, fields: Partial<Record<MonthField, string>>): Promise<SaveResult> => {
    const r = await api<{ month: Omit<PlanMonth, 'actions'> }>('/api/team-plan', { method: 'PATCH', body: JSON.stringify({ target: 'month', id: m.id, version: m.version, fields }) })
    if (!r.ok || !r.month) return { ok: false, error: r.error ?? '저장하지 못했습니다' }
    const saved = r.month
    setMonths(prev => prev?.map(x => (x.id === saved.id ? { ...saved, actions: x.actions } : x)) ?? prev)
    return { ok: true }
  }, [])

  const saveAction = useCallback(async (a: PlanAction, fields: Partial<Record<ActionField, string>>): Promise<SaveResult> => {
    const r = await api<{ action: PlanAction }>('/api/team-plan', { method: 'PATCH', body: JSON.stringify({ target: 'action', id: a.id, version: a.version, fields }) })
    if (!r.ok || !r.action) return { ok: false, error: r.error ?? '저장하지 못했습니다' }
    const saved = r.action
    setMonths(prev => prev?.map(m => (m.id === saved.month_id ? { ...m, actions: m.actions.map(x => (x.id === saved.id ? saved : x)) } : m)) ?? prev)
    return { ok: true }
  }, [])

  const addMonth = useCallback(async (month: string) => {
    const r = await api<{ month: PlanMonth }>('/api/team-plan', { method: 'POST', body: JSON.stringify({ op: 'add_month', month }) })
    if (!r.ok || !r.month) return { ok: false, error: r.error ?? '추가하지 못했습니다' }
    const created = r.month
    setMonths(prev => [...(prev ?? []), created])
    return { ok: true, id: created.id, error: r.warning }
  }, [])

  const addAction = useCallback(async (monthId: string, category: PlanCategory): Promise<SaveResult> => {
    const r = await api<{ action: PlanAction }>('/api/team-plan', { method: 'POST', body: JSON.stringify({ op: 'add_action', month_id: monthId, category }) })
    if (!r.ok || !r.action) return { ok: false, error: r.error ?? '추가하지 못했습니다' }
    const created = r.action
    setMonths(prev => prev?.map(m => (m.id === monthId ? { ...m, actions: [...m.actions, created] } : m)) ?? prev)
    return { ok: true }
  }, [])

  if (loadError) return (
    <div className="bg-white rounded-2xl border border-[#EEF0F2] p-5">
      <p className="text-[12.5px] text-[#7A8491]">{loadError}</p>
      <button onClick={() => { setLoadError(null); setReloadKey(k => k + 1) }} className="text-[12px] text-[#4C7FE0] mt-2 hover:underline">다시 시도</button>
    </div>
  )
  if (months === null) return <p className="text-[13px] text-[#B0B8C1] px-1 py-6">불러오는 중...</p>
  return (
    <DevPlanBoard months={months} baselines={baselines} canEdit={canEdit}
      onSaveMonth={saveMonth} onSaveAction={saveAction} onAddMonth={addMonth} onAddAction={addAction} learningLabels={labels} />
  )
}
