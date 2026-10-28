// 테스트 공용 — 검증을 통과하는 R0 응답 예시. over로 일부만 바꿔 쓴다.
import { HEALTH_ITEMS } from '@/lib/teamHealth'
import type { R0Answers } from './r0'

export function sampleAnswers(over: Partial<R0Answers> = {}): R0Answers {
  return {
    ws: { when_stuck: 'solo', feedback_pref: 'direct', focus_time: 'morning', meeting_pref: 'agenda', gives_tags: ['실행력'], needs_tags: ['빠른 피드백'], growth_edge: null, team_request: null },
    jh_self: ['analytic', 'logical', 'creative'],
    jh_peers: {},
    health: Object.fromEntries(HEALTH_ITEMS.map(i => [i.id, 4])),
    friction: { feedback_pref: 0, when_stuck: 1, meeting_pref: 0, focus_time: 2 },
    friction_note: null, strengths: ['commit'], keep: ['commit'], keep_note: null, change: [], change_note: null,
    ...over,
  }
}
