// 핵심 역학 요약(r0-v3) — ①~④의 발견(insightsV3)을 "같은 협업 영역" 단위 주제로 묶어 결과 화면 맨 위에 3~5개로 보여 준다.
// 원칙
//   ① 응답 수·빈도로 고르지 않는다. 서로 다른 파트(A 선호·B 행동·C 마찰·D 사례/유지/개선)의 근거가 2개 이상 겹친 주제,
//      또는 숫자는 작아도 구체적인 소수 신호(1명의 4회 이상·지정한 장면)가 있는 주제만 고른다.
//   ② 발견 하나는 한 주제에만 들어간다(중복 제거). 개인 인식(조하리)처럼 영역에 걸리지 않는 발견은 요약에 넣지 않고 ②에 그대로 둔다.
//   ③ 조건을 채운 주제가 적으면 그만큼만 보여 준다(억지로 3개를 채우지 않음). 최대 5개.
//   ④ 순서 = 근거 파트의 다양성 → 소수·인식 불일치 신호 유무 → 영역 순서. 중요도·우선순위가 아니다.
//   ⑤ 요약은 원본 발견을 대신하지 않는다 — 주제마다 묶은 발견 id를 가지고, 화면에서 ①~④의 원래 카드로 이동한다.

import type { Finding, Insights, SignalType } from '@/lib/team/insights'
import { NEED_BEHAVIOR, PREF_BEHAVIOR } from '@/lib/team/insightsV3'
import { BEHAVIOR_ITEMS, DOMAINS, FRICTION_V3_ITEMS, KEEP_V3_OPTIONS, type DomainKey } from '@/lib/team/r0v3'
import type { WorkStyleQuestionKey } from '@/lib/workStyle'

export const CORE_MAX = 5
export type Part = 'A' | 'B' | 'C' | 'D'
export const PART_LABEL: Record<Part, string> = { A: '선호', B: '협업 행동', C: '실제 마찰', D: '성공·유지·개선' }
export type ThemeLine = { label: '강점' | '다르게 경험' | '실제 마찰' | '소수 경험' | '기대한 도움' | '유지·개선'; text: string; findingId: string }
export type CoreTheme = {
  id: string
  domain: DomainKey
  kind: 'strength' | 'strength_tension' | 'tension'
  title: string
  parts: Part[]
  signals: SignalType[]
  lines: ThemeLine[]
  findingIds: string[]
  question: string
}
export type CoreSummary = { themes: CoreTheme[]; omitted: { domain: DomainKey; label: string; findings: number; reason: string }[] }

const domainOfItem = (k: string) => BEHAVIOR_ITEMS.find(i => i.key === k)!.domain
// 발견 → 영역(하나). 영역에 걸리지 않으면 null.
export function findingDomain(f: Finding): DomainKey | null {
  const [, a] = f.id.split(':')
  switch (f.kind) {
    case 'domain_strength': case 'success_pattern': case 'behavior_split': case 'strength_friction_coexist':
      return a as DomainKey
    case 'improve_review':
      return DOMAINS.some(d => d.key === a) ? (a as DomainKey) : null
    case 'keep_success_link': case 'keep_improve_same_area':
      return KEEP_V3_OPTIONS.find(o => o.key === a)?.domain ?? null
    case 'friction_shared': case 'friction_minority': case 'friction_not_raised':
      return FRICTION_V3_ITEMS.find(c => c.key === a)?.domains[0] ?? null
    case 'need_support_gap': case 'need_support_match':
      return NEED_BEHAVIOR[a] ? domainOfItem(NEED_BEHAVIOR[a].items[0]) : null
    case 'pref_behavior_link':
      return domainOfItem(PREF_BEHAVIOR[a as WorkStyleQuestionKey])
    default:
      return null
  }
}
// 발견이 기대는 근거 파트
function partsOf(f: Finding): Part[] {
  const comp = f.signals.includes('composite')
  switch (f.kind) {
    case 'domain_strength': return comp ? ['B', 'D'] : ['B']
    case 'success_pattern': return ['D']
    case 'behavior_split': return comp ? ['B', 'C'] : ['B']
    case 'strength_friction_coexist': return ['B', 'C']
    case 'friction_shared': case 'friction_minority': return comp ? ['C', 'D'] : ['C']
    case 'friction_not_raised': return ['C', 'D']
    case 'need_support_gap': case 'need_support_match': case 'pref_behavior_link': return ['A', 'B']
    case 'keep_success_link': case 'keep_improve_same_area': return ['D']
    case 'improve_review': return comp ? ['D', 'C'] : ['D']
    default: return []
  }
}
const LINE_OF: Partial<Record<Finding['kind'], ThemeLine['label']>> = {
  domain_strength: '강점', success_pattern: '강점',
  behavior_split: '다르게 경험', pref_behavior_link: '다르게 경험', strength_friction_coexist: '실제 마찰',
  friction_shared: '실제 마찰', friction_not_raised: '실제 마찰', friction_minority: '소수 경험',
  need_support_gap: '기대한 도움', need_support_match: '기대한 도움',
  keep_success_link: '유지·개선', keep_improve_same_area: '유지·개선', improve_review: '유지·개선',
}
// 대표 질문을 고를 때의 순서 — 서로 다른 경험을 묻는 질문이 대화의 출발점으로 가장 넓다
const QUESTION_ORDER: Finding['kind'][] = ['behavior_split', 'strength_friction_coexist', 'pref_behavior_link', 'need_support_gap', 'friction_shared', 'friction_minority', 'improve_review', 'keep_improve_same_area', 'domain_strength', 'success_pattern', 'keep_success_link']
const SIG_ORDER: SignalType[] = ['common', 'minority', 'mismatch', 'composite']

export function buildCoreSummary(insights: Insights): CoreSummary {
  const byDomain = new Map<DomainKey, Finding[]>()
  for (const f of insights.findings) {
    const d = findingDomain(f)
    if (!d) continue
    byDomain.set(d, [...(byDomain.get(d) ?? []), f])
  }
  const candidates: (CoreTheme & { rank: [number, number, number] })[] = []
  const omitted: CoreSummary['omitted'] = []
  DOMAINS.forEach((d, order) => {
    const fs = byDomain.get(d.key) ?? []
    if (!fs.length) return
    const parts = [...new Set(fs.flatMap(partsOf))].sort() as Part[]
    const signals = SIG_ORDER.filter(s => fs.some(f => f.signals.includes(s)))
    const hasMinority = fs.some(f => f.kind === 'friction_minority' || (f.basis === 'single' && f.signals.includes('minority') && f.kind !== 'improve_review'))
    if (parts.length < 2 && !hasMinority) {
      omitted.push({ domain: d.key, label: d.label, findings: fs.length, reason: parts.length ? `${PART_LABEL[parts[0]]} 응답 한 가지에서만 나온 신호` : '서로 겹치는 근거 없음' })
      return
    }
    const has = (k: Finding['kind']) => fs.some(f => f.kind === k)
    const strength = has('domain_strength') || has('success_pattern')
    const differs = has('behavior_split') || has('pref_behavior_link')
    const friction = has('friction_shared') || has('friction_minority') || has('strength_friction_coexist') || has('friction_not_raised')
    const gap = has('need_support_gap')
    const tension = differs || friction || gap
    const kind: CoreTheme['kind'] = strength && tension ? 'strength_tension' : strength ? 'strength' : 'tension'
    const q = `‘${d.label}’`
    const title = kind === 'strength_tension'
      ? `${q} — 팀의 강점이지만, 모두에게 같게 작동하지는 않습니다`
      : kind === 'strength'
        ? `${q} — 여러 근거가 함께 가리키는 팀의 강점입니다`
        : differs && friction
          ? `${q} — 서로 다르게 경험하고, 실제 마찰 장면도 있었습니다`
          : friction ? `${q} — 실제 마찰 장면이 있었습니다` : `${q} — 같은 상황을 서로 다르게 경험합니다`
    // 같은 종류의 발견이 여럿이면 첫 줄만 요약에 쓰고 나머지는 "외 n건"으로(원본은 링크로)
    const lines: ThemeLine[] = []
    for (const label of ['강점', '다르게 경험', '기대한 도움', '실제 마찰', '소수 경험', '유지·개선'] as ThemeLine['label'][]) {
      const of = fs.filter(f => LINE_OF[f.kind] === label)
      if (!of.length) continue
      lines.push({ label, text: (of[0].brief ?? of[0].title) + (of.length > 1 ? ` 외 ${of.length - 1}건` : ''), findingId: of[0].id })
    }
    const lead = QUESTION_ORDER.map(k => fs.find(f => f.kind === k)).find(Boolean)!
    candidates.push({
      id: `theme:${d.key}`, domain: d.key, kind, title, parts, signals, lines, findingIds: fs.map(f => f.id), question: lead.question,
      rank: [parts.length, signals.includes('minority') || signals.includes('mismatch') ? 1 : 0, -order],
    })
  })
  candidates.sort((a, b) => b.rank[0] - a.rank[0] || b.rank[1] - a.rank[1] || b.rank[2] - a.rank[2])
  const themes: CoreTheme[] = candidates.slice(0, CORE_MAX).map(c => ({ id: c.id, domain: c.domain, kind: c.kind, title: c.title, parts: c.parts, signals: c.signals, lines: c.lines, findingIds: c.findingIds, question: c.question }))
  for (const t of candidates.slice(CORE_MAX)) omitted.push({ domain: t.domain, label: DOMAINS.find(d => d.key === t.domain)!.label, findings: t.findingIds.length, reason: `요약은 최대 ${CORE_MAX}개 — 근거 파트 ${t.parts.length}가지로 다른 주제보다 겹침이 적음` })
  return { themes, omitted }
}
