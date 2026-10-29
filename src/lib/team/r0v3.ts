// R0 v3(r0-v3) — 팀 진단 문항 전면 재설계. 기준 기간은 최근 4주(합류 4주 미만이면 실제 경험한 기간).
// 구성: A 나의 업무 방식(WorkStyle·조하리 선택) / B 실제 협업 행동 12문항(6영역) / C 실제 마찰 경험 4문항 + 대표 장면 /
//       D 실제 성공 사례 · 유지 행동 · 달라지면 좋을 상황 · 관점 차이.
// 연구 개념(Edmondson 심리적 안전감, Salas 등 Big Five in Teamwork, Gittell 관계적 조정, Marks 등 팀 프로세스, 팀 성찰·AAR)을
// 참고한 자체 진단이다. 타당화된 원척도나 표준화된 심리검사가 아니다(화면·스냅샷에 그대로 밝힌다).
// v1·v2와 응답 구조가 다르다 — 회차의 items_version으로 갈라 읽고, 과거 회차의 문항 의미를 바꾸지 않는다.
// 이전 Lencioni 5층 건강도와 B 6영역은 서로 다른 구성개념이라 같은 지표의 시계열로 잇지 않는다.

import { GIVES_TAGS, NEEDS_TAGS, WORK_STYLE_QUESTIONS, type WorkStyleQuestionKey } from '@/lib/workStyle'
import { JOHARI_MAX, JOHARI_MIN, JOHARI_TRAITS } from '@/lib/johari'
import {
  addJohari, bump, cleanText, emptyJohari, isStr, obj, pickKeys, validateJohari, validateWs,
  type Counts, type JohariCounts, type WsAnswers,
} from '@/lib/team/r0common'

export const V3_VERSION = 'r0-v3'
export const PERIOD = '최근 4주'
export const LONG_MAX = 500
export const DISCLAIMER_V3 = '연구 개념(심리적 안전감·팀워크·관계적 조정·팀 프로세스·팀 성찰)을 참고해 만든 자체 팀 진단입니다. 타당화된 원척도나 표준화된 심리검사가 아닙니다.'

export type DomainKey = 'goals' | 'info' | 'safety' | 'support' | 'execution' | 'learning'
export const DOMAINS: { key: DomainKey; code: string; label: string; short: string }[] = [
  { key: 'goals', code: 'B1', label: '공동 목표와 역할', short: '목표·역할' },
  { key: 'info', code: 'B2', label: '정보 공유와 업무 조율', short: '정보 공유·업무 조율' },
  { key: 'safety', code: 'B3', label: '이견과 심리적 안전감', short: '이견·피드백' },
  { key: 'support', code: 'B4', label: '상호 지원과 협력', short: '상호 지원' },
  { key: 'execution', code: 'B5', label: '실행과 상호 책임', short: '실행·상호 책임' },
  { key: 'learning', code: 'B6', label: '학습과 적응', short: '학습·적응' },
]
export const DOMAIN_KEYS = DOMAINS.map(d => d.key)
export const domainOf = (k: string) => DOMAINS.find(d => d.key === k)

// ── PART B 실제 협업 행동 ────────────────────────────────────────────────
export const BEHAVIOR_ITEMS: { key: string; domain: DomainKey; text: string }[] = [
  { key: 'B01', domain: 'goals', text: '우리 팀은 현재 무엇이 가장 중요한 일인지 대체로 같은 그림을 갖고 있었다.' },
  { key: 'B02', domain: 'goals', text: '함께 진행하는 업무에서 누가 무엇을 책임지는지 명확했다.' },
  { key: 'B03', domain: 'info', text: '업무에 영향을 주는 변경 사항이나 위험은 필요한 사람에게 제때 공유됐다.' },
  { key: 'B04', domain: 'info', text: '업무를 요청하거나 넘길 때 필요한 배경과 기대 결과가 충분히 전달됐다.' },
  { key: 'B05', domain: 'safety', text: '문제나 우려, 반대 의견이 있을 때 이를 팀에 드러낼 수 있었다.' },
  { key: 'B06', domain: 'safety', text: '의견이 다를 때 사람의 입장보다 근거와 대안을 중심으로 논의했다.' },
  { key: 'B07', domain: 'support', text: '업무가 막히거나 부담이 커질 때 다른 팀원에게 도움을 요청할 수 있었다.' },
  { key: 'B08', domain: 'support', text: '도움 요청을 받으면 가능한 지원 범위나 대안을 함께 찾았다.' },
  { key: 'B09', domain: 'execution', text: '논의 후에는 결정 사항과 담당자, 기한이 명확히 정리됐다.' },
  { key: 'B10', domain: 'execution', text: '진행이 예상과 달라질 때 서로 확인하고 필요한 조정을 했다.' },
  { key: 'B11', domain: 'learning', text: '협업이 잘된 경험의 이유를 돌아보고 이후 업무에도 활용했다.' },
  { key: 'B12', domain: 'learning', text: '문제가 반복되면 개인의 잘잘못뿐 아니라 일하는 방식도 점검하고 바꿨다.' },
]
export const BEHAVIOR_SCALE = [
  { value: 1, label: '전혀 그렇지 않음' },
  { value: 2, label: '대체로 그렇지 않음' },
  { value: 3, label: '상황에 따라 다름' },
  { value: 4, label: '대체로 그러함' },
  { value: 5, label: '일관되게 그러함' },
] as const
export const NA = 'na' as const
export const BEHAVIOR_NA_LABEL = '관찰 기회 없음 / 해당 없음'
export type BehaviorValue = 1 | 2 | 3 | 4 | 5 | typeof NA

// ── PART C 실제 협업 마찰 경험 ─────────────────────────────────────────────
// domains: 이 장면이 걸치는 B 영역(교차 분석 축) / dim: 이어 볼 수 있는 WorkStyle 차원(선호 차이가 원인이라는 뜻이 아니다)
export const FRICTION_V3_ITEMS: { key: string; text: string; short: string; domains: DomainKey[]; dim: WorkStyleQuestionKey }[] = [
  { key: 'C01', text: '도움이나 업무 공유 시점이 맞지 않아 업무 진행이 어려웠던 적이 있다.', short: '도움·공유 시점', domains: ['info', 'support'], dim: 'when_stuck' },
  { key: 'C02', text: '피드백의 내용·시점·전달 방식 때문에 오해나 재작업이 발생한 적이 있다.', short: '피드백 내용·시점·방식', domains: ['safety'], dim: 'feedback_pref' },
  { key: 'C03', text: '집중 시간이나 응답 속도에 대한 기대가 맞지 않아 업무 조율이 어려웠던 적이 있다.', short: '집중 시간·응답 속도', domains: ['info'], dim: 'focus_time' },
  { key: 'C04', text: '회의 준비·진행·결정 과정에서 혼선이나 불필요한 재논의가 발생한 적이 있다.', short: '회의 준비·진행·결정', domains: ['execution', 'goals'], dim: 'meeting_pref' },
]
export const FRICTION_V3_SCALE = [
  { value: 0, label: '경험 없음' },
  { value: 1, label: '1회' },
  { value: 2, label: '2~3회' },
  { value: 3, label: '4회 이상' },
] as const
export const FRICTION_NA_LABEL = '경험·관찰할 기회가 없었음'
export type FrictionValue = 0 | 1 | 2 | 3 | typeof NA

// ── PART D 성공 경험 · 유지 · 개선 · 관점 차이 ─────────────────────────────────
export const KEEP_V3_OPTIONS: { key: string; label: string; domain: DomainKey }[] = [
  { key: 'K01', label: '문제나 지연 가능성을 알게 되면 조기에 공유하기', domain: 'info' },
  { key: 'K02', label: '업무를 나누기 전에 역할과 완료 기준 확인하기', domain: 'goals' },
  { key: 'K03', label: '업무 요청 시 배경·목적·기한까지 전달하기', domain: 'info' },
  { key: 'K04', label: '이견을 논의한 뒤 결정 사항을 함께 실행하기', domain: 'safety' },
  { key: 'K05', label: '도움 요청을 받으면 지원 가능 범위와 시점 알려주기', domain: 'support' },
  { key: 'K06', label: '회의 종료 시 결정 사항·담당·기한을 확인하기', domain: 'execution' },
  { key: 'K07', label: '잘된 협업의 이유와 방식을 팀에 공유하기', domain: 'learning' },
]
export const KEEP_OTHER = 'K99'
export const KEEP_V3_MAX = 2
export const IMPROVE_OTHER = 'other'
export const IMPROVE_NONE = 'none'
export const IMPROVE_AREAS: { key: string; label: string }[] = [
  ...DOMAINS.map(d => ({ key: d.key as string, label: d.short })),
  { key: IMPROVE_OTHER, label: '기타' },
  { key: IMPROVE_NONE, label: '특별히 없음' },
]
export const IMPROVE_MAX = 2
export const SUCCESS_DOMAIN_MAX = 2

export const keepLabel = (k: string) => (k === KEEP_OTHER ? '기타' : KEEP_V3_OPTIONS.find(o => o.key === k)?.label ?? k)
export const areaLabel = (k: string) => IMPROVE_AREAS.find(a => a.key === k)?.label ?? k
export const behaviorText = (k: string) => BEHAVIOR_ITEMS.find(i => i.key === k)?.text ?? k
export const frictionText = (k: string) => FRICTION_V3_ITEMS.find(i => i.key === k)?.text ?? k
export const behaviorLabel = (v: BehaviorValue | undefined) => (v === NA ? '관찰 기회 없음' : BEHAVIOR_SCALE.find(s => s.value === v)?.label ?? '-')
export const frictionLabelV3 = (v: FrictionValue | undefined) => (v === NA ? '기회 없음' : FRICTION_V3_SCALE.find(s => s.value === v)?.label ?? '-')

export type R0V3Answers = {
  ws: WsAnswers
  short_tenure: boolean                       // 합류 4주 미만 — 실제 경험한 기간 기준으로 답함
  jh_self: string[]                           // 선택 영역(고르면 3~6개). 협업 진단 점수와 섞지 않는다
  jh_peers: Record<string, string[]>
  behavior: Record<string, BehaviorValue>     // B01~B12
  friction: Record<string, FrictionValue>     // C01~C04
  friction_case: { text: string | null; items: string[] }   // C05 대표 장면 + 관련 C 항목(선택)
  success: { none: boolean; situation: string | null; behaviors: string | null; domains: DomainKey[] }  // D01
  keep: string[]                              // D02 K01~K07·K99, 1~2개
  keep_other: string | null
  keep_note: string | null
  improve: { areas: string[]; other: string | null; situation: string | null; impact: string | null; change: string | null }  // D03
  perspective: string | null                  // D04
}

export function itemsSnapshotV3() {
  return {
    version: V3_VERSION,
    period: PERIOD,
    disclaimer: DISCLAIMER_V3,
    ws: WORK_STYLE_QUESTIONS.map(q => ({ key: q.key, label: q.label, options: q.options.map(o => ({ value: o.value, label: o.label })) })),
    gives_tags: [...GIVES_TAGS],
    needs_tags: [...NEEDS_TAGS],
    johari: { traits: JOHARI_TRAITS.map(t => ({ key: t.key, label: t.label })), min: JOHARI_MIN, max: JOHARI_MAX, optional: true },
    domains: DOMAINS,
    behavior: { items: BEHAVIOR_ITEMS, scale: BEHAVIOR_SCALE, na: BEHAVIOR_NA_LABEL },
    friction: { items: FRICTION_V3_ITEMS, scale: FRICTION_V3_SCALE, na: FRICTION_NA_LABEL },
    success: { domains_max: SUCCESS_DOMAIN_MAX },
    keep: { options: KEEP_V3_OPTIONS, other: KEEP_OTHER, max: KEEP_V3_MAX },
    improve: { areas: IMPROVE_AREAS, max: IMPROVE_MAX },
  }
}

// 응답 검증 + 정리. 아는 키·허용 값만 남긴다(브라우저가 보낸 값을 그대로 믿지 않음).
export function validateAnswersV3(raw: unknown, ctx: { selfId: string; peerIds: string[] }):
  { ok: true; answers: R0V3Answers } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const a = obj(raw)
  const ws = validateWs(a.ws, errors)
  const { jhSelf, jhPeers } = validateJohari(a.jh_self, a.jh_peers, ctx, false, errors)

  const bRaw = obj(a.behavior)
  const behavior: Record<string, BehaviorValue> = {}
  for (const it of BEHAVIOR_ITEMS) {
    const v = bRaw[it.key]
    if (v === NA || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5)) behavior[it.key] = v as BehaviorValue
    else errors.push('PART B 협업 행동 문항에 모두 답해 주세요(관찰 기회가 없으면 ‘관찰 기회 없음’)')
  }
  const cRaw = obj(a.friction)
  const friction: Record<string, FrictionValue> = {}
  for (const it of FRICTION_V3_ITEMS) {
    const v = cRaw[it.key]
    if (v === NA || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3)) friction[it.key] = v as FrictionValue
    else errors.push('PART C 마찰 경험 문항에 모두 답해 주세요')
  }
  const fc = obj(a.friction_case)
  const caseText = cleanText(fc.text, LONG_MAX)
  const friction_case = { text: caseText, items: caseText ? pickKeys(fc.items, FRICTION_V3_ITEMS.map(i => i.key)) : [] }

  const s = obj(a.success)
  const none = s.none === true
  const situation = none ? null : cleanText(s.situation, LONG_MAX)
  const success = {
    none, situation,
    behaviors: none ? null : cleanText(s.behaviors, LONG_MAX),
    domains: none ? [] : pickKeys(s.domains, DOMAIN_KEYS).slice(0, SUCCESS_DOMAIN_MAX) as DomainKey[],
  }
  if (!none && !situation) errors.push('D01 잘됐던 장면을 적거나 ‘떠오르는 사례 없음’을 골라 주세요')

  const keep = pickKeys(a.keep, [...KEEP_V3_OPTIONS.map(o => o.key), KEEP_OTHER])
  if (keep.length < 1 || keep.length > KEEP_V3_MAX) errors.push(`D02 유지하고 싶은 행동을 1~${KEEP_V3_MAX}개 골라 주세요`)
  const keepOther = keep.includes(KEEP_OTHER) ? cleanText(a.keep_other) : null
  if (keep.includes(KEEP_OTHER) && !keepOther) errors.push('D02 기타 행동을 직접 적어 주세요')

  const im = obj(a.improve)
  let areas = pickKeys(im.areas, IMPROVE_AREAS.map(x => x.key))
  if (areas.includes(IMPROVE_NONE)) areas = [IMPROVE_NONE]
  const wants = areas.length > 0 && areas[0] !== IMPROVE_NONE
  if (areas.length < 1) errors.push('D03 달라지면 좋을 영역을 고르거나 ‘특별히 없음’을 골라 주세요')
  if (areas.length > IMPROVE_MAX) errors.push(`D03 영역은 최대 ${IMPROVE_MAX}개까지 골라 주세요`)
  const improve = {
    areas,
    other: areas.includes(IMPROVE_OTHER) ? cleanText(im.other) : null,
    situation: wants ? cleanText(im.situation, LONG_MAX) : null,
    impact: wants ? cleanText(im.impact, LONG_MAX) : null,
    change: wants ? cleanText(im.change, LONG_MAX) : null,
  }
  if (areas.includes(IMPROVE_OTHER) && !improve.other) errors.push('D03 기타 영역을 직접 적어 주세요')
  if (wants && !improve.situation) errors.push('D03 실제로 아쉬웠던 상황을 적어 주세요')

  if (errors.length) return { ok: false, errors: [...new Set(errors)] }
  return {
    ok: true,
    answers: {
      ws, short_tenure: a.short_tenure === true, jh_self: jhSelf, jh_peers: jhPeers, behavior, friction, friction_case,
      success, keep, keep_other: keepOther, keep_note: cleanText(a.keep_note), improve, perspective: cleanText(a.perspective, LONG_MAX),
    },
  }
}

// ── 마감 집계 ───────────────────────────────────────────────────────────────
// 문항별 응답 분포를 그대로 남긴다('na'는 별도 칸 — 3점으로 계산하지 않는다). 평균은 화면에서 유효 응답만으로 계산한다.
export type RoundResultV3 = {
  version: typeof V3_VERSION
  n: number
  roster_n: number
  respondent_ids: string[]
  short_tenure: number
  ws: Record<string, Counts>
  gives: Counts
  needs: Counts
  behavior: Record<string, Counts>     // B항목 → '1'~'5'·'na' → 인원
  friction: Record<string, Counts>     // C항목 → '0'~'3'·'na' → 인원
  friction_cases: number
  success: { cases: number; none: number; domains: Counts }
  keep: Counts
  improve: Counts
  perspective: number
  johari: JohariCounts
}

export function computeRoundResultV3(responses: { member_id: string; answers: R0V3Answers }[], rosterIds: string[]): RoundResultV3 {
  const r: RoundResultV3 = {
    version: V3_VERSION, n: responses.length, roster_n: rosterIds.length, respondent_ids: responses.map(x => x.member_id).sort(),
    short_tenure: 0, ws: Object.fromEntries(WORK_STYLE_QUESTIONS.map(q => [q.key, {}])), gives: {}, needs: {},
    behavior: Object.fromEntries(BEHAVIOR_ITEMS.map(i => [i.key, {}])), friction: Object.fromEntries(FRICTION_V3_ITEMS.map(i => [i.key, {}])),
    friction_cases: 0, success: { cases: 0, none: 0, domains: {} }, keep: {}, improve: {}, perspective: 0, johari: emptyJohari(),
  }
  for (const { member_id, answers: a } of responses) {
    if (a.short_tenure) r.short_tenure++
    for (const q of WORK_STYLE_QUESTIONS) bump(r.ws[q.key], a.ws[q.key])
    a.ws.gives_tags.forEach(t => bump(r.gives, t))
    a.ws.needs_tags.forEach(t => bump(r.needs, t))
    for (const [k, v] of Object.entries(a.behavior)) bump(r.behavior[k] ?? (r.behavior[k] = {}), String(v))
    for (const [k, v] of Object.entries(a.friction)) bump(r.friction[k] ?? (r.friction[k] = {}), String(v))
    if (a.friction_case.text) r.friction_cases++
    if (a.success.none) r.success.none++
    else if (a.success.situation) { r.success.cases++; a.success.domains.forEach(d => bump(r.success.domains, d)) }
    a.keep.forEach(k => bump(r.keep, k))
    a.improve.areas.forEach(k => bump(r.improve, k))
    if (a.perspective) r.perspective++
    addJohari(r.johari, member_id, a.jh_self, a.jh_peers)
  }
  return r
}

// 유효 응답(관찰 기회 없음 제외)만 — 개인 값 읽기 도우미
export const scoreOf = (a: R0V3Answers, key: string): number | null => { const v = a.behavior[key]; return typeof v === 'number' ? v : null }
export const timesOf = (a: R0V3Answers, key: string): number | null => { const v = a.friction[key]; return typeof v === 'number' ? v : null }
export const isNa = (v: unknown) => v === NA
export const hasText = (v: unknown) => isStr(v) && v.trim().length > 0
