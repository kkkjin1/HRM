// 팀 역학 해석 — 다수결 순위가 아니라 여러 응답을 교차해 "발견"을 만든다.
// 원칙
//   ① 발견마다 관찰된 사실 / 가능한 해석 / 반대되거나 다른 경험 / 확인할 질문을 나눠 담는다.
//   ② 소수(1명) 응답도 버리지 않되 "단일 응답"으로 표시하고 팀 전체 문제로 일반화하지 않는다.
//   ③ 연관돼 보여도 인과로 단정하지 않는다. 근거가 없으면 해석을 만들지 않는다(interpretation = null).
//   ⑤ 응답 수로 중요도·우선순위를 정하지 않는다. 근거 유형(공통·소수·인식 불일치·복합)과 확인할 질문만 제시하고, 개선 주제는 팀이 정한다.
//   ⑥ 서로 다른 문항의 결과가 다르다고 모순으로 보지 않고, 유지·개선이 같은 영역에 있어도 충돌로 보지 않는다.
//   ④ 모든 근거는 응답 항목 id(ref)로 원본에 되짚어 갈 수 있다 — 예: "m3:friction.feedback_pref".
// 모든 규칙은 이 파일에 명시돼 있고 숨은 점수·가중치는 없다.

import { WORK_STYLE_QUESTIONS, labelOf, type WorkStyleQuestionKey } from '@/lib/workStyle'
import { HEALTH_ITEMS, HEALTH_LAYERS, itemScore, type HealthLayerKey } from '@/lib/teamHealth'
import { traitLabel } from '@/lib/johari'
import type { PlanV3 } from '@/lib/team/insightsV3'
import {
  BEHAVIOR_LINKS, CHANGE_OPTIONS, FRICTION_ITEMS, FRICTION_SCALE, KEEP_OPTIONS, STRENGTH_OPTIONS,
  type R0Answers,
} from '@/lib/team/r0'

export type Basis = 'majority' | 'some' | 'single'
// 근거 유형 — 어떤 종류의 근거가 있는지만 보여 준다(중요도·순위 아님).
export type SignalType = 'common' | 'minority' | 'mismatch' | 'composite'
export const SIGNAL_LABEL: Record<SignalType, string> = { common: '공통 신호', minority: '소수 신호', mismatch: '인식 불일치', composite: '복합 신호' }
export const SIGNAL_DESC: Record<SignalType, string> = {
  common: '여러 사람(2명 이상)이 비슷한 경험을 답함',
  minority: '1명의 응답이지만 구체적(서술을 남김)이거나 반복적(‘자주’·‘4회 이상’)인 경험 — 검토 후보가 될 수 있지만 팀 전체 문제로 일반화하지 않음',
  mismatch: '같은 팀 상황을 서로 상반되게 평가함(같은 문항·영역을 낮게(2점 이하, 구 문항 2.5점 이하) 본 사람과 4점 이상으로 본 사람이 함께 있음) — 어느 쪽이 맞는지 판정하지 않음',
  composite: '서로 다른 진단 항목이 같은 영역을 다른 관점에서 가리킴 — 인과 관계를 뜻하지 않음',
}
export type Evidence = { ref: string; text: string }
export type FindingKind =
  | 'shared_strength' | 'strength_score_gap' | 'blind_strength' | 'need_unmet_signal'
  | 'friction_cluster' | 'friction_common' | 'minority_signal' | 'perception_split'
  | 'keep_change_same_area' | 'change_review'
  // r0-v3 (insightsV3.ts)
  | 'domain_strength' | 'success_pattern' | 'pref_behavior_link'
  | 'need_support_gap' | 'need_support_match'
  | 'behavior_split' | 'friction_shared' | 'friction_minority' | 'strength_friction_coexist'
  | 'keep_success_link' | 'improve_review' | 'keep_improve_same_area' | 'friction_not_raised'
export type Finding = {
  id: string
  section: 1 | 2 | 3 | 4
  kind: FindingKind
  title: string
  basis: Basis                  // 응답 수(사실) — 중요도가 아니다
  signals: SignalType[]         // 근거 유형
  observed: Evidence[]          // 관찰된 사실(응답 그대로)
  interpretation: string | null // 가능한 해석(가설) — 근거가 약하면 null
  counter: Evidence[]           // 반대되거나 다른 경험
  question: string              // 팀이 함께 확인할 질문
  brief?: string                // 한 줄 사실 요약(사람·숫자) — 핵심 역학 요약(coreThemesV3)이 쓴다. 해석이 아니다
}
export type NoteGroup = {
  field: 'friction_note' | 'keep_note' | 'change_note' | 'growth_edge' | 'team_request'
    | 'friction_case' | 'success' | 'keep_other' | 'improve' | 'perspective'  // r0-v3
  title: string; items: Evidence[]
}
// 근거가 부족해 해석을 보류한 지점(r0-v3) — 숨기지 않고 "왜 해석하지 않았는지"를 남긴다.
// level: held = 해석하지 않음(유효 응답 부족 등) / caution = 해석은 했지만 함께 알아 둘 한계(관찰 기회 적음·합류 4주 미만 등)
export type Held = { ref: string; topic: string; reason: string; level: 'held' | 'caution' }
export type TeamPlan = {
  keep: { key: string; label: string; memberIds: string[]; refs: string[]; layerScore: number | null; layer: string | null; alsoChange: string[] }[]
  // 개선 희망은 모두 "팀 검토 후보" — 근거 유형만 붙이고 순서는 문항 순서(우선순위 아님). 주제 선정은 다음 단계에서 팀이 한다.
  change: { key: string; label: string; memberIds: string[]; refs: string[]; evidence: Evidence[]; signals: SignalType[] }[]
}
export type Insights = { findings: Finding[]; notes: NoteGroup[]; plan: TeamPlan; questions: string[]; held?: Held[]; planV3?: PlanV3 }

type Resp = { member_id: string; answers: R0Answers }
type Ctx = { nameOf: (id: string) => string; responses: Resp[] }

const DIM: Record<string, { title: string; icon: string }> = Object.fromEntries(WORK_STYLE_QUESTIONS.map(q => [q.key, { title: q.label, icon: q.icon }]))
const LAYER = Object.fromEntries(HEALTH_LAYERS.map(l => [l.key, l]))
const optLabel = (opts: readonly { key: string; label: string }[], k: string) => opts.find(o => o.key === k)?.label ?? k
const frictionLabel = (v: number) => FRICTION_SCALE.find(s => s.value === v)?.label ?? String(v)
const majority = (k: number, n: number) => k * 2 > n
// 받침에 따라 을/를·이/가·과/와·은/는을 고른다(따옴표·괄호 등 뒤 문자는 건너뜀).
export function josa(word: string, pair: '을/를' | '이/가' | '과/와' | '은/는') {
  const ch = [...word.replace(/[’'"”)\]\s]+$/, '')].pop() ?? ''
  const code = ch.charCodeAt(0) - 0xac00
  const hasFinal = code >= 0 && code <= 11171 ? code % 28 !== 0 : false
  const [withFinal, without] = pair.split('/')
  return word + (hasFinal ? withFinal : without)
}
const q = (label: string) => `‘${label}’`
export const basisOf = (k: number, n: number): Basis => (k <= 1 ? 'single' : majority(k, n) ? 'majority' : 'some')
const names = (ids: string[], c: Ctx) => ids.map(c.nameOf).join(', ')

// 개인별 층 점수(역채점 반영, 두 문항 평균) — 같은 층을 사람마다 어떻게 보는지 비교하는 데 쓴다.
export function personLayerScore(a: R0Answers, layer: HealthLayerKey) {
  const vals = HEALTH_ITEMS.filter(i => i.layer === layer).map(i => a.health[i.id]).filter(v => typeof v === 'number' && v > 0)
  if (!vals.length) return null
  const items = HEALTH_ITEMS.filter(i => i.layer === layer)
  return items.reduce((s, i) => s + (a.health[i.id] ? itemScore(i, a.health[i.id]) : 0), 0) / vals.length
}
const teamLayerScore = (rs: Resp[], layer: HealthLayerKey) => {
  const v = rs.map(r => personLayerScore(r.answers, layer)).filter((x): x is number => x !== null)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}
const fmt = (x: number | null) => (x === null ? '-' : x.toFixed(1))
// 기대(needs_tags) 중 불편 차원과 같은 영역을 가리키는 것
const NEED_DIM: Record<string, WorkStyleQuestionKey> = { '빠른 피드백': 'feedback_pref', '정보 공유': 'when_stuck' }

export function buildInsights(input: { responses: Resp[]; nameOf: (id: string) => string }): Insights {
  const c: Ctx = { nameOf: input.nameOf, responses: input.responses }
  const rs = input.responses
  const n = rs.length
  const findings: Finding[] = []
  if (n === 0) return { findings, notes: [], plan: { keep: [], change: [] }, questions: [] }

  const layerAvg = Object.fromEntries(HEALTH_LAYERS.map(l => [l.key, teamLayerScore(rs, l.key)])) as Record<HealthLayerKey, number | null>
  const scored = Object.values(layerAvg).filter((x): x is number => x !== null)
  const overall = scored.length ? scored.reduce((s, x) => s + x, 0) / scored.length : null
  const pickers = (field: 'strengths' | 'keep' | 'change', key: string) => rs.filter(r => (r.answers[field] ?? []).includes(key)).map(r => r.member_id)
  // 같은 층을 2.5점 이하로 본 사람(lo)과 4점 이상으로 본 사람(hi) — 둘 다 있으면 인식 불일치
  const layerSplit = (layer: HealthLayerKey) => {
    const per = rs.map(r => ({ id: r.member_id, s: personLayerScore(r.answers, layer) })).filter((x): x is { id: string; s: number } => x.s !== null)
    return { lo: per.filter(x => x.s <= 2.5), hi: per.filter(x => x.s >= 4) }
  }
  const hurtIn = (dim: WorkStyleQuestionKey) => rs.filter(r => (r.answers.friction[dim] ?? 0) >= 1)
  // 불편 서술(friction_note)은 차원을 고르지 않는 문항이라, 그 사람이 불편을 답한 차원이 하나뿐일 때만 그 차원에 잇는다.
  const noteFor = (r: Resp, dim: WorkStyleQuestionKey) => {
    const dims = FRICTION_ITEMS.filter(f => (r.answers.friction[f.key] ?? 0) >= 1).map(f => f.key)
    return r.answers.friction_note && dims.length === 1 && dims[0] === dim ? r.answers.friction_note : null
  }
  const concrete = (r: Resp, dim: WorkStyleQuestionKey) => r.answers.friction[dim] === 3 || !!noteFor(r, dim)
  const noteEvidence = (r: Resp, dim: WorkStyleQuestionKey): Evidence[] => {
    const v = noteFor(r, dim)
    return v ? [{ ref: `${r.member_id}:friction_note`, text: `${c.nameOf(r.member_id)}의 서술: “${v}”` }] : []
  }

  // ── ① 공통 강점: 다수가 꼽은 강점과 관련 기능 점수를 나란히 본다(서로 다른 문항 — 다르다고 모순은 아님) ──
  for (const o of STRENGTH_OPTIONS) {
    const who = pickers('strengths', o.key)
    if (!majority(who.length, n)) continue
    const layer = BEHAVIOR_LINKS[o.key]?.layer
    const score = layer ? layerAvg[layer] : null
    const observed: Evidence[] = [{ ref: `team:strengths.${o.key}`, text: `${josa(q(o.label), '을/를')} 강점으로 꼽음 ${who.length}/${n}명 (${names(who, c)})` }]
    if (layer && score !== null) observed.push({ ref: `team:health.${layer}`, text: `관련 기능 ‘${LAYER[layer].name}’ 팀 평균 ${fmt(score)}점 (5개 층 평균 ${fmt(overall)}점)` })
    const split = layer ? layerSplit(layer) : { lo: [], hi: [] }
    const counter = split.lo.map(x => ({ ref: `${x.id}:health.${layer}`, text: `${c.nameOf(x.id)}: ‘${LAYER[layer!].name}’ ${fmt(x.s)}점` }))
    const mismatch: SignalType[] = split.lo.length && split.hi.length ? ['mismatch'] : []
    if (layer && score !== null && overall !== null && score + 1e-9 < overall) {
      findings.push({
        id: `strength_gap:${o.key}`, section: 1, kind: 'strength_score_gap', basis: 'majority', signals: ['common', ...mismatch],
        title: `강점으로 꼽힌 ${q(o.label)} — 관련 기능 점수는 다른 층보다 낮게 나왔습니다`,
        observed, counter,
        interpretation: '서로 다른 문항이라 결과가 다를 수 있고, 모순을 뜻하지 않습니다. 기대 수준이 높아 점수를 엄격하게 줬거나, 잘 되는 장면과 아쉬운 장면이 함께 있을 수 있습니다 — 어느 쪽인지는 응답만으로 알 수 없습니다.',
        question: `${josa(q(o.label), '이/가')} 잘 되는 장면과 잘 안 되는 장면은 각각 언제인가요?`,
      })
    } else {
      const agree = !!(layer && score !== null)
      findings.push({
        id: `shared_strength:${o.key}`, section: 1, kind: 'shared_strength', basis: 'majority', signals: ['common', ...(agree ? ['composite' as const] : []), ...mismatch],
        title: `${josa(q(o.label), '은/는')} 팀이 함께 인정하는 강점으로 보입니다`,
        observed, counter,
        interpretation: agree ? '강점 선택과 관련 기능 점수가 같은 방향을 가리킵니다(서로 다른 두 문항이 일치).' : null,
        question: `${josa(q(o.label), '이/가')} 계속 유지되려면 무엇이 필요할까요? 새로 온 사람에게는 어떻게 전할까요?`,
      })
    }
  }

  // ① 동료가 본 강점을 본인은 꼽지 않음(조하리 R0, 2명 이상 동료가 고른 형용사만)
  for (const target of rs) {
    const self = new Set(target.answers.jh_self)
    const counts = new Map<string, string[]>()
    for (const r of rs) {
      if (r.member_id === target.member_id) continue
      for (const t of r.answers.jh_peers?.[target.member_id] ?? []) counts.set(t, [...(counts.get(t) ?? []), r.member_id])
    }
    const blind = [...counts].filter(([t, who]) => who.length >= 2 && !self.has(t))
    if (!blind.length) continue
    findings.push({
      id: `blind:${target.member_id}`, section: 1, kind: 'blind_strength', basis: 'some', signals: ['common'],
      title: `${c.nameOf(target.member_id)} — 동료 여러 명이 본 강점을 본인은 꼽지 않았습니다`,
      observed: blind.map(([t, who]) => ({ ref: `team:jh_peers.${target.member_id}`, text: `‘${traitLabel(t)}’ — 동료 ${who.length}명 (${names(who, c)})` })),
      counter: [{ ref: `${target.member_id}:jh_self`, text: `본인이 고른 말: ${target.answers.jh_self.map(traitLabel).join(', ')}` }],
      interpretation: '본인이 의식하지 못하는 강점일 수도, 특정 업무에서만 보인 모습일 수도 있습니다. 고르지 않았다고 부정한 것은 아닙니다.',
      question: `동료들은 어떤 장면에서 이 모습을 봤나요? 본인은 어떻게 느끼나요?`,
    })
  }

  // ── ② 보완 가능성 ↔ 실제 경험: 기대를 말한 사람이 관련 불편도 답했나(서로 다른 두 문항 → 복합 신호) ──────
  for (const [need, dim] of Object.entries(NEED_DIM)) {
    const askers = rs.filter(r => r.answers.ws.needs_tags.includes(need))
    if (!askers.length) continue
    const hurt = askers.filter(r => (r.answers.friction[dim] ?? 0) >= 1)
    if (!hurt.length) continue
    const signals: SignalType[] = ['composite', ...(hurt.length >= 2 ? ['common' as const] : concrete(hurt[0], dim) ? ['minority' as const] : [])]
    findings.push({
      id: `need_unmet:${need}`, section: 2, kind: 'need_unmet_signal', basis: basisOf(hurt.length, n), signals,
      title: `${josa(q(need), '을/를')} 기대한 사람이 관련 불편도 답했습니다`,
      observed: [
        ...askers.map(r => ({ ref: `${r.member_id}:ws.needs_tags`, text: `${c.nameOf(r.member_id)}: ${josa(q(need), '을/를')} 기대` })),
        ...hurt.map(r => ({ ref: `${r.member_id}:friction.${dim}`, text: `${c.nameOf(r.member_id)}: ${DIM[dim].title} 불편 ‘${frictionLabel(r.answers.friction[dim])}’` })),
        ...hurt.flatMap(r => noteEvidence(r, dim)),
      ],
      counter: askers.filter(r => !hurt.includes(r)).map(r => ({ ref: `${r.member_id}:friction.${dim}`, text: `${c.nameOf(r.member_id)}: 같은 기대가 있지만 불편은 ‘없었다’` })),
      interpretation: '두 응답이 같은 영역을 가리킵니다. 그 기대가 아직 채워지지 않고 있을 수 있지만, 이유는 응답만으로 알 수 없습니다.',
      question: `${josa(q(need), '이/가')} 필요할 때 지금은 누구에게, 어떻게 요청하고 있나요?`,
    })
  }

  // ── ③ 실제 경험의 교차 ─────────────────────────────────────────────────────
  for (const f of FRICTION_ITEMS) {
    const dim = f.key
    const hurt = hurtIn(dim)
    if (!hurt.length) continue
    const prefs = new Map<string, string[]>()
    rs.forEach(r => prefs.set(r.answers.ws[dim], [...(prefs.get(r.answers.ws[dim]) ?? []), r.member_id]))
    const hurtPrefs = new Set(hurt.map(r => r.answers.ws[dim]))
    const top = [...prefs].sort((a, b) => b[1].length - a[1].length)[0]
    const observed = hurt.map(r => ({ ref: `${r.member_id}:friction.${dim}`, text: `${c.nameOf(r.member_id)} (${labelOf(dim, r.answers.ws[dim])} 선호): 불편 ‘${frictionLabel(r.answers.friction[dim])}’` }))
    const counter = rs.filter(r => !hurt.includes(r)).map(r => ({ ref: `${r.member_id}:friction.${dim}`, text: `${c.nameOf(r.member_id)} (${labelOf(dim, r.answers.ws[dim])} 선호): 불편 없었다` }))
    if (hurt.length >= 2) {
      const notes = hurt.flatMap(r => noteEvidence(r, dim))
      if (prefs.size >= 2 && hurtPrefs.size === 1 && top && !hurtPrefs.has(top[0])) {
        findings.push({
          id: `friction_cluster:${dim}`, section: 3, kind: 'friction_cluster', basis: basisOf(hurt.length, n), signals: ['common'],
          title: `${DIM[dim].title} — 불편을 답한 ${hurt.length}명이 모두 다수와 다른 방식을 선호합니다`,
          observed: [...observed, { ref: `team:ws.${dim}`, text: `팀 다수 선호: ${labelOf(dim, top[0])} ${top[1].length}명` }, ...notes],
          counter,
          interpretation: '다수의 방식이 자연스럽게 기본값이 되면서 다른 방식을 선호하는 사람이 불편을 겪고 있을 수 있습니다. 응답 수가 적어 우연일 수도 있습니다.',
          question: `‘${DIM[dim].title}’ 영역에서 서로 다른 선호를 함께 존중하는 방법은 무엇일까요?`,
        })
      } else {
        findings.push({
          id: `friction_common:${dim}`, section: 3, kind: 'friction_common', basis: basisOf(hurt.length, n), signals: ['common'],
          title: prefs.size === 1
            ? `${DIM[dim].title} — 선호는 같은데 ${hurt.length}명이 불편을 답했습니다`
            : hurtPrefs.size >= 2
              ? `${DIM[dim].title} — 선호가 서로 다른 ${hurt.length}명이 모두 불편을 답했습니다`
              : `${DIM[dim].title} — 다수 선호 쪽에서도 ${hurt.length}명이 불편을 답했습니다`,
          observed: [...observed, ...notes], counter,
          interpretation: prefs.size === 1
            ? '방식 선호의 차이만으로는 설명되지 않을 수 있습니다. 업무량·일정·특정 상황 같은 다른 맥락을 함께 봐야 합니다.'
            : '특정 선호 그룹만의 경험이라기보다, 이 영역에서 함께 정해 둔 약속이 아직 없는 상태일 수 있습니다.',
          question: prefs.size === 1
            ? `‘${DIM[dim].title}’ 영역에서 최근 불편했던 장면은 구체적으로 어떤 상황이었나요?`
            : `‘${DIM[dim].title}’ 영역에서 팀이 함께 정해 둘 최소한의 약속이 있을까요?`,
        })
      }
    } else if (concrete(hurt[0], dim)) {
      // 1명뿐이지만 '자주'이거나 서술을 남긴 경험 — 숫자에 묻히지 않게 따로 남긴다(일반화 금지).
      const r = hurt[0]
      const often = r.answers.friction[dim] === 3
      findings.push({
        id: `minority:${dim}:${r.member_id}`, section: 3, kind: 'minority_signal', basis: 'single', signals: ['minority'],
        title: `${DIM[dim].title} — 한 사람이 ${often ? '‘자주’ 불편했다고' : '구체적인 불편 경험을'} 답했습니다`,
        observed: [observed[0], ...noteEvidence(r, dim)],
        counter,
        interpretation: '팀 전체의 문제로 일반화할 근거는 없습니다. 다만 한 사람에게는 반복되거나 구체적인 경험이라, 팀이 검토할 후보로 따로 표시합니다.',
        question: '당사자가 원한다면, 이 경험을 팀이 함께 듣고 이해하는 자리가 필요할까요?',
      })
    }
    // 1명의 '한두 번'(서술 없음)은 발견으로 만들지 않는다 — 아래 근거 표에 그대로 남는다.
  }

  // ③ 같은 층을 보는 시각이 크게 갈림(개인 점수 최저 ≤2.5, 최고 ≥4) — 어느 쪽이 맞는지 판정하지 않는다
  for (const l of HEALTH_LAYERS) {
    const { lo, hi } = layerSplit(l.key)
    if (!lo.length || !hi.length) continue
    findings.push({
      id: `split:${l.key}`, section: 3, kind: 'perception_split', basis: basisOf(lo.length + hi.length, n), signals: ['mismatch'],
      title: `${josa(q(l.name), '을/를')} 보는 시각이 크게 엇갈립니다`,
      observed: lo.map(x => ({ ref: `${x.id}:health.${l.key}`, text: `${c.nameOf(x.id)}: ${fmt(x.s)}점` })),
      counter: hi.map(x => ({ ref: `${x.id}:health.${l.key}`, text: `${c.nameOf(x.id)}: ${fmt(x.s)}점` })),
      interpretation: `팀 평균(${fmt(layerAvg[l.key])}점)만 보면 가려지는 차이입니다. 어느 쪽이 맞는지 판정할 수 없고, 같은 팀 안에서도 이 영역을 겪는 장면이 서로 다를 수 있습니다.`,
      question: `${q(l.name)}에 대해 서로 다르게 느끼는 이유는 무엇일까요? 각자 떠올린 장면은 무엇인가요?`,
    })
  }

  // ── ④ 유지할 것 / 바꿀 것 ────────────────────────────────────────────────
  const keepSource: 'keep' | 'strengths' = rs.some(r => (r.answers.keep ?? []).length) ? 'keep' : 'strengths'
  const keepOpts = keepSource === 'keep' ? KEEP_OPTIONS : STRENGTH_OPTIONS
  const plan: TeamPlan = { keep: [], change: [] }
  for (const o of keepOpts) {
    const who = pickers(keepSource, o.key)
    if (!who.length) continue
    const link = BEHAVIOR_LINKS[o.key] ?? {}
    const sameArea = CHANGE_OPTIONS.filter(ch => {
      const l2 = BEHAVIOR_LINKS[ch.key] ?? {}
      return (link.layer && l2.layer === link.layer) || (link.dim && l2.dim === link.dim)
    }).filter(ch => pickers('change', ch.key).length > 0).map(ch => ch.key)
    plan.keep.push({
      key: o.key, label: o.label, memberIds: who, refs: who.map(id => `${id}:${keepSource}`),
      layer: link.layer ? LAYER[link.layer].name : null, layerScore: link.layer ? layerAvg[link.layer] : null, alsoChange: sameArea,
    })
    for (const ch of sameArea) {
      const changers = pickers('change', ch)
      findings.push({
        id: `keep_change:${o.key}:${ch}`, section: 4, kind: 'keep_change_same_area', basis: basisOf(Math.min(who.length, changers.length), n), signals: [],
        title: `${q(o.label)} 유지와 ${q(optLabel(CHANGE_OPTIONS, ch))} 개선이 같은 영역에서 함께 나왔습니다`,
        observed: [
          { ref: `team:${keepSource}.${o.key}`, text: `유지/강점: ${names(who, c)}` },
          { ref: `team:change.${ch}`, text: `개선: ${names(changers, c)}` },
        ],
        counter: [],
        interpretation: '충돌을 뜻하지 않습니다. 잘 되는 부분은 지키면서 다른 부분을 보완하자는 뜻일 수 있고, 서로 다른 장면을 떠올리고 답했을 수도 있습니다.',
        question: `${q(o.label)}의 좋은 점은 지키면서 ${josa(q(optLabel(CHANGE_OPTIONS, ch)), '을/를')} 함께 챙기려면 무엇이 필요할까요?`,
      })
    }
  }
  // 개선 희망 — 모두 "팀 검토 후보". 응답 수로 순위를 매기지 않고, 어떤 유형의 근거가 함께 있는지만 붙인다.
  for (const o of CHANGE_OPTIONS) {
    const who = pickers('change', o.key)
    if (!who.length) continue
    const link = BEHAVIOR_LINKS[o.key] ?? {}
    const evidence: Evidence[] = []
    const counter: Evidence[] = []
    const signals = new Set<SignalType>()
    let perspectives = 0 // 개선 희망 외에 같은 영역을 가리키는 다른 진단 항목 수(불편 경험·기대·관련 기능 점수)
    if (who.length >= 2) signals.add('common')
    if (link.dim) {
      const dim = link.dim
      const hurt = hurtIn(dim)
      if (hurt.length) {
        perspectives++
        evidence.push({ ref: `team:friction.${dim}`, text: `${DIM[dim].title} 불편 경험 ${hurt.length}/${n}명 (${names(hurt.map(r => r.member_id), c)})${hurt.length === 1 ? ' · 단일 응답' : ''}` })
        if (hurt.length >= 2) signals.add('common')
        else if (concrete(hurt[0], dim)) { signals.add('minority'); evidence.push(...noteEvidence(hurt[0], dim)) }
      }
      const needs = Object.entries(NEED_DIM).filter(([, d]) => d === dim).map(([need]) => need)
      const askers = rs.filter(r => needs.some(nd => r.answers.ws.needs_tags.includes(nd)))
      if (askers.length) {
        perspectives++
        evidence.push({ ref: `team:ws.needs_tags`, text: `관련 기대(${needs.join('·')}) ${askers.length}명 (${names(askers.map(r => r.member_id), c)})` })
      }
    }
    if (link.layer) {
      const layer = link.layer
      const { lo, hi } = layerSplit(layer)
      const below = overall !== null && layerAvg[layer] !== null && layerAvg[layer]! + 1e-9 < overall
      if (below || lo.length) {
        perspectives++
        evidence.push({ ref: `team:health.${layer}`, text: `관련 기능 ‘${LAYER[layer].name}’ 팀 평균 ${fmt(layerAvg[layer])}점 (5개 층 평균 ${fmt(overall)}점)${lo.length ? ` · 2.5점 이하로 본 사람 ${lo.length}명` : ''}` })
      }
      if (lo.length && hi.length) {
        signals.add('mismatch')
        counter.push(...hi.map(x => ({ ref: `${x.id}:health.${layer}`, text: `${c.nameOf(x.id)}: ‘${LAYER[layer].name}’ ${fmt(x.s)}점` })))
      }
    }
    if (perspectives >= 2) signals.add('composite')
    const sig = (['common', 'minority', 'mismatch', 'composite'] as const).filter(s => signals.has(s))
    plan.change.push({ key: o.key, label: o.label, memberIds: who, refs: who.map(id => `${id}:change`), evidence, signals: sig })
    findings.push({
      id: `change:${o.key}`, section: 4, kind: 'change_review', basis: basisOf(who.length, n), signals: sig,
      title: sig.length
        ? `${q(o.label)} — 함께 검토해 볼 근거가 있습니다`
        : `${q(o.label)} — 바꾸고 싶다는 응답 외에 다른 근거는 아직 없습니다`,
      observed: [{ ref: `team:change.${o.key}`, text: `개선 희망 ${who.length}/${n}명 (${names(who, c)})` }, ...evidence],
      counter,
      interpretation: sig.length
        ? '팀이 함께 검토해 볼 후보입니다. 근거 유형은 중요도나 순위가 아니며, 관련 점수나 불편이 이 행동 때문이라는 뜻도 아닙니다. 실제 개선 주제는 다음 단계에서 팀이 함께 정합니다.'
        : null,
      question: sig.length
        ? `${josa(q(o.label), '이/가')} 필요하다고 느낀 구체적인 장면은 언제였나요? 다른 사람도 비슷한 장면을 겪었나요?`
        : `${josa(q(o.label), '을/를')} 꼽은 이유가 된 구체적인 장면이 있었나요?`,
    })
  }

  // ── 자유서술: 맥락으로 그대로 보존 ───────────────────────────────────────
  const note = (field: NoteGroup['field'], title: string, get: (a: R0Answers) => string | null): NoteGroup => ({
    field, title, items: rs.flatMap(r => { const v = get(r.answers); return v ? [{ ref: `${r.member_id}:${field === 'growth_edge' || field === 'team_request' ? `ws.${field}` : field}`, text: `${c.nameOf(r.member_id)}: “${v}”` }] : [] }),
  })
  const notes = [
    note('friction_note', '불편했던 경험', a => a.friction_note),
    note('keep_note', '꼭 유지했으면 하는 행동', a => a.keep_note),
    note('change_note', '바꾸고 싶은 것(기타)', a => a.change_note),
    note('team_request', '팀에 부탁', a => a.ws.team_request),
    note('growth_edge', '스스로 잘 못한다고 느끼는 것', a => a.ws.growth_edge),
  ].filter(g => g.items.length)

  const questions = [...new Set(findings.map(f => f.question))].slice(0, 8)
  return { findings, notes, plan, questions }
}

export const BASIS_LABEL: Record<Basis, string> = { majority: '다수 응답', some: '일부 응답', single: '단일 응답 · 팀 전체로 일반화 금지' }
export const keepOptionLabel = (k: string) => optLabel(KEEP_OPTIONS, k)
