'use client'

// 팀 페이지 — "누가 뭘 담당하는가"(R&R)가 아니라 "혼자서는 안 됐을 일이 왜 이 팀이면 되는가"를 담는다.
// 그래서 구성이 개인 단위가 아니라 관계 단위다: 팀의 약속(개인 위) → 주고받음(맞물림) → 동료가 본 나(타인의 시선).
// 멤버 개인의 gives/needs/동료노트는 ProfileCardModal로 옮겨서, 여기서는 미니 아바타 줄만 보여주고
// 클릭하면 그 카드가 "확대"되어 뜬다.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useMembers } from '@/lib/useMembers'
import Avatar from '@/components/Avatar'
import ProfileCardModal from '@/components/ProfileCardModal'
import BelbinPanel from '@/components/BelbinPanel'
import JohariPanel from '@/components/JohariPanel'
import TeamHealthPanel from '@/components/TeamHealthPanel'
import TeamSummary from '@/components/TeamSummary'

type Principle = { id: string; content: string; sort_order: number; created_at: string }

export default function TeamPersona() {
  const { members, loaded: membersLoaded } = useMembers()
  const [principles, setPrinciples] = useState<Principle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [newPrinciple, setNewPrinciple] = useState('')
  const [busy, setBusy] = useState(false)
  const [openMemberId, setOpenMemberId] = useState<string | null>(null)

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
    const { data } = await supabase
      .from('team_principles')
      .insert({ content, sort_order: principles.length })
      .select().single()
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[17px] font-semibold text-[#1F2933]">팀</h1>
        <p className="text-[12.5px] text-[#7A8491] mt-0.5">각자 무엇을 보태고 무엇을 기대는지, 서로를 어떻게 보고 있는지.</p>
      </div>

      {/* ── 멤버 미니 프로필 줄 — 클릭하면 카드가 확대되어 뜬다 ──
          팀원이 늘어나도 깨지지 않도록: 한 줄로 밀어붙이지 않고 폭에 맞춰 다음 줄로 감싸고
          (flex-wrap), 그래도 너무 많아지면 카드가 무한정 늘어나지 않게 세로 스크롤로 막는다. */}
      <div className="bg-white rounded-xl border border-[#EEF0F2] p-5">
        <div className="flex flex-wrap gap-5 max-h-[240px] overflow-y-auto">
          {members.map(m => (
            <button
              key={m.id}
              onClick={() => setOpenMemberId(m.id)}
              className="flex flex-col items-center gap-1.5 w-16 flex-shrink-0 group"
            >
              <Avatar member={m} size={56} ring className="transition-transform group-hover:scale-105 group-hover:shadow-md" />
              <span className="text-[12px] text-[#3A4249] font-medium truncate w-full text-center">{m.name}</span>
            </button>
          ))}
        </div>
      </div>

      <TeamSummary />

      {/* ── 우리 팀의 약속 ── */}
      <div className="bg-white rounded-xl border border-[#EEF0F2] p-5">
        <p className="text-[13px] font-semibold text-[#1F2933] mb-1">우리 팀의 약속</p>
        <p className="text-[11.5px] text-[#B0B8C1] mb-3">개인 위에 있는 공통 기준입니다. 새로 온 사람이 가장 먼저 읽습니다.</p>

        {principles.length === 0 && (
          <p className="text-[12.5px] text-[#B0B8C1] mb-2">아직 약속이 없습니다. 첫 문장을 적어보세요.</p>
        )}
        <ul className="space-y-1.5 mb-3">
          {principles.map((p, i) => (
            <li key={p.id} className="flex items-start gap-2.5 text-[14px] text-[#3A4249]">
              <span className="text-[12px] font-semibold text-[#4C7FE0] mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
              <span className="flex-1 leading-relaxed">{p.content}</span>
              <button
                onClick={() => deletePrinciple(p)}
                title="삭제"
                className="text-[12px] text-[#C4CBD2] hover:text-red-500 hover:bg-red-50 rounded px-1.5 flex-shrink-0"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={e => { e.preventDefault(); addPrinciple() }} className="flex gap-1.5">
          <input
            value={newPrinciple}
            onChange={e => setNewPrinciple(e.target.value)}
            placeholder="예: 막히면 혼자 3일 이상 끌지 않는다"
            className="flex-1 text-[13px] border border-[#E5E8EB] rounded-md px-3 py-2 focus:outline-none focus:border-[#4C7FE0]"
          />
          <button type="submit" disabled={busy || !newPrinciple.trim()} className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-md px-4 py-2">추가</button>
        </form>
      </div>

      {/* ── 팀 역할 균형 (Belbin 약식) ── */}
      <BelbinPanel />

      {/* ── 조하리 창 (자기인식 vs 타인인식) ── */}
      <JohariPanel />

      {/* ── 팀 건강도 (Lencioni 5단계) ── */}
      <TeamHealthPanel />

      {openMemberId && <ProfileCardModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} />}
    </div>
  )
}
