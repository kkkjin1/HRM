import { describe, expect, it } from 'vitest'
import { analyzeTeam, classify, type Profile } from './composition'
import { computeRoundResult } from './r0'
import { sampleAnswers } from './testFixtures'

const people = [
  { id: 'a', name: '가' }, { id: 'b', name: '나' }, { id: 'c', name: '다' }, { id: 'd', name: '라' }, { id: 'e', name: '마' },
]
const p = (o: Partial<Profile>): Profile => ({ when_stuck: 'share', feedback_pref: 'direct', focus_time: 'morning', meeting_pref: 'agenda', gives_tags: [], needs_tags: [], ...o })
const profiles: Record<string, Profile> = {
  a: p({ feedback_pref: 'direct', gives_tags: ['기획력', '실행력'], needs_tags: ['빠른 피드백'] }),
  b: p({ feedback_pref: 'direct', gives_tags: ['관계/소통'], needs_tags: ['명확한 방향'] }),
  c: p({ feedback_pref: 'gentle', when_stuck: 'solo', gives_tags: ['분석력'], needs_tags: ['자율성'] }),
  d: p({ feedback_pref: 'written', gives_tags: ['꼼꼼함'], needs_tags: ['업무 분담'] }),
  e: p({ feedback_pref: 'written', focus_time: 'afternoon', gives_tags: ['실행력'], needs_tags: ['빠른 피드백'] }),
}

describe('analyzeTeam — 프로필만(R0 전)', () => {
  const t = analyzeTeam({ people, profiles, result: null })
  it('출처를 프로필로 표시하고 실제 경험은 비워 둔다', () => {
    expect(t.source).toBe('profile')
    expect(t.experience).toBeNull()
    expect(t.checks.every(c => c.kind === null && c.experience === null)).toBe(true)
  })
  it('공통 성향은 과반(2명 이상)만', () => {
    const keys = t.common.map(c => `${c.key}:${c.group.value}`)
    expect(keys).toContain('meeting_pref:agenda')        // 5/5
    expect(keys).toContain('when_stuck:share')           // 4/5
    expect(keys).not.toContain('feedback_pref:direct')   // 2/5는 과반 아님
  })
  it('다양한 차원(선택이 갈림)', () => {
    expect(t.diverse.map(d => d.key).sort()).toEqual(['feedback_pref', 'focus_time', 'when_stuck'])
  })
  it('보완: 기대(빠른 피드백)를 다른 사람이 보탬으로 채운다 — 근거 태그와 사람', () => {
    const fast = t.complements.find(c => c.need === '빠른 피드백')!
    expect(fast.demand.sort()).toEqual(['a', 'e'])
    expect(fast.supply.find(s => s.tag === '관계/소통')!.memberIds).toEqual(['b'])
  })
  it('채울 사람이 없는 기대는 따로 모은다 — 자율성은 연결 규칙이 없어 제외', () => {
    expect(t.unmetNeeds.map(u => u.need)).toEqual(['업무 분담'])
    expect(t.emptyGives.sort()).toEqual(['조율/중재', '추진력'])
  })
  it('개인 간 점수는 만들지 않는다', () => {
    expect(JSON.stringify(t)).not.toMatch(/score"\s*:\s*\{|compat|궁합/)
  })
})

describe('analyzeTeam — R0 결과 포함', () => {
  const answers = people.map((x, i) => ({
    member_id: x.id,
    answers: sampleAnswers({
      friction: { feedback_pref: i < 3 ? 2 : 0, when_stuck: 0, meeting_pref: i === 0 ? 1 : 0, focus_time: 0 },
      strengths: i % 2 ? ['commit', 'help'] : ['commit'],
      change: i < 2 ? ['feedback_way'] : [],
    }),
  }))
  const result = computeRoundResult(answers, people.map(x => x.id))
  const t = analyzeTeam({ people, profiles, result })
  it('잠재 × 실제 2×2 분류', () => {
    const by = Object.fromEntries(t.checks.map(c => [c.key, c.kind]))
    expect(by.feedback_pref).toBe('watch')      // 성향 갈림 + 실제 경험 3명
    expect(by.meeting_pref).toBe('other_cause') // 성향 같음 + 경험 1명 → 방식 차이 외 원인 확인
    expect(by.when_stuck).toBe('latent')        // 성향 갈림 + 경험 없음 → 가설로만
    expect(by.focus_time).toBe('latent')
  })
  it('실제 경험 인원(한두 번 이상 / 몇 번 이상)', () => {
    const f = t.experience!.friction.find(x => x.key === 'feedback_pref')!
    expect([f.experienced, f.frequent, f.n]).toEqual([3, 3, 5])
  })
  it('강점·바꿀 것 순위', () => {
    expect(t.experience!.strengths[0]).toMatchObject({ key: 'commit', count: 5 })
    expect(t.experience!.change[0]).toMatchObject({ key: 'feedback_way', count: 2 })
  })
})

describe('classify', () => {
  const e = (experienced: number) => ({ key: 'feedback_pref' as const, experienced, frequent: 0, n: 5, counts: {} })
  it('R0 전이면 판단 보류(null)', () => expect(classify(true, null)).toBeNull())
  it('4분류', () => {
    expect([classify(true, e(1)), classify(false, e(1)), classify(true, e(0)), classify(false, e(0))]).toEqual(['watch', 'other_cause', 'latent', 'stable'])
  })
})
