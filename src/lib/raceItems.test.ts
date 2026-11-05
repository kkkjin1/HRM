import { describe, expect, it } from 'vitest'
import { HURDLE_SHOTS, LANE_Y, SHIELD_MS, SLOW_KEEP, fireItem, hitByMail, itemWeights, kartStep, newKart, noticeTarget, pickItem, rng, type Kart, type Thing } from '@/lib/race'

describe('🏎 새 아이템(🛡️ 🏃 📢)', () => {
  it('📢는 1등에겐 절대 안 나오고 뒤쪽에서만, 🍌·🏃는 앞일수록 많다', () => {
    for (const total of [2, 3, 4, 6]) {
      expect(itemWeights(0, total).notice).toBe(0)
      expect(itemWeights(0, total).mail).toBe(0) // 1등은 메일도 안 나온다
      expect(itemWeights(total - 1, total).notice).toBeGreaterThan(0)
    }
    expect(itemWeights(0, 4).hurdle).toBeGreaterThan(itemWeights(3, 4).hurdle)
    expect(itemWeights(0, 4).banana).toBeGreaterThan(itemWeights(3, 4).banana)
    const rand = rng(3)
    const seen = new Set<string>()
    for (let i = 0; i < 3000; i++) seen.add(pickItem(i % 4, 4, rand))
    expect([...seen].sort()).toEqual(['banana', 'hurdle', 'mail', 'notice', 'rocket', 'shield'])
  })

  it('🏃 허들은 세 번 쓸 수 있다', () => {
    let k: Kart = { ...newKart(0), item: 'hurdle', charges: HURDLE_SHOTS }
    const used: string[] = []
    for (let i = 0; i < 4; i++) { const u = fireItem(k, 1000); k = u.k; if (u.used) used.push(u.used) }
    expect(used).toEqual(['hurdle', 'hurdle', 'hurdle'])
    expect(k.item).toBeNull()
  })

  it('🏃 허들은 밟으면 감속(빙글 없음), 바나나보다 가로로 넓고, 옆 차선은 안 막는다', () => {
    const y = LANE_Y[1]
    const hurdle = { id: 'h', x: 600, y, owner: 'x', kind: 'hurdle' as const }
    const k = { ...newKart(0), x: 590, y, v: 300 }
    const hit = kartStep(k, 0, 1000, 16, [], [hurdle], 0, 1, rng(1))
    expect(hit.events).toContainEqual({ type: 'slow', by: 'hurdle', bananaId: 'h' })
    expect(hit.k.spinUntil).toBe(0)
    expect(hit.k.v).toBeLessThanOrEqual(300 * SLOW_KEEP + 20)
    // 가로로 20 비켜 있어도 허들은 걸리고, 바나나는 안 걸린다
    const off = { ...k, y: y + 20 }
    expect(kartStep(off, 0, 1000, 16, [], [hurdle], 0, 1, rng(1)).events.map(e => e.type)).toContain('slow')
    expect(kartStep(off, 0, 1000, 16, [], [{ ...hurdle, kind: undefined }], 0, 1, rng(1)).events.map(e => e.type)).not.toContain('spin')
    // 옆 차선(한 칸 옆) 차는 안 걸린다
    const next = { ...k, y: LANE_Y[2] }
    expect(kartStep(next, 0, 1000, 16, [], [hurdle], 0, 1, rng(1)).events.map(e => e.type)).not.toContain('slow')
  })

  it('🛡️ 도장은 처음 한 번(장애물·메일)을 막고 사라진다, 시간이 지나면 못 막는다', () => {
    const shielded = fireItem({ ...newKart(0), item: 'shield' as const }, 1000).k
    expect(shielded.shieldUntil).toBe(1000 + SHIELD_MS)
    const cone: Thing = { id: 1, kind: 'cone', x: 600, y: shielded.y, r: 12 }
    const k = { ...shielded, x: 590, v: 300 }
    const st = kartStep(k, 0, 1500, 16, [cone], [], 0, 1, rng(1))
    expect(st.events.map(e => e.type)).toContain('block')
    expect(st.k.spinUntil).toBe(0)
    expect(st.k.shieldUntil).toBe(0)
    const late = kartStep(k, 0, 1000 + SHIELD_MS + 10, 16, [cone], [], 0, 1, rng(1))
    expect(late.events.map(e => e.type)).toContain('spin')
    expect(hitByMail(shielded, 1200).blocked).toBe(true)
    expect(hitByMail(shielded, 9999).blocked).toBe(false)
  })

  it('📢 대상은 달리는 사람 중 1등(나 빼고), 내가 1등이면 대상 없음', () => {
    const rs = [{ id: 'a', x: 100, done: false }, { id: 'b', x: 900, done: false }, { id: 'c', x: 1200, done: true }]
    expect(noticeTarget('a', rs)).toBe('b')
    expect(noticeTarget('b', rs)).toBeNull()
  })
})
