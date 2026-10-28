// 팀 진단 회차(R0 = 최초 진단, 이후 정기 진단)의 문항 카탈로그·응답 검증·마감 집계.
// 모든 응답은 실명이다(마감 전엔 본인 것만, 마감 후 팀 전체 공개 — 규칙은 /api/team-rounds가 강제).
// 문항은 key + 버전(ITEMS_VERSION)으로 고정한다. 문구를 바꾸면 버전을 올려 회차 간 비교가 끊긴 걸 드러낸다.

import { GIVES_TAGS, NEEDS_TAGS, WORK_STYLE_QUESTIONS, type WorkStyleQuestionKey } from '@/lib/workStyle'
import { JOHARI_MAX, JOHARI_MIN, JOHARI_TRAITS } from '@/lib/johari'
import { HEALTH_ITEMS, HEALTH_SCALE, type HealthPeriodSummary } from '@/lib/teamHealth'

export const ITEMS_VERSION = 'r0-v1'

export const WS_DIMENSIONS: WorkStyleQuestionKey[] = WORK_STYLE_QUESTIONS.map(q => q.key)

// 협업 방식 차이로 생긴 "실제 불편 경험" — WorkStyle 4개 차원과 같은 키로 잇는다(잠재 차이 ↔ 실제 경험 비교의 축).
export const FRICTION_ITEMS: { key: WorkStyleQuestionKey; text: string }[] = [
  { key: 'feedback_pref', text: '최근 한 달, 피드백을 주고받는 방식이 서로 달라 오해가 생기거나 불편했던 적이 있다' },
  { key: 'when_stuck', text: '최근 한 달, 막혔을 때 공유하는 시점·방식의 차이로 일이 늦어지거나 불편했던 적이 있다' },
  { key: 'meeting_pref', text: '최근 한 달, 회의를 준비·진행하는 방식의 차이로 불편했던 적이 있다' },
  { key: 'focus_time', text: '최근 한 달, 집중하는 시간대·일하는 리듬의 차이로 협업 일정이 불편했던 적이 있다' },
]
export const FRICTION_SCALE = [
  { value: 0, label: '없었다' },
  { value: 1, label: '한두 번' },
  { value: 2, label: '몇 번' },
  { value: 3, label: '자주' },
] as const

export const STRENGTH_OPTIONS = [
  { key: 'commit', label: '결정한 것을 지킨다' },
  { key: 'help', label: '서로 돕는다' },
  { key: 'candid', label: '솔직하게 말한다' },
  { key: 'deadline', label: '일정을 지킨다' },
  { key: 'finish', label: '꼼꼼하게 마무리한다' },
  { key: 'share', label: '정보를 잘 나눈다' },
  { key: 'try', label: '새로 시도한다' },
  { key: 'respect', label: '서로 존중한다' },
  { key: 'own', label: '맡은 일에 책임진다' },
] as const
export const STRENGTH_MAX = 3

export const CHANGE_OPTIONS = [
  { key: 'ask_help', label: '막히면 일찍 도움 요청하기' },
  { key: 'disagree', label: '회의에서 이견을 바로 말하기' },
  { key: 'decision_clear', label: '결정·담당·기한을 분명히 남기기' },
  { key: 'check_each', label: '서로 진행 상황을 짚어 주기' },
  { key: 'team_result', label: '팀 결과를 함께 챙기기' },
  { key: 'feedback_way', label: '피드백 주고받는 방식 맞추기' },
  { key: 'meeting_way', label: '회의 준비·진행 방식 맞추기' },
  { key: 'time_sync', label: '집중 시간·연락 리듬 맞추기' },
  { key: 'share_info', label: '정보·맥락 공유 늘리기' },
] as const
export const CHANGE_MAX = 2
export const NOTE_MAX = 300

export type R0Answers = {
  ws: {
    when_stuck: string; feedback_pref: string; focus_time: string; meeting_pref: string
    gives_tags: string[]; needs_tags: string[]
    growth_edge: string | null; team_request: string | null
  }
  jh_self: string[]
  jh_peers: Record<string, string[]>          // 대상 member_id → 고른 형용사(선택 — 고르면 3~6개)
  health: Record<string, number>              // Lencioni 10문항, 1~5 (역채점은 집계 때 반영)
  friction: Record<string, number>            // WorkStyle 차원 키 → 0~3
  friction_note: string | null
  strengths: string[]                         // 1~3
  keep_note: string | null
  change: string[]                            // 0~2
  change_note: string | null
}

// 회차에 함께 보존하는 문항 스냅샷 — 나중에 문구가 바뀌어도 "그때 무엇을 물었는지"가 남는다.
export function itemsSnapshot() {
  return {
    version: ITEMS_VERSION,
    ws: WORK_STYLE_QUESTIONS.map(q => ({ key: q.key, label: q.label, options: q.options.map(o => ({ value: o.value, label: o.label })) })),
    gives_tags: [...GIVES_TAGS],
    needs_tags: [...NEEDS_TAGS],
    johari: { traits: JOHARI_TRAITS.map(t => ({ key: t.key, label: t.label })), min: JOHARI_MIN, max: JOHARI_MAX },
    health: { items: HEALTH_ITEMS.map(i => ({ key: i.id, layer: i.layer, text: i.text, reverse: !!i.reverse })), scale: HEALTH_SCALE },
    friction: { items: FRICTION_ITEMS, scale: FRICTION_SCALE },
    strengths: { options: STRENGTH_OPTIONS, max: STRENGTH_MAX },
    change: { options: CHANGE_OPTIONS, max: CHANGE_MAX },
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const cleanNote = (v: unknown) => (isStr(v) && v.trim() ? v.trim().slice(0, NOTE_MAX) : null)
const uniq = (a: string[]) => [...new Set(a)]

// 응답 검증 + 정리. 브라우저가 보낸 값을 그대로 믿지 않고, 아는 키·허용 값만 남겨 저장한다.
export function validateAnswers(raw: unknown, ctx: { selfId: string; peerIds: string[] }):
  { ok: true; answers: R0Answers } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const ws = (a.ws && typeof a.ws === 'object' ? a.ws : {}) as Record<string, unknown>

  const wsOut = {} as R0Answers['ws']
  for (const q of WORK_STYLE_QUESTIONS) {
    const v = ws[q.key]
    if (!isStr(v) || !q.options.some(o => o.value === v)) errors.push(`나와 일하는 법 · ${q.label}을 골라 주세요`)
    else wsOut[q.key] = v
  }
  const pickTags = (v: unknown, allowed: readonly string[]) => (Array.isArray(v) ? uniq(v.filter(isStr)).filter(t => allowed.includes(t)) : [])
  wsOut.gives_tags = pickTags(ws.gives_tags, GIVES_TAGS)
  wsOut.needs_tags = pickTags(ws.needs_tags, NEEDS_TAGS)
  if (wsOut.gives_tags.length === 0) errors.push('보태는 것을 1개 이상 골라 주세요')
  if (wsOut.needs_tags.length === 0) errors.push('기대하는 것을 1개 이상 골라 주세요')
  wsOut.growth_edge = cleanNote(ws.growth_edge)
  wsOut.team_request = cleanNote(ws.team_request)

  const traitKeys = JOHARI_TRAITS.map(t => t.key)
  const pickTraits = (v: unknown) => (Array.isArray(v) ? uniq(v.filter(isStr)).filter(t => traitKeys.includes(t)) : [])
  const jhSelf = pickTraits(a.jh_self)
  if (jhSelf.length < JOHARI_MIN || jhSelf.length > JOHARI_MAX) errors.push(`나를 나타내는 말을 ${JOHARI_MIN}~${JOHARI_MAX}개 골라 주세요`)
  const jhPeers: Record<string, string[]> = {}
  const peersRaw = (a.jh_peers && typeof a.jh_peers === 'object' ? a.jh_peers : {}) as Record<string, unknown>
  for (const [about, v] of Object.entries(peersRaw)) {
    if (about === ctx.selfId || !ctx.peerIds.includes(about)) continue
    const traits = pickTraits(v)
    if (traits.length === 0) continue
    if (traits.length < JOHARI_MIN || traits.length > JOHARI_MAX) { errors.push(`동료를 나타내는 말은 ${JOHARI_MIN}~${JOHARI_MAX}개로 골라 주세요`); continue }
    jhPeers[about] = traits
  }

  const healthRaw = (a.health && typeof a.health === 'object' ? a.health : {}) as Record<string, unknown>
  const health: Record<string, number> = {}
  for (const item of HEALTH_ITEMS) {
    const v = healthRaw[item.id]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) errors.push('팀 건강도 문항에 모두 답해 주세요')
    else health[item.id] = v
  }

  const frictionRaw = (a.friction && typeof a.friction === 'object' ? a.friction : {}) as Record<string, unknown>
  const friction: Record<string, number> = {}
  for (const f of FRICTION_ITEMS) {
    const v = frictionRaw[f.key]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 3) errors.push('협업 경험 문항에 모두 답해 주세요')
    else friction[f.key] = v
  }

  const strengthKeys: string[] = STRENGTH_OPTIONS.map(o => o.key)
  const strengths = Array.isArray(a.strengths) ? uniq(a.strengths.filter(isStr)).filter(k => strengthKeys.includes(k)) : []
  if (strengths.length < 1 || strengths.length > STRENGTH_MAX) errors.push(`우리 팀이 잘하는 것을 1~${STRENGTH_MAX}개 골라 주세요`)
  const changeKeys: string[] = CHANGE_OPTIONS.map(o => o.key)
  const change = Array.isArray(a.change) ? uniq(a.change.filter(isStr)).filter(k => changeKeys.includes(k)) : []
  if (change.length > CHANGE_MAX) errors.push(`함께 바꾸고 싶은 것은 최대 ${CHANGE_MAX}개까지 골라 주세요`)

  if (errors.length) return { ok: false, errors: uniq(errors) }
  return {
    ok: true,
    answers: {
      ws: wsOut, jh_self: jhSelf, jh_peers: jhPeers, health, friction,
      friction_note: cleanNote(a.friction_note), strengths, keep_note: cleanNote(a.keep_note),
      change, change_note: cleanNote(a.change_note),
    },
  }
}

// ── 마감 집계 ───────────────────────────────────────────────────────────────
// 마감 순간의 팀 전체 결과를 회차에 고정한다(이후 응답·프로필이 바뀌어도 R0 기준점은 그대로).
export type Counts = Record<string, number>

export type RoundResult = {
  version: string
  n: number
  roster_n: number
  respondent_ids: string[]
  ws: Record<string, Counts>                  // 차원 → 선택지 → 인원
  gives: Counts
  needs: Counts
  health: HealthPeriodSummary['items']        // 문항별 합계·개수(layerScoresFromSummary로 층 점수)
  friction: Record<string, Counts>            // 차원 → '0'~'3' → 인원
  strengths: Counts
  change: Counts
  johari: { self: Counts; peer: Counts; peer_by_about: Record<string, Counts>; peer_raters: Record<string, number> }
}

const bump = (c: Counts, k: string, by = 1) => { c[k] = (c[k] ?? 0) + by }

export function computeRoundResult(responses: { member_id: string; answers: R0Answers }[], rosterIds: string[]): RoundResult {
  const r: RoundResult = {
    version: ITEMS_VERSION, n: responses.length, roster_n: rosterIds.length,
    respondent_ids: responses.map(x => x.member_id).sort(),
    ws: Object.fromEntries(WS_DIMENSIONS.map(d => [d, {}])), gives: {}, needs: {}, health: {},
    friction: Object.fromEntries(FRICTION_ITEMS.map(f => [f.key, {}])), strengths: {}, change: {},
    johari: { self: {}, peer: {}, peer_by_about: {}, peer_raters: {} },
  }
  for (const { member_id, answers: a } of responses) {
    for (const d of WS_DIMENSIONS) bump(r.ws[d], a.ws[d])
    a.ws.gives_tags.forEach(t => bump(r.gives, t))
    a.ws.needs_tags.forEach(t => bump(r.needs, t))
    for (const [k, v] of Object.entries(a.health)) {
      const it = r.health[k] ?? { sum: 0, count: 0 }
      r.health[k] = { sum: it.sum + v, count: it.count + 1 }
    }
    for (const [k, v] of Object.entries(a.friction)) bump(r.friction[k] ?? (r.friction[k] = {}), String(v))
    a.strengths.forEach(k => bump(r.strengths, k))
    a.change.forEach(k => bump(r.change, k))
    a.jh_self.forEach(t => bump(r.johari.self, t))
    for (const [about, traits] of Object.entries(a.jh_peers)) {
      if (about === member_id) continue
      const by = r.johari.peer_by_about[about] ?? (r.johari.peer_by_about[about] = {})
      traits.forEach(t => { bump(by, t); bump(r.johari.peer, t) })
      bump(r.johari.peer_raters, about)
    }
  }
  return r
}

// 회차 상태 — 화면·API가 같은 기준을 쓴다.
export type RoundStatus = 'open' | 'closed'
export function roundStatus(round: { closed_at: string | null }): RoundStatus {
  return round.closed_at ? 'closed' : 'open'
}
