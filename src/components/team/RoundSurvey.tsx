'use client'

// 팀 진단(R0·정기 진단) 응답 창 — 실명 응답. 3단계: ① 나와 일하는 법·나를 나타내는 말 ② 실제 협업 경험 ③ 함께 지킬·바꿀 행동.
// 검증은 서버가 다시 한다(validateAnswers). 여기서는 같은 규칙으로 미리 알려 줄 뿐이다.

import { useEffect, useMemo, useState } from 'react'
import { GIVES_TAGS, NEEDS_TAGS, WORK_STYLE_QUESTIONS } from '@/lib/workStyle'
import { JOHARI_GROUPS, JOHARI_MAX, JOHARI_MIN, JOHARI_TRAITS } from '@/lib/johari'
import { HEALTH_ITEMS, HEALTH_SCALE } from '@/lib/teamHealth'
import {
  CHANGE_MAX, CHANGE_OPTIONS, FRICTION_ITEMS, FRICTION_SCALE, KEEP_MAX, KEEP_OPTIONS, NOTE_MAX, STRENGTH_MAX, STRENGTH_OPTIONS,
  hasKeepItem, validateAnswers, type R0Answers,
} from '@/lib/team/r0'

export type SurveyPerson = { id: string; name: string }

type Props = {
  title: string
  itemsVersion: string             // 회차가 열릴 때의 문항 버전 — 그 버전의 문항으로 받고 검증한다
  meId: string
  peers: SurveyPerson[]
  initial: R0Answers
  alreadySubmitted: boolean
  busy?: boolean
  serverError?: string | null
  onSubmit: (answers: R0Answers) => void
  onCancel: () => void
}

// 처음 응답할 때 현재 "나와 일하는 법"을 미리 채운다(확인·수정만 하면 되게).
type ProfileSeed = {
  when_stuck?: string | null; feedback_pref?: string | null; focus_time?: string | null; meeting_pref?: string | null
  gives_tags?: string[]; needs_tags?: string[]; growth_edge?: string | null; team_request?: string | null
}
export function emptyAnswers(profile?: ProfileSeed | null): R0Answers {
  return {
    ws: {
      when_stuck: profile?.when_stuck ?? '', feedback_pref: profile?.feedback_pref ?? '', focus_time: profile?.focus_time ?? '', meeting_pref: profile?.meeting_pref ?? '',
      gives_tags: profile?.gives_tags ?? [], needs_tags: profile?.needs_tags ?? [], growth_edge: profile?.growth_edge ?? null, team_request: profile?.team_request ?? null,
    },
    jh_self: [], jh_peers: {}, health: {}, friction: {}, friction_note: null, strengths: [], keep: [], keep_note: null, change: [], change_note: null,
  }
}

const chip = (active: boolean, disabled = false) =>
  `text-[12px] px-3 py-1.5 rounded-lg border transition-colors ${active ? 'bg-[#4C7FE0] text-white border-[#4C7FE0]' : disabled ? 'border-[#EEF0F2] text-[#D3D8DD] cursor-not-allowed' : 'border-[#E5E8EB] text-[#3A4249] hover:bg-[#F7F8F8]'}`
const toggle = (list: string[], v: string, max = Infinity) => (list.includes(v) ? list.filter(x => x !== v) : list.length >= max ? list : [...list, v])

function Q({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-[#F3F4F6] last:border-0">
      <p className="text-[13px] font-semibold text-[#1F2933]">{title}</p>
      {hint && <p className="text-[11.5px] text-[#7A8491] mt-0.5">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
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

function Note({ value, onChange, placeholder }: { value: string | null; onChange: (v: string | null) => void; placeholder: string }) {
  return (
    <input value={value ?? ''} maxLength={NOTE_MAX} onChange={e => onChange(e.target.value || null)} placeholder={placeholder}
      className="w-full text-[12.5px] border border-[#E5E8EB] rounded-md px-2.5 py-2 focus:outline-none focus:border-[#4C7FE0]" />
  )
}

export default function RoundSurvey({ title, itemsVersion, meId, peers, initial, alreadySubmitted, busy, serverError, onSubmit, onCancel }: Props) {
  const [a, setA] = useState<R0Answers>(initial)
  const [step, setStep] = useState(0)
  const [openPeer, setOpenPeer] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const check = useMemo(() => validateAnswers(a, { selfId: meId, peerIds: peers.map(p => p.id) }, itemsVersion), [a, meId, peers, itemsVersion])
  const withKeep = hasKeepItem(itemsVersion)
  const errors = check.ok ? [] : check.errors

  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onCancel])

  const setWs = (patch: Partial<R0Answers['ws']>) => setA(prev => ({ ...prev, ws: { ...prev.ws, ...patch } }))
  const steps = ['나와 일하는 법', '실제 협업 경험', '함께 지킬·바꿀 행동']

  function submit() {
    setShowErrors(true)
    if (check.ok) onSubmit(check.answers)
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-stretch sm:items-center justify-center sm:px-4" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} className="bg-white sm:rounded-2xl border border-[#EEF0F2] w-full max-w-[720px] sm:max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 px-5 py-4 border-b border-[#EEF0F2]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-semibold text-[#1F2933]">{title}</p>
            <button onClick={onCancel} className="w-7 h-7 rounded-full text-[#7A8491] hover:bg-black/[0.05]" aria-label="닫기">✕</button>
          </div>
          <p className="text-[12px] text-[#B45309] bg-[#FFF7ED] rounded-lg px-3 py-2 mt-2 leading-relaxed">
            이 진단의 모든 응답은 <b>실명으로 팀원 전원에게 공개</b>됩니다(마감 후). 마감 전에는 나만 볼 수 있고, 마감 전까지 고칠 수 있습니다.
            이전에 익명으로 모은 조하리·팀 건강도 응답은 공개되지 않습니다.
          </p>
          <div className="flex gap-1.5 mt-3">
            {steps.map((s, i) => (
              <button key={s} onClick={() => setStep(i)} className={`flex-1 text-[11.5px] rounded-md py-1.5 ${step === i ? 'bg-[#1F2933] text-white' : 'bg-[#F0F2F5] text-[#5B6472]'}`}>{i + 1}. {s}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {step === 0 && (
            <>
              {WORK_STYLE_QUESTIONS.map(q => (
                <Q key={q.key} title={`${q.icon} ${q.label}`}>
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map(o => <button key={o.value} type="button" onClick={() => setWs({ [q.key]: o.value })} className={chip(a.ws[q.key] === o.value)}>{o.label}</button>)}
                  </div>
                </Q>
              ))}
              <Q title="보태는 것" hint="내가 있어서 팀이 덜 걱정하는 영역 (1개 이상)">
                <div className="flex flex-wrap gap-1.5">{GIVES_TAGS.map(t => <button key={t} type="button" onClick={() => setWs({ gives_tags: toggle(a.ws.gives_tags, t) })} className={chip(a.ws.gives_tags.includes(t))}>{t}</button>)}</div>
              </Q>
              <Q title="기대하는 것" hint="누군가 채워 주면 힘이 되는 것 (1개 이상)">
                <div className="flex flex-wrap gap-1.5">{NEEDS_TAGS.map(t => <button key={t} type="button" onClick={() => setWs({ needs_tags: toggle(a.ws.needs_tags, t) })} className={chip(a.ws.needs_tags.includes(t))}>{t}</button>)}</div>
              </Q>
              <Q title="팀에서 내가 잘 못하는 것 · 팀에 부탁 (선택)">
                <div className="space-y-2">
                  <Note value={a.ws.growth_edge} onChange={v => setWs({ growth_edge: v })} placeholder="예: 마감 직전 우선순위 재조정" />
                  <Note value={a.ws.team_request} onChange={v => setWs({ team_request: v })} placeholder="예: 막혔을 때 먼저 말 걸어줘도 돼" />
                </div>
              </Q>
              <Q title="나를 가장 잘 나타내는 말" hint={`${JOHARI_MIN}~${JOHARI_MAX}개 · 현재 ${a.jh_self.length}개`}>
                <TraitPicker value={a.jh_self} onChange={v => setA(prev => ({ ...prev, jh_self: v }))} />
              </Q>
              <Q title="동료를 나타내는 말 (선택)" hint={`고르면 사람당 ${JOHARI_MIN}~${JOHARI_MAX}개 · 실명으로 공개됩니다`}>
                <div className="space-y-1.5">
                  {peers.map(p => {
                    const picked = a.jh_peers[p.id] ?? []
                    return (
                      <div key={p.id} className="border border-[#EEF0F2] rounded-lg">
                        <button type="button" onClick={() => setOpenPeer(openPeer === p.id ? null : p.id)} className="w-full flex items-center justify-between px-3 py-2 text-[12.5px] text-[#1F2933]">
                          <span>{p.name}</span><span className="text-[11.5px] text-[#7A8491]">{picked.length ? `${picked.length}개 선택` : '건너뛰기'} {openPeer === p.id ? '▴' : '▾'}</span>
                        </button>
                        {openPeer === p.id && (
                          <div className="px-3 pb-3">
                            <TraitPicker value={picked} onChange={v => setA(prev => ({ ...prev, jh_peers: { ...prev.jh_peers, [p.id]: v } }))} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Q>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-[11.5px] text-[#7A8491] pt-3">최근 3개월의 팀을 떠올리며 답해 주세요.</p>
              {HEALTH_ITEMS.map(item => (
                <Q key={item.id} title={item.text}>
                  <div className="flex flex-wrap gap-1.5">
                    {HEALTH_SCALE.map(s => <button key={s.value} type="button" onClick={() => setA(prev => ({ ...prev, health: { ...prev.health, [item.id]: s.value } }))} className={chip(a.health[item.id] === s.value)}>{s.label}</button>)}
                  </div>
                </Q>
              ))}
              {FRICTION_ITEMS.map(f => (
                <Q key={f.key} title={f.text}>
                  <div className="flex flex-wrap gap-1.5">
                    {FRICTION_SCALE.map(s => <button key={s.value} type="button" onClick={() => setA(prev => ({ ...prev, friction: { ...prev.friction, [f.key]: s.value } }))} className={chip(a.friction[f.key] === s.value)}>{s.label}</button>)}
                  </div>
                </Q>
              ))}
              <Q title="위 경험을 한 줄로 남겨도 됩니다 (선택)" hint="특정 사람을 지목하기보다 상황과 방식을 적어 주세요. 실명으로 공개됩니다.">
                <Note value={a.friction_note} onChange={v => setA(prev => ({ ...prev, friction_note: v }))} placeholder="예: 급한 피드백이 메신저로만 오가서 맥락을 놓쳤다" />
              </Q>
            </>
          )}

          {step === 2 && (
            <>
              <Q title="지금 우리 팀이 잘하고 있는 것" hint={`1~${STRENGTH_MAX}개`}>
                <div className="flex flex-wrap gap-1.5">
                  {STRENGTH_OPTIONS.map(o => {
                    const active = a.strengths.includes(o.key)
                    const full = !active && a.strengths.length >= STRENGTH_MAX
                    return <button key={o.key} type="button" disabled={full} onClick={() => setA(prev => ({ ...prev, strengths: toggle(prev.strengths, o.key, STRENGTH_MAX) }))} className={chip(active, full)}>{o.label}</button>
                  })}
                </div>
              </Q>
              {withKeep ? (
                <Q title="앞으로도 꼭 지켜야 할 우리 팀 행동" hint={`1~${KEEP_MAX}개 · 지금 잘하는 것과 같아도, 달라도 됩니다`}>
                  <div className="flex flex-wrap gap-1.5">
                    {KEEP_OPTIONS.map(o => {
                      const keep = a.keep ?? []
                      const active = keep.includes(o.key)
                      const full = !active && keep.length >= KEEP_MAX
                      return <button key={o.key} type="button" disabled={full} onClick={() => setA(prev => ({ ...prev, keep: toggle(prev.keep ?? [], o.key, KEEP_MAX) }))} className={chip(active, full)}>{o.label}</button>
                    })}
                  </div>
                  <div className="mt-2"><Note value={a.keep_note} onChange={v => setA(prev => ({ ...prev, keep_note: v }))} placeholder="구체적인 행동으로 적어도 좋아요 (선택) — 예: 결정한 건 회의 당일 한 줄로 남기기" /></div>
                </Q>
              ) : (
                <Q title="앞으로도 꼭 유지했으면 하는 우리 팀 행동 (선택)">
                  <Note value={a.keep_note} onChange={v => setA(prev => ({ ...prev, keep_note: v }))} placeholder="예: 결정한 건 회의 당일 한 줄로 남기기" />
                </Q>
              )}
              <Q title="함께 바꾸거나 새로 시도했으면 하는 것" hint={`0~${CHANGE_MAX}개`}>
                <div className="flex flex-wrap gap-1.5">
                  {CHANGE_OPTIONS.map(o => {
                    const active = a.change.includes(o.key)
                    const full = !active && a.change.length >= CHANGE_MAX
                    return <button key={o.key} type="button" disabled={full} onClick={() => setA(prev => ({ ...prev, change: toggle(prev.change, o.key, CHANGE_MAX) }))} className={chip(active, full)}>{o.label}</button>
                  })}
                </div>
                <div className="mt-2"><Note value={a.change_note} onChange={v => setA(prev => ({ ...prev, change_note: v }))} placeholder="기타 — 직접 적기 (선택)" /></div>
              </Q>
            </>
          )}
        </div>

        <div className="flex-shrink-0 px-5 py-3 border-t border-[#EEF0F2]">
          {(showErrors && errors.length > 0) && <p className="text-[11.5px] text-red-500 mb-2">{errors[0]}{errors.length > 1 ? ` 외 ${errors.length - 1}건` : ''}</p>}
          {serverError && <p className="text-[11.5px] text-red-500 mb-2">{serverError}</p>}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] text-[#7A8491]">{errors.length ? `남은 필수 항목 ${errors.length}건` : '모든 필수 항목을 답했습니다'}</span>
            <div className="flex gap-2">
              {step > 0 && <button onClick={() => setStep(step - 1)} className="text-[13px] font-medium text-[#5B6472] px-3 py-2">이전</button>}
              {step < 2 ? (
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
