'use client'

// 팀 탭 "팀 발전계획"(DevPlanBoard)을 로그인 없이 보고 다듬기 위한 미리보기.
// 초기 3개월 계획(lib/team/devPlan의 SEED_MONTHS)으로 메모리에서만 동작한다(서버 저장 없음). 운영 빌드에서는 layout.tsx가 404로 막는다.
// ?role=member 로 팀원(열람 전용) 화면, ?conflict=1 로 저장 충돌(409) 응답을 흉내 낸다.
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import DevPlanBoard from '@/components/team/DevPlanBoard'
import { PLAN_CATEGORIES, SEED_MONTHS, type BaselineMeta, type PlanAction, type PlanMonth } from '@/lib/team/devPlan'

const BASELINE: BaselineMeta = { id: 'r0', title: 'R0 최초 팀 진단', items_version: 'r0-v3', closed_at: '2026-10-30T02:26:32Z', roster_n: 5, submitted_n: 5 }
let seq = 0
const uid = () => `mock-${++seq}`
const blankAction = (month_id: string, category: PlanAction['category'], sort_order = 0): PlanAction => ({
  id: uid(), month_id, category, focus: '', purpose: '', action_plan: '', evidence: '', status: 'planned', result: '', learned: '', follow_up: '', sort_order, version: 1, updated_at: null,
})
function seed(): PlanMonth[] {
  return SEED_MONTHS.map(s => {
    const id = uid()
    return {
      id, month: s.month, theme: s.theme, core_question: s.core_question, next_question: s.next_question,
      learned_new: '', changed_view: '', still_unknown: '', baseline_round_id: 'r0', version: 1, updated_at: null,
      actions: s.actions.map(a => ({ ...blankAction(id, a.category), ...a })),
    }
  })
}

function Mock() {
  const q = useSearchParams()
  const canEdit = q.get('role') !== 'member'
  const conflict = q.get('conflict') === '1'
  const [months, setMonths] = useState<PlanMonth[]>(seed)
  const wait = () => new Promise(r => setTimeout(r, 250))

  return (
    <div className="min-h-screen bg-[#F7F8FA] p-4 sm:p-8">
      <div className="max-w-[1120px] mx-auto">
        <p className="text-[11.5px] text-[#B45309] mb-3">미리보기 — 메모리에서만 동작합니다(새로고침하면 초기화). ?role=member 팀원 화면 · ?conflict=1 저장 충돌</p>
        <DevPlanBoard
          months={months} baselines={[BASELINE]} canEdit={canEdit}
          onSaveMonth={async (m, f) => {
            await wait()
            if (conflict) return { ok: false, error: '그사이 다른 곳에서 먼저 수정했습니다. 새로고침해 최신 내용을 확인한 뒤 다시 저장해 주세요.' }
            setMonths(prev => prev.map(x => (x.id === m.id ? { ...x, ...f, version: x.version + 1 } : x)))
            return { ok: true }
          }}
          onSaveAction={async (a, f) => {
            await wait()
            if (conflict) return { ok: false, error: '그사이 다른 곳에서 먼저 수정했습니다. 새로고침해 최신 내용을 확인한 뒤 다시 저장해 주세요.' }
            setMonths(prev => prev.map(m => (m.id === a.month_id ? { ...m, actions: m.actions.map(x => (x.id === a.id ? { ...x, ...f, version: x.version + 1 } as PlanAction : x)) } : m)))
            return { ok: true }
          }}
          onAddMonth={async month => {
            await wait()
            const key = `${month}-01`
            if (months.some(m => m.month === key)) return { ok: false, error: '이미 있는 월입니다' }
            const id = uid()
            setMonths(prev => [...prev, {
              id, month: key, theme: '', core_question: '', next_question: '', learned_new: '', changed_view: '', still_unknown: '',
              baseline_round_id: 'r0', version: 1, updated_at: null, actions: PLAN_CATEGORIES.map(c => blankAction(id, c)),
            }])
            return { ok: true, id }
          }}
          onAddAction={async (monthId, category) => {
            await wait()
            setMonths(prev => prev.map(m => (m.id === monthId ? { ...m, actions: [...m.actions, blankAction(monthId, category, m.actions.length)] } : m)))
            return { ok: true }
          }}
        />
      </div>
    </div>
  )
}

export default function TeamPlanMockPage() {
  return <Suspense><Mock /></Suspense>
}
