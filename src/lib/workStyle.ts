export const GIVES_TAGS = ['실행력', '분석력', '아이디어', '관계/소통', '정리/문서화', '꼼꼼함', '추진력', '조율/중재', '기획력', '전문성']
export const NEEDS_TAGS = ['명확한 방향', '빠른 피드백', '자율성', '공감/지지', '기술적 도움', '의사결정 지원', '업무 분담', '정보 공유']

export const WORK_STYLE_QUESTIONS = [
  {
    key: 'when_stuck' as const,
    label: '막혔을 때',
    icon: '🤔',
    options: [
      { value: 'solo', label: '혼자 먼저 씨름' },
      { value: 'share', label: '바로 팀에 공유' },
      { value: 'depends', label: '상황마다 달라' },
    ],
  },
  {
    key: 'feedback_pref' as const,
    label: '피드백',
    icon: '💬',
    options: [
      { value: 'direct', label: '직접적으로' },
      { value: 'gentle', label: '맥락 먼저, 부드럽게' },
      { value: 'written', label: '텍스트로 정리해서' },
    ],
  },
  {
    key: 'focus_time' as const,
    label: '집중 시간',
    icon: '⏰',
    options: [
      { value: 'morning', label: '오전형' },
      { value: 'afternoon', label: '오후형' },
      { value: 'anytime', label: '상관없음' },
    ],
  },
  {
    key: 'meeting_pref' as const,
    label: '회의',
    icon: '📋',
    options: [
      { value: 'agenda', label: '아젠다 미리 필수' },
      { value: 'spontaneous', label: '즉흥도 OK' },
      { value: 'fewer', label: '길고 가끔이 낫다' },
    ],
  },
] as const

export type WorkStyleQuestionKey = typeof WORK_STYLE_QUESTIONS[number]['key']

export type WorkStyle = {
  member_id: string
  gives_tags: string[]
  needs_tags: string[]
  when_stuck: string | null
  feedback_pref: string | null
  focus_time: string | null
  meeting_pref: string | null
  growth_edge: string | null
  team_request: string | null
  updated_at: string
}

export type WorkStyleDraft = Omit<WorkStyle, 'member_id' | 'updated_at'>

export const EMPTY_DRAFT: WorkStyleDraft = {
  gives_tags: [],
  needs_tags: [],
  when_stuck: null,
  feedback_pref: null,
  focus_time: null,
  meeting_pref: null,
  growth_edge: null,
  team_request: null,
}

export function isFilledEnough(ws: WorkStyleDraft): boolean {
  return ws.gives_tags.length > 0 || ws.needs_tags.length > 0 || ws.when_stuck !== null
}

export function labelOf(key: WorkStyleQuestionKey, value: string | null): string | null {
  if (!value) return null
  const q = WORK_STYLE_QUESTIONS.find(q => q.key === key)
  return q?.options.find(o => o.value === value)?.label ?? null
}
