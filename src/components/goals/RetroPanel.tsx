'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import RetroTemplateModal from './RetroTemplateModal'
import RetroFullscreenView from './RetroFullscreenView'
import TeamRetroSplit, { type RetroLearningField } from './TeamRetroSplit'
import { normalizeLearningLabels, type LearningLabels, type PlanMonth } from '@/lib/team/devPlan'
import PersonalRetroTable from './PersonalRetroTable'

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
  // 월말 학습 — 팀빌딩 월 기록(team_plan_months)을 읽어 팀 회고 가운데 칸에 보여 준다. 저장도 같은 기록에(/api/team-plan, 팀장만·version 비교).
  // 그달 팀빌딩 계획이 없으면 가운데 칸 없이 기존 두 칸만.
  const [planMonths, setPlanMonths] = useState<PlanMonth[]>([])
  const [planCanEdit, setPlanCanEdit] = useState(false)
  const planRef = useRef<PlanMonth[]>([])
  const [learningLabels, setLearningLabels] = useState<LearningLabels>(() => normalizeLearningLabels(null))
  const saveChain = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    let alive = true
    fetch('/api/team-plan').then(r => (r.ok ? r.json() : null)).catch(() => null).then((j: { ok?: boolean; months?: PlanMonth[]; can_edit?: boolean } | null) => {
      if (!alive || !j?.ok || !j.months) return
      planRef.current = j.months
      setPlanMonths(j.months)
      setPlanCanEdit(j.can_edit === true)
    })
    fetch('/api/team-settings?key=retro_learning_labels').then(r => (r.ok ? r.json() : null)).catch(() => null).then((j: { value?: unknown } | null) => {
      if (alive && j) setLearningLabels(normalizeLearningLabels(j.value))
    })
    return () => { alive = false }
  }, [])
  // 칸마다 저장이 이어질 수 있어 순서대로 보내고, 매번 가장 최근 version을 쓴다(실패하면 throw → 입력칸이 "저장 실패" 표시).
  const saveLearning = useCallback((monthId: string, field: RetroLearningField, content: string) => {
    const run = async () => {
      const cur = planRef.current.find(m => m.id === monthId)
      if (!cur) throw new Error('not found')
      const res = await fetch('/api/team-plan', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'month', id: monthId, version: cur.version, fields: { [field]: content } }) }).catch(() => null)
      const j = res ? await res.json().catch(() => null) : null
      if (!j?.ok || !j.month) throw new Error(j?.error ?? 'save failed')
      planRef.current = planRef.current.map(m => (m.id === monthId ? { ...j.month, actions: m.actions } : m))
      setPlanMonths(planRef.current)
    }
    const p = saveChain.current.then(run, run)
    saveChain.current = p.catch(() => undefined)
    return p
  }, [])

  // 칸 이름 바꾸기(팀장) — 팀 공용 설정에 저장, 실패하면 그대로 두고 false
  const saveLearningLabel = useCallback(async (field: RetroLearningField, label: string) => {
    const next = { ...learningLabels, [field]: label }
    const res = await fetch('/api/team-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'retro_learning_labels', value: next }) }).catch(() => null)
    if (!res?.ok) { window.alert('칸 이름을 저장하지 못했습니다. 다시 시도해 주세요.'); return false }
    setLearningLabels(next)
    return true
  }, [learningLabels])

  // 그달 팀빌딩 기록 → 팀 회고 가운데 칸 값(없으면 null = 칸 없음)
  const learningOf = useCallback((month: number) => {
    const pm = planMonths.find(m => m.month === `${year}-${String(month).padStart(2, '0')}-01`)
    if (!pm) return null
    return {
      value: { learned_new: pm.learned_new, changed_view: pm.changed_view, still_unknown: pm.still_unknown },
      labels: learningLabels,
      canEdit: planCanEdit,
      onSave: (field: RetroLearningField, content: string) => saveLearning(pm.id, field, content),
      onSaveLabel: saveLearningLabel,
    }
  }, [planMonths, planCanEdit, year, saveLearning, learningLabels, saveLearningLabel])

  // 개인 회고 행 순서 — 팀장이 ⠿로 끌어 바꾼 순서(team_log_settings 'retro_member_order', 팀 공용)
  const [retroOrder, setRetroOrder] = useState<string[]>([])
  const [orderError, setOrderError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/team-settings?key=retro_member_order').then(r => (r.ok ? r.json() : null)).catch(() => null).then((j: { value?: unknown } | null) => {
      if (alive && Array.isArray(j?.value)) setRetroOrder(j.value.filter((id): id is string => typeof id === 'string'))
    })
    return () => { alive = false }
  }, [])

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

  // 개인 회고 칸 순서: 저장된 순서(팀장이 끌어서 정함)가 우선, 없거나 빠진 사람은 기본 배치 뒤로.
  // 기본 배치 = 강은정/김다슬 두 명의 위치를 서로 바꿔 달라는 예전 요청에 따른 수동 배치.
  const orderedMembers = (() => {
    const a = members.findIndex(m => m.name === '강은정')
    const b = members.findIndex(m => m.name === '김다슬')
    const base = [...members]
    if (a !== -1 && b !== -1) [base[a], base[b]] = [base[b], base[a]]
    const saved = retroOrder.map(id => base.find(m => m.id === id)).filter((m): m is (typeof members)[number] => !!m)
    return [...saved, ...base.filter(m => !retroOrder.includes(m.id))]
  })()

  // 순서 저장 — 화면에 먼저 반영하고, 실패하면 되돌린다.
  async function reorderRetro(next: string[]) {
    const before = retroOrder
    setRetroOrder(next)
    setOrderError(null)
    const res = await fetch('/api/team-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'retro_member_order', value: next }) }).catch(() => null)
    if (!res?.ok) { setRetroOrder(before); setOrderError('개인 회고 순서를 저장하지 못했습니다. 다시 시도해 주세요.') }
  }

  // 그 달의 개인 회고 대상 = 그 달까지 입사한 팀원(입사일 없으면 기존 팀원). 입사 전 달에 이미 쓴 회고가 있으면 그 사람도 보여 준다.
  function membersOf(month: number) {
    const ym = `${year}-${String(month).padStart(2, '0')}`
    return orderedMembers.filter(m => !m.hired_at || m.hired_at.slice(0, 7) <= ym || !!retros[month]?.[m.id]?.trim())
  }

  // 월 버튼 진행 막대용: 그 달 개인 회고를 쓴 팀원 수.
  function writtenCount(month: number) {
    return membersOf(month).filter(m => retros[month]?.[m.id]?.trim()).length
  }

  // 일부 달은 입사 전 팀원이 빠진 목록이라, 그 목록에서 바꾼 순서를 전체 순서의 같은 자리들에 다시 끼워 넣는다.
  function reorderFromMonth(subset: string[]) {
    const full = orderedMembers.map(m => m.id)
    const inSubset = new Set(subset)
    let k = 0
    void reorderRetro(full.map(id => (inSubset.has(id) ? subset[k++] : id)))
  }

  if (!loaded || !membersLoaded || !meLoaded) return <p className="text-[13px] text-[#7A8491]">불러오는 중...</p>
  const isLead = me?.role === 'lead'

  return (
    <div className="font-['Pretendard',sans-serif]">
      <div className="grid grid-cols-12 gap-1.5 mb-5 bg-white border border-[#E5E8EB] rounded-[22px] p-3 overflow-x-auto">
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
          const written = writtenCount(m)
          const total = membersOf(m).length
          const selected = selectedMonth === m
          const pct = total ? Math.round(written / total * 100) : 0
          return (
            <button
              key={m}
              type="button"
              onClick={() => setSelectedMonth(m)}
              className={`min-w-[56px] flex flex-col items-stretch gap-1.5 px-1.5 py-2 rounded-xl border text-center transition-colors ${
                selected ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]' : 'bg-white text-[#1F2933] border-[#E5E8EB] hover:bg-black/[0.03]'
              }`}
            >
              <span className="text-[12.5px] font-semibold">{m}월</span>
              <span className={`block h-1 rounded-full overflow-hidden ${selected ? 'bg-white/30' : 'bg-[#E5E8EB]'}`}>
                <span className={`block h-full rounded-full ${selected ? 'bg-white' : 'bg-[#2E8B6A]'}`} style={{ width: `${pct}%` }} />
              </span>
              <span className={`text-[10.5px] ${selected ? 'text-white/90' : 'text-[#7A8491]'}`}>{written ? `${written}/${total}` : '—'}</span>
            </button>
          )
        })}
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
              learning={learningOf(selectedMonth)}
            />
          </section>

          {/* 스크롤을 끝까지 내리면 "개인 회고" 제목이 화면 맨 위까지 올라오도록 화면 높이만큼은 확보한다. */}
          <section className="min-h-[calc(100vh-40px)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] font-semibold text-[#1F2933]">
                개인 회고 <span className="font-normal text-[12px] text-[#7A8491] ml-1">{writtenCount(selectedMonth)} / {membersOf(selectedMonth).length}명 작성 · 행을 누르면 펼쳐집니다</span>
              </p>
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
              <PersonalRetroTable
                key={`personal-${year}-${selectedMonth}`}
                year={year}
                month={selectedMonth}
                members={membersOf(selectedMonth)}
                entries={retros[selectedMonth] ?? {}}
                qas={qas[selectedMonth] ?? {}}
                meId={me?.id ?? null}
                onSave={(memberId, content) => save(selectedMonth, memberId, content)}
                onSaveQA={(askerId, targetId, field, content) => saveQA(selectedMonth, askerId, targetId, field, content)}
                onReorder={isLead ? reorderFromMonth : undefined}
              />
            )}
            {orderError && <p className="text-[11.5px] text-red-500 mt-1.5">{orderError}</p>}
          </section>
        </div>
      )}

      {templateOpen && <RetroTemplateModal onClose={() => setTemplateOpen(false)} />}
      {fullscreenOpen && selectedMonth !== null && (
        <RetroFullscreenView
          year={year}
          month={selectedMonth}
          members={membersOf(selectedMonth)}
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
