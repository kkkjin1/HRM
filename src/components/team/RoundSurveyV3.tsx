'use client'

// 팀 진단 응답 창(r0-v3) — 실명 응답. PART A 나의 업무 방식 / B 실제 협업 행동 / C 실제 마찰 경험 / D 성공·유지·개선·관점 차이.
// 검증은 서버가 다시 한다(validateAnswersV3). 여기서는 같은 규칙으로 미리 알려 줄 뿐이다.
// 15~20분 분량이라 입력 중인 내용은 이 브라우저에 임시로 남긴다(제출하면 지움) — 격리·삭제 규칙은 lib/team/r0Draft.ts.

import { useEffect, useMemo, useRef, useState } from 'react'
import { GIVES_TAGS, NEEDS_TAGS, WORK_STYLE_QUESTIONS } from '@/lib/workStyle'
import { JOHARI_GROUPS, JOHARI_MAX, JOHARI_MIN, JOHARI_TRAITS } from '@/lib/johari'
import {
  BEHAVIOR_ITEMS, BEHAVIOR_NA_LABEL, BEHAVIOR_SCALE, DISCLAIMER_V3, DOMAINS, FRICTION_NA_LABEL, FRICTION_V3_ITEMS, FRICTION_V3_SCALE,
  IMPROVE_AREAS, IMPROVE_MAX, IMPROVE_NONE, IMPROVE_OTHER, KEEP_OTHER, KEEP_V3_MAX, KEEP_V3_OPTIONS, LONG_MAX, NA, PERIOD, SUCCESS_DOMAIN_MAX,
  validateAnswersV3, type DomainKey, type R0V3Answers,
} from '@/lib/team/r0v3'
import { NOTE_MAX } from '@/lib/team/r0common'
import type { SurveyPerson } from '@/components/team/RoundSurvey'
import { clearDraft, loadDraft, saveDraft } from '@/lib/team/r0Draft'

type Props = {
  roundId: string
  itemsVersion: string            // 회차 문항 버전 — 초안 격리 키에 들어간다
  basedOn: string | null          // 서버에 있는 내 응답의 마지막 저장 시각(없으면 null) — 그 뒤 바뀌었으면 초안을 버린다
  title: string
  meId: string
  peers: SurveyPerson[]
  initial: R0V3Answers
  alreadySubmitted: boolean
  busy?: boolean
  serverError?: string | null
  onSubmit: (answers: R0V3Answers) => void
  onCancel: () => void
}

type ProfileSeed = {
  when_stuck?: string | null; feedback_pref?: string | null; focus_time?: string | null; meeting_pref?: string | null
  gives_tags?: string[]; needs_tags?: string[]; growth_edge?: string | null; team_request?: string | null
}
// 처음 응답할 때 현재 "나와 일하는 법"을 미리 채운다(확인·수정만 하면 되게).
export function emptyAnswersV3(profile?: ProfileSeed | null): R0V3Answers {
  return {
    ws: {
      when_stuck: profile?.when_stuck ?? '', feedback_pref: profile?.feedback_pref ?? '', focus_time: profile?.focus_time ?? '', meeting_pref: profile?.meeting_pref ?? '',
      gives_tags: profile?.gives_tags ?? [], needs_tags: profile?.needs_tags ?? [], growth_edge: profile?.growth_edge ?? null, team_request: profile?.team_request ?? null,
    },
    short_tenure: false, jh_self: [], jh_peers: {}, behavior: {}, friction: {},
    friction_case: { text: null, items: [] },
    success: { none: false, situation: null, behaviors: null, domains: [] },
    keep: [], keep_other: null, keep_note: null,
    improve: { areas: [], other: null, situation: null, impact: null, change: null },
    perspective: null,
  }
}

const B_SHORT = ['전혀 아님', '대체로 아님', '상황 따라', '대체로 그러함', '일관되게']
const chip = (active: boolean, disabled = false) =>
  `text-[12px] px-3 py-1.5 rounded-lg border transition-colors ${active ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]' : disabled ? 'border-[#EEF0F2] text-[#D3D8DD] cursor-not-allowed' : 'border-[#E5E8EB] text-[#3A4249] hover:bg-[#F7F8F8]'}`
const scaleBtn = (active: boolean, na = false) =>
  `min-h-[44px] rounded-lg border px-1 py-1 text-center leading-tight transition-colors ${active ? (na ? 'bg-[#5B6472] border-[#5B6472] text-white' : 'bg-[#4C7FE0] border-[#4C7FE0] text-white') : na ? 'border-dashed border-[#D0D7E2] text-[#7A8491] hover:bg-[#F7F8F8]' : 'border-[#E5E8EB] text-[#3A4249] hover:bg-[#F7F8F8]'}`
const toggle = <T extends string>(list: T[], v: T, max = Infinity) => (list.includes(v) ? list.filter(x => x !== v) : list.length >= max ? list : [...list, v])

function Q({ title, hint, children, id }: { title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="py-3 border-b border-[#F3F4F6] last:border-0">
      <div className="text-[13px] font-semibold text-[#1F2933] leading-snug">{title}</div>
      {hint && <p className="text-[11.5px] text-[#7A8491] mt-0.5 leading-relaxed">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Text({ value, onChange, placeholder, rows = 2, max = LONG_MAX, label }: { value: string | null; onChange: (v: string | null) => void; placeholder: string; rows?: number; max?: number; label?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-[11.5px] font-medium text-[#5B6472] mb-1">{label}</span>}
      <textarea value={value ?? ''} maxLength={max} rows={rows} onChange={e => onChange(e.target.value || null)} placeholder={placeholder}
        className="w-full text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-2 leading-relaxed resize-y focus:outline-none focus:border-[#4C7FE0] placeholder:text-[#B8C0C8]" />
    </label>
  )
}

function TraitPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      {JOHARI_GROUPS.map(g => (
        <div key={g}>
          <p className="text-[11px] text-[#7A8491] mb-1">{g}</p>
          <div className="flex flex-wrap gap-1.5">
            {JOHARI_TRAITS.filter(t => t.group === g).map(t => {
              const active = value.includes(t.key)
              const full = !active && value.length >= JOHARI_MAX
              return <button key={t.key} type="button" disabled={full} onClick={() => onChange(toggle(value, t.key, JOHARI_MAX))} className={chip(active, full)}>{t.label}</button>
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// 필수 단위별 완료 여부 — 진행률·파트별 남은 개수에 쓴다(검증 규칙과 같은 기준).
function progressOf(a: R0V3Answers) {
  const wants = a.improve.areas.length > 0 && !a.improve.areas.includes(IMPROVE_NONE)
  const A = [...WORK_STYLE_QUESTIONS.map(q => !!a.ws[q.key]), a.ws.gives_tags.length > 0, a.ws.needs_tags.length > 0]
  const B = BEHAVIOR_ITEMS.map(i => a.behavior[i.key] !== undefined)
  const C = FRICTION_V3_ITEMS.map(i => a.friction[i.key] !== undefined)
  const D = [
    a.success.none || !!a.success.situation?.trim(),
    a.keep.length > 0 && (!a.keep.includes(KEEP_OTHER) || !!a.keep_other?.trim()),
    a.improve.areas.length > 0 && (!a.improve.areas.includes(IMPROVE_OTHER) || !!a.improve.other?.trim()),
    ...(wants ? [!!a.improve.situation?.trim()] : []),
  ]
  const parts = [A, B, C, D].map(x => ({ done: x.filter(Boolean).length, total: x.length }))
  return { parts, done: parts.reduce((s, p) => s + p.done, 0), total: parts.reduce((s, p) => s + p.total, 0) }
}

export default function RoundSurveyV3({ roundId, itemsVersion, basedOn, title, meId, peers, initial, alreadySubmitted, busy, serverError, onSubmit, onCancel }: Props) {
  const who = useMemo(() => ({ version: itemsVersion, roundId, memberId: meId }), [itemsVersion, roundId, meId])
  const [draft] = useState(() => loadDraft(who, basedOn))
  const [a, setA] = useState<R0V3Answers>(() => (draft ? { ...initial, ...draft } : initial))
  const restored = !!draft
  const [step, setStep] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [openPeer, setOpenPeer] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const check = useMemo(() => validateAnswersV3(a, { selfId: meId, peerIds: peers.map(p => p.id) }), [a, meId, peers])
  const errors = check.ok ? [] : check.errors
  const prog = useMemo(() => progressOf(a), [a])

  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onCancel])
  useEffect(() => {
    if (a === initial) return
    saveDraft(who, basedOn, a)
  }, [a, initial, who, basedOn])
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }) }, [step])

  const set = (patch: Partial<R0V3Answers>) => setA(prev => ({ ...prev, ...patch }))
  const setWs = (patch: Partial<R0V3Answers['ws']>) => setA(prev => ({ ...prev, ws: { ...prev.ws, ...patch } }))
  const steps = ['나의 업무 방식', '실제 협업 행동', '실제 마찰 경험', '성공·유지·개선']
  const wants = a.improve.areas.length > 0 && !a.improve.areas.includes(IMPROVE_NONE)

  function submit() {
    setShowErrors(true)
    if (!check.ok) return
    clearDraft(who)
    onSubmit(check.answers)
  }
  function discardDraft() {
    clearDraft(who)
    setA(initial)
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-stretch sm:items-center justify-center sm:px-4">
      <div className="bg-white sm:rounded-2xl border border-[#EEF0F2] w-full max-w-[760px] h-full sm:h-auto sm:max-h-[92vh] flex flex-col" role="dialog" aria-label={title}>
        <div className="flex-shrink-0 px-4 sm:px-5 pt-4 pb-3 border-b border-[#EEF0F2]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-[#1F2933]">{title}</p>
              <p className="text-[11.5px] text-[#7A8491]">기준 기간: {PERIOD} · 약 15~20분</p>
            </div>
            <button onClick={onCancel} className="w-8 h-8 flex-shrink-0 rounded-full text-[#7A8491] hover:bg-black/[0.05]" aria-label="닫기(입력 내용은 이 브라우저에 임시 저장됩니다)">✕</button>
          </div>
          {step === 0 && (
            <div className="text-[11.5px] text-[#B45309] bg-[#FFF7ED] rounded-lg px-3 py-2 mt-2 leading-relaxed space-y-0.5">
              <p>모든 응답은 <b>실명이며, 마감 후 팀원 전원에게 공개</b>됩니다. 마감 전에는 나만 볼 수 있고 마감 전까지 고칠 수 있습니다.</p>
              <p>개인을 평가하는 설문이 아니라 우리 팀이 실제로 어떻게 일하는지 함께 이해하기 위한 진단입니다. 팀장도 같은 질문에 답합니다.</p>
              <p className="text-[#8A6A45]">{DISCLAIMER_V3}</p>
            </div>
          )}
          {restored && step === 0 && (
            <p className="text-[11.5px] text-[#3A5BC7] bg-[#EEF1FE] rounded-lg px-3 py-1.5 mt-2">이 브라우저에 임시 저장된 입력을 불러왔습니다. <button onClick={discardDraft} className="underline">처음 상태로</button></p>
          )}
          <div className="grid grid-cols-4 gap-1.5 mt-3">
            {steps.map((s, i) => {
              const p = prog.parts[i]
              const done = p.done === p.total
              return (
                <button key={s} onClick={() => setStep(i)} className={`text-[11px] sm:text-[11.5px] rounded-md py-1.5 px-1 leading-tight ${step === i ? 'bg-[#1F2933] text-white' : 'bg-[#F0F2F5] text-[#5B6472]'}`}>
                  <span className="font-semibold">PART {'ABCD'[i]}</span><span className="hidden sm:inline"> · {s}</span>
                  <span className={`block text-[10.5px] ${step === i ? 'text-white/70' : done ? 'text-[#047857]' : 'text-[#9AA3AD]'}`}>{done ? '완료 ✓' : `${p.done}/${p.total}`}</span>
                </button>
              )
            })}
          </div>
          <div className="h-1.5 bg-[#F0F2F5] rounded-full overflow-hidden mt-2" aria-label={`필수 항목 ${prog.done}/${prog.total}`}>
            <div className="h-full bg-[#4C7FE0] rounded-full transition-all" style={{ width: `${(prog.done / prog.total) * 100}%` }} />
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 sm:px-5 py-1">
          {step === 0 && (
            <>
              <p className="text-[12px] font-semibold text-[#1F2933] pt-3">PART A — 나의 업무 방식과 협업 선호</p>
              <p className="text-[11.5px] text-[#7A8491]">현재 ‘나와 일하는 법’을 미리 채웠습니다. 확인하고 바뀐 부분만 고쳐 주세요. 선호의 차이는 좋고 나쁨이 아닙니다.</p>
              <label className="flex items-start gap-2 text-[12px] text-[#3A4249] bg-[#FAFBFC] rounded-lg px-3 py-2 mt-2">
                <input type="checkbox" className="mt-0.5" checked={a.short_tenure} onChange={e => set({ short_tenure: e.target.checked })} />
                <span>팀에 합류한 지 4주가 안 됐습니다 — 실제로 경험한 기간을 기준으로 답할게요.</span>
              </label>
              {WORK_STYLE_QUESTIONS.map((q, i) => (
                <Q key={q.key} title={`A${i + 1}. ${q.icon} ${q.label}`}>
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map(o => <button key={o.value} type="button" onClick={() => setWs({ [q.key]: o.value })} className={chip(a.ws[q.key] === o.value)}>{o.label}</button>)}
                  </div>
                </Q>
              ))}
              <Q title="팀에 보태는 강점" hint="내가 있어서 팀이 덜 걱정하는 영역 (1개 이상)">
                <div className="flex flex-wrap gap-1.5">{GIVES_TAGS.map(t => <button key={t} type="button" onClick={() => setWs({ gives_tags: toggle(a.ws.gives_tags, t) })} className={chip(a.ws.gives_tags.includes(t))}>{t}</button>)}</div>
              </Q>
              <Q title="기대하는 도움" hint="누군가 채워 주면 힘이 되는 것 (1개 이상)">
                <div className="flex flex-wrap gap-1.5">{NEEDS_TAGS.map(t => <button key={t} type="button" onClick={() => setWs({ needs_tags: toggle(a.ws.needs_tags, t) })} className={chip(a.ws.needs_tags.includes(t))}>{t}</button>)}</div>
              </Q>
              <Q title="성장 과제 · 팀에 부탁하고 싶은 것 (선택)">
                <div className="space-y-2">
                  <Text rows={1} max={NOTE_MAX} value={a.ws.growth_edge} onChange={v => setWs({ growth_edge: v })} placeholder="스스로 잘 못한다고 느끼는 것" />
                  <Text rows={1} max={NOTE_MAX} value={a.ws.team_request} onChange={v => setWs({ team_request: v })} placeholder="팀에 부탁하고 싶은 것" />
                </div>
              </Q>
              <details className="py-3 group">
                <summary className="text-[13px] font-semibold text-[#1F2933] cursor-pointer">나와 동료를 나타내는 말 <span className="font-normal text-[11.5px] text-[#7A8491]">(선택 영역 · {a.jh_self.length ? `${a.jh_self.length}개 선택` : '건너뛰어도 됩니다'})</span></summary>
                <p className="text-[11.5px] text-[#7A8491] mt-1">조하리 선택 영역입니다. 협업 진단(PART B~D)과 섞어 점수로 만들지 않습니다. 고르면 {JOHARI_MIN}~{JOHARI_MAX}개, 실명으로 공개됩니다.</p>
                <div className="mt-2"><TraitPicker value={a.jh_self} onChange={v => set({ jh_self: v })} /></div>
                <div className="space-y-1.5 mt-3">
                  {peers.map(p => {
                    const picked = a.jh_peers[p.id] ?? []
                    return (
                      <div key={p.id} className="border border-[#EEF0F2] rounded-lg">
                        <button type="button" onClick={() => setOpenPeer(openPeer === p.id ? null : p.id)} className="w-full flex items-center justify-between px-3 py-2 text-[12.5px] text-[#1F2933]">
                          <span>{p.name}</span><span className="text-[11.5px] text-[#7A8491]">{picked.length ? `${picked.length}개 선택` : '건너뛰기'} {openPeer === p.id ? '▴' : '▾'}</span>
                        </button>
                        {openPeer === p.id && <div className="px-3 pb-3"><TraitPicker value={picked} onChange={v => set({ jh_peers: { ...a.jh_peers, [p.id]: v } })} /></div>}
                      </div>
                    )
                  })}
                </div>
              </details>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-[12px] font-semibold text-[#1F2933] pt-3">PART B — 우리 팀의 실제 협업 행동</p>
              <p className="text-[11.5px] text-[#7A8491] leading-relaxed">{PERIOD} 동안 실제로 겪거나 본 모습을 기준으로 골라 주세요. 기대나 바람이 아니라 실제 장면입니다. 직접 보거나 겪을 기회가 없었다면 ‘관찰 기회 없음’을 골라 주세요 — ‘상황에 따라 다름’(3)과 다르게 셉니다.</p>
              <div className="hidden sm:flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-[#9AA3AD] mt-1.5">{BEHAVIOR_SCALE.map(s => <span key={s.value}>{s.value} {s.label}</span>)}</div>
              {DOMAINS.map(d => (
                <div key={d.key} className="mt-2">
                  <p className="text-[11.5px] font-semibold text-[#4C7FE0] pt-2">{d.code}. {d.label}</p>
                  {BEHAVIOR_ITEMS.filter(i => i.domain === d.key).map(it => (
                    <Q key={it.key} id={`q-${it.key}`} title={<><span className="text-[#9AA3AD] font-medium mr-1">{it.key}</span>{it.text}</>}>
                      <div className="grid grid-cols-6 gap-1">
                        {BEHAVIOR_SCALE.map((s, i) => (
                          <button key={s.value} type="button" title={s.label} aria-pressed={a.behavior[it.key] === s.value}
                            onClick={() => set({ behavior: { ...a.behavior, [it.key]: s.value } })} className={scaleBtn(a.behavior[it.key] === s.value)}>
                            <span className="block text-[13px] font-semibold">{s.value}</span><span className="block text-[9.5px] sm:text-[10px] opacity-80">{B_SHORT[i]}</span>
                          </button>
                        ))}
                        <button type="button" title={BEHAVIOR_NA_LABEL} aria-pressed={a.behavior[it.key] === NA} onClick={() => set({ behavior: { ...a.behavior, [it.key]: NA } })} className={scaleBtn(a.behavior[it.key] === NA, true)}>
                          <span className="block text-[10px] sm:text-[10.5px]">관찰 기회<br />없음</span>
                        </button>
                      </div>
                    </Q>
                  ))}
                </div>
              ))}
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-[12px] font-semibold text-[#1F2933] pt-3">PART C — 실제 협업 마찰 경험</p>
              <p className="text-[11.5px] text-[#7A8491] leading-relaxed">{PERIOD} 동안 아래 상황이 실제로 몇 번 있었는지 골라 주세요. 누구 탓인지가 아니라 어떤 장면이 있었는지를 묻습니다.</p>
              {FRICTION_V3_ITEMS.map(it => (
                <Q key={it.key} id={`q-${it.key}`} title={<><span className="text-[#9AA3AD] font-medium mr-1">{it.key}</span>{it.text}</>}>
                  <div className="grid grid-cols-5 gap-1">
                    {FRICTION_V3_SCALE.map(s => (
                      <button key={s.value} type="button" aria-pressed={a.friction[it.key] === s.value} onClick={() => set({ friction: { ...a.friction, [it.key]: s.value } })} className={scaleBtn(a.friction[it.key] === s.value)}>
                        <span className="block text-[11.5px] sm:text-[12px] font-medium">{s.label}</span>
                      </button>
                    ))}
                    <button type="button" title={FRICTION_NA_LABEL} aria-pressed={a.friction[it.key] === NA} onClick={() => set({ friction: { ...a.friction, [it.key]: NA } })} className={scaleBtn(a.friction[it.key] === NA, true)}>
                      <span className="block text-[10px] sm:text-[10.5px]">경험·관찰<br />기회 없음</span>
                    </button>
                  </div>
                </Q>
              ))}
              <Q title={<>C05. 대표적인 상황 <span className="font-normal text-[11.5px] text-[#7A8491]">(선택)</span></>}
                hint="위 경험이 있다면 팀이 함께 이해할 필요가 있는 장면 하나를 적어 주세요. 사람보다 상황과 영향을 중심으로 적어 주세요. 실명으로 공개됩니다.">
                <Text rows={3} value={a.friction_case.text} onChange={v => set({ friction_case: { ...a.friction_case, text: v } })}
                  placeholder="어떤 상황이었고 업무에 어떤 영향을 주었나요?" />
                <p className="text-[10.5px] text-[#9AA3AD] mt-1">예: 업무 우선순위가 바뀐 사실을 늦게 알게 되어 완료한 작업 일부를 다시 해야 했다.</p>
                {a.friction_case.text && (
                  <div className="mt-2">
                    <p className="text-[11.5px] text-[#5B6472] mb-1">관련 있는 항목 (선택 · 여러 상황에 걸치면 해당하는 것만)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {FRICTION_V3_ITEMS.map(it => (
                        <button key={it.key} type="button" onClick={() => set({ friction_case: { ...a.friction_case, items: toggle(a.friction_case.items, it.key) } })} className={chip(a.friction_case.items.includes(it.key))}>{it.key} {it.short}</button>
                      ))}
                    </div>
                  </div>
                )}
              </Q>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-[12px] font-semibold text-[#1F2933] pt-3">PART D — 실제 성공 경험과 유지·개선</p>
              <Q title="D01. 최근 우리 팀이 함께 일해서 잘됐다고 느낀 장면은?" hint={`${PERIOD} 중 하나만 떠올려 주세요. ‘서로 잘 도왔다’보다 실제 상황과 그때의 행동을 나눠 적으면 팀이 그 방식을 반복하기 쉽습니다.`}>
                <label className="flex items-center gap-2 text-[12px] text-[#3A4249] mb-2">
                  <input type="checkbox" checked={a.success.none} onChange={e => set({ success: { ...a.success, none: e.target.checked } })} /> 떠오르는 사례 없음
                </label>
                {!a.success.none && (
                  <div className="space-y-2">
                    <Text label="어떤 상황이었나요?" rows={2} value={a.success.situation} onChange={v => set({ success: { ...a.success, situation: v } })} placeholder="상황 — 어떤 업무였고 결과가 어땠나요?" />
                    <Text label="팀원들의 어떤 행동이 좋은 결과에 기여했나요?" rows={2} value={a.success.behaviors} onChange={v => set({ success: { ...a.success, behaviors: v } })} placeholder="행동 — 누가 무엇을 했나요? (이름 대신 역할로 적어도 됩니다)" />
                    <p className="text-[10.5px] text-[#9AA3AD]">예: 급한 자료 요청이 있었는데 서로 담당을 나누고 검토를 지원해 기한 내 제출했다.</p>
                    <div>
                      <p className="text-[11.5px] text-[#5B6472] mb-1">가장 가까운 영역 (선택 · 최대 {SUCCESS_DOMAIN_MAX}개)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {DOMAINS.map(d => {
                          const active = a.success.domains.includes(d.key)
                          const full = !active && a.success.domains.length >= SUCCESS_DOMAIN_MAX
                          return <button key={d.key} type="button" disabled={full} onClick={() => set({ success: { ...a.success, domains: toggle<DomainKey>(a.success.domains, d.key, SUCCESS_DOMAIN_MAX) } })} className={chip(active, full)}>{d.short}</button>
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </Q>
              <Q title="D02. 좋은 협업을 반복하기 위해 유지하고 싶은 행동은?" hint={`1~${KEEP_V3_MAX}개 · 위 성공 장면과 같은 행동이어도, 평소 지키고 싶은 행동이어도 됩니다.`}>
                <div className="flex flex-col gap-1.5">
                  {[...KEEP_V3_OPTIONS, { key: KEEP_OTHER, label: '기타 — 직접 입력' }].map(o => {
                    const active = a.keep.includes(o.key)
                    const full = !active && a.keep.length >= KEEP_V3_MAX
                    return <button key={o.key} type="button" disabled={full} onClick={() => set({ keep: toggle(a.keep, o.key, KEEP_V3_MAX) })} className={`${chip(active, full)} text-left`}>{o.label}</button>
                  })}
                </div>
                {a.keep.includes(KEEP_OTHER) && <div className="mt-2"><Text rows={1} max={NOTE_MAX} value={a.keep_other} onChange={v => set({ keep_other: v })} placeholder="유지하고 싶은 행동" /></div>}
                <div className="mt-2"><Text rows={1} max={NOTE_MAX} value={a.keep_note} onChange={v => set({ keep_note: v })} placeholder="이유나 구체적인 경험 (선택)" /></div>
              </Q>
              <Q title="D03. 우리 팀에서 어떤 협업 상황이 달라지면 좋을까요?" hint={`영역 최대 ${IMPROVE_MAX}개 · 해결책은 다음 단계에서 팀이 함께 정합니다. 지금은 어떤 상황이었는지만 적어 주세요.`}>
                <div className="flex flex-wrap gap-1.5">
                  {IMPROVE_AREAS.map(ar => {
                    const active = a.improve.areas.includes(ar.key)
                    const full = !active && ar.key !== IMPROVE_NONE && a.improve.areas.filter(x => x !== IMPROVE_NONE).length >= IMPROVE_MAX
                    return (
                      <button key={ar.key} type="button" disabled={full}
                        onClick={() => set({ improve: { ...a.improve, areas: ar.key === IMPROVE_NONE ? (active ? [] : [IMPROVE_NONE]) : toggle(a.improve.areas.filter(x => x !== IMPROVE_NONE), ar.key, IMPROVE_MAX) } })}
                        className={chip(active, full)}>{ar.label}</button>
                    )
                  })}
                </div>
                {a.improve.areas.includes(IMPROVE_OTHER) && <div className="mt-2"><Text rows={1} max={NOTE_MAX} value={a.improve.other} onChange={v => set({ improve: { ...a.improve, other: v } })} placeholder="기타 영역" /></div>}
                {wants && (
                  <div className="space-y-2 mt-3 border-l-2 border-[#F2D7B6] pl-3">
                    <Text label="A. 실제로 아쉬웠던 상황 (필수)" value={a.improve.situation} onChange={v => set({ improve: { ...a.improve, situation: v } })} placeholder="언제, 어떤 장면이었나요?" />
                    <Text label="B. 그때 업무나 협업에 미친 영향 (선택)" value={a.improve.impact} onChange={v => set({ improve: { ...a.improve, impact: v } })} placeholder="무엇이 늦어지거나 다시 해야 했나요?" />
                    <Text label="C. 무엇이 달라지면 개선됐다고 느낄지 (선택)" value={a.improve.change} onChange={v => set({ improve: { ...a.improve, change: v } })} placeholder="어떤 모습이면 ‘나아졌다’고 느낄까요?" />
                    <p className="text-[10.5px] text-[#9AA3AD]">예: 회의에서 방향은 정했지만 담당자와 기한이 불분명했다. 회의 종료 시 담당자와 완료일을 확인하면 좋겠다.</p>
                  </div>
                )}
              </Q>
              <Q title={<>D04. 다른 팀원들은 나와 다르게 느낄 수도 있겠다고 생각하는 부분이 있나요? <span className="font-normal text-[11.5px] text-[#7A8491]">(선택)</span></>}
                hint="다른 사람의 생각을 짐작해 확정하려는 질문이 아닙니다. 내가 보는 관점의 한계나 차이를 적어 주세요.">
                <Text rows={2} value={a.perspective} onChange={v => set({ perspective: v })} placeholder="내 위치·정보·업무 때문에 다르게 보일 수 있는 부분" />
                <p className="text-[10.5px] text-[#9AA3AD] mt-1">예: 저는 회의가 효율적이라고 생각하지만, 사전 맥락을 충분히 공유받지 못한 사람은 다르게 느낄 수 있을 것 같습니다.</p>
              </Q>
            </>
          )}
        </div>

        <div className="flex-shrink-0 px-4 sm:px-5 py-3 border-t border-[#EEF0F2]">
          {(showErrors && errors.length > 0) && <p className="text-[11.5px] text-red-500 mb-2">{errors[0]}{errors.length > 1 ? ` 외 ${errors.length - 1}건` : ''}</p>}
          {serverError && <p className="text-[11.5px] text-red-500 mb-2">{serverError}</p>}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] text-[#7A8491]">필수 {prog.done}/{prog.total}{prog.done === prog.total ? ' · 모두 답했습니다' : ''}</span>
            <div className="flex gap-2">
              {step > 0 && <button onClick={() => setStep(step - 1)} className="text-[13px] font-medium text-[#5B6472] px-3 py-2">이전</button>}
              {step < 3 ? (
                <button onClick={() => setStep(step + 1)} className="text-[13px] font-medium text-white bg-[#1F2933] rounded-lg px-4 py-2">다음</button>
              ) : (
                <button onClick={submit} disabled={busy} className="text-[13px] font-medium text-white bg-[#4C7FE0] hover:bg-[#3A6CC8] disabled:opacity-40 rounded-lg px-4 py-2">
                  {alreadySubmitted ? '수정 저장' : '제출'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
