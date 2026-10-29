// 팀 역학 해석(r0-v3) — 선호(A)·실제 협업 행동(B)·실제 마찰(C)·성공 사례/유지/개선/관점 차이(D)를 교차해 "발견"을 만든다.
// insights.ts(구버전)와 같은 원칙을 따른다.
//   ① 발견마다 관찰된 사실 / 다른 경험·반대 근거 / 가능한 해석 / 확인할 질문을 나눈다. 근거가 없으면 해석을 만들지 않는다(null).
//   ② 1명의 응답도 버리지 않되 "단일 응답"으로 표시하고 팀 전체로 일반화하지 않는다. 개선 희망은 인원이 적어도 모두 남긴다.
//   ③ 연관을 인과로 단정하지 않는다. 선호 차이가 마찰의 원인이라고 가정하지 않는다.
//   ④ 응답 수로 중요도·우선순위를 정하지 않는다. 서로 다른 문항이 다르게 나와도 모순이라 부르지 않는다.
//   ⑤ '관찰 기회 없음'은 3점으로 세지 않고 유효 응답에서 뺀다. 유효 응답이 적으면 해석을 보류하고 그 이유를 남긴다(held).
//   ⑥ 서술(C05·D01·D03)은 응답자가 직접 고른 항목·영역에만 잇는다(임의로 한 항목에 붙이지 않음).
//   ⑦ 5명 안팎의 응답이라 통계적 유의성·팀 역량 수준을 단정하지 않는다. 낮은 문항이 있다고 사람이나 팀을 문제로 분류하지 않는다.
// 근거 ref 형식: "m3:behavior.B05" · "team:friction.C02" · "m1:success" · "m2:improve" — 외부 분석 인용([P3.behavior.B05])과 같은 경로.
// 모든 규칙과 문턱값은 이 파일에 적혀 있고 숨은 점수·가중치는 없다.

import { WORK_STYLE_QUESTIONS, labelOf, type WorkStyleQuestionKey } from '@/lib/workStyle'
import { traitLabel } from '@/lib/johari'
import { NEED_SUPPLY_MAP } from '@/lib/team/composition'
import { basisOf, josa, type Basis, type Evidence, type Finding, type Held, type Insights, type NoteGroup, type SignalType } from '@/lib/team/insights'
import {
  BEHAVIOR_ITEMS, DOMAINS, FRICTION_V3_ITEMS, IMPROVE_AREAS, IMPROVE_NONE, IMPROVE_OTHER, KEEP_OTHER, KEEP_V3_OPTIONS,
  areaLabel, domainOf, frictionLabelV3, scoreOf, timesOf,
  type DomainKey, type R0V3Answers,
} from '@/lib/team/r0v3'

type Resp = { member_id: string; answers: R0V3Answers }

export const LOW_MAX = 2      // 2점 이하 = 낮게 경험
export const HIGH_MIN = 4     // 4점 이상 = 높게 경험
export const MIN_VALID = 3    // 문항 해석에 필요한 최소 유효 응답(관찰 기회 없음 제외)
export const SAFETY_CAVEAT = '실명 응답이고 팀장도 응답자라, 우려나 낮은 평가를 드러내기 어려웠을 수 있습니다(사회적 바람직성). 높은 점수만으로 ‘심리적 안전감이 높다’고 단정하지 않습니다.'

// 기대(needs_tags) ↔ 그 기대가 실제로 채워지는지 보여 줄 협업 행동·마찰 문항. '자율성'은 팀 운영 방식의 문제라 잇지 않는다.
export const NEED_BEHAVIOR: Record<string, { items: string[]; friction?: string }> = {
  '명확한 방향': { items: ['B01'] },
  '빠른 피드백': { items: ['B10'], friction: 'C02' },
  '공감/지지': { items: ['B07'] },
  '기술적 도움': { items: ['B08'] },
  '의사결정 지원': { items: ['B09'] },
  '업무 분담': { items: ['B02', 'B08'] },
  '정보 공유': { items: ['B03', 'B04'], friction: 'C01' },
}
// 선호(WorkStyle 차원) ↔ 같은 장면의 실제 협업 행동 — "선호에 따라 같은 행동을 다르게 경험하는가"를 보는 축(원인 판정 아님)
export const PREF_BEHAVIOR: Record<WorkStyleQuestionKey, string> = { when_stuck: 'B07', feedback_pref: 'B06', meeting_pref: 'B09', focus_time: 'B03' }

export type ItemStat = {
  key: string; domain: DomainKey; text: string
  valid: number; mean: number | null
  na: string[]; lo: string[]; mid: string[]; hi: string[]
  byValue: Record<number, string[]>
}
export type DomainStat = { key: DomainKey; code: string; label: string; items: ItemStat[]; mean: number | null; lo: string[]; hi: string[] }
export type FrictionStat = { key: string; short: string; domains: DomainKey[]; valid: number; na: string[]; none: string[]; exp: string[]; freq: string[]; often: string[]; cases: string[] }

export function itemStats(rs: Resp[]): ItemStat[] {
  return BEHAVIOR_ITEMS.map(it => {
    const byValue: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] }
    const na: string[] = []
    for (const r of rs) {
      const v = scoreOf(r.answers, it.key)
      if (v === null) na.push(r.member_id)
      else byValue[v].push(r.member_id)
    }
    const vals = rs.map(r => scoreOf(r.answers, it.key)).filter((v): v is number => v !== null)
    return {
      key: it.key, domain: it.domain, text: it.text, valid: vals.length, mean: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null,
      na, lo: [...byValue[1], ...byValue[2]], mid: byValue[3], hi: [...byValue[4], ...byValue[5]], byValue,
    }
  })
}
export function domainStats(items: ItemStat[]): DomainStat[] {
  return DOMAINS.map(d => {
    const its = items.filter(i => i.domain === d.key)
    const valid = its.reduce((s, i) => s + i.valid, 0)
    const sum = its.reduce((s, i) => s + (i.mean ?? 0) * i.valid, 0)
    return { key: d.key, code: d.code, label: d.label, items: its, mean: valid ? sum / valid : null, lo: [...new Set(its.flatMap(i => i.lo))], hi: [...new Set(its.flatMap(i => i.hi))] }
  })
}
export function frictionStats(rs: Resp[]): FrictionStat[] {
  return FRICTION_V3_ITEMS.map(it => {
    const val = (r: Resp) => timesOf(r.answers, it.key)
    const ids = (f: (v: number | null) => boolean) => rs.filter(r => f(val(r))).map(r => r.member_id)
    return {
      key: it.key, short: it.short, domains: it.domains,
      valid: ids(v => v !== null).length, na: ids(v => v === null), none: ids(v => v === 0),
      exp: ids(v => v !== null && v >= 1), freq: ids(v => v !== null && v >= 2), often: ids(v => v === 3),
      cases: rs.filter(r => r.answers.friction_case.text && r.answers.friction_case.items.includes(it.key)).map(r => r.member_id),
    }
  })
}

export type PlanKeepV3 = { key: string; label: string; domain: DomainKey | null; memberIds: string[]; success: Evidence[]; domainLine: string | null; alsoImprove: boolean; others: Evidence[] }
export type PlanImproveV3 = { key: string; label: string; memberIds: string[]; entries: Evidence[]; support: Evidence[]; contrary: Evidence[]; signals: SignalType[] }
export type PlanV3 = { keep: PlanKeepV3[]; improve: PlanImproveV3[]; noneIds: string[]; keepNotes: Evidence[] }

const q = (label: string) => `‘${label}’`
const fmt = (x: number | null) => (x === null ? '-' : x.toFixed(1))
const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n) + '…' : s)
const ORDER: SignalType[] = ['common', 'minority', 'mismatch', 'composite']
const sortSig = (s: Set<SignalType>) => ORDER.filter(x => s.has(x))

export function buildInsightsV3(input: { responses: Resp[]; nameOf: (id: string) => string }): Insights {
  const rs = input.responses
  const n = rs.length
  const nm = input.nameOf
  const names = (ids: string[]) => ids.map(nm).join(', ')
  const findings: Finding[] = []
  const held: Held[] = []
  const emptyPlan = { keep: [], change: [] }
  if (n === 0) return { findings, notes: [], plan: emptyPlan, questions: [], held, planV3: { keep: [], improve: [], noneIds: [], keepNotes: [] } }

  const items = itemStats(rs)
  const domains = domainStats(items)
  const frictions = frictionStats(rs)
  const item = (k: string) => items.find(i => i.key === k)!
  const dom = (k: DomainKey) => domains.find(d => d.key === k)!
  const byId = (id: string) => rs.find(r => r.member_id === id)!
  const scoreText = (id: string, k: string) => {
    const v = scoreOf(byId(id).answers, k)
    return v === null ? '관찰 기회 없음' : `${v}점`
  }
  const itemLine = (it: ItemStat, part: 'hi' | 'lo') =>
    ({ ref: `team:behavior.${it.key}`, text: `${it.key} ${clip(it.text, 40)} — ${part === 'hi' ? `4점 이상 ${it.hi.length}/${it.valid}명 (${names(it.hi)})` : `2점 이하 ${it.lo.length}/${it.valid}명 (${names(it.lo)})`}` })
  const personItem = (id: string, k: string): Evidence => ({ ref: `${id}:behavior.${k}`, text: `${nm(id)}: ${k} ${scoreText(id, k)}` })
  const domainLine = (d: DomainStat) => {
    const valid = d.items.reduce((s, i) => s + i.valid, 0)
    return valid ? `${d.code} ${d.label} — 유효 응답 평균 ${fmt(d.mean)}점 · 4점 이상 응답 ${d.items.reduce((s, i) => s + i.hi.length, 0)}/${valid} · 2점 이하 ${d.items.reduce((s, i) => s + i.lo.length, 0)}/${valid}` : `${d.code} ${d.label} — 유효 응답 없음`
  }
  const successIn = (d: DomainKey) => rs.filter(r => !r.answers.success.none && r.answers.success.situation && r.answers.success.domains.includes(d))
  const successEv = (r: Resp): Evidence => ({
    ref: `${r.member_id}:success`,
    text: `${nm(r.member_id)}의 성공 장면: “${clip(r.answers.success.situation ?? '')}”${r.answers.success.behaviors ? ` → 기여한 행동: “${clip(r.answers.success.behaviors)}”` : ''}`,
  })
  const caseEv = (id: string): Evidence => ({ ref: `${id}:friction_case`, text: `${nm(id)}의 장면: “${clip(byId(id).answers.friction_case.text ?? '')}”` })
  const keepIn = (d: DomainKey) => KEEP_V3_OPTIONS.filter(o => o.domain === d).flatMap(o => rs.filter(r => r.answers.keep.includes(o.key)).map(r => ({ o, id: r.member_id })))
  const improveIn = (d: string) => rs.filter(r => r.answers.improve.areas.includes(d)).map(r => r.member_id)
  const frictionsIn = (d: DomainKey) => frictions.filter(f => f.domains.includes(d))

  // 해석 보류: 유효 응답이 적은 행동 문항
  for (const it of items) {
    // 유효 응답 3명 미만 → 팀 단위 해석(강점·불일치·선호 비교·다수 판단)에서 뺀다. 개인 응답은 응답표·근거에 그대로 남기고, 낮게 답한 사람은 여기서도 밝힌다.
    if (it.valid < MIN_VALID) held.push({
      level: 'held', ref: `team:behavior.${it.key}`, topic: `${it.key} ${clip(it.text, 40)}`,
      reason: `유효 응답 ${it.valid}명(관찰 기회 없음 ${it.na.length}명) — 팀 전체로 일반화하는 해석은 하지 않았습니다${it.lo.length ? `. 낮게 답한 응답은 보존: ${it.lo.map(id => `${nm(id)} ${scoreText(id, it.key)}`).join(', ')}` : ''}`,
    })
    else if (it.na.length >= 2) held.push({ level: 'caution', ref: `team:behavior.${it.key}`, topic: `${it.key} ${clip(it.text, 40)}`, reason: `관찰 기회 없음 ${it.na.length}명(${names(it.na)}) — 해석은 유효 응답 ${it.valid}명 기준이며, 이 장면 자체가 드물었을 수 있습니다` })
  }
  for (const f of frictions) {
    if (f.na.length >= 2) held.push({ level: 'caution', ref: `team:friction.${f.key}`, topic: `${f.key} ${f.short}`, reason: `경험·관찰할 기회가 없었다는 응답 ${f.na.length}명 — ‘경험 없음’과 구분해 따로 둡니다` })
  }

  // ── ① 우리 팀은 어떤 팀인가 ────────────────────────────────────────────────
  // 1a 영역의 두 문항 모두 유효 응답 과반이 4점 이상 → 팀이 대체로 잘 작동한다고 본 영역
  const strongDomains: DomainKey[] = []
  for (const d of domains) {
    const ok = d.items.every(i => i.valid >= MIN_VALID && i.hi.length * 2 > i.valid)
    if (!ok) continue
    strongDomains.push(d.key)
    const succ = successIn(d.key)
    const keeps = keepIn(d.key)
    const sig = new Set<SignalType>(['common'])
    if (d.lo.length) sig.add('mismatch')
    if (succ.length || keeps.length) sig.add('composite')
    const observed: Evidence[] = [...d.items.map(i => itemLine(i, 'hi')), ...succ.map(successEv)]
    if (keeps.length) observed.push({ ref: `team:keep`, text: `같은 영역의 유지 행동을 고른 사람: ${[...new Set(keeps.map(k => `${nm(k.id)}(${clip(k.o.label, 24)})`))].join(', ')}` })
    findings.push({
      id: `domain_strength:${d.key}`, section: 1, kind: 'domain_strength', basis: 'majority', signals: sortSig(sig),
      title: `${josa(q(d.label), '은/는')} 다수가 대체로 잘 작동한다고 경험한 영역입니다`,
      observed,
      counter: [...d.lo.flatMap(id => d.items.filter(i => i.lo.includes(id)).map(i => personItem(id, i.key))), ...d.items.flatMap(i => i.mid.map(id => personItem(id, i.key)))],
      interpretation: [
        succ.length || keeps.length
          ? '행동 평가와 실제 성공 사례(또는 유지하고 싶은 행동)가 같은 영역을 가리킵니다. 팀이 실제로 체감하는 작동 방식일 수 있습니다.'
          : '행동 평가는 대체로 높지만, 이 영역의 구체적인 성공 사례는 이번 응답에 없습니다 — 어떤 장면에서 잘 되는지 함께 확인해 볼 수 있습니다.',
        d.lo.length ? '낮게 경험한 사람도 있어, 모두에게 같은 수준으로 작동한다고 볼 수는 없습니다.' : '',
        d.key === 'safety' ? SAFETY_CAVEAT : '',
      ].filter(Boolean).join(' '),
      question: `${josa(q(d.label), '이/가')} 잘 됐던 최근 장면은 무엇이었고, 그때 누가 무엇을 했나요?${d.lo.length ? ' 다르게 경험한 장면은 어떤 때였나요?' : ''}`,
    })
  }

  // 1b 성공 사례 2건 이상이 같은 영역을 가리킴(1a에서 이미 다룬 영역은 제외)
  for (const d of DOMAINS) {
    if (strongDomains.includes(d.key)) continue
    const succ = successIn(d.key)
    if (succ.length < 2) continue
    const ds = dom(d.key)
    findings.push({
      id: `success_pattern:${d.key}`, section: 1, kind: 'success_pattern', basis: basisOf(succ.length, n), signals: ['common', ...(ds.lo.length ? ['composite' as const] : [])],
      title: `성공 사례 ${succ.length}건이 ${josa(q(d.label), '을/를')} 가리킵니다`,
      observed: succ.map(successEv),
      counter: ds.lo.length ? [{ ref: `team:behavior.${d.code}`, text: domainLine(ds) }] : [],
      interpretation: ds.lo.length
        ? '잘된 장면이 이 영역에서 나왔지만, 같은 영역의 행동을 낮게 경험한 사람도 있습니다. 잘 되는 조건과 안 되는 조건이 따로 있을 수 있습니다.'
        : '팀원들이 떠올린 성공 장면이 같은 영역에 모입니다. 그 장면에서 한 행동이 팀의 작동 방식일 수 있습니다.',
      question: `두 장면에서 공통으로 효과가 있었던 행동은 무엇이었나요? 다른 업무에도 옮길 수 있을까요?`,
    })
  }
  const noneCases = rs.filter(r => r.answers.success.none).map(r => r.member_id)
  if (noneCases.length * 2 > n) held.push({ level: 'held', ref: 'team:success', topic: 'D01 성공 사례', reason: `‘떠오르는 사례 없음’ ${noneCases.length}/${n}명 — 성공 패턴은 해석하지 않았습니다(사례가 없었다는 뜻인지, 떠올리기 어려웠다는 뜻인지 구분되지 않음)` })

  // 1c 선호 그룹에 따라 같은 협업 행동을 다르게 경험(한 그룹은 모두 3점 이하, 다른 그룹은 모두 4점 이상)
  for (const qd of WORK_STYLE_QUESTIONS) {
    const k = PREF_BEHAVIOR[qd.key]
    if (item(k).valid < MIN_VALID) continue  // 유효 응답이 적으면 선호 그룹 비교(팀 단위 해석)를 하지 않는다
    const groups = new Map<string, number[]>()
    const groupIds = new Map<string, string[]>()
    for (const r of rs) {
      const v = scoreOf(r.answers, k)
      if (v === null) continue
      const p = r.answers.ws[qd.key]
      groups.set(p, [...(groups.get(p) ?? []), v])
      groupIds.set(p, [...(groupIds.get(p) ?? []), r.member_id])
    }
    if (groups.size < 2) continue
    const lowG = [...groups].filter(([, vs]) => vs.every(v => v <= 3)).map(([p]) => p)
    const highG = [...groups].filter(([, vs]) => vs.every(v => v >= HIGH_MIN)).map(([p]) => p)
    if (!lowG.length || !highG.length) continue
    const line = (p: string): Evidence => ({ ref: `team:ws.${qd.key}`, text: `${labelOf(qd.key, p)} 선호(${names(groupIds.get(p)!)}): ${k} ${groupIds.get(p)!.map(id => scoreText(id, k)).join(', ')}` })
    findings.push({
      id: `pref_behavior:${qd.key}`, section: 1, kind: 'pref_behavior_link', basis: basisOf(lowG.reduce((s, p) => s + groupIds.get(p)!.length, 0), n), signals: ['composite', 'mismatch'],
      title: `${qd.label} 방식 선호에 따라 ${josa(q(clip(item(k).text, 28)), '을/를')} 다르게 경험했습니다`,
      observed: lowG.map(line),
      counter: highG.map(line),
      interpretation: '선호하는 방식에 따라 같은 협업 행동을 다르게 경험하고 있을 수 있습니다. 선호 차이가 원인이라고 단정할 수는 없고, 응답 수가 적어 우연일 수도 있습니다.',
      question: `${qd.label} 방식이 다른 사람에게 ${josa(q(clip(item(k).text, 28)), '이/가')} 잘 되려면 무엇이 필요할까요?`,
    })
  }

  // ── ② 서로 보완할 수 있는 지점 — 가능성(gives↔needs)과 실제 지원 경험(B·C)을 구분 ──────────────
  const gives = new Map<string, string[]>()
  for (const r of rs) for (const t of r.answers.ws.gives_tags) gives.set(t, [...(gives.get(t) ?? []), r.member_id])
  for (const [need, link] of Object.entries(NEED_BEHAVIOR)) {
    const askers = rs.filter(r => r.answers.ws.needs_tags.includes(need)).map(r => r.member_id)
    if (!askers.length) continue
    const low = askers.filter(id => link.items.some(k => { const v = scoreOf(byId(id).answers, k); return v !== null && v <= LOW_MAX }))
    const hurt = link.friction ? askers.filter(id => (timesOf(byId(id).answers, link.friction!) ?? 0) >= 1) : []
    const gap = [...new Set([...low, ...hurt])]
    const match = askers.filter(id => !gap.includes(id) && link.items.every(k => { const v = scoreOf(byId(id).answers, k); return v === null || v >= HIGH_MIN }) && link.items.some(k => scoreOf(byId(id).answers, k) !== null))
    const supply = (NEED_SUPPLY_MAP[need] ?? []).map(tag => ({ tag, ids: (gives.get(tag) ?? []).filter(id => !askers.includes(id) || askers.length > 1) })).filter(s => s.ids.length)
    const supplyEv: Evidence[] = supply.map(s => ({ ref: `team:ws.gives_tags`, text: `가능성 · ${josa(q(s.tag), '을/를')} 보탠다고 답한 사람: ${names(s.ids)}` }))
    const ask: Evidence = { ref: `team:ws.needs_tags`, text: `${josa(q(need), '을/를')} 기대: ${names(askers)}` }
    const expEv = (id: string): Evidence[] => [
      ...link.items.map(k => personItem(id, k)),
      ...(link.friction && (timesOf(byId(id).answers, link.friction) ?? 0) >= 1 ? [{ ref: `${id}:friction.${link.friction}`, text: `${nm(id)}: ${link.friction} ${FRICTION_V3_ITEMS.find(f => f.key === link.friction)!.short} 마찰 ${frictionLabelV3(byId(id).answers.friction[link.friction])}` }] : []),
    ]
    if (gap.length) {
      const sig = new Set<SignalType>(['composite'])
      if (gap.length >= 2) sig.add('common')
      else if (byId(gap[0]).answers.friction_case.text || (link.friction && timesOf(byId(gap[0]).answers, link.friction) === 3)) sig.add('minority')
      if (match.length) sig.add('mismatch')
      findings.push({
        id: `need_gap:${need}`, section: 2, kind: 'need_support_gap', basis: basisOf(gap.length, n), signals: sortSig(sig),
        title: `${josa(q(need), '을/를')} 기대한 사람이 관련 협업을 ${supply.length ? '실제로는 충분히 경험하지 못했다고' : '낮게'} 답했습니다`,
        observed: [ask, ...gap.flatMap(expEv), ...supplyEv],
        counter: match.flatMap(expEv),
        interpretation: supply.length
          ? '팀 안에 보탤 수 있다고 답한 사람이 있지만(가능성), 그 기대가 실제 지원 경험으로는 이어지지 않았을 수 있습니다. 요청 방식·시점·업무량 등 이유는 응답만으로 알 수 없습니다.'
          : '팀 안에서 이 기대를 보탠다고 답한 사람도 보이지 않습니다. 팀 밖 지원이나 일하는 방식으로 채울지 이야기해 볼 지점입니다.',
        question: `${josa(q(need), '이/가')} 필요할 때 지금은 누구에게 어떻게 요청하고 있나요? 무엇이 있으면 요청하기 쉬울까요?`,
      })
    } else if (match.length >= 2 && supply.length) {
      findings.push({
        id: `need_match:${need}`, section: 2, kind: 'need_support_match', basis: basisOf(match.length, n), signals: ['composite', 'common'],
        title: `${josa(q(need), '을/를')} 기대한 사람들이 관련 협업을 실제로도 잘 경험했습니다`,
        observed: [ask, ...match.flatMap(expEv), ...supplyEv], counter: [],
        interpretation: '기대(needs)·보탬(gives)의 가능성과 실제 협업 경험이 같은 방향입니다. 이미 작동하는 보완 관계일 수 있습니다.',
        question: `${josa(q(need), '이/가')} 잘 채워졌던 장면에서 누가 무엇을 했나요? 새로 온 사람도 그 도움을 받을 수 있을까요?`,
      })
    }
  }
  // 동료가 본 강점을 본인은 꼽지 않음(조하리 선택 영역 — 2명 이상 동료가 고른 말만)
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
      id: `blind:${target.member_id}`, section: 2, kind: 'blind_strength', basis: 'some', signals: ['common'],
      title: `${nm(target.member_id)} — 동료 여러 명이 본 모습을 본인은 꼽지 않았습니다`,
      observed: blind.map(([t, who]) => ({ ref: `team:jh_peers.${target.member_id}`, text: `‘${traitLabel(t)}’ — 동료 ${who.length}명 (${names(who)})` })),
      counter: [{ ref: `${target.member_id}:jh_self`, text: target.answers.jh_self.length ? `본인이 고른 말: ${target.answers.jh_self.map(traitLabel).join(', ')}` : '본인은 나를 나타내는 말을 고르지 않음(선택 영역)' }],
      interpretation: '본인이 의식하지 못하는 강점일 수도, 특정 업무에서만 보인 모습일 수도 있습니다. 협업 진단 점수와는 별개의 선택 응답입니다.',
      question: '동료들은 어떤 장면에서 이 모습을 봤나요? 본인은 어떻게 느끼나요?',
    })
  }

  // ── ③ 실제 협업 경험 ────────────────────────────────────────────────────
  // 3a 같은 문항을 2점 이하·4점 이상으로 본 사람이 함께 있음 — 영역별로 묶는다(어느 쪽이 맞는지 판정하지 않음)
  for (const d of domains) {
    const split = d.items.filter(i => i.lo.length && i.hi.length && i.valid >= MIN_VALID)
    if (!split.length) continue
    const loIds = [...new Set(split.flatMap(i => i.lo))]
    const related = frictionsIn(d.key).flatMap(f => f.exp.filter(id => loIds.includes(id)).map(id => ({ f, id })))
    const sig = new Set<SignalType>(['mismatch'])
    if (related.length) sig.add('composite')
    findings.push({
      id: `split:${d.key}`, section: 3, kind: 'behavior_split', basis: basisOf(loIds.length + new Set(split.flatMap(i => i.hi)).size, n), signals: sortSig(sig),
      title: `${josa(q(d.label), '을/를')} 서로 다르게 경험하고 있습니다`,
      observed: [
        ...split.flatMap(i => i.lo.map(id => personItem(id, i.key))),
        ...related.map(({ f, id }) => ({ ref: `${id}:friction.${f.key}`, text: `${nm(id)}: ${f.key} ${f.short} 마찰 ${frictionLabelV3(byId(id).answers.friction[f.key])}` })),
        ...[...new Set(related.map(x => x.id))].filter(id => byId(id).answers.friction_case.text && byId(id).answers.friction_case.items.some(k => frictionsIn(d.key).some(f => f.key === k))).map(caseEv),
      ],
      counter: split.flatMap(i => i.hi.map(id => personItem(id, i.key))),
      interpretation: [
        `평균(${fmt(d.mean)}점)만 보면 가려지는 차이입니다. 같은 팀 안에서도 이 영역을 겪는 장면·업무·관계가 서로 다를 수 있으며, 어느 쪽이 맞는지 판정하지 않습니다.`,
        related.length ? '낮게 본 사람이 같은 영역의 실제 마찰도 답해, 구체적인 장면이 있을 수 있습니다.' : '',
        d.key === 'safety' ? SAFETY_CAVEAT : '',
      ].filter(Boolean).join(' '),
      question: `${q(d.label)}에 대해 각자 떠올린 장면은 무엇인가요? 어떤 업무·상황에서 다르게 느껴지나요?`,
    })
  }

  // 3b·3c 실제 마찰 — 2명 이상이 경험(공통) / 1명이지만 4회 이상이거나 그 항목을 지정한 장면 서술(소수)
  for (const f of frictions) {
    if (f.exp.length >= 2) {
      const r0 = f.exp.map(id => ({ ref: `${id}:friction.${f.key}`, text: `${nm(id)}: ${frictionLabelV3(byId(id).answers.friction[f.key])}` }))
      findings.push({
        id: `friction:${f.key}`, section: 3, kind: 'friction_shared', basis: basisOf(f.exp.length, n), signals: ['common', ...(f.cases.length ? ['composite' as const] : [])],
        title: `${f.key} ${f.short} — ${f.exp.length}명이 실제로 겪었습니다`,
        observed: [...r0, ...f.cases.map(caseEv)],
        counter: [...f.none.map(id => ({ ref: `${id}:friction.${f.key}`, text: `${nm(id)}: 경험 없음` })), ...(f.na.length ? [{ ref: `team:friction.${f.key}`, text: `경험·관찰할 기회 없음: ${names(f.na)}` }] : [])],
        interpretation: '여러 사람이 비슷한 장면을 겪었습니다. 특정 사람의 성향 탓이라기보다, 이 장면에서 함께 정해 둔 방식이 아직 없을 수 있습니다(응답만으로 원인은 알 수 없음).',
        question: `${f.short} 때문에 어려웠던 장면은 각자 어떤 상황이었나요? 비슷한 점이 있나요?`,
      })
    } else if (f.exp.length === 1) {
      const id = f.exp[0]
      const often = timesOf(byId(id).answers, f.key) === 3
      const hasCase = f.cases.includes(id)
      if (!often && !hasCase) {
        held.push({ level: 'held', ref: `${id}:friction.${f.key}`, topic: `${f.key} ${f.short}`, reason: `1명 ${frictionLabelV3(byId(id).answers.friction[f.key])}, 장면 서술 없음 — 발견으로 만들지 않고 근거 표에만 남깁니다` })
        continue
      }
      findings.push({
        id: `friction_minority:${f.key}:${id}`, section: 3, kind: 'friction_minority', basis: 'single', signals: ['minority'],
        title: `${f.key} ${f.short} — 한 사람이 ${often ? '‘4회 이상’ 겪었다고' : '구체적인 장면과 함께'} 답했습니다`,
        observed: [{ ref: `${id}:friction.${f.key}`, text: `${nm(id)}: ${frictionLabelV3(byId(id).answers.friction[f.key])}` }, ...(hasCase ? [caseEv(id)] : [])],
        counter: f.none.map(x => ({ ref: `${x}:friction.${f.key}`, text: `${nm(x)}: 경험 없음` })),
        interpretation: '팀 전체의 문제로 일반화할 근거는 없습니다. 다만 한 사람에게는 반복되거나 구체적인 경험이라, 숫자에 묻히지 않게 따로 남깁니다.',
        question: '당사자가 원한다면, 이 장면을 팀이 함께 듣고 이해하는 자리가 필요할까요?',
      })
    }
  }

  // 3d 강점과 어려움의 공존 — 다수가 잘 작동한다고 본 영역(1a)에 실제 마찰도 있음(모순 아님)
  for (const d of DOMAINS) {
    const succ = successIn(d.key)
    const strong = strongDomains.includes(d.key)
    if (!strong) continue
    const fr = frictionsIn(d.key).filter(f => f.exp.length)
    if (!fr.length) continue
    findings.push({
      id: `coexist:${d.key}`, section: 3, kind: 'strength_friction_coexist', basis: basisOf(new Set(fr.flatMap(f => f.exp)).size, n), signals: ['composite'],
      title: `${q(d.label)} — 잘 되는 장면과 어려웠던 장면이 함께 있습니다`,
      observed: [
        { ref: `team:behavior.${d.code}`, text: domainLine(dom(d.key)) },
        ...succ.map(successEv),
        ...fr.map(f => ({ ref: `team:friction.${f.key}`, text: `${f.key} ${f.short} 마찰 경험 ${f.exp.length}/${f.valid}명 (${names(f.exp)})` })),
      ],
      counter: [],
      interpretation: '모순이 아닙니다. 대체로 잘 작동하지만 특정 상황(급한 일정, 처음 하는 업무 등)에서 어긋나는 장면이 있을 수 있습니다. 어떤 조건에서 갈리는지가 확인할 지점입니다.',
      question: `${q(d.label)}이 잘 됐던 때와 어려웠던 때는 무엇이 달랐나요?`,
    })
  }

  // ── ④ 앞으로 유지·개선할 부분 ─────────────────────────────────────────────
  const plan: PlanV3 = { keep: [], improve: [], noneIds: improveIn(IMPROVE_NONE), keepNotes: [] }
  plan.keepNotes = rs.filter(r => r.answers.keep_note).map(r => ({ ref: `${r.member_id}:keep_note`, text: `${nm(r.member_id)}: “${r.answers.keep_note}”` }))
  for (const o of [...KEEP_V3_OPTIONS, { key: KEEP_OTHER, label: '기타', domain: null }]) {
    const who = rs.filter(r => r.answers.keep.includes(o.key)).map(r => r.member_id)
    if (!who.length) continue
    const d = o.domain as DomainKey | null
    const succ = d ? successIn(d) : []
    const alsoImprove = d ? improveIn(d).length > 0 : false
    plan.keep.push({
      key: o.key, label: o.label, domain: d, memberIds: who, success: succ.map(successEv), domainLine: d ? domainLine(dom(d)) : null, alsoImprove,
      others: o.key === KEEP_OTHER ? who.map(id => ({ ref: `${id}:keep_other`, text: `${nm(id)}: “${byId(id).answers.keep_other}”` })) : [],
    })
    // 성공 사례와의 연결은 근거가 겹칠 때만 발견으로 — 사례를 쓴 사람이 직접 이 행동을 골랐거나, 고른 사람·사례가 2개 이상
    const selfLinked = succ.some(r => who.includes(r.member_id))
    if (d && succ.length && (selfLinked || who.length >= 2 || succ.length >= 2)) {
      findings.push({
        id: `keep_success:${o.key}`, section: 4, kind: 'keep_success_link', basis: basisOf(who.length, n), signals: ['composite', ...(who.length >= 2 ? ['common' as const] : [])],
        title: `유지 행동 ${q(o.label)}과 실제 성공 사례가 같은 영역(${domainOf(d)!.short})에 있습니다`,
        observed: [{ ref: `team:keep.${o.key}`, text: `유지하고 싶다고 고른 사람: ${names(who)}` }, ...succ.map(successEv)],
        counter: dom(d).lo.length ? [{ ref: `team:behavior.${domainOf(d)!.code}`, text: `같은 영역을 낮게 경험한 사람: ${names(dom(d).lo)}` }] : [],
        interpretation: '성공 장면에서 효과가 있었던 행동을 반복하자는 응답일 수 있습니다. 성공 사례에 이 행동이 실제로 있었는지는 서술로 함께 확인해야 합니다.',
        question: `성공 장면에서 ${josa(q(o.label), '이/가')} 실제로 어떻게 나타났나요? 계속하려면 무엇이 필요할까요?`,
      })
    }
    const changersAll = d ? improveIn(d) : []
    // 같은 사람이 유지·개선을 함께 고른 경우는 보드에만 표시하고, 다른 사람끼리 같은 영역을 다르게 본 경우만 발견으로 만든다
    if (d && alsoImprove && changersAll.some(id => !who.includes(id))) {
      const changers = changersAll
      // 유지를 고른 사람과 개선을 고른 사람이 같은 영역의 행동을 어떻게 평가했는지 나란히 둔다
      const its = dom(d).items.map(i => i.key)
      const avgOf = (id: string) => { const v = its.map(k => scoreOf(byId(id).answers, k)).filter((x): x is number => x !== null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null }
      const keepAvg = who.map(avgOf).filter((x): x is number => x !== null)
      const changeAvg = changers.filter(id => !who.includes(id)).map(avgOf).filter((x): x is number => x !== null)
      const apart = keepAvg.length && changeAvg.length && Math.min(...keepAvg) >= HIGH_MIN && Math.max(...changeAvg) <= 3
      findings.push({
        id: `keep_improve:${o.key}`, section: 4, kind: 'keep_improve_same_area', basis: basisOf(Math.min(who.length, changers.length), n), signals: apart ? ['mismatch'] : [],
        title: `${q(o.label)} 유지와 ${q(domainOf(d)!.short)} 개선이 같은 영역에서 함께 나왔습니다`,
        observed: [
          { ref: `team:keep.${o.key}`, text: `유지: ${names(who)}` }, ...who.flatMap(id => its.map(k => personItem(id, k))),
          { ref: `team:improve.${d}`, text: `개선 희망: ${names(changers)}` }, ...changers.filter(id => !who.includes(id)).flatMap(id => its.map(k => personItem(id, k))),
        ],
        counter: [],
        interpretation: apart
          ? '유지를 고른 사람은 이 영역의 행동을 높게, 개선을 고른 사람은 낮게 경험했습니다. 같은 행동이 사람·장면에 따라 다르게 작동하고 있을 수 있습니다(충돌이나 누가 맞는지의 문제가 아님).'
          : '충돌을 뜻하지 않습니다. 잘 되는 부분은 지키면서 다른 장면을 보완하자는 뜻일 수 있고, 서로 다른 장면을 떠올렸을 수도 있습니다.',
        question: `${q(o.label)}의 좋은 점은 지키면서 ${q(domainOf(d)!.short)}에서 아쉬웠던 장면을 줄이려면 무엇이 필요할까요?`,
      })
    }
  }

  // D03 개선 희망 — 인원과 관계없이 모두 "팀 검토 후보". 지지 근거(C 마찰·B 낮은 평가)와 다른 근거(B 높은 평가·성공 사례)를 나란히 둔다.
  for (const area of IMPROVE_AREAS) {
    if (area.key === IMPROVE_NONE) continue
    const who = improveIn(area.key)
    if (!who.length) continue
    const d = domainOf(area.key)?.key ?? null
    const entries: Evidence[] = who.flatMap(id => {
      const im = byId(id).answers.improve
      const both = im.areas.filter(a => a !== IMPROVE_NONE)
      const parts = [
        area.key === IMPROVE_OTHER && im.other ? `기타 영역 “${im.other}”` : '',
        im.situation ? `아쉬웠던 상황 “${im.situation}”` : '',
        im.impact ? `영향 “${im.impact}”` : '',
        im.change ? `달라지면 좋을 모습 “${im.change}”` : '',
      ].filter(Boolean)
      return parts.length ? [{ ref: `${id}:improve`, text: `${nm(id)}${both.length > 1 ? ` (${both.map(areaLabel).join('·')} 함께 선택)` : ''}: ${parts.join(' / ')}` }] : []
    })
    const support: Evidence[] = []
    const contrary: Evidence[] = []
    const sig = new Set<SignalType>()
    if (who.length >= 2) sig.add('common')
    else if (byId(who[0]).answers.improve.situation) sig.add('minority')
    if (d) {
      const ds = dom(d)
      const fr = frictionsIn(d).filter(f => f.exp.length)
      for (const f of fr) support.push({ ref: `team:friction.${f.key}`, text: `실제 마찰 ${f.key} ${f.short}: ${f.exp.length}/${f.valid}명 (${names(f.exp)})${f.exp.length === 1 ? ' · 단일 응답' : ''}` })
      if (ds.lo.length) support.push({ ref: `team:behavior.${ds.code}`, text: `행동 평가 2점 이하: ${ds.items.filter(i => i.lo.length).map(i => `${i.key} ${names(i.lo)}`).join(' / ')}` })
      const hiOthers = ds.items.filter(i => i.hi.length * 2 > i.valid && i.valid >= MIN_VALID)
      if (hiOthers.length) contrary.push({ ref: `team:behavior.${ds.code}`, text: `같은 영역을 높게(4점 이상) 본 응답이 다수: ${hiOthers.map(i => `${i.key} ${i.hi.length}/${i.valid}명`).join(' · ')}` })
      for (const r of successIn(d)) contrary.push(successEv(r))
      if (support.length) sig.add('composite')
      if (ds.lo.length && ds.hi.length) sig.add('mismatch')
    }
    const signals = sortSig(sig)
    plan.improve.push({ key: area.key, label: area.label, memberIds: who, entries, support, contrary, signals })
    const changeText = who.map(id => byId(id).answers.improve.change).find(Boolean)
    findings.push({
      id: `improve:${area.key}`, section: 4, kind: 'improve_review', basis: basisOf(who.length, n), signals,
      title: support.length
        ? `${q(area.label)} — 개선 희망과 함께 볼 실제 경험이 있습니다`
        : d ? `${q(area.label)} — 개선 희망 외에 같은 영역의 다른 근거는 아직 없습니다` : `${q(area.label)} — 응답자가 직접 적은 영역입니다`,
      observed: [{ ref: `team:improve.${area.key}`, text: `개선 희망 ${who.length}/${n}명 (${names(who)})` }, ...entries, ...support],
      counter: contrary,
      interpretation: support.length && contrary.length
        ? '같은 영역에서 아쉬운 경험과 잘 된 경험이 함께 나왔습니다. 모순이 아니라 장면에 따라 다를 수 있다는 신호입니다. 팀 검토 후보이며 우선순위나 확정 과제가 아닙니다.'
        : support.length
          ? '실제 마찰이나 낮은 행동 평가가 같은 영역을 가리킵니다. 원인이나 우선순위를 뜻하지 않으며, 팀이 함께 검토할 후보입니다.'
          : contrary.length
            ? '다른 응답에서는 이 영역이 잘 작동한다고 본 사람도 있습니다. 서로 다른 장면을 떠올렸을 수 있고 모순으로 보지 않습니다.'
            : null,
      question: changeText
        ? `“${clip(changeText, 50)}” — 이렇게 되면 무엇이 달라질까요? 다른 사람도 비슷한 장면을 겪었나요?`
        : `${josa(q(area.label), '을/를')} 고른 계기가 된 장면은 무엇이었나요? 다른 사람도 비슷한 장면을 겪었나요?`,
    })
    if (!support.length && !contrary.length && d) held.push({ level: 'held', ref: `team:improve.${area.key}`, topic: `D03 ${area.label}`, reason: '개선 희망 외에 같은 영역의 마찰·행동 평가 근거가 없어 해석하지 않았습니다(장면 확인 필요 — 후보에서 빼지는 않음)' })
  }

  // 4d 실제 마찰을 여러 명이 겪었지만 그 영역을 개선 희망으로 고른 사람은 없음
  for (const f of frictions) {
    if (f.exp.length < 2) continue
    if (f.domains.some(d => improveIn(d).length)) continue
    findings.push({
      id: `not_raised:${f.key}`, section: 4, kind: 'friction_not_raised', basis: basisOf(f.exp.length, n), signals: ['common'],
      title: `${f.key} ${f.short} — 여러 명이 겪었지만 개선 희망으로는 나오지 않았습니다`,
      observed: [{ ref: `team:friction.${f.key}`, text: `마찰 경험 ${f.exp.length}/${f.valid}명 (${names(f.exp)})` }, { ref: 'team:improve', text: `관련 영역(${f.domains.map(d => domainOf(d)!.short).join('·')}) 개선 희망: 0명` }],
      counter: [],
      interpretation: '크게 불편하지 않아 감수하고 있거나, 다른 영역이 더 급하다고 봤거나, 말하기 어려웠을 수 있습니다. 어느 쪽인지는 응답만으로 알 수 없습니다.',
      question: `${f.short} 장면은 그대로 둬도 괜찮은가요, 아니면 함께 다룰 필요가 있나요?`,
    })
  }

  // ── 자유서술: 맥락으로 그대로 보존 ───────────────────────────────────────
  const note = (field: NoteGroup['field'], title: string, get: (r: Resp) => string | null, ref: string): NoteGroup => ({
    field, title, items: rs.flatMap(r => { const v = get(r); return v ? [{ ref: `${r.member_id}:${ref}`, text: `${nm(r.member_id)}: ${v}` }] : [] }),
  })
  const notes = [
    note('friction_case', '마찰 장면 (C05)', r => r.answers.friction_case.text ? `“${r.answers.friction_case.text}”${r.answers.friction_case.items.length ? ` [${r.answers.friction_case.items.join('·')}]` : ' [관련 항목 미지정]'}` : null, 'friction_case'),
    note('success', '잘됐던 장면 (D01)', r => r.answers.success.situation ? `“${r.answers.success.situation}”${r.answers.success.behaviors ? ` → 행동 “${r.answers.success.behaviors}”` : ''}` : null, 'success'),
    note('improve', '달라지면 좋을 상황 (D03)', r => r.answers.improve.situation ? [r.answers.improve.areas.map(areaLabel).join('·'), `상황 “${r.answers.improve.situation}”`, r.answers.improve.impact && `영향 “${r.answers.improve.impact}”`, r.answers.improve.change && `바라는 변화 “${r.answers.improve.change}”`].filter(Boolean).join(' / ') : null, 'improve'),
    note('perspective', '다르게 느낄 수 있다고 본 부분 (D04 · 응답자 본인의 짐작 — 다른 사람의 실제 경험이 아님)', r => r.answers.perspective ? `“${r.answers.perspective}”` : null, 'perspective'),
    note('team_request', '팀에 부탁', r => r.answers.ws.team_request ? `“${r.answers.ws.team_request}”` : null, 'ws.team_request'),
    note('growth_edge', '스스로 잘 못한다고 느끼는 것', r => r.answers.ws.growth_edge ? `“${r.answers.ws.growth_edge}”` : null, 'ws.growth_edge'),
  ].filter(g => g.items.length)
  const short = rs.filter(r => r.answers.short_tenure).map(r => r.member_id)
  if (short.length) held.push({ level: 'caution', ref: 'team:short_tenure', topic: '합류 4주 미만', reason: `${names(short)} — 실제 경험한 기간 기준 응답이라 관찰 범위가 다른 사람보다 짧을 수 있습니다` })

  // 한 줄 사실 요약 — 발견을 만든 같은 데이터에서 사람·숫자만 다시 적는다(해석 문장 없음). 핵심 역학 요약이 쓴다.
  const hiLine = (its: ItemStat[]) => its.map(i => `${i.key} 4점 이상 ${i.hi.length}/${i.valid}명`).join(' · ')
  const keepOpt = (k: string) => KEEP_V3_OPTIONS.find(o => o.key === k)
  for (const f of findings) {
    const [, a1, a2] = f.id.split(':')
    switch (f.kind) {
      case 'domain_strength': {
        const succ = successIn(a1 as DomainKey)
        f.brief = `${hiLine(dom(a1 as DomainKey).items)}${succ.length ? ` · 성공 사례 ${succ.length}건(${names(succ.map(x => x.member_id))})` : ''}${dom(a1 as DomainKey).lo.length ? ` · 낮게 본 사람 ${names(dom(a1 as DomainKey).lo)}` : ''}`
        break
      }
      case 'success_pattern': f.brief = `성공 사례 ${successIn(a1 as DomainKey).length}건 (${names(successIn(a1 as DomainKey).map(x => x.member_id))})`; break
      case 'pref_behavior_link': f.brief = `${f.observed.map(e => e.text).join(' / ')} ↔ 다른 선호는 모두 4점 이상`; break
      case 'need_support_gap': case 'need_support_match': {
        const link = NEED_BEHAVIOR[a1]
        const askers = rs.filter(x => x.answers.ws.needs_tags.includes(a1)).map(x => x.member_id)
        const low = askers.filter(id => link.items.some(k => { const v = scoreOf(byId(id).answers, k); return v !== null && v <= LOW_MAX }) || (!!link.friction && (timesOf(byId(id).answers, link.friction) ?? 0) >= 1))
        f.brief = f.kind === 'need_support_gap'
          ? `‘${a1}’ 기대(${names(askers)}) → ${names(low)}은(는) 관련 협업(${link.items.join('·')}${link.friction ? `·${link.friction}` : ''})을 낮게 경험`
          : `‘${a1}’ 기대(${names(askers)}) → 관련 협업(${link.items.join('·')}) 모두 4점 이상`
        break
      }
      case 'behavior_split': {
        const its = dom(a1 as DomainKey).items.filter(i => i.lo.length && i.hi.length && i.valid >= MIN_VALID)
        f.brief = `2점 이하 ${its.map(i => `${i.key} ${names(i.lo)}`).join(' / ')} ↔ 4점 이상 ${its.map(i => `${i.key} ${i.hi.length}명`).join(' / ')}`
        break
      }
      case 'friction_shared': case 'friction_not_raised': {
        const fr = frictions.find(x => x.key === a1)!
        f.brief = `${fr.key} ${fr.short}: ${fr.exp.length}/${fr.valid}명 경험(${names(fr.exp)})${fr.cases.length ? ` · 장면 서술 ${fr.cases.length}건` : ''}${f.kind === 'friction_not_raised' ? ' · 관련 개선 희망 0명' : ''}`
        break
      }
      case 'friction_minority': {
        const fr = frictions.find(x => x.key === a1)!
        f.brief = `${fr.key} ${fr.short}: ${nm(a2)} ${frictionLabelV3(byId(a2).answers.friction[a1])}${fr.cases.includes(a2) ? ' · 장면 서술' : ''} (다른 사람은 경험 없음 ${fr.none.length}명)`
        break
      }
      case 'strength_friction_coexist': f.brief = `강점 영역이지만 실제 마찰 ${frictionsIn(a1 as DomainKey).filter(x => x.exp.length).map(x => `${x.key} ${x.short} ${x.exp.length}명`).join(' · ')}`; break
      case 'keep_success_link': {
        const o = keepOpt(a1)!
        f.brief = `유지 ‘${clip(o.label, 26)}’(${names(rs.filter(x => x.answers.keep.includes(a1)).map(x => x.member_id))}) ↔ 같은 영역 성공 사례 ${successIn(o.domain).length}건`
        break
      }
      case 'keep_improve_same_area': {
        const o = keepOpt(a1)!
        const who = rs.filter(x => x.answers.keep.includes(a1)).map(x => x.member_id)
        f.brief = `유지 ‘${clip(o.label, 26)}’(${names(who)}) ↔ 같은 영역 개선 희망(${names(improveIn(o.domain))})${f.signals.includes('mismatch') ? ' · 행동 평가도 높게/낮게 갈림' : ''}`
        break
      }
      case 'improve_review': {
        const who = improveIn(a1)
        const change = who.map(id => byId(id).answers.improve.change).find(Boolean)
        f.brief = `개선 희망 ${names(who)}${change ? `: “${clip(change, 40)}”` : ''}`
        break
      }
    }
  }

  const questions = [...new Set(findings.map(f => f.question))].slice(0, 8)
  return { findings, notes, plan: emptyPlan, questions, held, planV3: plan }
}

export type { Basis }
