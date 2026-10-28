'use client'

// 팀 탭 "우리 팀 이해"(TeamUnderstanding)·진단 응답 창·개인별 응답을 로그인 없이 보고 다듬기 위한 미리보기.
// 가상 팀원·가상 응답으로 메모리에서만 동작한다(서버 저장 없음) — /mock 접두사는 proxy.ts가 로그인 없이 통과시킨다.
import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import TeamUnderstanding from '@/components/team/TeamUnderstanding'
import RoundSurvey, { emptyAnswers } from '@/components/team/RoundSurvey'
import RoundResponses from '@/components/team/RoundResponses'
import { analyzeTeam, type Profile } from '@/lib/team/composition'
import { computeRoundResult, type R0Answers } from '@/lib/team/r0'
import { HEALTH_ITEMS } from '@/lib/teamHealth'
import type { ResponseRow, RoundView } from '@/lib/team/rounds'

const people = [
  { id: 'a', name: '가팀장' }, { id: 'b', name: '나파트' }, { id: 'c', name: '다팀원' }, { id: 'd', name: '라팀원' }, { id: 'e', name: '마팀원' },
]
const ws = (o: Partial<R0Answers['ws']>): R0Answers['ws'] => ({ when_stuck: 'share', feedback_pref: 'direct', focus_time: 'morning', meeting_pref: 'agenda', gives_tags: [], needs_tags: [], growth_edge: null, team_request: null, ...o })
const profiles: Record<string, R0Answers['ws']> = {
  a: ws({ feedback_pref: 'direct', gives_tags: ['기획력', '추진력'], needs_tags: ['빠른 피드백'], team_request: '결정 전에 한 번 물어봐 주세요' }),
  b: ws({ feedback_pref: 'direct', gives_tags: ['관계/소통', '조율/중재'], needs_tags: ['명확한 방향'] }),
  c: ws({ feedback_pref: 'gentle', when_stuck: 'solo', gives_tags: ['분석력'], needs_tags: ['자율성', '정보 공유'] }),
  d: ws({ feedback_pref: 'written', gives_tags: ['꼼꼼함', '정리/문서화'], needs_tags: ['업무 분담'], growth_edge: '갈등 상황에서 직접 말하기' }),
  e: ws({ feedback_pref: 'written', focus_time: 'afternoon', meeting_pref: 'spontaneous', gives_tags: ['실행력'], needs_tags: ['빠른 피드백'] }),
}
const answers = (id: string, i: number): R0Answers => ({
  ws: profiles[id],
  jh_self: ['analytic', 'accountable', 'diligent'],
  jh_peers: Object.fromEntries(people.filter(p => p.id !== id).slice(0, 2).map(p => [p.id, ['accountable', 'considerate', i % 2 ? 'driving' : 'meticulous']])),
  health: Object.fromEntries(HEALTH_ITEMS.map((it, k) => [it.id, it.layer === 'conflict' ? 2 + (k % 2) : 3 + ((i + k) % 3)])),
  friction: { feedback_pref: i < 3 ? 2 : 0, when_stuck: i === 2 ? 1 : 0, meeting_pref: 0, focus_time: i === 4 ? 1 : 0 },
  friction_note: i === 1 ? '급한 피드백이 메신저로만 오가서 맥락을 놓쳤다' : null,
  strengths: i % 2 ? ['commit', 'help'] : ['commit', 'own'],
  keep_note: i === 0 ? '결정한 건 회의 당일 한 줄로 남기기' : null,
  change: i < 3 ? ['feedback_way'] : ['disagree'],
  change_note: null,
})
const responses: ResponseRow[] = people.map((p, i) => ({ member_id: p.id, answers: answers(p.id, i), submitted_at: '2026-11-03T01:00:00Z', updated_at: null }))
const result = computeRoundResult(responses.map(r => ({ member_id: r.member_id, answers: r.answers })), people.map(p => p.id))
const base = { id: 'r1', kind: 'baseline' as const, title: 'R0 최초 팀 진단', items_version: 'r0-v1', roster: people.map(p => p.id), opened_at: '2026-11-02T00:00:00Z', in_roster: true }
const ROUNDS: Record<string, RoundView | null> = {
  none: null,
  open: { ...base, status: 'open', closed_at: null, close_reason: null, roster_n: 5, submitted_n: 3, my_submitted: true, result: null },
  closed: { ...base, status: 'closed', closed_at: '2026-11-06T09:00:00Z', close_reason: 'all_submitted', roster_n: 5, submitted_n: 5, my_submitted: true, result },
}

export default function TeamDynamicsMockPage() {
  return <Suspense><MockView /></Suspense>
}

function MockView() {
  // ?state=none|open|closed 로 바로 열 수 있게(스크린샷·모바일 폭 iframe 확인용)
  const q = useSearchParams().get('state')
  const [state, setState] = useState<'none' | 'open' | 'closed'>(q === 'none' || q === 'open' ? q : 'closed')
  const [lead, setLead] = useState(true)
  const [survey, setSurvey] = useState(false)
  const [showResponses, setShowResponses] = useState(false)
  const round = ROUNDS[state]
  const analysis = useMemo(() => analyzeTeam({ people, profiles: profiles as Record<string, Profile>, result: state === 'closed' ? result : null }), [state])

  return (
    <div className="min-h-screen bg-[#F7F8F8] px-4 sm:px-6 py-8">
      <div className="max-w-[1120px] mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-[#7A8491]">미리보기 상태:</span>
          {(['none', 'open', 'closed'] as const).map(s => (
            <button key={s} onClick={() => setState(s)} className={`px-2.5 py-1 rounded-md ${state === s ? 'bg-[#1F2933] text-white' : 'bg-white border border-[#E5E8EB]'}`}>{s === 'none' ? 'R0 미실시' : s === 'open' ? '진행 중' : '완료'}</button>
          ))}
          <label className="ml-3 flex items-center gap-1"><input type="checkbox" checked={lead} onChange={e => setLead(e.target.checked)} /> 팀장으로 보기</label>
        </div>
        <TeamUnderstanding people={people} analysis={analysis} profiles={profiles as Record<string, Profile>} round={round} isLead={lead}
          onStart={() => setState('open')} onRespond={() => setSurvey(true)} onClose={() => setState('closed')} onShowResponses={() => setShowResponses(true)} />
        {survey && (
          <RoundSurvey title="R0 최초 팀 진단" meId="c" peers={people.filter(p => p.id !== 'c')} initial={emptyAnswers(profiles.c)} alreadySubmitted={false}
            onSubmit={() => setSurvey(false)} onCancel={() => setSurvey(false)} />
        )}
        {showResponses && <RoundResponses title="R0 최초 팀 진단" responses={responses} nameOf={id => people.find(p => p.id === id)?.name ?? id} onClose={() => setShowResponses(false)} />}
      </div>
    </div>
  )
}
