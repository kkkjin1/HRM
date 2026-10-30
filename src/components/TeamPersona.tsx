'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAllMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import ProfileCardModal from '@/components/ProfileCardModal'
import TeamMemberCard from '@/components/TeamMemberCard'
import TeamSummary from '@/components/TeamSummary'
import DevPlanSection from '@/components/team/DevPlanSection'

type Principle = { id: string; content: string; sort_order: number; created_at: string }

// 팀 탭 세부 화면 — 세부탭 바는 page.tsx 상단 공용 바(업무 허브와 같은 바)에 있다.
// "우리 팀 이해"(R0 진단 화면, TeamDynamicsSection)는 2026-10-30 사용자 요청으로 탭에서 뺐다 — 코드·데이터는 그대로 둠.
export type TeamView = 'members' | 'plan'
export const TEAM_VIEWS: { key: TeamView; label: string }[] = [
  { key: 'members', label: '팀원·프로필' }, { key: 'plan', label: '팀빌딩' },
]

// 팀원 카드 순서 — 팀장이 카드를 끌어 바꾼 순서(team_log_settings 'team_card_order', 팀 공용)가 우선, 없거나 빠진 사람은 이 기본 순서 뒤로
const PINNED_MEMBER_ORDER = ['김진일', '김다슬', '박주현', '강은정']

export default function TeamPersona({ view }: { view: TeamView }) {
  const { members, loaded: membersLoaded } = useAllMembers()
  const [principles, setPrinciples] = useState<Principle[]>([])
  const [loaded, setLoaded] = useState(false)
  const [newPrinciple, setNewPrinciple] = useState('')
  const [busy, setBusy] = useState(false)
  const [openMemberId, setOpenMemberId] = useState<string | null>(null)
  const { me } = useCurrentMember()
  const isLead = me?.role === 'lead'
  const [cardOrder, setCardOrder] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)
  // 카드 끌기(팀장만) — 브라우저 기본 drag&drop 대신 포인터를 직접 따라간다(버튼 카드 위에서도 확실히 동작).
  // 6px 넘게 움직여야 끌기로 보고, 그 전에 떼면 그냥 클릭(프로필 열기).
  const cardEls = useRef(new Map<string, HTMLDivElement>())
  const dropAtRef = useRef<{ id: string; after: boolean } | null>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const [{ data }, order] = await Promise.all([
        supabase.from('team_principles').select('*').order('sort_order'),
        fetch('/api/team-settings?key=team_card_order').then(r => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ value?: unknown } | null>,
      ])
      if (!active) return
      if (data) setPrinciples(data as Principle[])
      if (Array.isArray(order?.value)) setCardOrder(order.value.filter((id): id is string => typeof id === 'string'))
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

  const pinnedSorted = [...members].sort((a, b) => {
    const ai = PINNED_MEMBER_ORDER.indexOf(a.name)
    const bi = PINNED_MEMBER_ORDER.indexOf(b.name)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return 0
  })
  const orderedMembers = [
    ...cardOrder.map(id => pinnedSorted.find(m => m.id === id)).filter((m): m is (typeof members)[number] => !!m),
    ...pinnedSorted.filter(m => !cardOrder.includes(m.id)),
  ]

  // 끌어 놓기 — 놓은 카드의 왼쪽/오른쪽 절반에 따라 앞·뒤로 넣고, 팀 공용 순서로 저장(실패하면 되돌림)
  async function dropCard(moving: string, target: string, after: boolean) {
    if (moving === target) return
    const current = orderedMembers.map(m => m.id)
    const rest = current.filter(id => id !== moving)
    const at = rest.indexOf(target) + (after ? 1 : 0)
    const next = [...rest.slice(0, at), moving, ...rest.slice(at)]
    if (next.join() === current.join()) return
    const before = cardOrder
    setCardOrder(next)
    setOrderError(null)
    const res = await fetch('/api/team-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'team_card_order', value: next }) }).catch(() => null)
    if (!res?.ok) { setCardOrder(before); setOrderError('팀원 순서를 저장하지 못했습니다. 다시 시도해 주세요.') }
  }

  function startCardDrag(e: React.PointerEvent, id: string) {
    if (!isLead || e.button !== 0) return
    const sx = e.clientX, sy = e.clientY
    let moved = false
    const setTarget = (v: { id: string; after: boolean } | null) => { dropAtRef.current = v; setDropAt(v) }
    const onMove = (ev: PointerEvent) => {
      if (!moved) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
        moved = true
        setDragId(id)
        document.body.style.userSelect = 'none'
      }
      let hit: { id: string; after: boolean } | null = null
      for (const [cid, el] of cardEls.current) {
        const r = el.getBoundingClientRect()
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top - 12 && ev.clientY <= r.bottom + 12) {
          hit = { id: cid, after: ev.clientX > r.left + r.width / 2 }
          break
        }
      }
      if (hit?.id !== dropAtRef.current?.id || hit?.after !== dropAtRef.current?.after) setTarget(hit)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.body.style.userSelect = ''
      if (!moved) return
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 0)
      const target = dropAtRef.current
      setTarget(null)
      setDragId(null)
      if (target) void dropCard(id, target.id, target.after)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    // 팀원·프로필은 화면 폭을 다 쓴다(카드를 가로로 넓게). 팀빌딩은 읽기 좋은 폭(1120px) 유지
    <div className={`${view === 'members' ? 'w-full space-y-4' : 'max-w-[1120px] space-y-6'} mx-auto`}>
      {view === 'plan' && <DevPlanSection />}

      {view === 'members' && (<>

      {/* 위에서부터: 새로운 사람을 위한 요약(카드 4개) → 팀원 카드 한 줄(특성은 눌러서 프로필 창) → 우리 팀의 약속 */}
      <TeamSummary />

      {/* 팀원 카드는 한 줄을 사람 수만큼 나눠 넓게 쓴다 — 6명까지 한 줄(인원이 늘면 카드가 그만큼 좁아짐), 7명부터 다음 줄 */}
      <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-medium text-[#7A8491]">팀원 {orderedMembers.length}명{isLead ? <span className="font-normal text-[#B0B8C1]"> · 카드를 끌어 순서 변경</span> : null}</p>
        <Link href="/fun/settings/members" className="text-[12px] font-medium text-[#4C7FE0] border border-[#C7D6F5] bg-white hover:bg-[#F0F4FC] rounded-lg px-2.5 py-1">＋ 팀원 추가</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))] gap-2"
        style={{ '--cols': Math.min(Math.max(orderedMembers.length, 1), 6) } as React.CSSProperties}>
        {orderedMembers.map(m => (
          <div key={m.id}
            ref={el => { if (el) cardEls.current.set(m.id, el); else cardEls.current.delete(m.id) }}
            onPointerDown={e => startCardDrag(e, m.id)}
            onClickCapture={e => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation() } }}
            onDragStart={e => e.preventDefault()}
            title={isLead ? '눌러서 프로필 · 끌어서 순서 바꾸기' : undefined}
            className={`relative group ${isLead ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === m.id ? 'opacity-40' : ''}`}>
            {dropAt?.id === m.id && dragId && dragId !== m.id && (
              <span aria-hidden className={`absolute top-2 bottom-2 w-[3px] rounded-full bg-[#4C7FE0] z-10 ${dropAt.after ? "-right-[5.5px]" : "-left-[5.5px]"}`} />
            )}
            <TeamMemberCard member={m} onOpenProfile={() => setOpenMemberId(m.id)} />
            {isLead && (
              <span aria-hidden className="pointer-events-none absolute top-2 left-2 w-6 h-6 flex items-center justify-center rounded-md text-[13px] text-[#B0B8C1] opacity-0 group-hover:opacity-100 transition-opacity">⠿</span>
            )}
          </div>
        ))}
      </div>
      {orderError && <p className="text-[11.5px] text-red-500 mt-1.5">{orderError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-[#EEF0F2] p-5 flex flex-col">
        {/* 높이를 아끼려고 제목·입력을 한 줄에, 약속은 3열로 나눠 놓는다 — 머리줄도 같은 3열 격자라 입력칸 왼쪽이 아래 3번째 열 상자와 맞는다 */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-end mb-3">
          <div className="xl:col-span-2">
            <p className="text-[13px] font-semibold text-[#1F2933]">우리 팀의 약속</p>
            <p className="text-[11.5px] text-[#B0B8C1] mt-0.5">개인 위에 있는 공통 기준입니다. 새로 온 사람이 가장 먼저 읽습니다.</p>
          </div>
          <form onSubmit={e => { e.preventDefault(); addPrinciple() }} className="flex gap-1.5 w-full">
            <input value={newPrinciple} onChange={e => setNewPrinciple(e.target.value)}
              placeholder="예: 막히면 혼자 3일 이상 끌지 않는다"
              className="flex-1 min-w-0 text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]" />
            <button type="submit" disabled={busy || !newPrinciple.trim()}
              className="text-[12.5px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-md px-3 py-1.5 flex-shrink-0">추가</button>
          </form>
        </div>
        {principles.length === 0 && <p className="text-[12.5px] text-[#B0B8C1]">아직 약속이 없습니다. 첫 문장을 적어보세요.</p>}
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {principles.map((p, i) => (
            <li key={p.id} className="flex items-start gap-2.5 text-[13px] text-[#3A4249] group bg-[#FAFBFC] rounded-lg px-2.5 py-2">
              <span className="text-[11px] font-semibold text-[#4C7FE0] mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
              <span className="flex-1 leading-relaxed">{p.content}</span>
              <button onClick={() => deletePrinciple(p)} className="text-[11px] text-[#C4CBD2] hover:text-red-500 rounded px-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
            </li>
          ))}
        </ul>
      </div>
      </>)}

      {openMemberId && <ProfileCardModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} />}
    </div>
  )
}
