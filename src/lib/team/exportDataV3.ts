// "분석용 데이터 복사"(r0-v3) — 외부 LLM에 붙여 넣을 구조화 텍스트. 규칙은 exportData.ts(구버전)와 같다.
//   기본 가명(P1~Pn, 회차 id로 섞음) · 자유서술 속 팀원 이름도 가명 · 모든 값에 항목 id([P3.behavior.B05]) · 익명 조하리·건강도 제외.
//   문항 원문·척도·유효 응답 수('관찰 기회 없음' 제외)를 함께 넣어, 외부 분석이 3점·N/A를 섞어 읽지 않게 한다.

import { WORK_STYLE_QUESTIONS, labelOf } from '@/lib/workStyle'
import { traitLabel } from '@/lib/johari'
import { BASIS_LABEL, SIGNAL_LABEL } from '@/lib/team/insights'
import { buildInsightsV3, itemStats, frictionStats } from '@/lib/team/insightsV3'
import {
  BEHAVIOR_ITEMS, BEHAVIOR_SCALE, DISCLAIMER_V3, DOMAINS, FRICTION_V3_ITEMS, FRICTION_V3_SCALE, IMPROVE_AREAS, KEEP_V3_OPTIONS, NA, PERIOD,
  areaLabel, keepLabel, type R0V3Answers, type RoundResultV3,
} from '@/lib/team/r0v3'

export function buildAnalysisExportV3(input: {
  round: { id: string; title: string; items_version: string; closed_at: string | null; roster: string[] }
  responses: { member_id: string; answers: R0V3Answers }[]
  result: RoundResultV3
  who: (id: string) => string
  alias: (id: string) => string
  txt: (v: string) => string
  pseudonymize: boolean
}) {
  const { round, result, who, txt } = input
  const L: string[] = []
  const insights = buildInsightsV3({ responses: input.responses, nameOf: who })
  const refText = (ref: string) => { const [id, path] = ref.split(':'); return id === 'team' ? `[team.${path}]` : `[${input.alias(id)}.${path}]` }
  const q = (s: string | null | undefined) => (s ? `"${txt(s)}"` : '-')

  L.push(`# 팀 진단 분석용 데이터 — ${round.title} (${round.items_version}, 마감 ${round.closed_at?.slice(0, 10) ?? '-'})`)
  L.push('')
  L.push(input.pseudonymize
    ? '※ 응답자 이름은 가명(P1~Pn)으로 바꿨고, 자유서술 속 팀원 이름도 가명으로 바꿨습니다. 단, 직책·역할·특정 사건·업무명 같은 묘사만으로도 사람을 짐작할 수 있습니다.'
    : '※ 이 데이터에는 팀원 실명이 포함돼 있습니다.')
  L.push('※ 이전에 익명으로 모은 조하리·건강도 응답은 포함하지 않았습니다. 이전 Lencioni 5층 건강도와 이 진단의 B 6영역은 다른 문항이라 같은 지표로 비교하지 마세요.')
  L.push(`※ ${DISCLAIMER_V3}`)
  L.push('')
  L.push('## 분석 요청')
  L.push(`이 데이터는 ${result.roster_n}명 안팎 소규모 팀의 실명 진단 응답입니다(기준 기간: ${PERIOD}). 개인 평가나 다수결 순위가 아니라, 여러 문항을 교차해 팀의 역학을 찾아 주세요.`)
  L.push('다음을 각각 정리해 주세요.')
  L.push('1. 팀의 실제 강점과 이를 뒷받침하는 행동(B 평가 + D01 성공 사례의 실제 행동)')
  L.push('2. 소수 의견 및 상대적으로 다른 경험(1명의 응답도 버리지 말고 "단일 응답"으로 표시)')
  L.push('3. 강점과 마찰이 동시에 존재하는 지점(모순으로 보지 말고, 어떤 조건에서 갈리는지)')
  L.push('4. 개선 가설과 이를 지지·반박하는 근거(D03 상황·영향·바라는 변화 + C 마찰 + B 평가)')
  L.push('5. 팀이 추가로 확인할 질문')
  L.push('6. 유지할 행동(D02)과 개선할 상황(D03)의 관계')
  L.push('규칙:')
  L.push('- 각 발견마다 "관찰된 사실 / 다른 경험 또는 반대 근거 / 가능한 해석 / 팀이 확인할 질문"을 나누고, 근거는 [P3.behavior.B05]처럼 항목 id로 인용하세요.')
  L.push('- 관찰된 사실(응답 인용)과 해석을 구분해, 해석 문장 앞에는 "해석:"이라고 붙이세요. 근거가 부족하면 "근거 부족 — 해석 보류"라고 쓰세요.')
  L.push('- "관찰 기회 없음(na)"은 중립(3점)이 아닙니다. 유효 응답 수에서 빼고 읽으세요. 5명 응답이므로 통계적 유의성이나 팀 역량 수준을 단정하지 마세요.')
  L.push('- 연관성만으로 인과를 단정하지 말고, 선호(ws) 차이가 마찰의 원인이라고 가정하지 마세요. 특정 개인을 평가하거나 순위를 매기지 마세요.')
  L.push('- 응답 수로 우선순위를 정하지 마세요. 서로 다른 문항의 결과가 다르다고 모순이라 단정하지 마세요. 개선 후보는 팀이 검토해 정합니다.')
  L.push('- D04(관점 차이)는 응답자 본인의 짐작입니다. 다른 사람의 실제 경험으로 다루지 마세요.')
  L.push('- 실명 응답이고 팀장도 응답자입니다. B05·B06 같은 심리적 안전감 문항이 높아도 "안전감이 높다"고 단정하지 말고 이 한계를 함께 적으세요.')
  L.push('')
  L.push('## 문항과 항목 id')
  for (const qd of WORK_STYLE_QUESTIONS) L.push(`- ws.${qd.key}: ${qd.label} (${qd.options.map(o => `${o.value}=${o.label}`).join(', ')})`)
  L.push('- ws.gives_tags: 보태는 것 / ws.needs_tags: 기대하는 것 / ws.growth_edge: 잘 못하는 것 / ws.team_request: 팀에 부탁')
  L.push('- jh_self·jh_peers.<대상>: 조하리 선택 영역(협업 진단 점수와 별개, 선택 응답)')
  L.push(`- behavior.<B항목>: 최근 4주 실제 협업 행동 (${BEHAVIOR_SCALE.map(s => `${s.value}=${s.label}`).join(', ')}, na=관찰 기회 없음)`)
  for (const d of DOMAINS) {
    L.push(`  - ${d.code} ${d.label}`)
    for (const it of BEHAVIOR_ITEMS.filter(i => i.domain === d.key)) L.push(`    - behavior.${it.key}: ${it.text}`)
  }
  L.push(`- friction.<C항목>: 최근 4주 실제 마찰 경험 횟수 (${FRICTION_V3_SCALE.map(s => `${s.value}=${s.label}`).join(', ')}, na=경험·관찰할 기회 없음)`)
  for (const it of FRICTION_V3_ITEMS) L.push(`  - friction.${it.key}: ${it.text} (관련 영역: ${it.domains.map(d => DOMAINS.find(x => x.key === d)!.short).join('·')})`)
  L.push('- friction_case: C05 대표 장면(서술) + 응답자가 직접 지정한 관련 C항목')
  L.push('- success: D01 잘됐던 장면(상황 / 기여한 행동 / 응답자가 고른 관련 영역) — none이면 "떠오르는 사례 없음"')
  L.push(`- keep: D02 유지하고 싶은 행동 (${KEEP_V3_OPTIONS.map(o => `${o.key}=${o.label}`).join(', ')}, K99=기타) / keep_note: 이유·경험`)
  L.push(`- improve: D03 달라지면 좋을 영역 (${IMPROVE_AREAS.map(a => `${a.key}=${a.label}`).join(', ')}) + 아쉬웠던 상황 / 영향 / 바라는 변화`)
  L.push('- perspective: D04 다른 팀원은 다르게 느낄 수 있겠다고 본 부분(응답자 본인의 짐작)')
  L.push('- short_tenure: 합류 4주 미만(실제 경험한 기간 기준으로 응답)')
  L.push('')
  L.push('## 응답자별 응답')
  const ordered = [...input.responses].sort((a, b) => input.alias(a.member_id).localeCompare(input.alias(b.member_id), 'en', { numeric: true }))
  for (const r of ordered) {
    const a = r.answers
    L.push(`### ${who(r.member_id)}${a.short_tenure ? ' (합류 4주 미만)' : ''}`)
    for (const qd of WORK_STYLE_QUESTIONS) L.push(`- ws.${qd.key}: ${labelOf(qd.key, a.ws[qd.key]) ?? '-'}`)
    L.push(`- ws.gives_tags: ${a.ws.gives_tags.join(', ') || '-'} / ws.needs_tags: ${a.ws.needs_tags.join(', ') || '-'}`)
    if (a.ws.growth_edge) L.push(`- ws.growth_edge: ${q(a.ws.growth_edge)}`)
    if (a.ws.team_request) L.push(`- ws.team_request: ${q(a.ws.team_request)}`)
    if (a.jh_self.length) L.push(`- jh_self: ${a.jh_self.map(traitLabel).join(', ')}`)
    for (const [about, traits] of Object.entries(a.jh_peers ?? {})) L.push(`- jh_peers.${input.pseudonymize ? input.alias(about) : who(about)}: ${traits.map(traitLabel).join(', ')}`)
    L.push(`- behavior: ${BEHAVIOR_ITEMS.map(i => `${i.key}=${a.behavior[i.key] ?? '-'}`).join(' ')}`)
    L.push(`- friction: ${FRICTION_V3_ITEMS.map(i => `${i.key}=${a.friction[i.key] ?? '-'}`).join(' ')}`)
    if (a.friction_case.text) L.push(`- friction_case: ${q(a.friction_case.text)} [관련: ${a.friction_case.items.join(', ') || '지정 안 함'}]`)
    if (a.success.none) L.push('- success: none(떠오르는 사례 없음)')
    else L.push(`- success: 상황 ${q(a.success.situation)} / 기여한 행동 ${q(a.success.behaviors)} / 관련 영역 ${a.success.domains.map(d => DOMAINS.find(x => x.key === d)!.short).join(', ') || '지정 안 함'}`)
    L.push(`- keep: ${a.keep.map(k => `${k}(${k === 'K99' ? q(a.keep_other) : keepLabel(k)})`).join(', ')}`)
    if (a.keep_note) L.push(`- keep_note: ${q(a.keep_note)}`)
    L.push(`- improve: ${a.improve.areas.map(x => (x === 'other' && a.improve.other ? `other(${q(a.improve.other)})` : `${x}(${areaLabel(x)})`)).join(', ')}`)
    if (a.improve.situation) L.push(`  - 아쉬웠던 상황: ${q(a.improve.situation)}`)
    if (a.improve.impact) L.push(`  - 영향: ${q(a.improve.impact)}`)
    if (a.improve.change) L.push(`  - 바라는 변화: ${q(a.improve.change)}`)
    if (a.perspective) L.push(`- perspective: ${q(a.perspective)}`)
    L.push('')
  }
  L.push('## 팀 집계 (참고 — 평균·빈도로 결론 내리지 말 것)')
  L.push(`- 응답 ${result.n}/${result.roster_n}명${result.short_tenure ? ` · 합류 4주 미만 ${result.short_tenure}명` : ''}`)
  for (const it of itemStats(input.responses)) {
    L.push(`- behavior.${it.key}: 유효 ${it.valid}명(na ${it.na.length}) · 분포 ${[1, 2, 3, 4, 5].map(v => `${v}:${it.byValue[v].length}`).join(' ')} · 유효 평균 ${it.mean === null ? '-' : it.mean.toFixed(1)}`)
  }
  for (const f of frictionStats(input.responses)) {
    const c = result.friction[f.key] ?? {}
    L.push(`- friction.${f.key}: 유효 ${f.valid}명(na ${c[NA] ?? 0}) · ${FRICTION_V3_SCALE.map(s => `${s.label} ${c[String(s.value)] ?? 0}`).join(', ')} · 장면 서술 연결 ${f.cases.length}건`)
  }
  L.push(`- success: 사례 ${result.success.cases}건 · 사례 없음 ${result.success.none}명`)
  L.push(`- keep: ${Object.entries(result.keep).map(([k, v]) => `${k} ${v}`).join(', ') || '-'}`)
  L.push(`- improve: ${Object.entries(result.improve).map(([k, v]) => `${k} ${v}`).join(', ') || '-'}`)
  L.push('')
  L.push('## 앱의 규칙 기반 발견 (참고 — 검증된 결론이 아님)')
  for (const f of insights.findings) {
    L.push(`- ${txt(f.title)} [${BASIS_LABEL[f.basis]}${f.signals.length ? ` · ${f.signals.map(s => SIGNAL_LABEL[s]).join(', ')}` : ''}] 근거: ${[...new Set(f.observed.map(e => refText(e.ref)))].join(' ')}`)
  }
  if (insights.held?.length) {
    L.push('')
    L.push('## 앱이 해석을 보류한 지점')
    for (const h of insights.held) L.push(`- ${txt(h.topic)}: ${txt(h.reason)} ${refText(h.ref)}`)
  }
  return L.join('\n')
}
