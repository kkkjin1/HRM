import { describe, it, expect } from 'vitest'
import {
  NEUTRAL_PROFILE, PITCH_TYPES, READ_BONUS,
  evaluateRead, heightBand, judgeSwing, pitchCategory, randomPitch, readAdjust, readFeedback, resolvePitch, simulateGame,
  type Outcome, type Pitch, type PitchType, type ReadGuess, type Swing,
} from './baseball'
import { DUEL_LINEUP, HEIGHTS, duelBatterAt } from './baseballDuel'

// 대결 1차 확장(구종 계열·높이 노림·타자 능력치) — 개인전·기존 기록 호환 포함

function seeded(seed: number) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}
const ev = (outcome: Outcome, distance = 0): Swing => ({ type: 'fastball', speed: 150, outcome, distance, offset: 0 })
const K = ev('looking')
const B = ev('ball')
const SGL = ev('fair', 50)
const CONTACT_P = duelBatterAt(0).profile
const POWER_P = duelBatterAt(2).profile
const center = (type: PitchType = 'fastball', speed = 145): Pitch => ({ id: 'c', type, speed, alt: 1, slot: 'mid', windup: 900, height: 0, side: 0 })
const zero = () => 0 // 정타 비거리 하한 + 안타 굴림 통과 (가운데 공이라 빗맞음 굴림은 없다)
const inZoneContact = (o: Outcome) => ['perfect', 'good', 'fair', 'flyout', 'groundout', 'popout'].includes(o)

describe('pitchCategory — 13구종 → 3계열', () => {
  it('빠른 6 · 휘는 4 · 떨어지는 3, 빠지는 볼·사구는 계열 없음', () => {
    const want: Record<string, PitchType[]> = {
      FAST: ['heater', 'fastball', 'twoseam', 'cutter', 'sidearm', 'rising'],
      BREAK: ['slider', 'curve', 'slowcurve', 'eephus'],
      DROP: ['splitter', 'changeup', 'knuckle'],
    }
    for (const [cat, types] of Object.entries(want)) for (const t of types) expect(pitchCategory(t)).toBe(cat)
    expect(pitchCategory('ball')).toBeNull()
    expect(pitchCategory('hbp')).toBeNull()
    expect((Object.keys(PITCH_TYPES) as PitchType[]).filter(t => pitchCategory(t))).toHaveLength(13)
  })
})

describe('heightBand — 타자용 높이 3단 (-1 = 존 맨 위)', () => {
  it('경계 ±0.4: 안쪽은 가운데, 바깥은 높음/낮음', () => {
    expect([-1.5, -0.8, -0.41].map(heightBand)).toEqual(['HIGH', 'HIGH', 'HIGH'])
    expect([-0.4, 0, 0.4].map(heightBand)).toEqual(['MID', 'MID', 'MID'])
    expect([0.41, 0.8, 1.5].map(heightBand)).toEqual(['LOW', 'LOW', 'LOW'])
  })
  it('대결 투수 코스 5단 → 높은 볼·높게 / 가운데 / 낮게·낮은 볼 (제구 흔들림 ±0.05 포함)', () => {
    const map = (v: number) => [heightBand(v - 0.05), heightBand(v + 0.05)]
    expect(map(HEIGHTS.highBall.value)).toEqual(['HIGH', 'HIGH'])
    expect(map(HEIGHTS.high.value)).toEqual(['HIGH', 'HIGH'])
    expect(map(HEIGHTS.mid.value)).toEqual(['MID', 'MID'])
    expect(map(HEIGHTS.low.value)).toEqual(['LOW', 'LOW'])
    expect(map(HEIGHTS.lowBall.value)).toEqual(['LOW', 'LOW'])
  })
})

describe('노림 보정 — 정타 이후에만', () => {
  const both: ReadGuess = { category: 'FAST', height: 'MID' }
  const r = (pitchHit: boolean, heightHit: boolean, g: ReadGuess = both) => ({ pitchCategory: g.category, height: g.height, pitchHit, heightHit })
  it('둘 다 적중 / 구종만 / 높이만 / 노린 것 전부 빗나감 / 안 노림', () => {
    expect(readAdjust(r(true, true), 'perfect')).toEqual({
      edgeMul: READ_BONUS.heightEdgeMul, weakMul: 1,
      hitAdd: READ_BONUS.categoryHitAdd + READ_BONUS.bothHitAdd, distMul: READ_BONUS.categoryDist * READ_BONUS.perfectBothDist,
    })
    expect(readAdjust(r(true, true), 'good').distMul).toBe(READ_BONUS.categoryDist) // ×1.05는 PERFECT만
    expect(readAdjust(r(true, false), 'good')).toEqual({ edgeMul: 1, weakMul: 1, hitAdd: READ_BONUS.categoryHitAdd, distMul: READ_BONUS.categoryDist })
    expect(readAdjust(r(false, true), 'good')).toEqual({ edgeMul: READ_BONUS.heightEdgeMul, weakMul: 1, hitAdd: 0, distMul: 1 })
    expect(readAdjust(r(false, false), 'fair')).toEqual({ edgeMul: 1, weakMul: 1, hitAdd: READ_BONUS.missHitAdd, distMul: READ_BONUS.missDist })
    expect(readAdjust(null, 'perfect')).toEqual({ edgeMul: 1, weakMul: 1, hitAdd: 0, distMul: 1 })
    expect(readAdjust(r(false, false, { category: null, height: null }), 'perfect').hitAdd).toBe(0)
  })
  it('전부 빗나감 패널티(−3%p · ×0.96) — 아무거나 찍기가 안 노림보다 유리해지지 않게(시뮬 기준)', () => {
    expect(READ_BONUS.missHitAdd).toBe(-0.03)
    expect(READ_BONUS.missDist).toBe(0.96)
  })
  it('evaluateRead: 실제 공의 계열·도착 높이와 비교', () => {
    expect(evaluateRead(both, center())).toEqual({ pitchCategory: 'FAST', height: 'MID', pitchHit: true, heightHit: true })
    expect(evaluateRead({ category: 'DROP', height: 'LOW' }, { ...center('splitter'), height: -0.8 })).toMatchObject({ pitchHit: true, heightHit: false })
    expect(evaluateRead({ category: null, height: 'HIGH' }, { ...center(), height: -1.5 })).toMatchObject({ pitchHit: false, heightHit: true })
  })
  it('PERFECT + 둘 다 적중이면 비거리 ×1.015 ×1.05, 안 노림이면 예전과 같다', () => {
    const plain = judgeSwing(0, center(), zero)
    expect(plain.outcome).toBe('perfect')
    expect(judgeSwing(0, center(), zero, { read: both }).distance)
      .toBe(Math.round(115 * (1 + (45 / 50) * 0.12) * READ_BONUS.categoryDist * READ_BONUS.perfectBothDist * 10) / 10)
    expect(judgeSwing(0, center(), zero, { read: { category: null, height: null } })).toEqual(plain)
  })
  it('헛스윙·파울·존 밖 공·스윙 안 함에는 노림 효과 0 (자동 구제 없음)', () => {
    const rr = seeded(5)
    let checked = 0
    for (let i = 0; i < 4000; i++) {
      const p: Pitch = { ...randomPitch(rr), side: rr() * 3.4 - 1.7 }
      const off = rr() < 0.15 ? null : rr() * 200 - 100
      const s0 = Math.floor(rr() * 1e9) + 1
      const a = judgeSwing(off, p, seeded(s0))
      const outZone = p.type === 'ball' || Math.abs(p.height ?? 0) > 1.1 || Math.abs(p.side ?? 0) > 1.1
      if (!outZone && off !== null && inZoneContact(a.outcome)) continue // 정타만 보정 대상
      expect(judgeSwing(off, p, seeded(s0), { read: both })).toEqual(a)
      checked++
    }
    expect(checked).toBeGreaterThan(1500)
  })
})

describe('타자 3명 — 타순·능력치', () => {
  it('타순은 타석마다 1번 컨택 → 2번 밸런스 → 3번 거포 순환 (기록에서 계산)', () => {
    expect([0, 1, 2, 3, 4, 5].map(pa => duelBatterAt(pa).key)).toEqual(['contact', 'balance', 'power', 'contact', 'balance', 'power'])
    expect(DUEL_LINEUP.map(b => [b.stars.contact, b.stars.power, b.stars.speed])).toEqual([[3, 1, 3], [2, 2, 2], [1, 3, 1]])
    expect(duelBatterAt(1).profile).toBe(NEUTRAL_PROFILE) // 밸런스 = 현재 판정
  })
  const W = PITCH_TYPES.fastball.window
  const outcomeAt = (off: number, profile = NEUTRAL_PROFILE) => judgeSwing(off * W, center(), () => 0.999, { profile }).outcome
  it('PERFECT 경계(±8ms)는 세 타자 모두 같다', () => {
    for (const pr of [CONTACT_P, NEUTRAL_PROFILE, POWER_P]) {
      expect(judgeSwing(8 * W, center(), zero, { profile: pr }).outcome).toBe('perfect')
      expect(judgeSwing(8.3 * W, center(), zero, { profile: pr }).outcome).not.toBe('perfect')
    }
  })
  it('컨택은 GOOD·FAIR 경계 ×1.06, 거포는 ×0.94', () => {
    // 안타 굴림 0.999 → 실패: GOOD은 뜬공, FAIR는 땅볼로 갈린다
    expect(outcomeAt(18.5)).toBe('groundout')
    expect(outcomeAt(18.5, CONTACT_P)).toBe('flyout')
    expect(outcomeAt(17.5)).toBe('flyout')
    expect(outcomeAt(17.5, POWER_P)).toBe('groundout')
  })
  it('능력치 때문에 파울·헛스윙 구간이 GOOD 이상으로 바뀌지 않는다', () => {
    for (const pr of [CONTACT_P, POWER_P]) {
      for (let off = 35.5; off < 120; off += 0.5) {
        expect(['perfect', 'good', 'flyout']).not.toContain(judgeSwing(off * W, center(), zero, { profile: pr }).outcome)
      }
    }
  })
  it('PERFECT 비거리: 거포 ×1.10 · 컨택 ×0.93', () => {
    const d = (pr = NEUTRAL_PROFILE) => judgeSwing(0, center(), zero, { profile: pr }).distance
    const raw = 115 * (1 + (45 / 50) * 0.12)
    expect(d()).toBe(Math.round(raw * 10) / 10)
    expect(d(POWER_P)).toBe(Math.round(raw * 1.1 * 10) / 10)
    expect(d(CONTACT_P)).toBe(Math.round(raw * 0.93 * 10) / 10)
  })
  it('밸런스형 = 능력치 없는 판정', () => {
    const rr = seeded(9)
    for (let i = 0; i < 3000; i++) {
      const p: Pitch = { ...randomPitch(rr), side: rr() * 3.4 - 1.7 }
      const off = rr() < 0.1 ? null : rr() * 140 - 70
      const s0 = Math.floor(rr() * 1e9) + 1
      expect(judgeSwing(off, p, seeded(s0), { profile: NEUTRAL_PROFILE })).toEqual(judgeSwing(off, p, seeded(s0)))
    }
  })
})

describe('기존 기록·개인전 호환', () => {
  it('개인전 판정은 확장 전 코드(git 원본)로 뽑은 고정값과 똑같다', () => {
    const golden: [Pick<Pitch, 'type' | 'speed' | 'alt' | 'height'>, number | null, number, { outcome: Outcome; distance: number }][] = [
      [{ type: 'heater', speed: 165, alt: -1, height: 1 }, 5.7, 1000, { outcome: 'groundout', distance: 0 }],
      [{ type: 'sidearm', speed: 137, alt: 1, height: -0.27 }, 13.9, 1037, { outcome: 'flyout', distance: 80.3 }],
      [{ type: 'ball', speed: 154, alt: -1, height: -1.5 }, -18.9, 1074, { outcome: 'popout', distance: 0 }],
      [{ type: 'changeup', speed: 131, alt: -1, height: -0.77 }, 15.2, 1111, { outcome: 'popout', distance: 0 }],
      [{ type: 'changeup', speed: 126, alt: -1, height: -0.31 }, -11.7, 1148, { outcome: 'good', distance: 77.4 }],
      [{ type: 'rising', speed: 134, alt: 1, height: 0.88 }, 2.3, 1185, { outcome: 'perfect', distance: 91.8 }],
      [{ type: 'sidearm', speed: 139, alt: -1, height: 0.86 }, -21.9, 1222, { outcome: 'groundout', distance: 0 }],
      [{ type: 'curve', speed: 113, alt: 1, height: -1 }, null, 1259, { outcome: 'looking', distance: 0 }],
      [{ type: 'ball', speed: 147, alt: 1, height: 1.33 }, -14.6, 1296, { outcome: 'groundout', distance: 0 }],
      [{ type: 'slider', speed: 132, alt: 1, height: -0.17 }, 45, 1333, { outcome: 'foul', distance: 0 }],
      [{ type: 'curve', speed: 111, alt: -1, height: -0.64 }, -3.9, 1370, { outcome: 'perfect', distance: 95.7 }],
      [{ type: 'slider', speed: 128, alt: 1, height: -0.38 }, -35.6, 1407, { outcome: 'foul', distance: 0 }],
      [{ type: 'curve', speed: 106, alt: -1, height: -0.35 }, -7.5, 1444, { outcome: 'flyout', distance: 73 }],
      [{ type: 'heater', speed: 156, alt: 1, height: -0.91 }, -5.1, 1481, { outcome: 'perfect', distance: 95.2 }],
      [{ type: 'fastball', speed: 143, alt: 1, height: -0.07 }, 41.4, 1518, { outcome: 'foul', distance: 0 }],
      [{ type: 'ball', speed: 112, alt: -1, height: -1.37 }, null, 1555, { outcome: 'ball', distance: 0 }],
      [{ type: 'curve', speed: 114, alt: 1, height: -0.02 }, -20.5, 1592, { outcome: 'groundout', distance: 0 }],
      [{ type: 'hbp', speed: 140, alt: 1, height: -0.89 }, 18.1, 1629, { outcome: 'hbp', distance: 0 }],
      [{ type: 'slider', speed: 125, alt: 1, height: 0.44 }, 11.3, 1666, { outcome: 'good', distance: 74 }],
      [{ type: 'sidearm', speed: 141, alt: 1, height: 0.86 }, 31, 1703, { outcome: 'groundout', distance: 0 }],
      [{ type: 'twoseam', speed: 143, alt: -1, height: 0.2 }, 1.8, 1740, { outcome: 'flyout', distance: 114 }],
      [{ type: 'splitter', speed: 139, alt: 1, height: -0.26 }, -12.6, 1777, { outcome: 'flyout', distance: 81.2 }],
      [{ type: 'curve', speed: 114, alt: 1, height: -0.31 }, -2.6, 1814, { outcome: 'flyout', distance: 108.3 }],
      [{ type: 'twoseam', speed: 142, alt: 1, height: -0.09 }, null, 1851, { outcome: 'looking', distance: 0 }],
    ]
    for (const [pitch, offset, seed, want] of golden) expect(judgeSwing(offset, pitch, seeded(seed))).toEqual(want)
  })
  it('대결에서 노림·능력치를 안 쓰면(밸런스 + 안 노림) 예전 판정과 같고 swing.read도 생기지 않는다', () => {
    const rr = seeded(13)
    for (let i = 0; i < 2000; i++) {
      const events = [B, B, SGL, K].slice(0, Math.floor(rr() * 5))
      const p: Pitch = { ...randomPitch(rr), side: Math.round((rr() * 3.4 - 1.7) * 100) / 100 }
      const off = rr() < 0.15 ? null : rr() * 140 - 70
      const s0 = Math.floor(rr() * 1e9) + 1
      const a = resolvePitch(events, p, off, { pid: p.id, rand: seeded(s0) })
      const b = resolvePitch(events, p, off, { pid: p.id, rand: seeded(s0), mods: { profile: NEUTRAL_PROFILE, read: { category: null, height: null } } })
      expect(b).toEqual(a)
      expect(b.swing.read).toBeUndefined()
    }
  })
  it('replay: Swing.read가 있든 없든 경기 재생 결과가 같고, 같은 입력이면 같은 판정', () => {
    const rr = seeded(21)
    const events: Swing[] = []
    const mods = { read: { category: 'FAST', height: 'MID' } as ReadGuess, profile: POWER_P }
    for (let i = 0; i < 12; i++) {
      const p: Pitch = { ...randomPitch(rr), side: 0 }
      const off = rr() * 60 - 30
      const res = resolvePitch(events, p, off, { rand: seeded(i + 1), mods })
      expect(resolvePitch(events, p, off, { rand: seeded(i + 1), mods })).toEqual(res)
      events.push(res.swing)
    }
    expect(events.every(e => e.read)).toBe(true)
    expect(simulateGame(events)).toEqual(simulateGame(events.map(e => { const copy = { ...e }; delete copy.read; return copy })))
  })
  it('readFeedback: 둘 다 적중 + PERFECT 타이밍으로 쳐낸 공만 강한 문구, 다 빗나가면 표시 없음', () => {
    const read = { pitchCategory: 'FAST' as const, height: 'MID' as const, pitchHit: true, heightHit: true }
    expect(readFeedback({ type: 'fastball', offset: 3, outcome: 'perfect', read })).toEqual({ text: '완벽히 노렸다!', strong: true })
    expect(readFeedback({ type: 'fastball', offset: 12, outcome: 'good', read })).toEqual({ text: '구종·코스 적중', strong: false })
    expect(readFeedback({ type: 'fastball', offset: 3, outcome: 'perfect', read: { ...read, heightHit: false } })?.text).toBe('구종 적중')
    expect(readFeedback({ type: 'fastball', offset: 3, outcome: 'perfect', read: { ...read, pitchHit: false } })?.text).toBe('코스 적중')
    expect(readFeedback({ type: 'fastball', offset: 3, outcome: 'perfect', read: { ...read, pitchHit: false, heightHit: false } })).toBeNull()
    expect(readFeedback({ type: 'fastball', offset: 3, outcome: 'perfect' })).toBeNull()
  })
})
