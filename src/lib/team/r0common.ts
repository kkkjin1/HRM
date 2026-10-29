// 진단 문항 버전(r0-v1·v2·v3)이 함께 쓰는 응답 조각 — "나와 일하는 법"(WorkStyle)·조하리 검증과 집계 도우미.
// 버전마다 묻는 내용은 달라도 이 두 영역은 같은 키·같은 규칙으로 받는다(버전 간 비교의 공통 축).

import { GIVES_TAGS, NEEDS_TAGS, WORK_STYLE_QUESTIONS } from '@/lib/workStyle'
import { JOHARI_MAX, JOHARI_MIN, JOHARI_TRAITS } from '@/lib/johari'

export type Counts = Record<string, number>
export type WsAnswers = {
  when_stuck: string; feedback_pref: string; focus_time: string; meeting_pref: string
  gives_tags: string[]; needs_tags: string[]
  growth_edge: string | null; team_request: string | null
}

export const NOTE_MAX = 300
export const isStr = (v: unknown): v is string => typeof v === 'string'
export const cleanText = (v: unknown, max = NOTE_MAX) => (isStr(v) && v.trim() ? v.trim().slice(0, max) : null)
export const uniq = (a: string[]) => [...new Set(a)]
export const bump = (c: Counts, k: string, by = 1) => { c[k] = (c[k] ?? 0) + by }
export const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>
export const pickKeys = (v: unknown, allowed: readonly string[]) => (Array.isArray(v) ? uniq(v.filter(isStr)).filter(t => allowed.includes(t)) : [])

// 나와 일하는 법 — 4개 차원 필수, 보태는 것·기대하는 것 1개 이상, 서술 2개 선택
export function validateWs(raw: unknown, errors: string[]): WsAnswers {
  const ws = obj(raw)
  const out = {} as WsAnswers
  for (const q of WORK_STYLE_QUESTIONS) {
    const v = ws[q.key]
    if (!isStr(v) || !q.options.some(o => o.value === v)) errors.push(`나와 일하는 법 · ${q.label}을 골라 주세요`)
    else out[q.key] = v
  }
  out.gives_tags = pickKeys(ws.gives_tags, GIVES_TAGS)
  out.needs_tags = pickKeys(ws.needs_tags, NEEDS_TAGS)
  if (out.gives_tags.length === 0) errors.push('보태는 것을 1개 이상 골라 주세요')
  if (out.needs_tags.length === 0) errors.push('기대하는 것을 1개 이상 골라 주세요')
  out.growth_edge = cleanText(ws.growth_edge)
  out.team_request = cleanText(ws.team_request)
  return out
}

// 조하리 — 나를 나타내는 말(required면 필수) + 동료를 나타내는 말(선택, 고르면 사람당 3~6개). 나 자신·명단 밖 대상은 버린다.
export function validateJohari(rawSelf: unknown, rawPeers: unknown, ctx: { selfId: string; peerIds: string[] }, required: boolean, errors: string[]) {
  const traitKeys = JOHARI_TRAITS.map(t => t.key)
  const jhSelf = pickKeys(rawSelf, traitKeys)
  if ((required || jhSelf.length > 0) && (jhSelf.length < JOHARI_MIN || jhSelf.length > JOHARI_MAX)) errors.push(`나를 나타내는 말을 ${JOHARI_MIN}~${JOHARI_MAX}개 골라 주세요`)
  const jhPeers: Record<string, string[]> = {}
  for (const [about, v] of Object.entries(obj(rawPeers))) {
    if (about === ctx.selfId || !ctx.peerIds.includes(about)) continue
    const traits = pickKeys(v, traitKeys)
    if (traits.length === 0) continue
    if (traits.length < JOHARI_MIN || traits.length > JOHARI_MAX) { errors.push(`동료를 나타내는 말은 ${JOHARI_MIN}~${JOHARI_MAX}개로 골라 주세요`); continue }
    jhPeers[about] = traits
  }
  return { jhSelf, jhPeers }
}

export type JohariCounts = { self: Counts; peer: Counts; peer_by_about: Record<string, Counts>; peer_raters: Record<string, number> }
export const emptyJohari = (): JohariCounts => ({ self: {}, peer: {}, peer_by_about: {}, peer_raters: {} })
export function addJohari(j: JohariCounts, memberId: string, self: string[], peers: Record<string, string[]>) {
  self.forEach(t => bump(j.self, t))
  for (const [about, traits] of Object.entries(peers ?? {})) {
    if (about === memberId) continue
    const by = j.peer_by_about[about] ?? (j.peer_by_about[about] = {})
    traits.forEach(t => { bump(by, t); bump(j.peer, t) })
    bump(j.peer_raters, about)
  }
}
