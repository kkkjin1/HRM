import { describe, expect, it } from 'vitest'
import { addDays, conditionOf, kstDay, landing, rankOf, scoreOf, weekStart, type ShotRow } from './dailyShot'

describe('오늘의 한 발', () => {
  it('점수: 가운데 100, 가장자리로 갈수록 낮고, 과녁 밖 0', () => {
    expect(scoreOf(0, 0)).toBe(100)
    expect(scoreOf(0.04, 0.02)).toBe(100)
    expect(scoreOf(0.5, 0)).toBe(48)
    expect(scoreOf(0, -0.99)).toBe(1)
    expect(scoreOf(1, 0)).toBe(0)
    expect(scoreOf(1.2, 0.3)).toBe(0)
  })
  it('오늘의 조건은 날짜마다 같고(팀 전원 같음), 날짜가 바뀌면 달라진다', () => {
    expect(conditionOf('2026-11-18')).toEqual(conditionOf('2026-11-18'))
    const labels = new Set(Array.from({ length: 40 }, (_, i) => conditionOf(addDays('2026-11-01', i)).label))
    expect(labels.size).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < 60; i++) {
      const c = conditionOf(addDays('2026-01-01', i))
      expect(Math.hypot(c.windX, c.windY)).toBeLessThanOrEqual(0.27)
      expect(c.speedX).toBeGreaterThan(0.5); expect(c.speedY).toBeLessThan(0.95)
    }
  })
  it('바람만큼 밀린다 — 무풍이면 조준한 곳 그대로', () => {
    let calm = '', i = 0
    while (!calm) { const d = addDays('2026-01-01', i++); if (conditionOf(d).windLv === 0) calm = d }
    expect(landing(0.1, -0.2, conditionOf(calm))).toEqual({ x: 0.1, y: -0.2 })
  })
  it('서울 날짜·주 시작(월요일)', () => {
    expect(kstDay(Date.UTC(2026, 10, 17, 15, 30))).toBe('2026-11-18') // UTC 15:30 = 서울 0:30
    expect(weekStart('2026-11-18')).toBe('2026-11-16') // 수 → 월
    expect(weekStart('2026-11-16')).toBe('2026-11-16')
    expect(weekStart('2026-11-22')).toBe('2026-11-16') // 일 → 그 주 월
  })
  it('주간 순위: 합계 순, 놓침은 0점, 기간 밖 제외, 동점은 최고점', () => {
    const row = (id: number, m: string, day: string, score: number | null): ShotRow => ({ id, member_id: m, day, x: 0, y: 0, score, started_at: '' })
    const rows = [
      row(1, 'a', '2026-11-16', 80), row(2, 'a', '2026-11-17', null),
      row(3, 'b', '2026-11-16', 40), row(4, 'b', '2026-11-17', 40),
      row(5, 'c', '2026-11-16', 70), row(6, 'c', '2026-11-17', 10),
      row(7, 'd', '2026-11-13', 100),
    ]
    const r = rankOf(rows, '2026-11-16', '2026-11-22')
    expect(r.map(x => x.member_id)).toEqual(['a', 'c', 'b'])
    expect(r[0]).toMatchObject({ total: 80, days: 2, best: 80 })
  })
})
