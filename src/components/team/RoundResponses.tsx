'use client'

// 마감된 진단의 개인별 응답(실명). 서버는 마감 전엔 이 목록을 내려 주지 않는다(lib/team/rounds.ts toDetail).
// 회차의 문항 버전으로 그린다 — r0-v3는 PART A~D, 구버전은 강점·건강도·불편 경험.

import { useEffect } from 'react'
import { traitLabel } from '@/lib/johari'
import { layerScores } from '@/lib/teamHealth'
import { profileChips } from '@/lib/team/composition'
import { CHANGE_OPTIONS, FRICTION_ITEMS, FRICTION_SCALE, KEEP_OPTIONS, STRENGTH_OPTIONS, isV3, type R0Answers } from '@/lib/team/r0'
import {
  BEHAVIOR_ITEMS, DOMAINS, FRICTION_V3_ITEMS, NA, areaLabel, frictionLabelV3, keepLabel, type R0V3Answers,
} from '@/lib/team/r0v3'
import type { ResponseRow } from '@/lib/team/rounds'
import { WORK_STYLE_QUESTIONS } from '@/lib/workStyle'

type Props = { title: string; itemsVersion: string; responses: ResponseRow[]; nameOf: (id: string) => string; onClose: () => void }

const Dim = ({ children }: { children: React.ReactNode }) => <span className="text-[#B0B8C1]">{children}</span>

function V3Card({ a, name, nameOf }: { a: R0V3Answers; name: string; nameOf: (id: string) => string }) {
  const peers = Object.entries(a.jh_peers ?? {})
  return (
    <>
      <p className="text-[14px] font-semibold text-[#1F2933]">{name}{a.short_tenure && <span className="ml-1.5 text-[10.5px] font-normal text-[#B45309] bg-[#FFF7ED] rounded-full px-1.5 py-0.5">합류 4주 미만</span>}</p>
      <div className="flex flex-wrap gap-1">
        {profileChips({ ...a.ws }).map(c => <span key={c.key} className="text-[10.5px] bg-[#F0F2F5] rounded-full px-1.5 py-0.5">{c.icon} {c.label}</span>)}
      </div>
      <p><span className="text-[#059669]">보태는 것</span> {a.ws.gives_tags.join(', ')} · <span className="text-[#B45309]">기대하는 것</span> {a.ws.needs_tags.join(', ')}</p>
      {(a.ws.growth_edge || a.ws.team_request) && <p className="text-[#7A8491]">{a.ws.growth_edge && `성장 과제 · ${a.ws.growth_edge}`}{a.ws.growth_edge && a.ws.team_request ? ' / ' : ''}{a.ws.team_request && `팀에 부탁 · ${a.ws.team_request}`}</p>}
      <div>
        <Dim>B 실제 협업 행동</Dim>
        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 mt-0.5">
          {DOMAINS.map(d => (
            <span key={d.key} className="text-[11px]">{d.short}{' '}
              {BEHAVIOR_ITEMS.filter(i => i.domain === d.key).map(i => <b key={i.key} className="font-semibold" title={`${i.key} ${i.text}`}>{a.behavior[i.key] === NA ? '–' : a.behavior[i.key]} </b>)}
            </span>
          ))}
        </div>
      </div>
      <p><Dim>C 실제 마찰</Dim> {FRICTION_V3_ITEMS.map(f => `${f.short} ${frictionLabelV3(a.friction[f.key])}`).join(' · ')}</p>
      {a.friction_case.text && <p className="text-[#7A8491]">C05 “{a.friction_case.text}”{a.friction_case.items.length ? ` [${a.friction_case.items.join('·')}]` : ''}</p>}
      <p><Dim>D01 잘됐던 장면</Dim> {a.success.none ? '떠오르는 사례 없음' : <>“{a.success.situation}”{a.success.behaviors && <> → 행동 “{a.success.behaviors}”</>}{a.success.domains.length > 0 && <span className="text-[#7A8491]"> ({a.success.domains.map(d => DOMAINS.find(x => x.key === d)?.short).join('·')})</span>}</>}</p>
      <p><Dim>D02 유지할 행동</Dim> {a.keep.map(k => (k === 'K99' ? `기타 “${a.keep_other}”` : keepLabel(k))).join(', ')}{a.keep_note && <span className="text-[#7A8491]"> — “{a.keep_note}”</span>}</p>
      <p><Dim>D03 달라지면 좋을 상황</Dim> {a.improve.areas.map(x => (x === 'other' && a.improve.other ? `기타(${a.improve.other})` : areaLabel(x))).join(', ')}</p>
      {a.improve.situation && (
        <ul className="text-[#7A8491] pl-2 space-y-0.5">
          <li>상황 · {a.improve.situation}</li>
          {a.improve.impact && <li>영향 · {a.improve.impact}</li>}
          {a.improve.change && <li>바라는 변화 · {a.improve.change}</li>}
        </ul>
      )}
      {a.perspective && <p><Dim>D04 관점 차이</Dim> <span className="text-[#7A8491]">“{a.perspective}”</span></p>}
      {(a.jh_self.length > 0 || peers.length > 0) && (
        <p className="text-[11px] text-[#9AA3AD]">조하리(선택) · {a.jh_self.length ? `나: ${a.jh_self.map(traitLabel).join(', ')}` : ''}{peers.length ? ` / 동료: ${peers.map(([id, t]) => `${nameOf(id)} ${t.map(traitLabel).join('·')}`).join(' / ')}` : ''}</p>
      )}
    </>
  )
}

const label = (opts: readonly { key: string; label: string }[], k: string) => opts.find(o => o.key === k)?.label ?? k

export default function RoundResponses({ title, itemsVersion, responses, nameOf, onClose }: Props) {
  const v3 = isV3(itemsVersion)
  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-stretch sm:items-center justify-center sm:px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white sm:rounded-2xl border border-[#EEF0F2] w-full max-w-[900px] sm:max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 px-5 py-4 border-b border-[#EEF0F2] flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[#1F2933]">{title} · 개인별 응답</p>
            <p className="text-[11.5px] text-[#7A8491] mt-0.5">마감 후 공개된 실명 응답입니다. 마감된 응답은 더 이상 바뀌지 않습니다.</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full text-[#7A8491] hover:bg-black/[0.05]" aria-label="닫기">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {responses.map(r => {
            if (v3) return <div key={r.member_id} className="border border-[#EEF0F2] rounded-xl p-4 text-[12px] text-[#3A4249] space-y-2"><V3Card a={r.answers as R0V3Answers} name={nameOf(r.member_id)} nameOf={nameOf} /></div>
            const a = r.answers as R0Answers
            const layers = layerScores([a.health])
            const peers = Object.entries(a.jh_peers ?? {})
            return (
              <div key={r.member_id} className="border border-[#EEF0F2] rounded-xl p-4 text-[12px] text-[#3A4249] space-y-2">
                <p className="text-[14px] font-semibold text-[#1F2933]">{nameOf(r.member_id)}</p>
                <div className="flex flex-wrap gap-1">
                  {profileChips({ ...a.ws }).map(c => <span key={c.key} className="text-[10.5px] bg-[#F0F2F5] rounded-full px-1.5 py-0.5">{c.icon} {c.label}</span>)}
                </div>
                <p><span className="text-[#059669]">보태는 것</span> {a.ws.gives_tags.join(', ')} · <span className="text-[#B45309]">기대하는 것</span> {a.ws.needs_tags.join(', ')}</p>
                {(a.ws.growth_edge || a.ws.team_request) && <p className="text-[#7A8491]">{a.ws.growth_edge && `잘 못하는 것 · ${a.ws.growth_edge}`}{a.ws.growth_edge && a.ws.team_request ? ' / ' : ''}{a.ws.team_request && `팀에 부탁 · ${a.ws.team_request}`}</p>}
                <p><span className="text-[#B0B8C1]">나를 나타내는 말</span> {a.jh_self.map(traitLabel).join(', ')}</p>
                {peers.length > 0 && <p><span className="text-[#B0B8C1]">동료에게 고른 말</span> {peers.map(([id, t]) => `${nameOf(id)}: ${t.map(traitLabel).join('·')}`).join(' / ')}</p>}
                <p><span className="text-[#B0B8C1]">팀 기능 5층</span> {layers.map(l => `${l.layer.name} ${l.score.toFixed(1)}`).join(' · ')}</p>
                <p><span className="text-[#B0B8C1]">불편했던 경험</span>{' '}
                  {FRICTION_ITEMS.map(f => {
                    const title = WORK_STYLE_QUESTIONS.find(q => q.key === f.key)?.label
                    return `${title} ${FRICTION_SCALE.find(s => s.value === a.friction[f.key])?.label ?? '-'}`
                  }).join(' · ')}
                </p>
                {a.friction_note && <p className="text-[#7A8491]">“{a.friction_note}”</p>}
                <p><span className="text-[#B0B8C1]">잘하는 것</span> {a.strengths.map((k: string) => label(STRENGTH_OPTIONS, k)).join(', ')}</p>
                {(a.keep?.length || a.keep_note) && <p><span className="text-[#B0B8C1]">꼭 지킬 행동</span> {[...(a.keep ?? []).map(k => label(KEEP_OPTIONS, k)), a.keep_note && `“${a.keep_note}”`].filter(Boolean).join(', ')}</p>}
                {(a.change.length > 0 || a.change_note) && <p><span className="text-[#B0B8C1]">바꾸고 싶은 것</span> {[...a.change.map((k: string) => label(CHANGE_OPTIONS, k)), a.change_note].filter(Boolean).join(', ')}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
