// 팀 진단 회차(R0 = 최초 진단, 이후 정기 진단)의 문항 카탈로그·응답 검증·마감 집계.
// 모든 응답은 실명이다(마감 전엔 본인 것만, 마감 후 팀 전체 공개 — 규칙은 /api/team-rounds가 강제).
// 문항은 key + 버전(ITEMS_VERSION)으로 고정한다. 문구를 바꾸면 버전을 올려 회차 간 비교가 끊긴 걸 드러낸다.
// 회차는 열릴 때의 버전으로 끝까지 응답·검증한다. 새 회차는 ITEMS_VERSION(r0-v3)으로 열린다.
//   r0-v1: S2 "유지했으면 하는 행동"은 자유서술(keep_note)만
//   r0-v2: S2에 정형 선택(keep, 1~2개)을 더했다 — 유지 과제와 개선 과제를 같은 축으로 비교하려고
//   r0-v3: 전면 재설계(실제 협업 행동 B·실제 마찰 C·성공 사례/유지/개선/관점 차이 D) — lib/team/r0v3.ts
//          v1·v2(이 파일의 "구버전" 함수)와 응답 구조가 다르다. 아래 validateAnswers·computeRoundResult·itemsSnapshot이 버전으로 갈라 부른다.

import { GIVES_TAGS, NEEDS_TAGS, WORK_STYLE_QUESTIONS, type WorkStyleQuestionKey } from '@/lib/workStyle'
import { JOHARI_MAX, JOHARI_MIN, JOHARI_TRAITS } from '@/lib/johari'
import { HEALTH_ITEMS, HEALTH_SCALE, type HealthLayerKey, type HealthPeriodSummary } from '@/lib/teamHealth'
import { NOTE_MAX, addJohari, bump, cleanText, emptyJohari, isStr, obj, uniq, validateJohari, validateWs, type Counts, type WsAnswers } from '@/lib/team/r0common'
import { V3_VERSION, computeRoundResultV3, itemsSnapshotV3, validateAnswersV3, type R0V3Answers, type RoundResultV3 } from '@/lib/team/r0v3'

export { NOTE_MAX, type Counts }
export const ITEMS_VERSION = V3_VERSION
export const LEGACY_VERSIONS = ['r0-v1', 'r0-v2'] as const
export const SUPPORTED_VERSIONS = [...LEGACY_VERSIONS, V3_VERSION] as const
export type ItemsVersion = typeof SUPPORTED_VERSIONS[number]
export type LegacyVersion = typeof LEGACY_VERSIONS[number]
export const isV3 = (version: string | null | undefined) => version === V3_VERSION
export const hasKeepItem = (version: string) => version !== 'r0-v1'

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
// S2(r0-v2) 꼭 유지할 행동 — 강점과 같은 행동 목록에서 고른다(지금 잘하는 것 ≠ 앞으로 꼭 지킬 것).
export const KEEP_OPTIONS = STRENGTH_OPTIONS
export const KEEP_MAX = 2

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

// 행동 선택지 ↔ 협업 방식 차원·팀 기능 층 연결표 — 교차 분석(강점·유지·개선이 같은 영역을 가리키는지, 실제 불편·점수와 맞물리는지)의 축.
// 화면에 그대로 공개되는 규칙이다(숨은 가중치 없음). 연결이 애매한 선택지는 억지로 잇지 않는다.
export type Link = { dim?: WorkStyleQuestionKey; layer?: HealthLayerKey }
export const BEHAVIOR_LINKS: Record<string, Link> = {
  // 강점·유지(STRENGTH/KEEP_OPTIONS)
  commit: { layer: 'commitment' },
  help: { dim: 'when_stuck', layer: 'trust' },
  candid: { dim: 'feedback_pref', layer: 'conflict' },
  deadline: { layer: 'accountability' },
  finish: { layer: 'accountability' },
  share: { dim: 'when_stuck', layer: 'trust' },
  try: { layer: 'results' },
  respect: { layer: 'trust' },
  own: { layer: 'accountability' },
  // 개선(CHANGE_OPTIONS)
  ask_help: { dim: 'when_stuck', layer: 'trust' },
  disagree: { layer: 'conflict' },
  decision_clear: { layer: 'commitment' },
  check_each: { layer: 'accountability' },
  team_result: { layer: 'results' },
  feedback_way: { dim: 'feedback_pref' },
  meeting_way: { dim: 'meeting_pref' },
  time_sync: { dim: 'focus_time' },
  share_info: { dim: 'when_stuck' },
}

// 구버전(r0-v1·v2) 응답
export type R0Answers = {
  ws: WsAnswers
  jh_self: string[]
  jh_peers: Record<string, string[]>          // 대상 member_id → 고른 형용사(선택 — 고르면 3~6개)
  health: Record<string, number>              // Lencioni 10문항, 1~5 (역채점은 집계 때 반영)
  friction: Record<string, number>            // WorkStyle 차원 키 → 0~3
  friction_note: string | null
  strengths: string[]                         // 1~3
  keep?: string[]                             // r0-v2부터: 꼭 유지할 행동 1~2(v1 응답엔 없음)
  keep_note: string | null
  change: string[]                            // 0~2
  change_note: string | null
}

// 회차에 함께 보존하는 문항 스냅샷 — 나중에 문구가 바뀌어도 "그때 무엇을 물었는지"가 남는다.
export function itemsSnapshot(version: ItemsVersion = ITEMS_VERSION) {
  return isV3(version) ? itemsSnapshotV3() : legacySnapshot(version as LegacyVersion)
}
function legacySnapshot(version: LegacyVersion) {
  return {
    version,
    ws: WORK_STYLE_QUESTIONS.map(q => ({ key: q.key, label: q.label, options: q.options.map(o => ({ value: o.value, label: o.label })) })),
    gives_tags: [...GIVES_TAGS],
    needs_tags: [...NEEDS_TAGS],
    johari: { traits: JOHARI_TRAITS.map(t => ({ key: t.key, label: t.label })), min: JOHARI_MIN, max: JOHARI_MAX },
    health: { items: HEALTH_ITEMS.map(i => ({ key: i.id, layer: i.layer, text: i.text, reverse: !!i.reverse })), scale: HEALTH_SCALE },
    friction: { items: FRICTION_ITEMS, scale: FRICTION_SCALE },
    strengths: { options: STRENGTH_OPTIONS, max: STRENGTH_MAX },
    ...(hasKeepItem(version) ? { keep: { options: KEEP_OPTIONS, max: KEEP_MAX } } : {}),
    change: { options: CHANGE_OPTIONS, max: CHANGE_MAX },
    links: BEHAVIOR_LINKS,
  }
}

// 버전별 응답 검증 — 회차의 items_version으로 고른다.
export type AnyAnswers = R0Answers | R0V3Answers
export function validateAnswers(raw: unknown, ctx: { selfId: string; peerIds: string[] }, version: string = ITEMS_VERSION):
  { ok: true; answers: AnyAnswers } | { ok: false; errors: string[] } {
  return isV3(version) ? validateAnswersV3(raw, ctx) : validateLegacyAnswers(raw, ctx, version)
}

// 구버전(r0-v1·v2) 응답 검증 + 정리. 브라우저가 보낸 값을 그대로 믿지 않고, 아는 키·허용 값만 남겨 저장한다.
export function validateLegacyAnswers(raw: unknown, ctx: { selfId: string; peerIds: string[] }, version: string = 'r0-v2'):
  { ok: true; answers: R0Answers } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const a = obj(raw)
  const wsOut = validateWs(a.ws, errors)
  const { jhSelf, jhPeers } = validateJohari(a.jh_self, a.jh_peers, ctx, true, errors)

  const healthRaw = obj(a.health)
  const health: Record<string, number> = {}
  for (const item of HEALTH_ITEMS) {
    const v = healthRaw[item.id]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) errors.push('팀 건강도 문항에 모두 답해 주세요')
    else health[item.id] = v
  }

  const frictionRaw = obj(a.friction)
  const friction: Record<string, number> = {}
  for (const f of FRICTION_ITEMS) {
    const v = frictionRaw[f.key]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 3) errors.push('협업 경험 문항에 모두 답해 주세요')
    else friction[f.key] = v
  }

  const strengthKeys: string[] = STRENGTH_OPTIONS.map(o => o.key)
  const strengths = Array.isArray(a.strengths) ? uniq(a.strengths.filter(isStr)).filter(k => strengthKeys.includes(k)) : []
  if (strengths.length < 1 || strengths.length > STRENGTH_MAX) errors.push(`우리 팀이 잘하는 것을 1~${STRENGTH_MAX}개 골라 주세요`)
  const keepKeys: string[] = KEEP_OPTIONS.map(o => o.key)
  const keep = hasKeepItem(version) && Array.isArray(a.keep) ? uniq(a.keep.filter(isStr)).filter(k => keepKeys.includes(k)) : []
  if (hasKeepItem(version) && (keep.length < 1 || keep.length > KEEP_MAX)) errors.push(`꼭 유지할 행동을 1~${KEEP_MAX}개 골라 주세요`)
  const changeKeys: string[] = CHANGE_OPTIONS.map(o => o.key)
  const change = Array.isArray(a.change) ? uniq(a.change.filter(isStr)).filter(k => changeKeys.includes(k)) : []
  if (change.length > CHANGE_MAX) errors.push(`함께 바꾸고 싶은 것은 최대 ${CHANGE_MAX}개까지 골라 주세요`)

  if (errors.length) return { ok: false, errors: uniq(errors) }
  return {
    ok: true,
    answers: {
      ws: wsOut, jh_self: jhSelf, jh_peers: jhPeers, health, friction,
      friction_note: cleanText(a.friction_note), strengths, ...(hasKeepItem(version) ? { keep } : {}), keep_note: cleanText(a.keep_note),
      change, change_note: cleanText(a.change_note),
    },
  }
}

// ── 마감 집계 ───────────────────────────────────────────────────────────────
// 마감 순간의 팀 전체 결과를 회차에 고정한다(이후 응답·프로필이 바뀌어도 R0 기준점은 그대로).
// 구버전(r0-v1·v2) 집계
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
  keep: Counts                                // r0-v2부터(v1 회차는 빈 값)
  change: Counts
  johari: { self: Counts; peer: Counts; peer_by_about: Record<string, Counts>; peer_raters: Record<string, number> }
}

export type AnyRoundResult = RoundResult | RoundResultV3
export const isV3Result = (r: AnyRoundResult | null | undefined): r is RoundResultV3 => !!r && isV3(r.version)

// 버전별 마감 집계 — 회차의 items_version으로 고른다(같은 회차의 응답은 모두 같은 버전 — DB 함수가 강제).
export function computeRoundResult(responses: { member_id: string; answers: AnyAnswers }[], rosterIds: string[], version: string = ITEMS_VERSION): AnyRoundResult {
  return isV3(version)
    ? computeRoundResultV3(responses as { member_id: string; answers: R0V3Answers }[], rosterIds)
    : computeLegacyResult(responses as { member_id: string; answers: R0Answers }[], rosterIds, version)
}

export function computeLegacyResult(responses: { member_id: string; answers: R0Answers }[], rosterIds: string[], version: string = 'r0-v2'): RoundResult {
  const r: RoundResult = {
    version, n: responses.length, roster_n: rosterIds.length,
    respondent_ids: responses.map(x => x.member_id).sort(),
    ws: Object.fromEntries(WS_DIMENSIONS.map(d => [d, {}])), gives: {}, needs: {}, health: {},
    friction: Object.fromEntries(FRICTION_ITEMS.map(f => [f.key, {}])), strengths: {}, keep: {}, change: {},
    johari: emptyJohari(),
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
    ;(a.keep ?? []).forEach(k => bump(r.keep, k))
    a.change.forEach(k => bump(r.change, k))
    addJohari(r.johari, member_id, a.jh_self, a.jh_peers)
  }
  return r
}

// 회차 상태 — 화면·API가 같은 기준을 쓴다.
export type RoundStatus = 'open' | 'closed'
export function roundStatus(round: { closed_at: string | null }): RoundStatus {
  return round.closed_at ? 'closed' : 'open'
}
