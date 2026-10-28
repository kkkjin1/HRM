import { describe, expect, it } from 'vitest'
import { JOHARI_TRAITS, computeJohari, computeJohariFromCounts, countPeerPicks, type JohariSummary } from './johari'
import { HEALTH_ITEMS, layerScores, layerScoresFromSummary, type HealthAnswers, type HealthPeriodSummary } from './teamHealth'

// 조하리·건강도 화면이 원본(작성자 포함) 대신 DB 집계만 받도록 바꿨다 — 집계로 낸 결과가 예전 원본 계산과 같아야 한다.
// 아래 두 함수는 DB 함수 johari_summary()·team_health_summary()와 같은 규칙의 참조 구현(테스트 전용, 앱은 원본을 읽지 않는다).
function summarizeJohari(picks: { about_id: string; author_id: string; traits: string[] }[], memberIds: string[]): JohariSummary[] {
  return memberIds.map(id => {
    const self = picks.find(p => p.about_id === id && p.author_id === id)
    const peers = picks.filter(p => p.about_id === id && p.author_id !== id)
    return { about_id: id, self_traits: self ? self.traits : null, peer_n: peers.length, peer_counts: countPeerPicks(peers.map(p => p.traits)) }
  })
}

function summarizeHealth(rows: { period: string; member_id: string; answers: HealthAnswers }[]): HealthPeriodSummary[] {
  const byPeriod = new Map<string, HealthPeriodSummary>()
  for (const r of rows) {
    const s = byPeriod.get(r.period) ?? { period: r.period, n: 0, items: {} }
    s.n += 1
    for (const [k, v] of Object.entries(r.answers)) {
      if (typeof v !== 'number' || v <= 0) continue
      const it = s.items[k] ?? { sum: 0, count: 0 }
      s.items[k] = { sum: it.sum + v, count: it.count + 1 }
    }
    byPeriod.set(r.period, s)
  }
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period))
}

function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
}

describe('조하리 집계 계산 = 예전 원본 계산', () => {
  const keys = JOHARI_TRAITS.map(t => t.key)
  for (let seed = 1; seed <= 30; seed++) {
    it(`무작위 #${seed}`, () => {
      const r = rng(seed)
      const pick = () => keys.filter(() => r() < 0.15)
      const self = pick()
      const peers = Array.from({ length: Math.floor(r() * 6) }, pick)
      const ids = ['a', 'b']
      const picks = [{ about_id: 'a', author_id: 'a', traits: self }, ...peers.map((traits, i) => ({ about_id: 'a', author_id: `p${i}`, traits }))]
      const summary = summarizeJohari(picks, ids).find(s => s.about_id === 'a')!
      expect(computeJohariFromCounts(summary.self_traits ?? [], summary.peer_counts)).toEqual(computeJohari(self, peers))
      expect(summary.peer_n).toBe(peers.length)
    })
  }
  it('한 사람이 같은 형용사를 두 번 넣어도 1명으로 센다', () => {
    const s = summarizeJohari([{ about_id: 'a', author_id: 'p', traits: ['analytic', 'analytic'] }], ['a'])[0]
    expect(s.peer_counts).toEqual({ analytic: 1 })
  })
  it('본인 미응답은 self_traits = null', () => {
    expect(summarizeJohari([], ['a'])[0]).toEqual({ about_id: 'a', self_traits: null, peer_n: 0, peer_counts: {} })
  })
  it('집계 결과에는 동료 작성자 id가 없다', () => {
    const s = summarizeJohari([{ about_id: 'a', author_id: 'secret-author', traits: ['warm'] }], ['a'])
    expect(JSON.stringify(s)).not.toContain('secret-author')
  })
})

describe('건강도 집계 계산 = 예전 원본 계산', () => {
  for (let seed = 1; seed <= 30; seed++) {
    it(`무작위 #${seed}`, () => {
      const r = rng(seed)
      const answers: HealthAnswers[] = Array.from({ length: 1 + Math.floor(r() * 6) }, () =>
        Object.fromEntries(HEALTH_ITEMS.filter(() => r() < 0.85).map(i => [i.id, Math.floor(r() * 6)]))) // 0 = 무응답 취급
      const rows = answers.map((a, i) => ({ period: '2026-2H', member_id: `m${i}`, answers: a }))
      const [summary] = summarizeHealth(rows)
      const fromSummary = layerScoresFromSummary(summary.items)
      const original = layerScores(answers)
      fromSummary.forEach((s, i) => {
        expect(s.responses).toBe(original[i].responses)
        expect(s.score).toBeCloseTo(original[i].score, 10)
      })
      expect(summary.n).toBe(answers.length)
    })
  }
  it('DB 함수처럼 sum·count가 문자열(numeric)로 와도 같은 값', () => {
    const fromDb = layerScoresFromSummary({ t1: { sum: '9' as unknown as number, count: '2' as unknown as number }, t2: { sum: 3, count: 2 } })
    expect(fromDb[0].score).toBeCloseTo((9 + (12 - 3)) / 4, 10)
  })
  it('기간별로 나뉘고 기간 순으로 정렬된다', () => {
    const s = summarizeHealth([
      { period: '2026-2H', member_id: 'a', answers: { t1: 4 } },
      { period: '2026-1H', member_id: 'a', answers: { t1: 2 } },
    ])
    expect(s.map(x => x.period)).toEqual(['2026-1H', '2026-2H'])
  })
})
