'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAllMembers } from '@/lib/useMembers'
import { useCurrentMember } from '@/lib/useCurrentMember'
import ProfileCardModal from '@/components/ProfileCardModal'
import TeamSummary from '@/components/TeamSummary'
import TeamMemberCard from '@/components/TeamMemberCard'
import DevPlanSection from '@/components/team/DevPlanSection'

type Principle = { id: string; content: string; example?: string | null; sort_order: number; created_at: string }

// 약속 한 칸 — 번호·문장·사례. 누구나 ✎로 고칠 수 있다(team_principles는 팀원 전체 편집 테이블).
// 사례(example)는 add_team_principle_example.sql 적용 후 저장된다.
function PrincipleItem({ p, index, onSave, onDelete }: {
  p: Principle; index: number
  onSave: (p: Principle, fields: { content: string; example: string }) => Promise<string | null>
  onDelete: (p: Principle) => void
}) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(p.content)
  const [example, setExample] = useState(p.example ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  function begin() { setContent(p.content); setExample(p.example ?? ''); setError(null); setEditing(true) }
  async function save() {
    if (!content.trim()) { setError('약속 문장을 비울 수 없습니다.'); return }
    setSaving(true)
    const err = await onSave(p, { content: content.trim(), example: example.trim() })
    setSaving(false)
    if (err) setError(err)
    else setEditing(false)
  }
  // 두 층이 같은 틀: 왼쪽 머리(01 / 사례, 같은 글자 크기·같은 열 폭) + 오른쪽 본문(같은 글자 크기). 두 층 사이는 실선 한 줄로만 나눈다.
  const head = 'w-10 flex-shrink-0 text-[20px] leading-none font-bold tracking-[-0.02em] text-[#4C7FE0] mt-0.5'
  const bodyText = 'text-[15px] leading-relaxed text-[#1F2933]'
  const editBox = `w-full -mx-1 -my-0.5 px-1 py-0.5 ${bodyText} bg-transparent border-0 rounded-md resize-none focus:outline-none focus:bg-[#F5F8FE]`
  const cancel = () => { setEditing(false); setError(null) }
  return (
    <li className={`flex flex-col text-[#3A4249] group rounded-xl px-3.5 py-3.5 min-h-[120px] h-full ${editing ? 'bg-white ring-2 ring-[#C7D6F5]' : 'bg-white border border-[#E6E7E9]'}`}
      onKeyDown={editing ? e => { if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); cancel() } } : undefined}>
      <div className="flex items-start gap-3 pb-3">
        <span className={`${head} tabular-nums`}>{String(index + 1).padStart(2, '0')}</span>
        <div className="flex-1 min-w-0">
          {editing
            ? <textarea value={content} onChange={e => setContent(e.target.value)} rows={2} aria-label="약속" autoFocus className={`${editBox} font-medium`} />
            : <p className={`${bodyText} font-medium whitespace-pre-wrap break-words`}>{p.content}</p>}
        </div>
        {!editing && (
          <div className="flex flex-col gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button onClick={begin} title="고치기" aria-label="약속 고치기" className="text-[12px] text-[#9AA3AD] hover:text-[#4C7FE0] rounded px-1">✎</button>
            <button onClick={() => onDelete(p)} title="지우기" aria-label="약속 지우기" className="text-[12px] text-[#C4CBD2] hover:text-red-500 rounded px-1">✕</button>
          </div>
        )}
      </div>
      <div className="mt-auto flex items-start gap-3 pt-3 border-t border-[#DDE2E8]">
        <span className={head}>사례</span>
        <div className="flex-1 min-w-0">
          {editing
            ? <textarea value={example} onChange={e => setExample(e.target.value)} rows={4} aria-label="사례" placeholder="이 약속이 실제로 지켜진(또는 필요했던) 장면" className={editBox} />
            : p.example?.trim()
              ? <p className={`${bodyText} whitespace-pre-wrap break-words`}>{p.example}</p>
              : <button onClick={begin} className="text-[14px] text-[#9AA3AD] hover:text-[#4C7FE0] mt-0.5">＋ 사례 넣기</button>}
        </div>
      </div>
      {editing && (
        <div className="flex items-center justify-end gap-1.5 pt-2">
          {error && <p className="flex-1 text-[12px] text-red-500">{error}</p>}
          <button onClick={cancel} disabled={saving} className="text-[12px] text-[#7A8491] px-2.5 py-1 rounded-md hover:bg-[#F5F6F8]">취소 (Esc)</button>
          <button onClick={save} disabled={saving} className="text-[12px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-50 rounded-md px-3 py-1">{saving ? '저장 중…' : '저장'}</button>
        </div>
      )}
    </li>
  )
}

// 팀 탭 세부 화면 — 세부탭 바는 page.tsx 상단 공용 바(업무 허브와 같은 바)에 있다.
// "우리 팀 이해"(R0 진단 화면, TeamDynamicsSection)는 2026-10-30 사용자 요청으로 탭에서 뺐다 — 코드·데이터는 그대로 둠.
export type TeamView = 'members' | 'plan'
export const TEAM_VIEWS: { key: TeamView; label: string }[] = [
  { key: 'members', label: '팀원·프로필' }, { key: 'plan', label: '팀빌딩' },
]

// 팀원 카드 순서 — 팀장이 카드를 끌어 바꾼 순서(team_log_settings 'team_card_order', 팀 공용)가 우선, 없거나 빠진 사람은 이 기본 순서 뒤로
// 팀원·프로필 화면의 두 영역(팀원 / 우리 팀의 약속) — 큰 제목 줄 아래에 흰 카드를 페이지 바탕 위에 바로 놓는다(감싸는 회색 상자 없음, 맨 위 요약 카드와 같은 방식).
const panel = ''
const panelPadX = ''
// 영역 제목 3개(Welcome / 팀원 / 우리 팀의 약속)는 상단 세부탭 밑줄과 같은 파란색으로 포인트
const panelTitle = 'text-[20px] font-extrabold tracking-[-0.02em] text-[#4C7FE0]'

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

  // 약속 문장·사례 고치기 — 바뀐 칸만 보낸다. 실패하면 이유를 돌려준다(칸에 그대로 남아 다시 저장 가능).
  async function savePrinciple(p: Principle, fields: { content: string; example: string }) {
    const patch: Record<string, string> = {}
    if (fields.content !== p.content) patch.content = fields.content
    if (fields.example !== (p.example ?? '')) patch.example = fields.example
    if (!Object.keys(patch).length) return null
    const { data, error } = await createClient().from('team_principles').update(patch).eq('id', p.id).select().maybeSingle()
    if (error || !data) {
      return /example/.test(error?.message ?? '') ? '사례 칸이 아직 준비되지 않았습니다. add_team_principle_example.sql을 먼저 적용해 주세요.' : '저장하지 못했습니다. 다시 시도해 주세요.'
    }
    setPrinciples(prev => prev.map(x => (x.id === p.id ? (data as Principle) : x)))
    return null
  }

  async function deletePrinciple(p: Principle) {
    setPrinciples(prev => prev.filter(x => x.id !== p.id))
    const supabase = createClient()
    await supabase.from('team_principles').delete().eq('id', p.id)
  }

  if (!loaded || !membersLoaded) {
    return <p className="text-[14px] text-[#B0B8C1] px-1 py-6">불러오는 중...</p>
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
    // 팀원·프로필의 글자는 4단계(12 보조 / 14 본문 작게 / 15 본문 / 20 제목·번호)만 쓰고, Pretendard 자간을 살짝 좁힌다
    <div className={`${view === 'members' ? 'w-full space-y-9 tracking-[-0.01em]' : 'max-w-[1120px] space-y-6'} mx-auto`}>
      {view === 'plan' && <DevPlanSection />}

      {view === 'members' && (<>

      {/* 위에서부터: 요약 카드 4장(제목 줄 없이) → 팀원(카드 한 줄, 특성은 눌러서 프로필 창) → 우리 팀의 약속.
          팀원·약속은 큰 제목 줄을 상자 밖에 두고 내용만 상자에 담는다 */}
      <section>
        <h2 className={`${panelTitle} mb-2.5`}>Welcome 인사관리팀 <span aria-hidden>👋</span></h2>
        <TeamSummary />
      </section>

      {/* 팀원 카드는 한 줄을 사람 수만큼 나눠 넓게 쓴다 — 6명까지 한 줄(인원이 늘면 카드가 그만큼 좁아짐), 7명부터 다음 줄 */}
      <section>
      <div className={`flex items-center justify-between mb-2.5 ${panelPadX}`}>
        <h2 className={panelTitle}>팀원 <span className="text-[#7A8491] font-semibold">{orderedMembers.length}명</span></h2>
        <Link href="/fun/settings/members" className="text-[12px] font-medium text-[#4C7FE0] border border-[#C7D6F5] bg-white hover:bg-[#F0F4FC] rounded-lg px-3 py-1.5">＋ 팀원 추가</Link>
      </div>
      <div className={panel}>
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
              <span aria-hidden className="pointer-events-none absolute top-2 left-2 w-6 h-6 flex items-center justify-center rounded-md text-[14px] text-[#B0B8C1] opacity-0 group-hover:opacity-100 transition-opacity">⠿</span>
            )}
          </div>
        ))}
      </div>
      </div>
      {orderError && <p className={`text-[12px] text-red-500 mt-1.5 ${panelPadX}`}>{orderError}</p>}
      </section>

      <section className="flex flex-col">
        {/* 제목·입력을 한 줄에(입력칸은 팀장 화면에만) */}
        <div className={`flex items-end justify-between gap-3 flex-wrap mb-2.5 ${panelPadX}`}>
          <h2 className={panelTitle}>우리 팀의 약속</h2>
          {isLead && <form onSubmit={e => { e.preventDefault(); addPrinciple() }} className="flex gap-1.5 w-full sm:w-[420px]">
            <input value={newPrinciple} onChange={e => setNewPrinciple(e.target.value)}
              placeholder="예: 막히면 혼자 3일 이상 끌지 않는다"
              className="flex-1 min-w-0 text-[12px] bg-white border border-[#E5E8EB] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#4C7FE0]" />
            <button type="submit" disabled={busy || !newPrinciple.trim()}
              className="text-[12px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-md px-3 py-1.5 flex-shrink-0">추가</button>
          </form>}
        </div>
        <div className={`${panel} flex flex-col min-h-[420px]`}>
        {principles.length === 0 && <p className="text-[12px] text-[#9AA3AD]">{isLead ? '아직 약속이 없습니다. 첫 문장을 적어보세요.' : '아직 약속이 없습니다.'}</p>}
        {/* 칸 너비 기준 배치 — 한 칸이 220px보다 좁아지지 않게 들어가는 만큼만 한 줄에(넓은 화면 5칸, 창을 줄이면 4·3·2·1칸).
            auto-fit이라 남는 빈 칸을 접고 있는 칸들이 줄 전체 폭을 나눠 쓴다(auto-fill이면 오른쪽이 빈다) */}
        <ul className="flex-1 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] auto-rows-fr gap-2">
          {principles.map((p, i) => (
            <PrincipleItem key={p.id} p={p} index={i} onSave={savePrinciple} onDelete={deletePrinciple} />
          ))}
        </ul>
        </div>
      </section>
      </>)}

      {openMemberId && <ProfileCardModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} />}
    </div>
  )
}
