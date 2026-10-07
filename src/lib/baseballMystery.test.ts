import { describe, it, expect } from 'vitest'
import {
  CONTACT_ADJUST_CAP, LINEUP, MYSTERY_EFFECT, NEUTRAL_PROFILE, PITCH_TYPES,
  judgeSwing, mysteryAdjust, mysteryFeedback, randomPitch, resolvePitch, simulateGame,
  type MysteryKind, type Outcome, type Pitch, type ReadGuess, type Swing,
} from './baseball'
import { MYSTERY_RATE, MYSTERY_WEIGHTS, makeDuelPitch, mysteryArmed, rollMysteryKind } from './baseballDuel'

// 대결 미스터리 피치 — 판정 폭 불변, 정타 이후 작은 보정, 투구 생성 때 종류 확정

function seeded(seed: number) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}
const center = (): Pitch => ({ id: 'c', type: 'fastball', speed: 145, alt: 1, slot: 'mid', windup: 900, height: 0, side: 0 })
const zero = () => 0
const KINDS: MysteryKind[] = ['MINI', 'NORMAL', 'GIANT']
const W = PITCH_TYPES.fastball.window

describe('mysteryAdjust — 정타 이후 보정', () => {
  it('MINI 안타 −3%p·비거리 ×1.05, PERFECT면 안타 패널티 없음 / GIANT +3%p·×0.95 / NORMAL 없음', () => {
    expect(mysteryAdjust('MINI', 'good')).toEqual({ edgeMul: 1, weakMul: 1, hitAdd: -0.03, distMul: 1.05 })
    expect(mysteryAdjust('MINI', 'perfect')).toEqual({ edgeMul: 1, weakMul: 1, hitAdd: 0, distMul: 1.05 })
    expect(mysteryAdjust('GIANT', 'fair')).toEqual({ edgeMul: 1, weakMul: 1, hitAdd: 0.03, distMul: 0.95 })
    expect(mysteryAdjust('NORMAL', 'perfect')).toEqual({ edgeMul: 1, weakMul: 1, hitAdd: 0, distMul: 1 })
    expect(mysteryAdjust(null, 'perfect').hitAdd).toBe(0)
    expect(MYSTERY_EFFECT.MINI.scale).toBe(0.45)
    expect(MYSTERY_EFFECT.GIANT.scale).toBe(2.2)
  })
})

describe('판정 폭·타이밍 원칙 유지', () => {
  it('PERFECT/GOOD/FAIR 경계는 공 종류와 무관', () => {
    for (const k of KINDS) {
      expect(judgeSwing(8 * W, center(), zero, { mystery: k }).outcome).toBe('perfect')
      expect(judgeSwing(8.3 * W, center(), () => 0.999, { mystery: k }).outcome).toBe('flyout') // GOOD
      expect(judgeSwing(18.5 * W, center(), () => 0.999, { mystery: k }).outcome).toBe('groundout') // FAIR
      expect(judgeSwing(40 * W, center(), zero, { mystery: k }).outcome).toBe('foul')
      expect(judgeSwing(70 * W, center(), zero, { mystery: k }).outcome).toBe('miss')
    }
  })
  it('GIANT도 타이밍이 나쁘면(파울·헛스윙 구간·존 밖) 안타가 아니다', () => {
    const r = seeded(3)
    for (let i = 0; i < 3000; i++) {
      const p: Pitch = { ...randomPitch(r), side: r() * 3.4 - 1.7 }
      const off = (35.01 + r() * 80) * PITCH_TYPES[p.type].window * (r() < 0.5 ? -1 : 1)
      expect(['perfect', 'good', 'fair']).not.toContain(judgeSwing(off, p, seeded(i + 1), { mystery: 'GIANT' }).outcome)
    }
  })
  it('스윙 안 함·사구·존 밖 공에는 미스터리 효과 0', () => {
    const r = seeded(4)
    let n = 0
    for (let i = 0; i < 3000; i++) {
      const p: Pitch = { ...randomPitch(r), side: r() * 3.4 - 1.7 }
      const off = r() < 0.2 ? null : r() * 200 - 100
      const s0 = Math.floor(r() * 1e9) + 1
      const a = judgeSwing(off, p, seeded(s0))
      const outZone = p.type === 'ball' || Math.abs(p.height ?? 0) > 1.1 || Math.abs(p.side ?? 0) > 1.1
      if (!outZone && off !== null && p.type !== 'hbp') continue
      for (const k of KINDS) expect(judgeSwing(off, p, seeded(s0), { mystery: k })).toEqual(a)
      n++
    }
    expect(n).toBeGreaterThan(800)
  })
  it('PERFECT 비거리: MINI ×1.05 · GIANT ×0.95', () => {
    const raw = 115 * (1 + (45 / 50) * 0.12)
    expect(judgeSwing(0, center(), zero, { mystery: 'MINI' }).distance).toBe(Math.round(raw * 1.05 * 10) / 10)
    expect(judgeSwing(0, center(), zero, { mystery: 'GIANT' }).distance).toBe(Math.round(raw * 0.95 * 10) / 10)
  })
})

describe('보정 중첩 상한', () => {
  it('거포 + 노림 둘 다 적중 + MINI PERFECT: 비거리 배율이 ×1.18에서 멈춘다', () => {
    const read: ReadGuess = { category: 'FAST', height: 'MID' }
    const power = LINEUP[2].profile
    const raw = 115 * (1 + (45 / 50) * 0.12)
    const uncapped = 1.1 * 1.015 * 1.05 * 1.05
    expect(uncapped).toBeGreaterThan(CONTACT_ADJUST_CAP.distMax)
    expect(judgeSwing(0, center(), zero, { profile: power, read, mystery: 'MINI' }).distance).toBe(Math.round(raw * CONTACT_ADJUST_CAP.distMax * 10) / 10)
  })
  it('미스터리 없는 노림·능력치 조합은 상한에 걸리지 않는다(예전 판정 그대로)', () => {
    const reads: (ReadGuess | null)[] = [null, { category: 'FAST', height: 'MID' }, { category: 'DROP', height: 'LOW' }, { category: 'FAST', height: null }]
    const r = seeded(8)
    for (let i = 0; i < 4000; i++) {
      const p: Pitch = { ...randomPitch(r), side: r() * 2.2 - 1.1 }
      const off = r() * 80 - 40
      const s0 = Math.floor(r() * 1e9) + 1
      const mods = { profile: LINEUP[i % 3].profile, read: reads[i % reads.length] }
      expect(judgeSwing(off, p, seeded(s0), { ...mods, mystery: 'NORMAL' })).toEqual(judgeSwing(off, p, seeded(s0), mods))
      expect(judgeSwing(off, p, seeded(s0), { ...mods, mystery: null })).toEqual(judgeSwing(off, p, seeded(s0), mods))
    }
  })
})

describe('저장·재생', () => {
  it('resolvePitch가 swing.mystery를 남기고, 재생(simulateGame)에는 영향이 없다', () => {
    const p: Pitch = { ...center(), mystery: 'GIANT' }
    const { swing } = resolvePitch([], p, 0, { rand: zero, mods: { mystery: p.mystery, profile: NEUTRAL_PROFILE } })
    expect(swing.mystery).toBe('GIANT')
    const events: Swing[] = [swing, { ...swing, mystery: undefined }]
    expect(simulateGame(events)).toEqual(simulateGame(events.map(e => { const c = { ...e }; delete c.mystery; return c })))
  })
  it('예전 대결 기록(mystery 없음)도 그대로', () => {
    const { swing } = resolvePitch([], center(), 3, { rand: zero })
    expect(swing.mystery).toBeUndefined()
  })
  it('mysteryFeedback: 안타일 때만 짧은 문구', () => {
    const s = (mystery: MysteryKind | undefined, outcome: Outcome, distance = 60) => ({ mystery, outcome, distance })
    expect(mysteryFeedback(s('MINI', 'good'))).toBe('🎲 미니볼 공략!')
    expect(mysteryFeedback(s('MINI', 'perfect', 130))).toBe('🎲 미니볼 홈런!')
    expect(mysteryFeedback(s('GIANT', 'fair'))).toBe('🎲 자이언트볼 안타')
    expect(mysteryFeedback(s('GIANT', 'flyout'))).toBeNull()
    expect(mysteryFeedback(s('NORMAL', 'good'))).toBeNull()
    expect(mysteryFeedback(s(undefined, 'good'))).toBeNull()
  })
})

describe('발동·종류 결정', () => {
  it('makeDuelPitch: 종류는 받은 값을 싣기만 하고 나머지 공(코스·구속·투구폼)과 난수 순서는 같다', () => {
    for (let i = 1; i < 200; i++) {
      const a = makeDuelPitch('slider', 'low', 'fast', (i % 10) / 10, seeded(i), 'left')
      const b = makeDuelPitch('slider', 'low', 'fast', (i % 10) / 10, seeded(i), 'left', 'MINI')
      expect({ ...b, id: '', mystery: undefined }).toEqual({ ...a, id: '', mystery: undefined }) // id엔 시각(Date.now)이 들어가 비교에서 뺀다
      expect(b.mystery).toBe('MINI')
      expect('mystery' in a).toBe(false)
    }
  })
  it('rollMysteryKind 비율 ≈ MINI 40 · NORMAL 20 · GIANT 40', () => {
    const r = seeded(17)
    const n: Record<string, number> = { MINI: 0, NORMAL: 0, GIANT: 0 }
    for (let i = 0; i < 20000; i++) n[rollMysteryKind(r)]++
    for (const k of KINDS) expect(n[k] / 20000).toBeCloseTo(MYSTERY_WEIGHTS[k], 1)
  })
  it('mysteryArmed: 같은 공(같은 키·같은 화면)이면 다시 계산해도 같고, 전체 비율 ≈ 12%', () => {
    expect(mysteryArmed('1:3', 0.42)).toBe(mysteryArmed('1:3', 0.42))
    let on = 0
    for (let h = 0; h < 50; h++) for (let i = 0; i < 400; i++) if (mysteryArmed(`${h}:${i}`, 0.37)) on++
    expect(on / 20000).toBeCloseTo(MYSTERY_RATE, 1)
  })
})
