'use client'

// "우리 팀 이해" ①~④의 r0-v3 근거 블록 — 발견 카드(Findings) 아래에 "무엇을 근거로 했는지"를 원 응답 분포 그대로 보여 준다.
// 평균은 보조 수치로만 작게 두고, 개인별 응답·분포·'관찰 기회 없음'을 함께 보여 줘서 차이와 소수 응답이 가려지지 않게 한다.

import { useState } from 'react'
import type { Evidence, Held, Insights } from '@/lib/team/insights'
import { NEED_BEHAVIOR, SAFETY_CAVEAT, frictionStats, itemStats } from '@/lib/team/insightsV3'
import { BEHAVIOR_ITEMS, DOMAINS, FRICTION_V3_SCALE, scoreOf, type R0V3Answers } from '@/lib/team/r0v3'
import { SignalChips, revealFinding } from '@/components/team/Findings'
import { CORE_MAX, PART_LABEL, type CoreSummary } from '@/lib/team/coreThemesV3'
import type { Finding } from '@/lib/team/insights'

type Resp = { member_id: string; answers: R0V3Answers }

function EvidenceList({ items }: { items: Evidence[] }) {
  if (!items.length) return null
  return <ul className="space-y-0.5">{items.map((e, i) => <li key={e.ref + i} className="text-[12px] text-[#3A4249] leading-relaxed" title={`근거 항목: ${e.ref}`}>· {e.text}</li>)}</ul>
}
const cellCls = (v: number | null) =>
  v === null ? 'bg-[#F7F8F8] text-[#B0B8C1]' : v <= 2 ? 'bg-[#FDECEC] text-[#B42318]' : v === 3 ? 'bg-[#F0F2F5] text-[#5B6472]' : v === 4 ? 'bg-[#E3EEFF] text-[#2F5FB8]' : 'bg-[#C9DCFB] text-[#1E4C9A]'

// ③ B 실제 협업 행동 — 문항 × 사람 응답표(실명, 마감 후 공개). 색은 낮음(2점 이하)·보통(3)·높음(4·5)·관찰 기회 없음.
export function BehaviorMatrix({ responses, nameOf }: { responses: Resp[]; nameOf: (id: string) => string }) {
  const stats = itemStats(responses)
  return (
    <div>
      <p className="text-[12px] font-semibold text-[#1F2933] mb-1">실제 협업 행동 응답 <span className="font-normal text-[#B0B8C1]">· 최근 4주 · 1~5 · ‘–’ = 관찰 기회 없음(평균·인원에서 제외)</span></p>
      <div className="flex flex-wrap gap-2 text-[10.5px] text-[#7A8491] mb-2">
        <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded bg-[#FDECEC] inline-block" />2점 이하</span>
        <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded bg-[#F0F2F5] inline-block" />3 상황에 따라</span>
        <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded bg-[#E3EEFF] inline-block" />4·5</span>
      </div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[520px] text-[11.5px] border-separate border-spacing-y-0.5">
          <thead>
            <tr className="text-[#7A8491]">
              <th className="text-left font-medium pb-1">문항</th>
              {responses.map(r => <th key={r.member_id} className="font-medium pb-1 px-0.5 w-[48px] max-w-[48px] truncate" title={nameOf(r.member_id)}>{nameOf(r.member_id)}</th>)}
              <th className="font-medium pb-1 w-[58px] text-right">유효 · 평균</th>
            </tr>
          </thead>
          <tbody>
            {DOMAINS.map(d => (
              <FragmentRows key={d.key} label={`${d.code} ${d.label}`} cols={responses.length + 2}>
                {stats.filter(s => s.domain === d.key).map(s => (
                  <tr key={s.key}>
                    <td className="pr-2 text-[#3A4249] leading-snug" title={s.text}><span className="text-[#9AA3AD] mr-1">{s.key}</span>{s.text}</td>
                    {responses.map(r => {
                      const v = scoreOf(r.answers, s.key)
                      return <td key={r.member_id} className="px-0.5"><span className={`block text-center rounded-md py-1 font-semibold ${cellCls(v)}`}>{v ?? '–'}</span></td>
                    })}
                    <td className="text-right text-[#7A8491] whitespace-nowrap">{s.valid}명 · {s.mean === null ? '-' : s.mean.toFixed(1)}</td>
                  </tr>
                ))}
              </FragmentRows>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#9AA3AD] mt-1.5 leading-relaxed">5명 안팎의 응답이라 평균은 참고용입니다. 낮은 문항이 있다고 사람이나 팀을 문제로 분류하지 않습니다. {SAFETY_CAVEAT}</p>
    </div>
  )
}
function FragmentRows({ label, cols, children }: { label: string; cols: number; children: React.ReactNode }) {
  return (
    <>
      <tr><td colSpan={cols} className="pt-2 text-[11px] font-semibold text-[#4C7FE0]">{label}</td></tr>
      {children}
    </>
  )
}

// ③ C 실제 마찰 — 문항별 횟수 분포 + 기회 없음 + 장면 서술이 연결된 수
export function FrictionTable({ responses, nameOf }: { responses: Resp[]; nameOf: (id: string) => string }) {
  const stats = frictionStats(responses)
  return (
    <div>
      <p className="text-[12px] font-semibold text-[#1F2933] mb-2">실제 마찰 경험 <span className="font-normal text-[#B0B8C1]">· 최근 4주 횟수 · ‘기회 없음’은 ‘경험 없음’과 따로 셈</span></p>
      <ul className="space-y-2">
        {stats.map(f => (
          <li key={f.key} className="text-[12px] text-[#3A4249] bg-[#FAFBFC] rounded-lg px-3 py-2">
            <p className="font-medium"><span className="text-[#9AA3AD] mr-1">{f.key}</span>{f.short}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11.5px]">
              {FRICTION_V3_SCALE.map(s => {
                const ids = responses.filter(r => r.answers.friction[f.key] === s.value).map(r => r.member_id)
                return <span key={s.value} className={s.value >= 2 && ids.length ? 'text-[#B42318]' : s.value === 1 && ids.length ? 'text-[#B45309]' : 'text-[#7A8491]'} title={ids.map(nameOf).join(', ')}>{s.label} <b>{ids.length}</b></span>
              })}
              <span className="text-[#9AA3AD]" title={f.na.map(nameOf).join(', ')}>기회 없음 <b>{f.na.length}</b></span>
              {f.cases.length > 0 && <span className="text-[#3A5BC7]">장면 서술 {f.cases.length}건</span>}
            </div>
            {f.exp.length > 0 && <p className="text-[11px] text-[#7A8491] mt-0.5">겪은 사람: {f.exp.map(id => `${nameOf(id)}(${FRICTION_V3_SCALE.find(s => s.value === responses.find(r => r.member_id === id)!.answers.friction[f.key])?.label})`).join(', ')}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ① D01 성공 사례 — 상황과 행동을 나눠 그대로
export function SuccessCases({ responses, nameOf }: { responses: Resp[]; nameOf: (id: string) => string }) {
  const cases = responses.filter(r => !r.answers.success.none && r.answers.success.situation)
  const none = responses.filter(r => r.answers.success.none)
  return (
    <div className="mt-4">
      <p className="text-[12px] font-semibold text-[#1F2933] mb-2">팀원이 직접 꼽은 잘됐던 장면 <span className="font-normal text-[#B0B8C1]">· D01 · {cases.length}건{none.length ? ` · 떠오르는 사례 없음 ${none.length}명` : ''}</span></p>
      {cases.length === 0 ? <p className="text-[12.5px] text-[#B0B8C1]">이번 응답에는 성공 사례가 없습니다.</p> : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {cases.map(r => (
            <li key={r.member_id} className="text-[12px] text-[#3A4249] bg-[#F4FBF7] border border-[#D5EFE2] rounded-lg px-3 py-2 leading-relaxed">
              <p><span className="text-[#5B7A6B] font-medium">상황</span> {r.answers.success.situation}</p>
              {r.answers.success.behaviors && <p><span className="text-[#5B7A6B] font-medium">기여한 행동</span> {r.answers.success.behaviors}</p>}
              <p className="text-[11px] text-[#7A8491] mt-0.5">{nameOf(r.member_id)}{r.answers.success.domains.length ? ` · ${r.answers.success.domains.map(d => DOMAINS.find(x => x.key === d)?.short).join('·')}` : ' · 영역 지정 안 함'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ② 기대한 도움 ↔ 실제 지원 경험(B) — 가능성(gives↔needs)과 실제 경험을 나란히. 연결표는 insightsV3.NEED_BEHAVIOR.
export function NeedExperience({ responses, nameOf }: { responses: Resp[]; nameOf: (id: string) => string }) {
  const rows = Object.entries(NEED_BEHAVIOR).map(([need, link]) => ({
    need, link, askers: responses.filter(r => r.answers.ws.needs_tags.includes(need)),
  })).filter(x => x.askers.length)
  if (!rows.length) return null
  return (
    <div className="mt-4">
      <p className="text-[12px] font-semibold text-[#1F2933] mb-2">기대한 도움을 실제로 경험했나 <span className="font-normal text-[#B0B8C1]">· 기대한 사람의 관련 협업 행동 응답(B)</span></p>
      <ul className="space-y-1.5">
        {rows.map(({ need, link, askers }) => (
          <li key={need} className="text-[12px] text-[#3A4249] bg-[#FAFBFC] rounded-lg px-3 py-2">
            <b className="font-semibold">‘{need}’</b> <span className="text-[#7A8491]">↔ {link.items.join('·')}</span>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11.5px]">
              {askers.map(r => (
                <span key={r.member_id}>{nameOf(r.member_id)} {link.items.map(k => {
                  const v = scoreOf(r.answers, k)
                  return <b key={k} className={`font-semibold ${v !== null && v <= 2 ? 'text-[#B42318]' : v !== null && v >= 4 ? 'text-[#2F5FB8]' : 'text-[#5B6472]'}`} title={`${k} ${BEHAVIOR_ITEMS.find(i => i.key === k)?.text}`}>{v ?? '–'} </b>
                })}</span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <details className="mt-2">
        <summary className="text-[11.5px] text-[#7A8491] cursor-pointer hover:text-[#4C7FE0]">연결 기준 보기</summary>
        <p className="text-[11.5px] text-[#7A8491] mt-1 leading-relaxed">
          {Object.entries(NEED_BEHAVIOR).map(([n, l]) => `${n} ↔ ${l.items.join('·')}${l.friction ? `(+마찰 ${l.friction})` : ''}`).join(' / ')}. ‘자율성’은 팀 운영 방식의 문제라 잇지 않습니다.
          보탤 수 있다고 답한 사람이 있다는 것(가능성)과 실제로 도움을 경험했다는 것(B 응답)은 다릅니다.
        </p>
      </details>
    </div>
  )
}

// ④ 유지·강화할 행동 후보 / 함께 살펴볼 개선 후보 — 개선 쪽은 인원과 관계없이 모두 남기고, 순서는 문항 순서(우선순위 아님)
export function PlanBoardV3({ insights, nameOf }: { insights: Insights; nameOf: (id: string) => string }) {
  const plan = insights.planV3
  if (!plan) return null
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
      <div className="rounded-xl border border-[#BBE5D0] bg-[#F4FBF7] px-4 py-3">
        <p className="text-[13px] font-semibold text-[#047857]">A. 유지·강화할 행동 후보</p>
        <p className="text-[11px] text-[#5B7A6B] mb-2">D02 응답 기준 · 같은 영역의 성공 사례(D01)와 행동 평가(B)를 함께 붙였습니다</p>
        {plan.keep.length === 0 ? <p className="text-[12px] text-[#7A8491]">응답이 없습니다.</p> : (
          <ul className="space-y-2">
            {plan.keep.map(k => (
              <li key={k.key} className="text-[12.5px] text-[#1F2933]">
                <b className="font-semibold">{k.label}</b> <span className="text-[#5B7A6B]">{k.memberIds.length}명 · {k.memberIds.map(nameOf).join(', ')}</span>
                {k.domainLine && <p className="text-[11px] text-[#5B7A6B]">{k.domainLine}</p>}
                {k.success.length > 0 && <p className="text-[11px] text-[#047857]">같은 영역 성공 사례 {k.success.length}건(① 성공 장면 참고)</p>}
                {k.alsoImprove && <p className="text-[11px] text-[#5B7A6B]">같은 영역에 개선 희망도 있음(충돌이 아니라 함께 볼 지점)</p>}
                {k.others.length > 0 && <EvidenceList items={k.others} />}
              </li>
            ))}
          </ul>
        )}
        {plan.keepNotes.length > 0 && <div className="mt-2"><EvidenceList items={plan.keepNotes} /></div>}
      </div>
      <div className="rounded-xl border border-[#F2D7B6] bg-[#FFFAF2] px-4 py-3">
        <p className="text-[13px] font-semibold text-[#B45309]">B. 함께 살펴볼 개선 후보 <span className="font-normal text-[11px]">· 팀 검토 전</span></p>
        <p className="text-[11px] text-[#8A6A45] mb-2">D03 응답은 1명이어도 모두 남깁니다. 응답 수·근거 유형은 우선순위가 아니며, U3에서 팀이 검토·선택하기 전까지 공식 약속이나 확정 과제가 아닙니다.</p>
        {plan.improve.length === 0 ? <p className="text-[12px] text-[#7A8491]">개선 희망 응답이 없습니다{plan.noneIds.length ? ` (‘특별히 없음’ ${plan.noneIds.length}명)` : ''}.</p> : (
          <ul className="space-y-2.5">
            {plan.improve.map(c => (
              <li key={c.key} className="text-[12.5px] text-[#1F2933]">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <b className="font-semibold">{c.label}</b> <span className="text-[#8A6A45]">{c.memberIds.length}명 · {c.memberIds.map(nameOf).join(', ')}</span>
                  {c.signals.length ? <SignalChips items={c.signals} /> : <span className="text-[10.5px] rounded-full px-1.5 py-0.5 bg-[#F0F2F5] text-[#7A8491]">다른 근거 없음 · 장면 확인</span>}
                </div>
                {c.entries.length > 0 && <div className="mt-0.5"><EvidenceList items={c.entries} /></div>}
                {c.support.map(g => <p key={g.ref + g.text} className="text-[11px] text-[#8A6A45]" title={`근거 항목: ${g.ref}`}>함께 볼 근거: {g.text}</p>)}
                {c.contrary.map(g => <p key={g.ref + g.text} className="text-[11px] text-[#3A5BC7]" title={`근거 항목: ${g.ref}`}>다른 경험: {g.text}</p>)}
              </li>
            ))}
          </ul>
        )}
        {plan.improve.length > 0 && plan.noneIds.length > 0 && <p className="text-[11px] text-[#8A6A45] mt-2">‘특별히 없음’: {plan.noneIds.map(nameOf).join(', ')}</p>}
      </div>
    </div>
  )
}

function HeldRow({ h }: { h: Held }) {
  return <li className="text-[11.5px] text-[#5B6472]" title={`근거 항목: ${h.ref}`}>· <b className="font-medium">{h.topic}</b> — {h.reason}</li>
}

// 해석을 보류한 지점(held)과 해석했지만 알아 둘 한계(caution) — 근거가 부족한 곳에 억지 해석을 만들지 않았다는 기록
export function HeldList({ items }: { items: Held[] }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  const held = items.filter(h => h.level === 'held')
  const caution = items.filter(h => h.level === 'caution')
  return (
    <div className="mt-4 rounded-xl border border-dashed border-[#D0D7E2] px-4 py-3">
      <button onClick={() => setOpen(v => !v)} className="text-[12px] font-semibold text-[#5B6472]">C. 해석 보류 {held.length}건 · 함께 알아 둘 한계 {caution.length}건 {open ? '▴' : '▾'}</button>
      {open && (
        <div className="mt-1.5 space-y-2">
          <div>
            <p className="text-[11px] font-semibold text-[#7A8491]">해석 보류 — 근거가 부족해 팀 단위 해석을 하지 않음(원본 응답은 응답표에 보존)</p>
            {held.length ? <ul className="space-y-0.5">{held.map(h => <HeldRow key={h.ref + h.topic} h={h} />)}</ul> : <p className="text-[11.5px] text-[#B0B8C1]">없음</p>}
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[#7A8491]">함께 알아 둘 한계 — 해석은 했지만 관찰 기회·기간이 제한적</p>
            {caution.length ? <ul className="space-y-0.5">{caution.map(h => <HeldRow key={h.ref + h.topic} h={h} />)}</ul> : <p className="text-[11.5px] text-[#B0B8C1]">없음</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// 결과 화면 맨 위 — 핵심 역학 요약. 발견을 영역 단위 주제로 묶은 것이며, 각 줄은 ①~④의 원본 발견 카드로 이동한다.
const KIND_CHIP = {
  strength: { label: '공통 강점', cls: 'bg-[#E8F3EE] text-[#047857]' },
  strength_tension: { label: '강점 · 다른 경험 공존', cls: 'bg-[#EEF1FE] text-[#3A5BC7]' },
  tension: { label: '긴장 · 실제 마찰', cls: 'bg-[#FFF7ED] text-[#B45309]' },
} as const
const SECTION_OF = (findings: Finding[], id: string) => findings.find(f => f.id === id)?.section
export function CoreSummaryCard({ summary, findings, total }: { summary: CoreSummary; findings: Finding[]; total: number }) {
  return (
    <section className="rounded-2xl border border-[#D9E3F7] bg-white p-5">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[15px] font-semibold text-[#1F2933]">우리 팀의 핵심 역학</p>
        <span className="text-[11px] text-[#7A8491] bg-[#F0F2F5] rounded-full px-2 py-0.5">발견 {total}개를 영역별 {summary.themes.length}개 주제로 묶음</span>
      </div>
      <p className="text-[12px] text-[#7A8491] mt-1 leading-relaxed">
        서로 다른 응답(선호·협업 행동·실제 마찰·성공/유지/개선)이 2가지 이상 겹치거나, 숫자는 작아도 구체적인 소수 경험이 있는 영역만 골랐습니다(최대 {CORE_MAX}개, 근거가 부족하면 더 적게).
        순서는 근거의 다양성이며 중요도·우선순위가 아닙니다. 각 줄을 누르면 아래 ①~④의 원래 발견과 근거로 이동합니다.
      </p>
      {summary.themes.length === 0 ? (
        <p className="text-[12.5px] text-[#7A8491] bg-[#FAFBFC] rounded-lg px-4 py-3 mt-3">여러 근거가 함께 가리키는 주제는 이번 응답에서 찾지 못했습니다. 아래 ①~④에서 개별 발견을 확인해 주세요.</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {summary.themes.map((t, i) => (
            <li key={t.id} className="rounded-xl border border-[#E6EAF2] px-4 py-3">
              <div className="flex items-start gap-2 flex-wrap">
                <span className="w-5 h-5 rounded-full bg-[#1F2933] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-[13.5px] font-semibold text-[#1F2933] flex-1 min-w-[220px]">{t.title}</p>
                <span className="flex items-center gap-1 flex-wrap">
                  <span className={`text-[10.5px] font-medium rounded-full px-1.5 py-0.5 ${KIND_CHIP[t.kind].cls}`}>{KIND_CHIP[t.kind].label}</span>
                  <SignalChips items={t.signals} />
                </span>
              </div>
              <ul className="mt-1.5 space-y-0.5 sm:pl-7">
                {t.lines.map(l => (
                  <li key={l.label} className="text-[12px] text-[#3A4249] leading-relaxed">
                    <button onClick={() => revealFinding(l.findingId)} className="text-left hover:text-[#2F5FB8] hover:underline underline-offset-2" title="원본 발견으로 이동">
                      <span className={`font-semibold mr-1 ${l.label === '소수 경험' ? 'text-[#B45309]' : l.label === '강점' ? 'text-[#047857]' : 'text-[#5B6472]'}`}>{l.label}</span>{l.text}
                      <span className="text-[10.5px] text-[#9AA3AD] ml-1">→ {SECTION_OF(findings, l.findingId)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-[12px] text-[#1F2933] mt-1.5 sm:pl-7">확인할 질문 “{t.question}”</p>
              <details className="mt-1 sm:pl-7">
                <summary className="text-[11px] text-[#7A8491] cursor-pointer hover:text-[#4C7FE0]">근거 파트 {t.parts.map(p => PART_LABEL[p]).join('·')} · 관련 발견 {t.findingIds.length}개</summary>
                <div className="flex flex-wrap gap-1 mt-1">
                  {t.findingIds.map(id => {
                    const f = findings.find(x => x.id === id)
                    return f ? <button key={id} onClick={() => revealFinding(id)} className="text-[11px] text-[#3A5BC7] bg-[#EEF1FE] rounded px-1.5 py-0.5 hover:bg-[#DDE5FD] text-left">{f.section}. {f.title.length > 34 ? f.title.slice(0, 34) + '…' : f.title}</button> : null
                  })}
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
      {summary.omitted.length > 0 && (
        <p className="text-[11.5px] text-[#7A8491] mt-2">요약에 넣지 않은 영역: {summary.omitted.map(o => `${o.label}(발견 ${o.findings}개 — ${o.reason})`).join(' · ')}. 아래 상세에는 그대로 있습니다.</p>
      )}
    </section>
  )
}

