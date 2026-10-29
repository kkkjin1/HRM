// r0-v3 가상 5명 응답 — 미리보기(/mock/team-dynamics)·시나리오 테스트·분석 예시가 함께 쓴다. 실제 팀원 데이터가 아니다.
// 설계한 역학(검증 대상): 상호 지원은 대체로 잘 되지만 '혼자 먼저 씨름' 선호인 한 사람은 도움 요청을 어렵게 경험 /
// 정보 공유는 사람마다 크게 엇갈리고 실제 마찰·개선 희망·성공 사례가 함께 있음 / 회의 결정 정리를 팀장은 유지 행동으로, 팀원은 개선 희망으로 꼽음 /
// 이견·심리적 안전감은 높게 나오지만 실명·팀장 포함 응답의 한계 / 합류 4주 미만 1명의 '관찰 기회 없음' / 1명의 '4회 이상' 피드백 마찰.

import type { R0V3Answers } from '@/lib/team/r0v3'

export const PEOPLE_V3 = [
  { id: 'a', name: '가팀장' }, { id: 'b', name: '나파트' }, { id: 'c', name: '다팀원' }, { id: 'd', name: '라팀원' }, { id: 'e', name: '마팀원' },
]

type Over = Partial<Omit<R0V3Answers, 'ws' | 'success' | 'improve' | 'friction_case'>> & {
  ws?: Partial<R0V3Answers['ws']>; success?: Partial<R0V3Answers['success']>; improve?: Partial<R0V3Answers['improve']>; friction_case?: Partial<R0V3Answers['friction_case']>
}
const B = (v: (number | 'na')[]) => Object.fromEntries(v.map((x, i) => [`B${String(i + 1).padStart(2, '0')}`, x])) as R0V3Answers['behavior']
const C = (v: (number | 'na')[]) => Object.fromEntries(v.map((x, i) => [`C0${i + 1}`, x])) as R0V3Answers['friction']

// 검증을 통과하는 기본 응답(테스트용). over로 일부만 바꾼다.
export function sampleAnswersV3(over: Over = {}): R0V3Answers {
  const base: R0V3Answers = {
    ws: { when_stuck: 'share', feedback_pref: 'direct', focus_time: 'morning', meeting_pref: 'agenda', gives_tags: ['실행력'], needs_tags: ['빠른 피드백'], growth_edge: null, team_request: null },
    short_tenure: false, jh_self: [], jh_peers: {},
    behavior: B([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]), friction: C([0, 0, 0, 0]),
    friction_case: { text: null, items: [] },
    success: { none: true, situation: null, behaviors: null, domains: [] },
    keep: ['K01'], keep_other: null, keep_note: null,
    improve: { areas: ['none'], other: null, situation: null, impact: null, change: null },
    perspective: null,
  }
  return {
    ...base, ...over,
    ws: { ...base.ws, ...over.ws }, success: { ...base.success, ...over.success }, improve: { ...base.improve, ...over.improve }, friction_case: { ...base.friction_case, ...over.friction_case },
  }
}

export const ANSWERS_V3: Record<string, R0V3Answers> = {
  a: sampleAnswersV3({
    ws: { when_stuck: 'share', feedback_pref: 'direct', focus_time: 'morning', meeting_pref: 'agenda', gives_tags: ['기획력', '추진력'], needs_tags: ['빠른 피드백'], team_request: '결정 전에 한 번 물어봐 주세요' },
    jh_self: ['strategic', 'accountable', 'composed'], jh_peers: { b: ['considerate', 'cooperative', 'listener'], d: ['meticulous', 'diligent', 'accountable'] },
    behavior: B([5, 4, 4, 4, 5, 4, 4, 5, 4, 4, 3, 4]), friction: C([0, 0, 0, 0]),
    success: { none: false, situation: '월말 급여 마감 때 파트별로 검증 범위를 나눠 하루 일찍 마감했다', behaviors: '각자 맡은 검증 범위를 먼저 확인하고 막힌 건 바로 채널에 공유했다', domains: ['goals', 'support'] },
    keep: ['K06', 'K01'], keep_note: '회의 끝에 담당과 기한을 확인하는 지금 방식이 효과가 있다고 본다',
    improve: { areas: ['learning'], situation: '같은 실수가 반복될 때 개인 확인으로만 끝나고 방식은 그대로였다', change: '분기마다 30분이라도 일하는 방식을 돌아보는 자리' },
    perspective: '저는 회의가 효율적이라고 생각하지만, 맥락을 늦게 전달받는 팀원은 다르게 느낄 수 있을 것 같다',
  }),
  b: sampleAnswersV3({
    ws: { when_stuck: 'share', feedback_pref: 'direct', focus_time: 'anytime', meeting_pref: 'agenda', gives_tags: ['관계/소통', '조율/중재'], needs_tags: ['명확한 방향'] },
    jh_self: ['considerate', 'cooperative', 'warm'], jh_peers: { a: ['driving', 'strategic', 'persuasive'], c: ['analytic', 'logical', 'prudent'] },
    behavior: B([4, 4, 4, 3, 5, 4, 5, 5, 3, 4, 4, 3]), friction: C([0, 0, 0, 1]),
    success: { none: false, situation: '채용 일정이 한 주에 몰렸을 때 면접 일정을 서로 대신 잡아 줬다', behaviors: '가능한 시간대를 먼저 알려 주고, 빈 일정은 누가 맡을지 바로 정했다', domains: ['support'] },
    keep: ['K05'],
    improve: { areas: ['none'] },
  }),
  c: sampleAnswersV3({
    ws: { when_stuck: 'solo', feedback_pref: 'gentle', focus_time: 'morning', meeting_pref: 'agenda', gives_tags: ['분석력', '정리/문서화'], needs_tags: ['정보 공유', '자율성'], growth_edge: '막혀도 혼자 오래 붙잡고 있는 편' },
    jh_self: ['analytic', 'prudent', 'humble'], jh_peers: { a: ['driving', 'strategic', 'confident'], d: ['meticulous', 'accountable', 'composed'] },
    behavior: B([4, 3, 2, 2, 4, 3, 2, 4, 2, 3, 'na', 2]), friction: C([2, 0, 1, 1]),
    friction_case: { text: '업무 우선순위가 바뀐 걸 이틀 뒤에 알게 되어 만들던 표를 다시 만들었다', items: ['C01', 'C03'] },
    success: { none: true },
    keep: ['K03'], keep_note: '배경을 같이 받으면 혼자 판단할 때도 덜 헤맨다',
    improve: { areas: ['info'], situation: '우선순위 변경이 개인 메신저로만 오가서 늦게 알았다', impact: '작성한 자료 절반을 다시 만들었다', change: '변경 사항은 팀 채널에 한 줄로 남기기' },
  }),
  d: sampleAnswersV3({
    ws: { when_stuck: 'depends', feedback_pref: 'written', focus_time: 'afternoon', meeting_pref: 'agenda', gives_tags: ['꼼꼼함', '전문성'], needs_tags: ['의사결정 지원'] },
    jh_self: ['meticulous', 'diligent', 'logical'], jh_peers: { a: ['driving', 'confident', 'strategic'], e: ['optimistic', 'passionate', 'curious'] },
    behavior: B([4, 4, 4, 2, 5, 4, 4, 4, 2, 3, 3, 3]), friction: C([0, 3, 0, 2]),
    friction_case: { text: '검토 피드백이 마감 직전에 한꺼번에 와서 거의 다시 작성했다', items: ['C02'] },
    success: { none: false, situation: '규정 개정안 검토에서 반대 의견을 근거와 함께 냈고 대안이 반영됐다', behaviors: '의견이 달라도 근거 자료를 먼저 보자고 했다', domains: ['safety'] },
    keep: ['K04'],
    improve: { areas: ['execution', 'safety'], situation: '회의에서 결론은 났는데 담당과 기한이 불분명해 다음 회의에서 다시 논의했다', impact: '같은 안건을 두 번 다뤘다', change: '회의 끝에 담당·기한을 한 번 더 확인' },
  }),
  e: sampleAnswersV3({
    ws: { when_stuck: 'share', feedback_pref: 'gentle', focus_time: 'morning', meeting_pref: 'spontaneous', gives_tags: ['실행력'], needs_tags: ['정보 공유', '업무 분담'] },
    short_tenure: true,
    behavior: B([3, 2, 2, 'na', 3, 'na', 4, 4, 3, 4, 'na', 'na']), friction: C([1, 0, 1, 'na']),
    success: { none: false, situation: '입사 첫 주에 온보딩 체크리스트를 공유받아 빨리 적응했다', domains: ['info'] },
    keep: ['K02'],
    improve: { areas: ['goals'], situation: '업무를 받을 때 완료 기준이 서로 달라 두 번 수정했다', change: '요청할 때 완료 기준 예시를 같이 주기' },
    perspective: '입사한 지 얼마 안 돼서 다른 사람들과 비교 기준이 다를 수 있다',
  }),
}
