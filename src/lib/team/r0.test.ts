import { describe, expect, it } from 'vitest'
import { HEALTH_ITEMS, layerScores, layerScoresFromSummary } from '@/lib/teamHealth'
import { computeLegacyResult, itemsSnapshot, validateLegacyAnswers, ITEMS_VERSION } from './r0'

// 구버전(r0-v2) 응답 규칙 — 운영에 v2로 열린 회차가 있을 수 있어 그대로 보존·검증한다(r0-v3는 r0v3.test.ts).
const validateAnswers = (raw: unknown, ctx: { selfId: string; peerIds: string[] }) => validateLegacyAnswers(raw, ctx, 'r0-v2')
import { sampleAnswers } from './testFixtures'

const SELF = 'm1'
const PEERS = ['m2', 'm3']

describe('validateAnswers', () => {
  it('정상 응답 통과', () => {
    const r = validateAnswers(sampleAnswers(), { selfId: SELF, peerIds: PEERS })
    expect(r.ok).toBe(true)
  })
  it('필수 누락은 거부하고 이유를 알려 준다', () => {
    const r = validateAnswers({}, { selfId: SELF, peerIds: PEERS })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(5)
  })
  it('허용되지 않은 값·모르는 키는 버린다', () => {
    const raw = { ...sampleAnswers(), extra: 'x', ws: { ...sampleAnswers().ws, gives_tags: ['실행력', '해킹'], role: 'lead' } }
    const r = validateAnswers(raw, { selfId: SELF, peerIds: PEERS })
    expect(r.ok && r.answers.ws.gives_tags).toEqual(['실행력'])
    expect(r.ok && 'extra' in r.answers).toBe(false)
    expect(r.ok && 'role' in r.answers.ws).toBe(false)
  })
  it('잘못된 선택지는 거부', () => {
    const r = validateAnswers({ ...sampleAnswers(), ws: { ...sampleAnswers().ws, when_stuck: 'boss' } }, { selfId: SELF, peerIds: PEERS })
    expect(r.ok).toBe(false)
  })
  it('건강도 범위 밖·소수는 거부', () => {
    expect(validateAnswers({ ...sampleAnswers(), health: { ...sampleAnswers().health, t1: 6 } }, { selfId: SELF, peerIds: PEERS }).ok).toBe(false)
    expect(validateAnswers({ ...sampleAnswers(), health: { ...sampleAnswers().health, t1: 3.5 } }, { selfId: SELF, peerIds: PEERS }).ok).toBe(false)
  })
  it('조하리 동료 선택: 나 자신·명단 밖 대상은 버리고, 고르면 3~6개여야 한다', () => {
    const r = validateAnswers({ ...sampleAnswers(), jh_peers: { m1: ['warm', 'humble', 'candid'], zz: ['warm', 'humble', 'candid'], m2: ['warm', 'humble', 'candid'] } }, { selfId: SELF, peerIds: PEERS })
    expect(r.ok && Object.keys(r.answers.jh_peers)).toEqual(['m2'])
    expect(validateAnswers({ ...sampleAnswers(), jh_peers: { m2: ['warm'] } }, { selfId: SELF, peerIds: PEERS }).ok).toBe(false)
  })
  it('강점 1~3개, 바꿀 것 0~2개', () => {
    expect(validateAnswers({ ...sampleAnswers(), strengths: [] }, { selfId: SELF, peerIds: PEERS }).ok).toBe(false)
    expect(validateAnswers({ ...sampleAnswers(), strengths: ['commit', 'help', 'candid', 'own'] }, { selfId: SELF, peerIds: PEERS }).ok).toBe(false)
    expect(validateAnswers({ ...sampleAnswers(), change: ['ask_help', 'disagree', 'time_sync'] }, { selfId: SELF, peerIds: PEERS }).ok).toBe(false)
  })
  it('자유 입력은 다듬고 길이를 자른다', () => {
    const r = validateAnswers({ ...sampleAnswers(), keep_note: '  ' + 'a'.repeat(400) }, { selfId: SELF, peerIds: PEERS })
    expect(r.ok && r.answers.keep_note?.length).toBe(300)
  })
})

describe('computeRoundResult', () => {
  const a1 = sampleAnswers()
  const a2 = sampleAnswers({ ws: { ...a1.ws, feedback_pref: 'gentle', gives_tags: ['관계/소통'] }, friction: { feedback_pref: 3, when_stuck: 0, meeting_pref: 0, focus_time: 0 }, strengths: ['commit', 'help'], jh_peers: { m1: ['warm', 'candid', 'humble'] } })
  const res = computeLegacyResult([{ member_id: 'm1', answers: a1 }, { member_id: 'm2', answers: a2 }], ['m1', 'm2', 'm3'], 'r0-v2')
  it('인원·명단·버전', () => {
    expect([res.n, res.roster_n, res.version]).toEqual([2, 3, 'r0-v2'])
    expect(res.respondent_ids).toEqual(['m1', 'm2'])
  })
  it('성향·태그·강점 집계', () => {
    expect(res.ws.feedback_pref).toEqual({ direct: 1, gentle: 1 })
    expect(res.gives).toEqual({ '실행력': 1, '관계/소통': 1 })
    expect(res.strengths).toEqual({ commit: 2, help: 1 })
  })
  it('협업 경험은 응답 단계별 인원', () => {
    expect(res.friction.feedback_pref).toEqual({ '0': 1, '3': 1 })
  })
  it('건강도 집계는 개별 계산과 같은 층 점수', () => {
    const fromResult = layerScoresFromSummary(res.health)
    const direct = layerScores([a1.health, a2.health])
    fromResult.forEach((l, i) => expect(l.score).toBeCloseTo(direct[i].score, 10))
  })
  it('조하리 동료 선택은 대상별·전체로 센다', () => {
    expect(res.johari.peer_by_about.m1).toEqual({ warm: 1, candid: 1, humble: 1 })
    expect(res.johari.peer_raters.m1).toBe(1)
    expect(res.johari.self.analytic).toBe(2)
  })
})

describe('itemsSnapshot', () => {
  it('새 회차의 기본 버전은 r0-v3', () => {
    expect(ITEMS_VERSION).toBe('r0-v3')
    expect(itemsSnapshot().version).toBe('r0-v3')
  })
  it('구버전 스냅샷은 그때의 문항 원문을 그대로 담는다', () => {
    const s = itemsSnapshot('r0-v2') as ReturnType<typeof itemsSnapshot> & { health: { items: unknown[] }; friction: { items: { key: string }[] } }
    expect(s.version).toBe('r0-v2')
    expect(s.health.items).toHaveLength(HEALTH_ITEMS.length)
    expect(s.friction.items.map(f => f.key).sort()).toEqual(['feedback_pref', 'focus_time', 'meeting_pref', 'when_stuck'])
  })
})
