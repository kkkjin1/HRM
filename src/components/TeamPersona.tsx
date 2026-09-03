'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import ProfileCardModal from '@/components/ProfileCardModal'
import TeamMemberCard from '@/components/TeamMemberCard'
import WorkStylePanel, { type WorkStyleMap } from '@/components/WorkStylePanel'
import JohariPanel from '@/components/JohariPanel'
import TeamHealthPanel from '@/components/TeamHealthPanel'
import TeamSummary from '@/components/TeamSummary'

type Principle = { id: string; content: string; sort_order: number; created_at: string }

const PINNED_MEMBER_ORDER = ['김진일', '김다슬', '박주현', '강은정']

export default function TeamPersona() {
  const { members, loaded: membersLoaded } = useMembers()
  const [principles, setPrinciples] = useState<Principle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [newPrinciple, setNewPrinciple] = useState('')
  const [busy, setBusy] = useState(false)
  const [openMemberId, setOpenMemberId] = useState<string | null>(null)
  const [workStyleMap, setWorkStyleMap] = useState<WorkStyleMap>(new Map())

  const handleWorkStyleRows = useCallback((map: WorkStyleMap) => setWorkStyleMap(map), [])

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase.from('team_principles').select('*').order('sort_order')
      if (!active) return
      if (data) setPrinciples(data as Principle[])
      setLoaded(true)
    })()
    return () => { active = false }
  }, [])

  async function addPrinciple() {
    const content = newPrinciple.trim()
    if (!content || busy) return
    setBusy(true)
    const supabase = createClient()
    const { data } = await supabase.from('team_principles').insert({ content, sort_order: principles.length }).select().single()
    if (data) setPrinciples(prev => [...prev, data as Principle])
    setNewPrinciple('')
    setBusy(false)
  }

  async function deletePrinciple(p: Principle) {
    setPrinciples(prev => prev.filter(x => x.id !== p.id))
    const supabase = createClient()
    await supabase.from('team_principles').delete().eq('id', p.id)
  }

  if (!loaded || !membersLoaded) {
    return <p className="text-[13px] text-[#B0B8C1] px-1 py-6">불러오는 중...</p>
  }

  const orderedMembers = [...members].sort((a, b) => {
    const ai = PINNED_MEMBER_ORDER.indexOf(a.name)
    const bi = PINNED_MEMBER_ORDER.indexOf(b.name)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return 0
  })

  return (
    <div className="max-w-[1120px] mx-auto space-y-6">
      <div>
        <h1 className="text-[19px] font-semibold text-[#1F2933]">팀</h1>
      </div>

      {/* 팀원 grid(좌) + 요약/약속 sidebar(우) */}
      <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-5">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {orderedMembers.map(m => (
              <TeamMemberCard
                key={m.id}
                member={m}
                onOpenProfile={() => setOpenMemberId(m.id)}
                workStyle={workStyleMap.get(m.id) ?? null}
              />
            ))}
          </div>

          <Link
            href="/fun/settings/members"
            className="flex items-center justify-center gap-1.5 border-2 border-dashed border-[#E2E6EC] rounded-2xl py-4 text-[13px] font-medium text-[#7A8491] hover:text-[#4C7FE0] hover:border-[#C7D2E6] transition-colors"
          >
            <span aria-hidden>＋</span> 팀원 추가
          </Link>
        </div>

        <div className="flex flex-col gap-5">
          <TeamSummary />

          <div className="bg-white rounded-2xl border border-[#EEF0F2] p-5 flex flex-col">
            <p className="text-[13px] font-semibold text-[#1F2933] mb-0.5">우리 팀의 약속</p>
            <p className="text-[11.5px] text-[#B0B8C1] mb-3">개인 위에 있는 공통 기준입니다. 새로 온 사람이 가장 먼저 읽습니다.</p>
            {principles.length === 0 && <p className="text-[12.5px] text-[#B0B8C1] mb-2">아직 약속이 없습니다. 첫 문장을 적어보세요.</p>}
            <ul className="space-y-2 mb-3">
              {principles.map((p, i) => (
                <li key={p.id} className="flex items-start gap-2.5 text-[13px] text-[#3A4249] group bg-[#FAFBFC] rounded-lg px-2.5 py-2">
                  <span className="text-[11px] font-semibold text-[#4C7FE0] mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1 leading-relaxed">{p.content}</span>
                  <button onClick={() => deletePrinciple(p)} className="text-[11px] text-[#C4CBD2] hover:text-red-500 rounded px-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                </li>
              ))}
            </ul>
            <form onSubmit={e => { e.preventDefault(); addPrinciple() }} className="flex gap-1.5">
              <input value={newPrinciple} onChange={e => setNewPrinciple(e.target.value)}
                placeholder="예: 막히면 혼자 3일 이상 끌지 않는다"
                className="flex-1 text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]" />
              <button type="submit" disabled={busy || !newPrinciple.trim()}
                className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-md px-3 py-1.5 flex-shrink-0">추가</button>
            </form>
          </div>
        </div>
      </div>

      {/* 나와 일하는 법 */}
      <WorkStylePanel onRowsChange={handleWorkStyleRows} />

      {/* 조하리 창 */}
      <JohariPanel />

      {/* 팀 건강도 */}
      <TeamHealthPanel />

      {openMemberId && <ProfileCardModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} />}
    </div>
  )
}
