import { describe, it, expect, afterEach } from 'vitest'
import { BATTER_LOOK, INPUT_LOCK_OVERRIDE_MS, animPhaseFlags, arrivalOf, inputLockDuration, presentationDuration, shiftAnim, type Anim } from './scene'
import { BASES3, BRAWL_MS, getPlaySequence, isBroadcast, sequenceDuration, worldFrame } from './broadcast'
import { LINEUP, lineupBatter, paOutcome, simulateGame, type Bases, type Outcome, type Swing } from '@/lib/baseball'

const sw = (outcome: Outcome, distance = 0, extra: Partial<Swing> = {}): Swing => ({ type: 'fastball', speed: 140, outcome, distance, offset: 3, ...extra })
const GO = sw('groundout')
const SINGLE = sw('fair', 60)
const DOUBLE = sw('good', 95)
const FLY = sw('flyout', 100)
const HR = sw('perfect', 130)
const GDP = sw('groundout', 0, { dp: true })

const anim = (result: Swing | null, resultStart: number | null): Anim => ({
  pitch: { id: 'p', type: 'fastball', speed: 140, alt: 1, slot: 'mid', windup: 900, height: 0 },
  start: 0, result, resultStart, paEnded: null, selfResolve: true,
})

describe('sequenceDuration — 수비 장면 길이(현재 값 고정)', () => {
  it('GROUND_OUT / HIT / FLY_OUT / HOME_RUN / 병살', () => {
    expect(getPlaySequence(GO).type).toBe('GROUND_OUT')
    expect(sequenceDuration(getPlaySequence(GO), GO)).toBeCloseTo(2115.566, 2)
    expect(sequenceDuration(getPlaySequence(SINGLE), SINGLE)).toBe(2340)
    expect(sequenceDuration(getPlaySequence(DOUBLE), DOUBLE)).toBe(2850)
    expect(sequenceDuration(getPlaySequence(FLY), FLY)).toBeCloseTo(2129.2, 3)
    expect(sequenceDuration(getPlaySequence(HR), HR)).toBe(3190)
    expect(sequenceDuration(getPlaySequence(GDP), GDP)).toBeCloseTo(2387.574, 2)
  })
  it('장면 길이 = presentationDuration (인플레이), 그 외는 공 비행 시간, 대결 사구는 벤치 클리어링', () => {
    for (const s of [GO, SINGLE, DOUBLE, FLY, HR, GDP]) expect(presentationDuration(s)).toBe(sequenceDuration(getPlaySequence(s), s))
    expect(presentationDuration(sw('foul'))).toBe(700)
    expect(presentationDuration(sw('looking'))).toBe(600)
    expect(presentationDuration(sw('hbp'), 'duel')).toBe(BRAWL_MS)
  })
})

describe('presentation duration vs 입력 잠금', () => {
  afterEach(() => { for (const k of Object.keys(INPUT_LOCK_OVERRIDE_MS)) delete INPUT_LOCK_OVERRIDE_MS[k as keyof typeof INPUT_LOCK_OVERRIDE_MS] })

  it('기본값: 입력 잠금 = 장면 길이 (지금 템포 그대로)', () => {
    for (const s of [GO, SINGLE, FLY, HR, GDP, sw('foul'), sw('ball')]) {
      for (const mode of ['solo', 'duel'] as const) expect(inputLockDuration(s, mode)).toBe(presentationDuration(s, mode))
    }
  })
  it('기본값: 장면이 끝나는 순간 카운트 공개와 입력 해제가 같이 일어난다', () => {
    const a = anim(GO, 1000)
    const end = 1000 + presentationDuration(GO)
    expect(animPhaseFlags(a, end - 1)).toEqual({ presentationActive: true, inputLocked: true })
    expect(animPhaseFlags(a, end + 1)).toEqual({ presentationActive: false, inputLocked: false })
    expect(animPhaseFlags(anim(null, null), 99999)).toEqual({ presentationActive: true, inputLocked: true }) // 결과 전엔 둘 다 진행 중
    expect(animPhaseFlags(null, 0)).toEqual({ presentationActive: false, inputLocked: false })
  })
  it('장면 종류별로 입력 잠금만 따로 줄일 수 있다 — 장면 길이는 그대로', () => {
    INPUT_LOCK_OVERRIDE_MS.GROUND_OUT = 1600
    expect(inputLockDuration(GO)).toBe(1600)
    expect(presentationDuration(GO)).toBeCloseTo(2115.566, 2)
    expect(inputLockDuration(SINGLE)).toBe(presentationDuration(SINGLE)) // 다른 장면은 영향 없음
    expect(inputLockDuration(GO, 'solo', {})).toBe(presentationDuration(GO))
    // 1600 ~ 2115ms 사이: 장면은 아직 보이지만(카운트 미공개) 다음 투구는 가능
    expect(animPhaseFlags(anim(GO, 0), 1800)).toEqual({ presentationActive: true, inputLocked: false })
  })
})

describe('중계 장면 주자 = 게임 로직 진루', () => {
  const BASE_AT = [BASES3.first, BASES3.second, BASES3.third]
  const cases: [string, Bases, Swing][] = [
    ['1루 + 단타', [true, false, false], SINGLE],
    ['1·2루 + 단타', [true, true, false], SINGLE],
    ['1루 + 2루타', [true, false, false], DOUBLE],
    ['만루 + 단타', [true, true, true], SINGLE],
    ['만루 + 2루타', [true, true, true], DOUBLE],
    ['만루 + 홈런', [true, true, true], HR],
    ['1·3루 + 병살', [true, false, true], GDP],
    ['2루 + 땅볼', [false, true, false], GO],
    ['1·2루 + 뜬공', [true, true, false], FLY],
  ]
  it.each(cases)('%s: 장면 끝에 남은 주자 위치 = paOutcome의 after', (_label, bases, s) => {
    const st = { strikes: 0, balls: 0, outs: 0, bases }
    const pa = paOutcome(st, s)!
    const seq = getPlaySequence(s)
    expect(isBroadcast(seq)).toBe(true)
    const f = worldFrame(seq, s, presentationDuration(s) - 1, pa.transition.moves, false)
    const shown = f.runners.filter(r => r.opacity > 0.01).map(r => BASE_AT.findIndex(b => Math.hypot(b.x - r.pos.x, b.z - r.pos.z) < 0.01)).sort()
    const expected = pa.transition.after.map((on, i) => (on ? i : -1)).filter(i => i >= 0)
    // 타자 주자는 runners가 아니라 장면별로 따로 그린다 → 타자가 간 베이스는 제외
    const batterTo = pa.transition.moves.find(m => m.from === 'batter')!.to
    expect(shown).toEqual(expected.filter(i => i !== batterTo))
  })
  it('같은 이벤트열에서 simulateGame 결과 주자와도 같다', () => {
    const B = sw('ball')
    const st = simulateGame([B, B, B, B]) // 볼넷 2번 → 1·2루
    expect(paOutcome(st, SINGLE)!.transition.after).toEqual(simulateGame([B, B, B, B, SINGLE]).bases)
  })
})

describe('숨김 탭 — shiftAnim', () => {
  it('숨어 있던 시간만큼 공 시계(투구 시작·결과 시작)를 미룬다 — 같은 공을 이어서', () => {
    const a = anim(null, null)
    const s = shiftAnim(a, 5000)
    expect(s.pitch).toBe(a.pitch) // 새 공이 아님
    expect(arrivalOf(s) - arrivalOf(a)).toBe(5000)
    expect(s.resultStart).toBeNull()
    expect(shiftAnim(anim(GO, 1200), 300).resultStart).toBe(1500)
  })
})

describe('타자 유형별 외형(그림 전용)', () => {
  it('컨택 < 밸런스 < 거포: 체형·방망이 길이·굵기·스윙 크기, 밸런스는 예전 그림 그대로', () => {
    const { contact, balance, power } = BATTER_LOOK
    for (const k of ['build', 'batLen', 'batW', 'swingMs', 'finish', 'impact'] as const) {
      expect(contact[k]).toBeLessThan(balance[k])
      expect(balance[k]).toBeLessThan(power[k])
    }
    expect(balance).toMatchObject({ build: 1, batLen: 1, batW: 5, swingMs: 200, finish: 1, accent: null, head: 1, impact: 1 })
    expect(power.batLen / contact.batLen).toBeGreaterThan(1.6) // 작은 창에서도 방망이 차이가 확실히 보이게
  })
  it('타순 키마다 외형이 있다(개인전·대결 공용 LINEUP)', () => {
    for (const b of LINEUP) expect(BATTER_LOOK[b.key]).toBeDefined()
    expect(lineupBatter(0).key).toBe('contact')
    expect(lineupBatter(4).key).toBe('balance')
  })
})
