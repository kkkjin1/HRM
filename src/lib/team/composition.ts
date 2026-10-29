// 팀 조합·역학 분석 — 개인 5명을 나열하지 않고 "팀 하나"로 읽는다.
// 원칙: ① 개인 간 궁합 점수·우열 평가를 만들지 않는다(팀 단위 분포와 근거만).
//       ② 성향 차이(잠재 가설)와 R0에서 직접 답한 경험(실제)을 섞지 않는다.
//       ③ 모든 결과에 근거(어떤 문항·누가 몇 명)를 붙인다.

import { WORK_STYLE_QUESTIONS, labelOf, type WorkStyleQuestionKey } from '@/lib/workStyle'
import { HEALTH_LAYERS, layerScoresFromSummary, type LayerScore } from '@/lib/teamHealth'
import { traitLabel } from '@/lib/johari'
import {
  CHANGE_OPTIONS, FRICTION_ITEMS, STRENGTH_OPTIONS, WS_DIMENSIONS, isV3Result, type AnyRoundResult, type Counts,
} from '@/lib/team/r0'
import { FRICTION_V3_ITEMS, NA, type RoundResultV3 } from '@/lib/team/r0v3'

export type Person = { id: string; name: string }
export type Profile = {
  when_stuck: string | null; feedback_pref: string | null; focus_time: string | null; meeting_pref: string | null
  gives_tags: string[]; needs_tags: string[]
}

// "기대하는 것"을 팀 안에서 채울 수 있는 "보태는 것" — 연결 기준을 화면에도 그대로 보여 준다(임의 점수가 아니라 명시된 규칙).
export const NEED_SUPPLY_MAP: Record<string, string[]> = {
  '명확한 방향': ['기획력', '추진력'],
  '빠른 피드백': ['관계/소통', '실행력'],
  '공감/지지': ['관계/소통', '조율/중재'],
  '기술적 도움': ['전문성', '분석력'],
  '의사결정 지원': ['분석력', '기획력'],
  '업무 분담': ['조율/중재', '추진력'],
  '정보 공유': ['정리/문서화', '관계/소통'],
  // '자율성'은 동료가 채우는 능력이라기보다 팀 운영 방식의 문제라 연결하지 않는다.
}

// 같은 차원에서 선택이 갈릴 때 생길 수 있는 장면 — "가설"로만 쓴다(실제 마찰은 R0 응답으로 따로 본다). 단정 표현을 쓰지 않는다.
export const FRICTION_HYPOTHESIS: Record<WorkStyleQuestionKey, string> = {
  feedback_pref: '같은 피드백도 받는 사람이 원하는 방식(직접·부드럽게·글로)에 따라 다르게 전달될 수 있습니다.',
  when_stuck: '혼자 먼저 씨름하는 사람과 바로 공유하는 사람 사이에서 "왜 이제 말했지 / 왜 벌써 물어보지"가 생길 수 있습니다.',
  meeting_pref: '아젠다를 미리 원하는 사람과 즉흥 논의가 편한 사람 사이에서 회의 준비 기대가 엇갈릴 수 있습니다.',
  focus_time: '집중 시간대가 달라 회의·연락 시점이 누군가의 몰입 시간과 겹칠 수 있습니다.',
}

export type Group = { value: string; label: string; memberIds: string[] }
export type Dimension = { key: WorkStyleQuestionKey; title: string; icon: string; groups: Group[]; answered: number }

export type FrictionExperience = { key: WorkStyleQuestionKey; experienced: number; frequent: number; n: number; counts: Counts }
export type CheckKind = 'watch' | 'latent' | 'other_cause' | 'stable'
export type DimensionCheck = {
  key: WorkStyleQuestionKey; title: string
  differs: boolean                 // 잠재: 팀 안에서 선택이 갈리는가
  experience: FrictionExperience | null   // 실제: R0에서 불편을 경험했다고 답한 인원(R0 전이면 null)
  kind: CheckKind | null           // R0 전이면 null(판단 보류)
  hypothesis: string
}

export type TeamAnalysis = {
  n: number
  source: 'r0' | 'profile'
  dimensions: Dimension[]
  common: { key: WorkStyleQuestionKey; title: string; icon: string; group: Group; n: number }[]
  diverse: Dimension[]
  topGives: Group[]
  complements: { need: string; demand: string[]; supply: { tag: string; memberIds: string[] }[] }[]
  unmetNeeds: { need: string; demand: string[] }[]
  emptyGives: string[]
  checks: DimensionCheck[]
  // r0-v3 회차면 v3 집계(구버전 experience는 null) — 화면은 버전에 맞는 근거 표를 그린다
  v3: RoundResultV3 | null
  experience: null | {
    n: number
    layers: LayerScore[]
    strengths: { key: string; label: string; count: number }[]
    change: { key: string; label: string; count: number }[]
    peerTraits: { key: string; label: string; count: number }[]
    friction: FrictionExperience[]
  }
}

const sortGroups = (g: Group[]) => g.sort((a, b) => b.memberIds.length - a.memberIds.length || a.label.localeCompare(b.label))

export function buildDimensions(people: Person[], profiles: Record<string, Profile | undefined>): Dimension[] {
  return WORK_STYLE_QUESTIONS.map(q => {
    const groups: Group[] = q.options.map(o => ({
      value: o.value, label: o.label,
      memberIds: people.filter(p => profiles[p.id]?.[q.key] === o.value).map(p => p.id),
    })).filter(g => g.memberIds.length > 0)
    return { key: q.key, title: q.label, icon: q.icon, groups: sortGroups(groups), answered: groups.reduce((s, g) => s + g.memberIds.length, 0) }
  })
}

function tagGroups(people: Person[], profiles: Record<string, Profile | undefined>, field: 'gives_tags' | 'needs_tags') {
  const map = new Map<string, string[]>()
  for (const p of people) for (const t of profiles[p.id]?.[field] ?? []) map.set(t, [...(map.get(t) ?? []), p.id])
  return map
}

// 실제 마찰 경험 — 차원별 "1번 이상 겪은 인원". v3는 C01~C04를 같은 장면의 WorkStyle 차원에 이어 세고,
// '경험·관찰할 기회 없음'은 분모(n)에서 뺀다. 잦음 = v2 '몇 번'·'자주' / v3 '2~3회'·'4회 이상'.
function frictionOf(result: AnyRoundResult): FrictionExperience[] {
  if (isV3Result(result)) {
    return WS_DIMENSIONS.map(dim => {
      const it = FRICTION_V3_ITEMS.find(f => f.dim === dim)!
      const c = result.friction[it.key] ?? {}
      const at = (min: number) => Object.entries(c).filter(([v]) => v !== NA && Number(v) >= min).reduce((s, [, k]) => s + k, 0)
      return { key: dim, experienced: at(1), frequent: at(2), n: Object.entries(c).filter(([v]) => v !== NA).reduce((s, [, k]) => s + k, 0), counts: c }
    })
  }
  return FRICTION_ITEMS.map(f => {
    const c = result.friction[f.key] ?? {}
    const at = (min: number) => Object.entries(c).filter(([v]) => Number(v) >= min).reduce((s, [, k]) => s + k, 0)
    return { key: f.key, experienced: at(1), frequent: at(2), n: Object.values(c).reduce((s, k) => s + k, 0), counts: c }
  })
}

const ranked = (c: Counts, label: (k: string) => string) =>
  Object.entries(c).filter(([, v]) => v > 0).map(([key, count]) => ({ key, label: label(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

// 성향 차이(잠재) × 실제 경험(R0) 2×2 — 판정이 아니라 "어디를 먼저 확인할지"의 분류.
export function classify(differs: boolean, exp: FrictionExperience | null): CheckKind | null {
  if (!exp) return null
  if (exp.experienced > 0) return differs ? 'watch' : 'other_cause'
  return differs ? 'latent' : 'stable'
}

export function analyzeTeam(input: { people: Person[]; profiles: Record<string, Profile | undefined>; result: AnyRoundResult | null }): TeamAnalysis {
  const { people, profiles, result } = input
  const n = people.length
  const dimensions = buildDimensions(people, profiles)

  // 공통: 응답한 사람의 과반이 같은 선택(2명 이상)
  const common = dimensions.flatMap(d => {
    const top = d.groups[0]
    return top && top.memberIds.length >= 2 && top.memberIds.length * 2 > d.answered
      ? [{ key: d.key, title: d.title, icon: d.icon, group: top, n: d.answered }] : []
  })
  const diverse = dimensions.filter(d => d.groups.length >= 2)

  const gives = tagGroups(people, profiles, 'gives_tags')
  const needs = tagGroups(people, profiles, 'needs_tags')
  const topGives = sortGroups([...gives].map(([tag, ids]) => ({ value: tag, label: tag, memberIds: ids }))).slice(0, 5)

  const complements: TeamAnalysis['complements'] = []
  const unmetNeeds: TeamAnalysis['unmetNeeds'] = []
  for (const [need, demand] of [...needs].sort((a, b) => b[1].length - a[1].length)) {
    const supply = (NEED_SUPPLY_MAP[need] ?? [])
      .map(tag => ({ tag, memberIds: (gives.get(tag) ?? []).filter(id => !demand.includes(id) || demand.length > 1) }))
      .filter(s => s.memberIds.length > 0)
    if (!(need in NEED_SUPPLY_MAP)) continue
    if (supply.length) complements.push({ need, demand, supply })
    else unmetNeeds.push({ need, demand })
  }
  const allGives = new Set([...gives.keys()])
  const demandedTags = new Set(Object.entries(NEED_SUPPLY_MAP).filter(([need]) => needs.has(need)).flatMap(([, tags]) => tags))
  const emptyGives = [...demandedTags].filter(t => !allGives.has(t))

  const friction = result ? frictionOf(result) : null
  const checks: DimensionCheck[] = WS_DIMENSIONS.map(key => {
    const d = dimensions.find(x => x.key === key)!
    const differs = d.groups.length >= 2
    const exp = friction?.find(f => f.key === key) ?? null
    return { key, title: d.title, differs, experience: exp, kind: classify(differs, exp), hypothesis: FRICTION_HYPOTHESIS[key] }
  })

  return {
    n, source: result ? 'r0' : 'profile', dimensions, common, diverse, topGives,
    complements, unmetNeeds, emptyGives, checks,
    v3: isV3Result(result) ? result : null,
    experience: result && !isV3Result(result) ? {
      n: result.n,
      layers: layerScoresFromSummary(result.health),
      strengths: ranked(result.strengths, k => STRENGTH_OPTIONS.find(o => o.key === k)?.label ?? k),
      change: ranked(result.change, k => CHANGE_OPTIONS.find(o => o.key === k)?.label ?? k),
      peerTraits: ranked(result.johari.peer, traitLabel).slice(0, 6),
      friction: friction!,
    } : null,
  }
}

export function profileChips(p: Profile | undefined) {
  if (!p) return []
  return WORK_STYLE_QUESTIONS.flatMap(q => {
    const label = labelOf(q.key, p[q.key])
    return label ? [{ key: q.key, icon: q.icon, label }] : []
  })
}

export function lowestLayer(layers: LayerScore[]) {
  const scored = layers.filter(l => l.responses > 0)
  return scored.length ? scored.reduce((lo, l) => (l.score < lo.score ? l : lo)) : null
}

export const LAYER_ORDER = HEALTH_LAYERS.map(l => l.key)
