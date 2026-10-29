// "분석용 데이터 복사" — 마감된 진단 회차를 외부 LLM에 붙여 넣을 수 있는 구조화 텍스트로 만든다.
// 기본은 가명(P1~Pn). 가명 순서는 회차 id로 섞어 명단 순서(=입사·등록 순)로 사람을 짐작하지 못하게 한다.
// 이전 "익명" 조하리·건강도 응답(johari_picks·team_health_responses)은 넣지 않는다 — 이 함수는 실명 회차 응답만 받는다.
// 모든 값에 항목 id를 붙여, 외부 분석이 [P3.friction.feedback_pref]처럼 근거를 인용하게 한다(반영 화면에서 원본으로 되짚음).
// 가명일 때는 규칙 기반 발견도 가명으로 다시 만들고(제목에 실명이 들어가는 발견이 있음), 자유서술 속 팀원 이름(성 뺀 이름 포함)도 가명으로 바꾼다.
// 별명·직책·상황 묘사로는 여전히 사람을 짐작할 수 있다 — 화면과 데이터 머리말에 그대로 알린다.

import { WORK_STYLE_QUESTIONS, labelOf } from '@/lib/workStyle'
import { HEALTH_ITEMS, HEALTH_SCALE } from '@/lib/teamHealth'
import { traitLabel } from '@/lib/johari'
import {
  CHANGE_OPTIONS, FRICTION_ITEMS, FRICTION_SCALE, KEEP_OPTIONS, STRENGTH_OPTIONS, hasKeepItem, isV3Result,
  type AnyAnswers, type AnyRoundResult, type R0Answers,
} from '@/lib/team/r0'
import { BASIS_LABEL, SIGNAL_LABEL, buildInsights } from '@/lib/team/insights'
import { buildAnalysisExportV3 } from '@/lib/team/exportDataV3'
import type { R0V3Answers } from '@/lib/team/r0v3'

// 회차 id로 정하는 결정적 섞기 — 같은 회차는 항상 같은 가명(붙여 넣은 분석의 P#을 원래 사람으로 되돌릴 때 필요).
export function pseudonymMap(roundId: string, memberIds: string[]): Record<string, string> {
  let h = 2166136261
  for (const ch of roundId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  const rand = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^= h >>> 16) >>> 0) / 4294967296 }
  const ids = [...memberIds].sort()
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]] }
  return Object.fromEntries(ids.map((id, i) => [id, `P${i + 1}`]))
}

// 자유서술 속 팀원 이름을 가명으로 — 전체 이름과, 세 글자 한글 이름이면 성을 뺀 두 글자도. 두 글자 미만은 오탐이 많아 건드리지 않는다.
export function maskNames(text: string, people: { name: string; alias: string }[]) {
  const forms = people.flatMap(p => {
    const nm = p.name.trim()
    const out = nm.length >= 2 ? [{ f: nm, alias: p.alias }] : []
    if (/^[가-힣]{3}$/.test(nm)) out.push({ f: nm.slice(1), alias: p.alias })
    return out
  }).sort((a, b) => b.f.length - a.f.length)
  let s = text
  for (const { f, alias } of forms) s = s.split(f).join(alias)
  return s
}

const opt = (opts: readonly { key: string; label: string }[], k: string) => opts.find(o => o.key === k)?.label ?? k

export function buildAnalysisExport(input: {
  round: { id: string; title: string; items_version: string; closed_at: string | null; roster: string[] }
  responses: { member_id: string; answers: AnyAnswers }[]
  result: AnyRoundResult
  nameOf: (id: string) => string
  pseudonymize: boolean
}) {
  const { round } = input
  const pmap = pseudonymMap(round.id, round.roster)
  const who = (id: string) => (input.pseudonymize ? pmap[id] ?? 'P?' : `${pmap[id]}(${input.nameOf(id)})`)
  const people = round.roster.map(id => ({ name: input.nameOf(id), alias: pmap[id] }))
  const txt = (v: string) => (input.pseudonymize ? maskNames(v, people) : v)
  if (isV3Result(input.result)) {
    const text = buildAnalysisExportV3({
      round, responses: input.responses as { member_id: string; answers: R0V3Answers }[], result: input.result,
      who, alias: id => pmap[id] ?? id, txt, pseudonymize: input.pseudonymize,
    })
    return { text, pseudonyms: pmap }
  }
  const result = input.result
  const responses = input.responses as { member_id: string; answers: R0Answers }[]
  const insights = buildInsights({ responses, nameOf: who })
  const refText = (ref: string) => { const [id, path] = ref.split(':'); return id === 'team' ? `[team.${path}]` : `[${pmap[id] ?? id}.${path}]` }
  const L: string[] = []
  const v2 = hasKeepItem(round.items_version)

  L.push(`# 팀 진단 분석용 데이터 — ${round.title} (${round.items_version}, 마감 ${round.closed_at?.slice(0, 10) ?? '-'})`)
  L.push('')
  L.push(input.pseudonymize
    ? '※ 응답자 이름은 가명(P1~Pn)으로 바꿨고, 자유서술 속 팀원 이름도 가명으로 바꿨습니다. 단, 별명·직책·특정 사건 같은 묘사는 그대로라 사람을 짐작할 수 있습니다.'
    : '※ 이 데이터에는 팀원 실명이 포함돼 있습니다.')
  L.push('※ 이전에 익명으로 모은 조하리·건강도 응답은 포함하지 않았습니다.')
  L.push('')
  L.push('## 분석 요청')
  L.push('이 데이터는 5명 안팎 소규모 팀의 실명 진단 응답입니다. 다수결 순위가 아니라 여러 응답을 교차해 팀의 강점·긴장 관계·협업 역학·개선 가설을 찾아 주세요.')
  L.push('- 각 발견마다 "관찰된 사실 / 가능한 해석 / 반대되거나 다른 경험 / 팀이 확인할 질문"을 나눠 쓰고, 근거는 [P3.friction.feedback_pref]처럼 항목 id로 인용하세요.')
  L.push('- 1명만의 응답은 "단일 응답"으로 표시하고 팀 전체 문제로 일반화하지 마세요. 연관성만으로 인과를 단정하지 마세요.')
  L.push('- 근거가 부족하면 해석하지 말고 "근거 부족"이라고 쓰세요. 특정 개인을 평가하거나 순위를 매기지 마세요.')
  L.push('- 근거는 유형으로 구분하세요: 공통 신호(여러 사람의 비슷한 경험) / 소수 신호(1명이지만 구체적·반복적인 경험) / 인식 불일치(같은 상황을 상반되게 평가) / 복합 신호(서로 다른 문항이 같은 영역을 가리킴).')
  L.push('- 응답 수로 중요도나 우선순위를 정하지 마세요. 서로 다른 문항의 결과가 다르다고 모순이라 단정하지 말고, 점수와 특정 행동을 인과로 잇지 마세요.')
  L.push('- 관찰된 사실(응답 인용)과 당신의 해석을 구분해, 해석 문장 앞에는 "해석:"이라고 붙여 주세요.')
  L.push('- 마지막에 "유지할 행동"과 "팀이 검토해 볼 개선 후보"를 구분해 정리해 주세요(유지와 개선이 같은 영역에 있어도 충돌로 보지 마세요). 실제 개선 주제는 팀이 정합니다.')
  L.push('')
  L.push('## 문항과 항목 id')
  for (const q of WORK_STYLE_QUESTIONS) L.push(`- ws.${q.key}: ${q.label} (${q.options.map(o => `${o.value}=${o.label}`).join(', ')})`)
  L.push('- ws.gives_tags: 보태는 것 / ws.needs_tags: 기대하는 것 / ws.growth_edge: 잘 못하는 것 / ws.team_request: 팀에 부탁')
  L.push('- jh_self: 나를 나타내는 말 / jh_peers.<대상>: 동료를 나타내는 말')
  L.push(`- health.<id>: 팀 기능 문항(1~5, ${HEALTH_SCALE.map(s => `${s.value}=${s.label}`).join(', ')}; 역채점 표시 문항은 높을수록 나쁨)`)
  for (const i of HEALTH_ITEMS) L.push(`  - health.${i.id} [${i.layer}${i.reverse ? ', 역채점' : ''}] ${i.text}`)
  L.push(`- friction.<차원>: 최근 한 달 방식 차이로 불편(0~3, ${FRICTION_SCALE.map(s => `${s.value}=${s.label}`).join(', ')})`)
  for (const f of FRICTION_ITEMS) L.push(`  - friction.${f.key}: ${f.text}`)
  L.push('- strengths: 지금 잘하는 것' + (v2 ? ' / keep: 꼭 유지할 행동' : '') + ' / keep_note: 유지했으면 하는 행동(서술) / change: 바꾸고 싶은 것 / change_note: 기타 / friction_note: 불편 경험(서술)')
  L.push('')
  L.push('## 응답자별 응답')
  const ordered = [...responses].sort((a, b) => (pmap[a.member_id] ?? '').localeCompare(pmap[b.member_id] ?? '', 'en', { numeric: true }))
  for (const r of ordered) {
    const a = r.answers
    const P = who(r.member_id)
    L.push(`### ${P}`)
    for (const q of WORK_STYLE_QUESTIONS) L.push(`- ws.${q.key}: ${labelOf(q.key, a.ws[q.key]) ?? '-'}`)
    L.push(`- ws.gives_tags: ${a.ws.gives_tags.join(', ') || '-'}`)
    L.push(`- ws.needs_tags: ${a.ws.needs_tags.join(', ') || '-'}`)
    if (a.ws.growth_edge) L.push(`- ws.growth_edge: "${txt(a.ws.growth_edge)}"`)
    if (a.ws.team_request) L.push(`- ws.team_request: "${txt(a.ws.team_request)}"`)
    L.push(`- jh_self: ${a.jh_self.map(traitLabel).join(', ')}`)
    for (const [about, traits] of Object.entries(a.jh_peers ?? {})) L.push(`- jh_peers.${input.pseudonymize ? pmap[about] : who(about)}: ${traits.map(traitLabel).join(', ')}`)
    L.push(`- health: ${HEALTH_ITEMS.map(i => `${i.id}=${a.health[i.id] ?? '-'}`).join(' ')}`)
    L.push(`- friction: ${FRICTION_ITEMS.map(f => `${f.key}=${a.friction[f.key] ?? '-'}`).join(' ')}`)
    if (a.friction_note) L.push(`- friction_note: "${txt(a.friction_note)}"`)
    L.push(`- strengths: ${a.strengths.map(k => opt(STRENGTH_OPTIONS, k)).join(', ')}`)
    if (v2) L.push(`- keep: ${(a.keep ?? []).map(k => opt(KEEP_OPTIONS, k)).join(', ') || '-'}`)
    if (a.keep_note) L.push(`- keep_note: "${txt(a.keep_note)}"`)
    L.push(`- change: ${a.change.map(k => opt(CHANGE_OPTIONS, k)).join(', ') || '-'}`)
    if (a.change_note) L.push(`- change_note: "${txt(a.change_note)}"`)
    L.push('')
  }
  L.push('## 팀 집계 (참고)')
  L.push(`- 응답 ${result.n}/${result.roster_n}명`)
  L.push(`- strengths: ${Object.entries(result.strengths).map(([k, v]) => `${opt(STRENGTH_OPTIONS, k)} ${v}`).join(', ')}`)
  if (v2) L.push(`- keep: ${Object.entries(result.keep ?? {}).map(([k, v]) => `${opt(KEEP_OPTIONS, k)} ${v}`).join(', ')}`)
  L.push(`- change: ${Object.entries(result.change).map(([k, v]) => `${opt(CHANGE_OPTIONS, k)} ${v}`).join(', ') || '-'}`)
  L.push('')
  L.push('## 앱의 규칙 기반 발견 (참고 — 검증된 결론이 아님)')
  for (const f of insights.findings) {
    L.push(`- ${txt(f.title)} [${BASIS_LABEL[f.basis]}${f.signals.length ? ` · ${f.signals.map(s => SIGNAL_LABEL[s]).join(', ')}` : ''}] 근거: ${f.observed.map(e => refText(e.ref)).join(' ')}`)
  }
  return { text: L.join('\n'), pseudonyms: pmap }
}

// 붙여 넣은 분석 본문에서 [P3.friction.feedback_pref] 같은 근거 인용을 찾는다.
export function parseRefs(text: string) {
  const out: { raw: string; who: string; path: string }[] = []
  for (const m of text.matchAll(/\[(P\d+|team)\.([a-z_]+(?:\.[A-Za-z0-9_-]+)?)\]/g)) out.push({ raw: m[0], who: m[1], path: m[2] })
  return out
}
