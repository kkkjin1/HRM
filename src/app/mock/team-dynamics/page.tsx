'use client'

// 팀 탭 "우리 팀 이해"(TeamUnderstanding)·진단 응답 창·개인별 응답·외부 분석 패널을 로그인 없이 보고 다듬기 위한 미리보기.
// 가상 팀원·가상 응답으로 메모리에서만 동작한다(서버 저장 없음). 운영 빌드에서는 layout.tsx가 404로 막는다.
// "단순 집계" 보기는 같은 데이터로 교차 분석(주요 발견) 없이 그린 화면 — 개선 전후 비교용.
import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import TeamUnderstanding from '@/components/team/TeamUnderstanding'
import RoundSurvey, { emptyAnswers } from '@/components/team/RoundSurvey'
import RoundResponses from '@/components/team/RoundResponses'
import RoundAnalysisPanel from '@/components/team/RoundAnalysisPanel'
import { analyzeTeam, type Profile } from '@/lib/team/composition'
import { buildInsights } from '@/lib/team/insights'
import { computeRoundResult, ITEMS_VERSION, type R0Answers } from '@/lib/team/r0'
import { HEALTH_ITEMS } from '@/lib/teamHealth'
import type { AnalysisRow } from '@/lib/team/analyses'
import type { ResponseRow, RoundView } from '@/lib/team/rounds'

const people = [
  { id: 'a', name: '가팀장' }, { id: 'b', name: '나파트' }, { id: 'c', name: '다팀원' }, { id: 'd', name: '라팀원' }, { id: 'e', name: '마팀원' },
]
const ws = (o: Partial<R0Answers['ws']>): R0Answers['ws'] => ({ when_stuck: 'share', feedback_pref: 'direct', focus_time: 'morning', meeting_pref: 'agenda', gives_tags: [], needs_tags: [], growth_edge: null, team_request: null, ...o })
// 층별 점수(순채점 기준 1~5)로 건강도 10문항을 만든다(역채점 문항은 6-점수).
const health = (by: Partial<Record<string, number>>) => Object.fromEntries(HEALTH_ITEMS.map(i => [i.id, i.reverse ? 6 - (by[i.layer] ?? 4) : (by[i.layer] ?? 4)]))
const base = { jh_peers: {}, friction_note: null, keep_note: null, change_note: null }
const answers: Record<string, R0Answers> = {
  a: { ...base, ws: ws({ feedback_pref: 'direct', gives_tags: ['기획력', '추진력'], needs_tags: ['빠른 피드백'], team_request: '결정 전에 한 번 물어봐 주세요' }),
    jh_self: ['strategic', 'driving', 'accountable'], jh_peers: { b: ['considerate', 'listener', 'cooperative'], d: ['meticulous', 'diligent', 'accountable'] },
    health: health({ trust: 4, conflict: 3, commitment: 3, accountability: 4, results: 4 }), friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 0 },
    strengths: ['commit', 'own'], keep: ['commit'], change: ['decision_clear'], keep_note: '결정한 건 회의 당일 한 줄로 남기기' },
  b: { ...base, ws: ws({ feedback_pref: 'direct', gives_tags: ['관계/소통', '조율/중재'], needs_tags: ['명확한 방향'] }),
    jh_self: ['considerate', 'cooperative', 'warm'], jh_peers: { a: ['driving', 'strategic', 'persuasive'], c: ['analytic', 'logical', 'prudent'] },
    health: health({ trust: 5, conflict: 4, commitment: 3, accountability: 4, results: 4 }), friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 1, focus_time: 0 },
    strengths: ['commit', 'help'], keep: ['help'], change: ['meeting_way'] },
  c: { ...base, ws: ws({ feedback_pref: 'gentle', when_stuck: 'solo', gives_tags: ['분석력'], needs_tags: ['자율성', '정보 공유'] }),
    jh_self: ['analytic', 'prudent', 'humble'], jh_peers: { e: ['driving', 'passionate', 'optimistic'], d: ['meticulous', 'accountable', 'composed'] },
    health: health({ trust: 3, conflict: 2, commitment: 3, accountability: 3, results: 4 }), friction: { feedback_pref: 3, when_stuck: 1, meeting_pref: 0, focus_time: 0 },
    strengths: ['commit', 'finish'], keep: ['finish'], change: ['feedback_way', 'share_info'],
    friction_note: '급한 피드백이 메신저로 짧게만 와서 의도를 오해한 적이 있다', change_note: '피드백은 맥락 한 줄을 먼저' },
  d: { ...base, ws: ws({ feedback_pref: 'written', gives_tags: ['꼼꼼함', '정리/문서화'], needs_tags: ['업무 분담'], growth_edge: '갈등 상황에서 직접 말하기' }),
    jh_self: ['meticulous', 'diligent', 'composed'], jh_peers: { c: ['analytic', 'curious', 'logical'], a: ['strategic', 'accountable', 'driving'] },
    health: health({ trust: 4, conflict: 5, commitment: 4, accountability: 4, results: 4 }), friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 0 },
    strengths: ['finish', 'own'], keep: ['commit', 'own'], change: [] },
  e: { ...base, ws: ws({ feedback_pref: 'direct', focus_time: 'afternoon', meeting_pref: 'spontaneous', gives_tags: ['실행력'], needs_tags: ['빠른 피드백'] }),
    jh_self: ['driving', 'passionate', 'optimistic'], jh_peers: { a: ['driving', 'strategic', 'confident'], b: ['cooperative', 'considerate', 'warm'] },
    health: health({ trust: 4, conflict: 4, commitment: 2, accountability: 3, results: 5 }), friction: { feedback_pref: 0, when_stuck: 0, meeting_pref: 0, focus_time: 1 },
    strengths: ['help', 'try'], keep: ['help'], change: ['decision_clear'], keep_note: '막히면 바로 공유하는 지금 분위기' },
}
const responses: ResponseRow[] = people.map(p => ({ member_id: p.id, answers: answers[p.id], submitted_at: '2026-11-03T01:00:00Z', updated_at: null }))
const result = computeRoundResult(responses, people.map(p => p.id), ITEMS_VERSION)
const roundBase = { id: 'mock-r0', kind: 'baseline' as const, title: 'R0 최초 팀 진단', items_version: ITEMS_VERSION, roster: people.map(p => p.id), opened_at: '2026-11-02T00:00:00Z', in_roster: true }
const ROUNDS: Record<string, RoundView | null> = {
  none: null,
  open: { ...roundBase, status: 'open', closed_at: null, close_reason: null, roster_n: 5, submitted_n: 3, my_submitted: true, result: null },
  closed: { ...roundBase, status: 'closed', closed_at: '2026-11-06T09:00:00Z', close_reason: 'all_submitted', roster_n: 5, submitted_n: 5, my_submitted: true, result },
}
const nameOf = (id: string) => people.find(p => p.id === id)?.name ?? id

export default function TeamDynamicsMockPage() {
  return <Suspense><MockView /></Suspense>
}

function MockView() {
  // ?state=none|open|closed, ?view=simple|dynamics 로 바로 열 수 있게(스크린샷·비교용)
  const params = useSearchParams()
  const q = params.get('state')
  const [state, setState] = useState<'none' | 'open' | 'closed'>(q === 'none' || q === 'open' ? q : 'closed')
  const [view, setView] = useState<'dynamics' | 'simple'>(params.get('view') === 'simple' ? 'simple' : 'dynamics')
  const [lead, setLead] = useState(true)
  const [survey, setSurvey] = useState(false)
  const [showResponses, setShowResponses] = useState(false)
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([])
  const round = ROUNDS[state]
  const profiles = useMemo(() => Object.fromEntries(people.map(p => [p.id, answers[p.id].ws])) as Record<string, Profile>, [])
  const analysis = useMemo(() => analyzeTeam({ people, profiles, result: state === 'closed' ? result : null }), [state, profiles])
  const insights = useMemo(() => (state === 'closed' && view === 'dynamics' ? buildInsights({ responses, nameOf }) : null), [state, view])

  async function onSave(input: { source: string; content: string; publish: boolean; basedOn: string | null }) {
    const now = new Date().toISOString()
    setAnalyses(prev => {
      const next = prev.map(a => (input.publish && a.status === 'published' ? { ...a, status: 'superseded' as const } : a))
      return [{ id: `an${prev.length + 1}`, round_id: 'mock-r0', version: prev.length + 1, source: input.source, content: input.content, status: input.publish ? 'published' : 'draft', based_on: input.basedOn, created_by: 'a', created_at: now, published_at: input.publish ? now : null, published_by: input.publish ? 'a' : null, withdrawn_at: null, withdrawn_by: null }, ...next]
    })
    return true
  }

  return (
    <div className="min-h-screen bg-[#F7F8F8] px-4 sm:px-6 py-8">
      <div className="max-w-[1120px] mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-[#7A8491]">미리보기 상태:</span>
          {(['none', 'open', 'closed'] as const).map(s => (
            <button key={s} onClick={() => setState(s)} className={`px-2.5 py-1 rounded-md ${state === s ? 'bg-[#1F2933] text-white' : 'bg-white border border-[#E5E8EB]'}`}>{s === 'none' ? 'R0 미실시' : s === 'open' ? '진행 중' : '완료'}</button>
          ))}
          <span className="text-[#7A8491] ml-3">보기:</span>
          {(['dynamics', 'simple'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 rounded-md ${view === v ? 'bg-[#1F2933] text-white' : 'bg-white border border-[#E5E8EB]'}`}>{v === 'dynamics' ? '팀 역학 분석' : '단순 집계(이전)'}</button>
          ))}
          <label className="ml-3 flex items-center gap-1"><input type="checkbox" checked={lead} onChange={e => setLead(e.target.checked)} /> 팀장으로 보기</label>
        </div>
        <TeamUnderstanding people={people} analysis={analysis} profiles={profiles} round={round} isLead={lead}
          insights={insights}
          analysisPanel={state === 'closed' && view === 'dynamics' && insights ? (
            <RoundAnalysisPanel isLead={lead} round={{ ...roundBase, closed_at: '2026-11-06T09:00:00Z' }} responses={responses} result={result} nameOf={nameOf}
              analyses={lead ? analyses : analyses.filter(a => a.published_at)} onSave={onSave}
              onPublish={id => setAnalyses(prev => prev.map(a => a.status === 'published' ? { ...a, status: 'superseded' } : a.id === id ? { ...a, status: 'published', published_at: new Date().toISOString(), published_by: 'a' } : a))}
              onWithdraw={id => setAnalyses(prev => prev.map(a => a.id === id ? { ...a, status: 'withdrawn', withdrawn_at: new Date().toISOString(), withdrawn_by: 'a' } : a))} />
          ) : null}
          onStart={() => setState('open')} onRespond={() => setSurvey(true)} onClose={() => setState('closed')} onShowResponses={() => setShowResponses(true)} />
        {survey && (
          <RoundSurvey title="R0 최초 팀 진단" itemsVersion={ITEMS_VERSION} meId="c" peers={people.filter(p => p.id !== 'c')} initial={emptyAnswers(answers.c.ws)} alreadySubmitted={false}
            onSubmit={() => setSurvey(false)} onCancel={() => setSurvey(false)} />
        )}
        {showResponses && <RoundResponses title="R0 최초 팀 진단" responses={responses} nameOf={nameOf} onClose={() => setShowResponses(false)} />}
      </div>
    </div>
  )
}
