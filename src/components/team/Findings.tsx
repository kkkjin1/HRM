'use client'

// "우리 팀 이해"의 해석 레이어 — 교차 분석 발견(insights.ts)을 사실/해석/다른 경험/질문으로 나눠 보여 준다.
// 수치·순위는 이 카드들의 근거로 아래에 따로 남는다(TeamUnderstanding).

import { useEffect, useState } from 'react'

// 핵심 역학 요약(CoreSummaryCard)에서 원본 발견 카드로 이동 — 접혀 있으면 펼친 뒤 그 카드로 스크롤하고 잠깐 강조한다.
export const REVEAL_EVENT = 'hrm:reveal-finding'
export const findingAnchor = (id: string) => `finding-${id.replace(/[^A-Za-z0-9_-]/g, c => `_${c.charCodeAt(0).toString(16)}`)}`
export function revealFinding(id: string) {
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: id }))
  window.setTimeout(() => {
    const el = document.getElementById(findingAnchor(id))
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-[#4C7FE0]')
    window.setTimeout(() => el.classList.remove('ring-2', 'ring-[#4C7FE0]'), 1800)
  }, 60)
}
import { BASIS_LABEL, SIGNAL_DESC, SIGNAL_LABEL, type Evidence, type Finding, type Insights, type NoteGroup, type SignalType } from '@/lib/team/insights'

const BASIS_CLS = {
  majority: 'bg-[#EEF1FE] text-[#3A5BC7]',
  some: 'bg-[#F0F2F5] text-[#5B6472]',
  single: 'bg-[#FFF7ED] text-[#B45309]',
} as const

// 근거 유형 칩 — 중요도·순위가 아니라 "어떤 종류의 근거인지"만 표시한다.
const SIGNAL_CLS: Record<SignalType, string> = {
  common: 'bg-[#E8F3EE] text-[#047857]',
  minority: 'bg-[#FFF7ED] text-[#B45309]',
  mismatch: 'bg-[#FDF2F2] text-[#B42318]',
  composite: 'bg-[#EEF1FE] text-[#3A5BC7]',
}
export function SignalChips({ items }: { items: SignalType[] }) {
  return <>{items.map(s => <span key={s} title={SIGNAL_DESC[s]} className={`text-[10.5px] font-medium rounded-full px-1.5 py-0.5 ${SIGNAL_CLS[s]}`}>{SIGNAL_LABEL[s]}</span>)}</>
}

function EvidenceList({ items, empty }: { items: Evidence[]; empty?: string }) {
  if (!items.length) return empty ? <p className="text-[12px] text-[#B0B8C1]">{empty}</p> : null
  return (
    <ul className="space-y-0.5">
      {items.map((e, i) => <li key={e.ref + i} className="text-[12px] text-[#3A4249] leading-relaxed" title={`근거 항목: ${e.ref}`}>· {e.text}</li>)}
    </ul>
  )
}

function FindingCard({ f }: { f: Finding }) {
  return (
    <li id={findingAnchor(f.id)} className="border border-[#E6EAF2] rounded-xl px-4 py-3 bg-white scroll-mt-20 transition-shadow">
      <div className="flex items-start gap-2 flex-wrap">
        <p className="text-[13px] font-semibold text-[#1F2933] flex-1 min-w-[200px]">{f.title}</p>
        <span className="flex items-center gap-1 flex-wrap flex-shrink-0">
          <SignalChips items={f.signals} />
          <span className={`text-[10.5px] font-medium rounded-full px-2 py-0.5 ${BASIS_CLS[f.basis]}`}>{BASIS_LABEL[f.basis]}</span>
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-2 mt-2">
        <div>
          <p className="text-[11px] font-semibold text-[#7A8491] mb-0.5">관찰된 사실</p>
          <EvidenceList items={f.observed} />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#7A8491] mb-0.5">반대되거나 다른 경험</p>
          <EvidenceList items={f.counter} empty="다른 응답은 없었습니다" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#7A8491] mb-0.5">가능한 해석 <span className="font-normal text-[#B0B8C1]">(가설)</span></p>
          <p className="text-[12px] text-[#3A4249] leading-relaxed">{f.interpretation ?? '응답만으로는 해석할 근거가 부족해 해석을 덧붙이지 않았습니다.'}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#7A8491] mb-0.5">함께 확인할 질문</p>
          <p className="text-[12px] text-[#1F2933] leading-relaxed">“{f.question}”</p>
        </div>
      </div>
    </li>
  )
}

export function Findings({ items, limit = 3, empty }: { items: Finding[]; limit?: number; empty?: string }) {
  const [all, setAll] = useState(false)
  useEffect(() => {
    function onReveal(e: Event) {
      const id = (e as CustomEvent<string>).detail
      const idx = items.findIndex(f => f.id === id)
      if (idx >= limit) setAll(true)
    }
    window.addEventListener(REVEAL_EVENT, onReveal)
    return () => window.removeEventListener(REVEAL_EVENT, onReveal)
  }, [items, limit])
  if (!items.length) return empty ? <p className="text-[12.5px] text-[#7A8491] bg-[#FAFBFC] rounded-lg px-4 py-3 mb-4">{empty}</p> : null
  const shown = all ? items : items.slice(0, limit)
  return (
    <div className="mb-5">
      <p className="text-[12px] font-semibold text-[#1F2933] mb-2">주요 발견 <span className="font-normal text-[#B0B8C1]">· 여러 응답을 교차해 찾은 것(판정이 아니라 대화의 출발점)</span></p>
      <ul className="space-y-2">{shown.map(f => <FindingCard key={f.id} f={f} />)}</ul>
      {items.length > limit && (
        <button onClick={() => setAll(v => !v)} className="text-[12px] text-[#4C7FE0] mt-2">{all ? '접기' : `발견 ${items.length - limit}개 더 보기`}</button>
      )}
    </div>
  )
}

export function Notes({ groups }: { groups: NoteGroup[] }) {
  if (!groups.length) return null
  return (
    <div className="mt-4">
      <p className="text-[12px] font-semibold text-[#1F2933] mb-2">응답 원문 <span className="font-normal text-[#B0B8C1]">· 자유서술(실명, 마감 후 공개)</span></p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {groups.map(g => (
          <div key={g.field} className="bg-[#FAFBFC] rounded-lg px-3 py-2">
            <p className="text-[11px] font-semibold text-[#7A8491] mb-1">{g.title}</p>
            <EvidenceList items={g.items} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ④ 유지할 것 / 바꿀 것 — 같은 행동 목록을 두 칸으로 나눈다. 개선 쪽은 모두 "팀 검토 후보"이고 근거 유형만 붙인다(순위 없음, 문항 순서).
export function PlanBoard({ insights, nameOf, keepFromStrengths }: { insights: Insights; nameOf: (id: string) => string; keepFromStrengths: boolean }) {
  const { keep, change } = insights.plan
  const keepNotes = insights.notes.find(n => n.field === 'keep_note')
  const changeNotes = insights.notes.find(n => n.field === 'change_note')
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
      <div className="rounded-xl border border-[#BBE5D0] bg-[#F4FBF7] px-4 py-3">
        <p className="text-[13px] font-semibold text-[#047857]">유지·강화할 것</p>
        <p className="text-[11px] text-[#5B7A6B] mb-2">{keepFromStrengths ? '‘지금 잘하는 것’ 응답 기준(이 회차엔 유지 행동 문항이 없음)' : '‘꼭 지켜야 할 행동’ 응답 기준'}</p>
        {keep.length === 0 ? <p className="text-[12px] text-[#7A8491]">응답이 없습니다.</p> : (
          <ul className="space-y-1.5">
            {keep.map(k => (
              <li key={k.key} className="text-[12.5px] text-[#1F2933]">
                <b className="font-semibold">{k.label}</b> <span className="text-[#5B7A6B]">{k.memberIds.length}명 · {k.memberIds.map(nameOf).join(', ')}</span>
                {k.layer && <p className="text-[11px] text-[#5B7A6B]">관련 기능 ‘{k.layer}’ {k.layerScore === null ? '-' : k.layerScore.toFixed(1)}점</p>}
                {k.alsoChange.length > 0 && <p className="text-[11px] text-[#5B7A6B]">같은 영역에 개선 희망도 있음(충돌이 아니라 함께 볼 지점) — 아래 발견 참고</p>}
              </li>
            ))}
          </ul>
        )}
        {keepNotes && <div className="mt-2"><EvidenceList items={keepNotes.items} /></div>}
      </div>
      <div className="rounded-xl border border-[#F2D7B6] bg-[#FFFAF2] px-4 py-3">
        <p className="text-[13px] font-semibold text-[#B45309]">개선해 볼 것 <span className="font-normal text-[11px]">· 팀 검토 후보</span></p>
        <p className="text-[11px] text-[#8A6A45] mb-2">‘함께 바꾸고 싶은 것’ 응답마다 함께 있는 근거의 유형을 붙였습니다. 응답 수나 근거 유형은 우선순위가 아니며, 실제 개선 주제는 다음 단계에서 팀이 함께 정합니다.</p>
        {change.length === 0 ? <p className="text-[12px] text-[#7A8491]">응답이 없습니다.</p> : (
          <ul className="space-y-1.5">
            {change.map(c => (
              <li key={c.key} className="text-[12.5px] text-[#1F2933]">
                <b className="font-semibold">{c.label}</b> <span className="text-[#8A6A45]">{c.memberIds.length}명 · {c.memberIds.map(nameOf).join(', ')}</span>
                <span className="ml-1.5 inline-flex gap-1 flex-wrap align-middle">
                  {c.signals.length ? <SignalChips items={c.signals} /> : <span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-[#F0F2F5] text-[#7A8491]">근거 유형 없음 · 장면 확인</span>}
                </span>
                {c.evidence.map(g => <p key={g.ref + g.text} className="text-[11px] text-[#8A6A45]" title={`근거 항목: ${g.ref}`}>근거: {g.text}</p>)}
              </li>
            ))}
          </ul>
        )}
        {changeNotes && <div className="mt-2"><EvidenceList items={changeNotes.items} /></div>}
      </div>
    </div>
  )
}

export function Questions({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div className="mt-4 rounded-xl bg-[#F5F8FE] border border-[#D9E3F7] px-4 py-3">
      <p className="text-[12px] font-semibold text-[#1F2933] mb-1.5">팀 토론 질문</p>
      <ol className="list-decimal pl-5 space-y-1 text-[12.5px] text-[#3A4249]">{items.map(q => <li key={q}>{q}</li>)}</ol>
    </div>
  )
}
