'use client'

// 마감된 진단의 개인별 응답(실명). 서버는 마감 전엔 이 목록을 내려 주지 않는다(lib/team/rounds.ts toDetail).

import { useEffect } from 'react'
import { traitLabel } from '@/lib/johari'
import { layerScores } from '@/lib/teamHealth'
import { profileChips } from '@/lib/team/composition'
import { CHANGE_OPTIONS, FRICTION_ITEMS, FRICTION_SCALE, KEEP_OPTIONS, STRENGTH_OPTIONS } from '@/lib/team/r0'
import type { ResponseRow } from '@/lib/team/rounds'
import { WORK_STYLE_QUESTIONS } from '@/lib/workStyle'

type Props = { title: string; responses: ResponseRow[]; nameOf: (id: string) => string; onClose: () => void }

const label = (opts: readonly { key: string; label: string }[], k: string) => opts.find(o => o.key === k)?.label ?? k

export default function RoundResponses({ title, responses, nameOf, onClose }: Props) {
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
            const a = r.answers
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
                <p><span className="text-[#B0B8C1]">잘하는 것</span> {a.strengths.map(k => label(STRENGTH_OPTIONS, k)).join(', ')}</p>
                {(a.keep?.length || a.keep_note) && <p><span className="text-[#B0B8C1]">꼭 지킬 행동</span> {[...(a.keep ?? []).map(k => label(KEEP_OPTIONS, k)), a.keep_note && `“${a.keep_note}”`].filter(Boolean).join(', ')}</p>}
                {(a.change.length > 0 || a.change_note) && <p><span className="text-[#B0B8C1]">바꾸고 싶은 것</span> {[...a.change.map(k => label(CHANGE_OPTIONS, k)), a.change_note].filter(Boolean).join(', ')}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
